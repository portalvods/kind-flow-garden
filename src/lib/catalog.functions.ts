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
    const { data, error } = await context.supabase
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
    const { data: row, error } = await context.supabase
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
    const { error } = await context.supabase.from("m3u_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const toggleSchema = z.object({ id: z.string().uuid(), active: z.boolean() });
export const toggleSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => toggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
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
    const { parseM3u } = await import("./m3u.server");

    const { data: src, error: fetchErr } = await context.supabase
      .from("m3u_sources")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !src) throw new Error("Fonte não encontrada");

    try {
      const res = await fetch(src.url, {
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" },
        signal: AbortSignal.timeout(120_000),
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar a lista (URL inválida ou servidor fora do ar)`);
      const text = await res.text();
      if (!/#EXTM3U|#EXTINF/i.test(text.slice(0, 5000))) {
        throw new Error("A URL não retornou uma lista M3U válida (resposta HTML/erro do servidor)");
      }
      const items = parseM3u(text);
      const movies = items.filter((i) => i.kind === "movie").length;
      const series = items.filter((i) => i.kind === "series").length;

      // Replace all items for this source
      await context.supabase.from("catalog_items").delete().eq("source_id", src.id);

      const rows = items.map((i) => ({ ...i, source_id: src.id }));
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insErr } = await context.supabase
          .from("catalog_items")
          .insert(rows.slice(i, i + CHUNK));
        if (insErr) throw new Error(insErr.message);
      }

      await context.supabase
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
      await context.supabase
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

// Verifica vários títulos de uma vez (usado na aba "Em alta")
const batchSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().max(60),
        tmdb_id: z.number().int().nullable().optional(),
        title: z.string().trim().min(1).max(200),
        kind: z.enum(["movie", "series"]),
      }),
    )
    .max(40),
});

export const checkAvailabilityBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ results: Record<string, { exists: boolean; category: string | null }> }> => {
    const { normalizeTitle } = await import("./m3u.server");
    const results: Record<string, { exists: boolean; category: string | null }> = {};
    if (!data.items.length) return { results };

    const norms = data.items.map((i) => normalizeTitle(i.title));
    const tmdbIds = data.items.map((i) => i.tmdb_id).filter((x): x is number => typeof x === "number");

    const { data: byTitle } = await context.supabase
      .from("catalog_items")
      .select("title_normalized, tmdb_id, kind, category")
      .in("title_normalized", [...new Set(norms)])
      .limit(2000);

    let rows = (byTitle ?? []) as Array<{ title_normalized: string; tmdb_id: number | null; kind: string; category: string | null }>;

    if (tmdbIds.length) {
      const { data: byTmdb } = await context.supabase
        .from("catalog_items")
        .select("title_normalized, tmdb_id, kind, category")
        .in("tmdb_id", [...new Set(tmdbIds)])
        .limit(2000);
      rows = rows.concat((byTmdb ?? []) as typeof rows);
    }

    data.items.forEach((item, idx) => {
      const norm = norms[idx];
      const hit = rows.find(
        (r) => r.kind === item.kind && (r.title_normalized === norm || (item.tmdb_id != null && r.tmdb_id === item.tmdb_id)),
      );
      results[item.key] = { exists: !!hit, category: hit?.category ?? null };
    });

    return { results };
  });

// ---- Ajuste manual de disponibilidade (admin) ----
const overrideSchema = z.object({
  tmdb_id: z.number().int().positive(),
  kind: z.enum(["movie", "series"]),
  title: z.string().trim().max(200).nullable().optional(),
  available: z.boolean().nullable(), // null = remover ajuste manual
});

export const setAvailabilityOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => overrideSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    await context.supabase
      .from("availability_overrides")
      .delete()
      .eq("tmdb_id", data.tmdb_id)
      .eq("kind", data.kind);
    if (data.available !== null) {
      const { error } = await context.supabase.from("availability_overrides").insert({
        tmdb_id: data.tmdb_id,
        kind: data.kind,
        title: data.title ?? null,
        available: data.available,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
