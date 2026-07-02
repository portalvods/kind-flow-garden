// Weekly news: list recently completed content + broadcast via WhatsApp.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendWhatsapp, getTemplate, renderTemplate } from "./whatsapp.server";

export type NewsItem = {
  request_id: string;
  title: string;
  year: number | null;
  content_type: string;
  request_kind: string;
  poster_path: string | null;
  completed_at: string;
};

export const listWeeklyNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(60).default(7) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ items: NewsItem[] }> => {
    const { data: rows, error } = await context.supabase.rpc("weekly_news", { _days: data.days });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as NewsItem[] };
  });

async function assertAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const broadcastWeeklyNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(60).default(7), test_only: z.boolean().default(false) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);

    const { data: itemsRaw, error: newsErr } = await context.supabase.rpc("weekly_news", { _days: data.days });
    if (newsErr) throw new Error(newsErr.message);
    const items = (itemsRaw ?? []) as NewsItem[];
    if (!items.length) throw new Error("Sem novidades nos últimos dias para enviar.");

    const lista = items
      .slice(0, 40)
      .map((i) => `• ${i.title}${i.year ? ` (${i.year})` : ""}${i.content_type === "tv" ? " — Série" : ""}`)
      .join("\n");

    const { data: siteSettings } = await context.supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["site_name", "site_url"]);
    const settingsMap = new Map((siteSettings ?? []).map((r) => [r.key as string, r.value as string]));
    const vars = {
      site: settingsMap.get("site_name") ?? "Portal VOD",
      url: settingsMap.get("site_url") ?? "",
      lista,
    };

    const tpl = (await getTemplate("weekly_news", context.supabase as never)) ?? "";
    if (!tpl) throw new Error("Modelo weekly_news não encontrado.");
    const message = renderTemplate(tpl, vars);

    if (data.test_only) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("whatsapp")
        .eq("id", context.userId)
        .maybeSingle();
      const to = (prof?.whatsapp as string | null) ?? null;
      if (!to) throw new Error("Seu perfil não tem WhatsApp cadastrado para teste.");
      const r = await sendWhatsapp(to, message, { supabase: context.supabase as never });
      return { sent: r.ok ? 1 : 0, failed: r.ok ? 0 : 1, total_items: items.length, preview: message };
    }

    const { data: recipients, error: recErr } = await context.supabase.rpc("admin_active_whatsapps");
    if (recErr) throw new Error(recErr.message);
    const list = (recipients ?? []) as Array<{ whatsapp: string; full_name: string | null }>;

    let sent = 0;
    let failed = 0;
    for (const r of list) {
      const res = await sendWhatsapp(r.whatsapp, message, { supabase: context.supabase as never });
      if (res.ok) sent++;
      else failed++;
      // gentle throttle
      await new Promise((res2) => setTimeout(res2, 250));
    }
    return { sent, failed, total_items: items.length, preview: message };
  });
