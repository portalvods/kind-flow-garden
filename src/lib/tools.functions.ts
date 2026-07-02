// Admin tools: duplicate detection + data export.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const sb = context.supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export type DuplicateGroup = {
  normalized_title: string;
  sample_title: string;
  content_type: string;
  year: number | null;
  request_kind: string | null;
  count: number;
  request_ids: string[];
  user_ids: string[];
};

export const listDuplicateRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DuplicateGroup[]> => {
    await assertAdmin(context as never);
    const { data, error } = await (context.supabase as {
      rpc: (fn: string) => Promise<{ data: DuplicateGroup[] | null; error: { message: string } | null }>;
    }).rpc("admin_duplicate_requests");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Export: returns JSON snapshot of core tables. Admins only.
export const exportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const sb = context.supabase;

    const [reqs, profs, roles, settings, templates, catalog, m3u] = await Promise.all([
      sb.from("requests").select("*"),
      sb.from("profiles").select("*"),
      sb.from("user_roles").select("*"),
      sb.from("site_settings").select("*"),
      sb.from("message_templates").select("*"),
      sb.from("catalog_items").select("*"),
      sb.from("m3u_sources").select("*"),
    ]);

    return {
      exported_at: new Date().toISOString(),
      requests: reqs.data ?? [],
      profiles: profs.data ?? [],
      user_roles: roles.data ?? [],
      site_settings: settings.data ?? [],
      message_templates: templates.data ?? [],
      catalog_items: catalog.data ?? [],
      m3u_sources: m3u.data ?? [],
    };
  });
