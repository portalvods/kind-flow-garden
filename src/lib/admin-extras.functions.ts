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

export type MostVotedRequest = {
  request_id: string;
  title: string;
  year: number | null;
  content_type: string;
  request_kind: string;
  status: string;
  poster_path: string | null;
  votes: number;
  author_name: string | null;
  author_whatsapp: string | null;
  created_at: string;
};

export const listMostVotedRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: MostVotedRequest[] }> => {
    await assertAdmin(context);
    const c = context.supabase as unknown as RpcClient;

    const { data: votes, error: vErr } = await c.from("request_votes").select("request_id");
    if (vErr) throw new Error(vErr.message);

    const counts = new Map<string, number>();
    for (const v of (votes ?? []) as Array<{ request_id: string }>) {
      counts.set(v.request_id, (counts.get(v.request_id) ?? 0) + 1);
    }
    const ids = [...counts.keys()];
    if (!ids.length) return { items: [] };

    const { data: reqs, error: rErr } = await c
      .from("requests")
      .select("id, title, year, content_type, request_kind, status, poster_path, user_id, created_at")
      .in("id", ids);
    if (rErr) throw new Error(rErr.message);

    const rows = (reqs ?? []) as Array<{
      id: string; title: string; year: number | null; content_type: string;
      request_kind: string; status: string; poster_path: string | null;
      user_id: string; created_at: string;
    }>;

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: profs } = await c.from("profiles").select("id, full_name, whatsapp").in("id", userIds);
    const pmap = new Map(
      ((profs ?? []) as Array<{ id: string; full_name: string | null; whatsapp: string | null }>).map((p) => [p.id, p]),
    );

    const items: MostVotedRequest[] = rows
      .map((r) => ({
        request_id: r.id,
        title: r.title,
        year: r.year,
        content_type: r.content_type,
        request_kind: r.request_kind,
        status: r.status,
        poster_path: r.poster_path,
        votes: counts.get(r.id) ?? 0,
        author_name: pmap.get(r.user_id)?.full_name ?? null,
        author_whatsapp: pmap.get(r.user_id)?.whatsapp ?? null,
        created_at: r.created_at,
      }))
      .sort((a, b) => b.votes - a.votes || +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 100);

    return { items };
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
