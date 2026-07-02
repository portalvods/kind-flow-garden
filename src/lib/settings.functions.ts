// Settings and branding server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("site_settings").select("key, value");
  const map: Record<string, string | null> = {};
  for (const row of data ?? []) map[row.key as string] = (row.value as string | null) ?? null;
  return {
    logo_url: map.logo_url ?? null,
    site_name: map.site_name ?? "Portal VOD",
  };
});

const uploadSchema = z.object({
  filename: z.string().min(1).max(120),
  content_type: z.string().min(3).max(80),
  data_base64: z.string().min(10),
});

export const uploadLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => uploadSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const bytes = Buffer.from(data.data_base64, "base64");
    const ext = data.filename.split(".").pop() || "png";
    const path = `logo-${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("branding")
      .upload(path, bytes, { contentType: data.content_type, upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabaseAdmin.storage.from("branding").getPublicUrl(path);
    const url = pub.publicUrl;

    await supabaseAdmin
      .from("site_settings")
      .upsert({ key: "logo_url", value: url, updated_at: new Date().toISOString() });

    return { url };
  });

export const clearLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("site_settings")
      .upsert({ key: "logo_url", value: null, updated_at: new Date().toISOString() });
    return { ok: true };
  });

const nameSchema = z.object({ site_name: z.string().trim().min(1).max(60) });
export const updateSiteName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => nameSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("site_settings")
      .upsert({ key: "site_name", value: data.site_name, updated_at: new Date().toISOString() });
    return { ok: true };
  });

// ---- Templates ----
const upsertTemplateSchema = z.object({
  key: z.string().min(1).max(60),
  content: z.string().min(1).max(4000),
});

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("message_templates")
      .select("key, label, content, updated_at")
      .order("label");
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertTemplateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("message_templates")
      .update({ content: data.content, updated_by: context.userId })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Daily request limit ----
const DEFAULT_DAILY_LIMIT = 5;

export const getDailyLimit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "daily_request_limit")
      .maybeSingle();
    const limit = Number(row?.value ?? DEFAULT_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", startOfDay.toISOString());

    const used = count ?? 0;
    return { limit, used, remaining: Math.max(0, limit - used) };
  });

const limitSchema = z.object({ limit: z.number().int().min(1).max(500) });
export const updateDailyLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => limitSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("site_settings")
      .upsert({ key: "daily_request_limit", value: String(data.limit), updated_at: new Date().toISOString() });
    return { ok: true };
  });

export const getAdminDailyLimit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "daily_request_limit")
      .maybeSingle();
    return { limit: Number(row?.value ?? DEFAULT_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT };
  });
