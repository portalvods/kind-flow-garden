// Similar-title suggestions from the M3U catalog.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeTitle } from "./m3u.server";

export type Suggestion = {
  title: string;
  year: number | null;
  category: string | null;
  kind: "movie" | "series";
  tmdb_id: number | null;
};

const schema = z.object({
  title: z.string().trim().min(2).max(200),
  kind: z.enum(["movie", "series"]).optional(),
  limit: z.number().int().min(1).max(10).default(3),
});

const STOP = new Set(["the", "a", "an", "de", "da", "do", "das", "dos", "o", "os", "as", "e", "of", "and", "la", "el", "un", "una"]);

export const suggestAlternatives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }): Promise<{ suggestions: Suggestion[] }> => {
    const norm = normalizeTitle(data.title);
    if (!norm) return { suggestions: [] };
    const words = norm.split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
    if (!words.length) return { suggestions: [] };

    // Try full normalized match first; then per-word ILIKE OR across kinds.
    const results = new Map<string, Suggestion>();

    async function push(rows: Array<Record<string, unknown>> | null) {
      for (const r of rows ?? []) {
        const key = `${r.title}|${r.year ?? ""}|${r.kind}`;
        if (results.has(key)) continue;
        results.set(key, {
          title: String(r.title ?? ""),
          year: (r.year as number | null) ?? null,
          category: (r.category as string | null) ?? null,
          kind: r.kind as "movie" | "series",
          tmdb_id: (r.tmdb_id as number | null) ?? null,
        });
        if (results.size >= data.limit * 4) break;
      }
    }

    let q = context.supabase
      .from("catalog_items")
      .select("title, year, category, kind, tmdb_id")
      .ilike("title_normalized", `%${norm}%`)
      .limit(data.limit * 2);
    if (data.kind) q = q.eq("kind", data.kind);
    await push((await q).data);

    if (results.size < data.limit) {
      const orExpr = words.slice(0, 4).map((w) => `title_normalized.ilike.%${w}%`).join(",");
      let q2 = context.supabase
        .from("catalog_items")
        .select("title, year, category, kind, tmdb_id")
        .or(orExpr)
        .limit(data.limit * 4);
      if (data.kind) q2 = q2.eq("kind", data.kind);
      await push((await q2).data);
    }

    // Rank by word overlap.
    const scored = Array.from(results.values())
      .map((s) => {
        const n = normalizeTitle(s.title).split(" ");
        const overlap = words.filter((w) => n.includes(w)).length;
        return { s, score: overlap };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, data.limit)
      .map((x) => x.s);

    return { suggestions: scored };
  });
