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
    const { synchronizeCatalog } = await import("./catalog-sync.server");

    const { data: src, error: fetchErr } = await context.supabase
      .from("m3u_sources")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !src) throw new Error("Fonte não encontrada");

    return synchronizeCatalog(context.supabase, src);
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
    const { data: results, error } = await context.supabase.rpc("catalog_lookup", {
      _items: [{ ...data, key: "single", normalized: normalizeTitle(data.title) }],
    });
    if (error) throw new Error("Não foi possível consultar a disponibilidade. Tente novamente.");
    return (results as unknown as Record<string, AvailabilityResult>).single;

  });

// Verifica vários títulos de uma vez (usado na aba "Em alta")
const batchSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().max(60),
        year: z.number().int().nullable().optional(),
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

    const { data: lookup, error } = await context.supabase.rpc("catalog_lookup", {
      _items: data.items.map((item) => ({ ...item, normalized: normalizeTitle(item.title) })),
    });
    if (error) throw new Error("Não foi possível consultar a disponibilidade. Tente novamente.");
    return { results: lookup as unknown as typeof results };

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
