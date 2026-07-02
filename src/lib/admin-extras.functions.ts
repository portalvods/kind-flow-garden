import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendWhatsapp } from "./whatsapp.server";

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
};

async function assertAdmin(ctx: { supabase: unknown; userId: string }) {
  const c = ctx.supabase as unknown as RpcClient;
  const { data, error } = await c.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado.");
}

export type TopClient = {
  user_id: string;
  full_name: string | null;
  whatsapp: string | null;
  total: number;
  completed: number;
  rejected: number;
  pending: number;
  last_request: string | null;
};

export const listTopClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ clients: TopClient[] }> => {
    await assertAdmin(context);
    const c = context.supabase as unknown as RpcClient;
    const { data, error } = await c.rpc("admin_top_clients", { _limit: 50 });
    if (error) throw new Error(error.message);
    return { clients: (data as TopClient[]) ?? [] };
  });

// -------- Rejection reasons --------
export const getRejectionReasons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ reasons: string[] }> => {
    const c = context.supabase as unknown as RpcClient;
    const { data } = await c.from("site_settings").select("value").eq("key", "rejection_reasons").maybeSingle();
    let reasons: string[] = [];
    try {
      reasons = data?.value ? JSON.parse(data.value) : [];
    } catch { reasons = []; }
    return { reasons: Array.isArray(reasons) ? reasons : [] };
  });

const reasonsSchema = z.object({ reasons: z.array(z.string().trim().min(1).max(200)).max(30) });
export const saveRejectionReasons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reasonsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const c = context.supabase as unknown as RpcClient;
    const { error } = await c.from("site_settings").upsert({
      key: "rejection_reasons",
      value: JSON.stringify(data.reasons),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Bot config --------
export const getBotConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const c = context.supabase as unknown as RpcClient;
    const { data } = await c.from("site_settings").select("key, value").in("key", ["bot_enabled", "bot_message", "bot_webhook_secret", "bot_orders_enabled"]);
    const map: Record<string, string> = {};
    for (const row of (data ?? []) as Array<{ key: string; value: string | null }>) {
      if (row.value != null) map[row.key] = row.value;
    }
    return {
      enabled: map.bot_enabled === "true",
      ordersEnabled: (map.bot_orders_enabled ?? "true") === "true",
      message: map.bot_message ?? "",
      secret: map.bot_webhook_secret ?? "",
    };
  });

const botSchema = z.object({
  enabled: z.boolean(),
  ordersEnabled: z.boolean(),
  message: z.string().trim().min(1).max(1000),
});
export const saveBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => botSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const c = context.supabase as unknown as RpcClient;
    const now = new Date().toISOString();
    const { error } = await c.from("site_settings").upsert([
      { key: "bot_enabled", value: data.enabled ? "true" : "false", updated_at: now },
      { key: "bot_orders_enabled", value: data.ordersEnabled ? "true" : "false", updated_at: now },
      { key: "bot_message", value: data.message, updated_at: now },
    ]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateBotSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const c = context.supabase as unknown as RpcClient;
    const secret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error } = await c.from("site_settings").upsert({
      key: "bot_webhook_secret",
      value: secret,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { secret };
  });

// -------- Custom message (resposta rápida livre) --------
const msgSchema = z.object({
  whatsapp: z.string().min(6).max(30),
  message: z.string().trim().min(1).max(2000),
});
export const sendCustomWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => msgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const res = await sendWhatsapp(data.whatsapp, data.message, { supabase: context.supabase as never });
    if (!res.ok) throw new Error(`Falha ao enviar: ${res.error ?? "desconhecido"}`);
    return { ok: true };
  });

// -------- Timeline --------
export const getRequestTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => d)
  .handler(async ({ data, context }) => {
    const c = context.supabase as unknown as RpcClient;
    const { data: rows, error } = await c.rpc("request_timeline", { _request_id: data.requestId });
    if (error) throw new Error(error.message);
    return { events: (rows as Array<{ from_status: string; to_status: string; note: string | null; created_at: string }>) ?? [] };
  });
