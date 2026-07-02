import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: {
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };
  userId: string;
}) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden");
}

export const listSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("m3u_sources")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { sources: data ?? [] };
  });

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(2000),
  sync_interval_hours: z.number().int().min(1).max(168).default(12),
});
export const createSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("m3u_sources")
      .insert({
        name: data.name,
        url: data.url,
        sync_interval_hours: data.sync_interval_hours,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const idSchema = z.object({ id: z.string().uuid() });
export const deleteSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("m3u_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const toggleSchema = z.object({ id: z.string().uuid(), active: z.boolean() });
export const toggleSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => toggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("m3u_sources")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseM3u } = await import("./m3u.server");

    const { data: src, error: fetchErr } = await supabaseAdmin
      .from("m3u_sources")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !src) throw new Error("Fonte não encontrada");

    try {
      const res = await fetch(src.url, { headers: { "User-Agent": "PortalVOD/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const items = parseM3u(text);
      const movies = items.filter((i) => i.kind === "movie").length;
      const series = items.filter((i) => i.kind === "series").length;

      // Replace all items for this source
      await supabaseAdmin.from("catalog_items").delete().eq("source_id", src.id);

      const rows = items.map((i) => ({ ...i, source_id: src.id }));
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insErr } = await supabaseAdmin
          .from("catalog_items")
          .insert(rows.slice(i, i + CHUNK));
        if (insErr) throw new Error(insErr.message);
      }

      await supabaseAdmin
        .from("m3u_sources")
        .update({
          last_synced_at: new Date().toISOString(),
          last_status: "ok",
          last_error: null,
          movies_count: movies,
          series_count: series,
        })
        .eq("id", src.id);

      return { ok: true, movies, series, total: items.length };
    } catch (err) {
      const msg = (err as Error).message ?? "erro desconhecido";
      await supabaseAdmin
        .from("m3u_sources")
        .update({
          last_status: "error",
          last_error: msg,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", src.id);
      throw new Error(`Sincronização falhou: ${msg}`);
    }
  });

const checkSchema = z.object({
  tmdb_id: z.number().int().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  year: z.number().int().nullable().optional(),
  kind: z.enum(["movie", "series"]),
});

export type AvailabilityResult = {
  exists: boolean;
  category: string | null;
  match: string | null;
};

export const checkAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkSchema.parse(d))
  .handler(async ({ data, context }): Promise<AvailabilityResult> => {
    const { normalizeTitle } = await import("./m3u.server");
    const norm = normalizeTitle(data.title);

    if (data.tmdb_id) {
      const { data: byTmdb } = await context.supabase
        .from("catalog_items")
        .select("category, title")
        .eq("tmdb_id", data.tmdb_id)
        .eq("kind", data.kind)
        .limit(1);
      if (byTmdb && byTmdb.length) {
        return { exists: true, category: byTmdb[0].category, match: byTmdb[0].title };
      }
    }
    if (data.year) {
      const { data: byBoth } = await context.supabase
        .from("catalog_items")
        .select("category, title")
        .eq("title_normalized", norm)
        .eq("year", data.year)
        .eq("kind", data.kind)
        .limit(1);
      if (byBoth && byBoth.length) {
        return { exists: true, category: byBoth[0].category, match: byBoth[0].title };
      }
    }
    const { data: byTitle } = await context.supabase
      .from("catalog_items")
      .select("category, title")
      .eq("title_normalized", norm)
      .eq("kind", data.kind)
      .limit(1);
    if (byTitle && byTitle.length) {
      return { exists: true, category: byTitle[0].category, match: byTitle[0].title };
    }
    return { exists: false, category: null, match: null };
  });
