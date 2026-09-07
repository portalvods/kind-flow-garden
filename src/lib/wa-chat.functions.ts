import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendWhatsapp } from "./whatsapp.server";

type Client = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
};

async function assertAdmin(ctx: { supabase: unknown; userId: string }) {
  const c = ctx.supabase as unknown as Client;
  const { data, error } = await c.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado.");
}

export type WaMessage = {
  id: string;
  whatsapp: string;
  contact_name: string | null;
  direction: "in" | "out";
  body: string;
  created_at: string;
};

export type WaConversation = {
  whatsapp: string;
  name: string | null;
  last_body: string;
  last_at: string;
  last_direction: "in" | "out";
  total: number;
};

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ conversations: WaConversation[] }> => {
    await assertAdmin(context as never);
    const c = context.supabase as unknown as Client;

    const { data, error } = await c
      .from("wa_messages")
      .select("whatsapp, contact_name, direction, body, created_at")
      .order("created_at", { ascending: false })
      .limit(1500);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as WaMessage[];
    const map = new Map<string, WaConversation>();
    for (const r of rows) {
      const found = map.get(r.whatsapp);
      if (!found) {
        map.set(r.whatsapp, {
          whatsapp: r.whatsapp,
          name: r.contact_name,
          last_body: r.body,
          last_at: r.created_at,
          last_direction: r.direction,
          total: 1,
        });
      } else {
        found.total += 1;
        if (!found.name && r.contact_name) found.name = r.contact_name;
      }
    }

    const list = [...map.values()];
    // Nomes reais dos clientes cadastrados
    const numbers = list.map((l) => l.whatsapp);
    if (numbers.length) {
      const { data: profs } = await c
        .from("profiles")
        .select("full_name, whatsapp")
        .in("whatsapp", numbers);
      const pmap = new Map(
        ((profs ?? []) as Array<{ full_name: string | null; whatsapp: string }>).map((p) => [p.whatsapp, p.full_name]),
      );
      for (const conv of list) conv.name = pmap.get(conv.whatsapp) ?? conv.name;
    }

    return { conversations: list };
  });

export const listWaMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ whatsapp: z.string().min(6).max(30) }).parse(d))
  .handler(async ({ data, context }): Promise<{ messages: WaMessage[] }> => {
    await assertAdmin(context as never);
    const c = context.supabase as unknown as Client;
    const { data: rows, error } = await c
      .from("wa_messages")
      .select("id, whatsapp, contact_name, direction, body, created_at")
      .eq("whatsapp", data.whatsapp.replace(/\D/g, ""))
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return { messages: (rows ?? []) as WaMessage[] };
  });

export const replyConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ whatsapp: z.string().min(6).max(30), message: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const c = context.supabase as unknown as Client;
    const res = await sendWhatsapp(data.whatsapp, data.message, { supabase: context.supabase as never });
    if (!res.ok) throw new Error(`Falha ao enviar: ${res.error ?? "desconhecido"}`);
    await c.from("wa_messages").insert({
      whatsapp: data.whatsapp.replace(/\D/g, ""),
      direction: "out",
      body: data.message,
    });
    return { ok: true };
  });
