import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getServerEnv } from "./env.server";

const schema = z.object({
  kind: z.enum(["all", "movie", "tv"]).default("all"),
});

export type TrendingItem = {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  vote_average: number;
};

type Cached = { at: number; items: TrendingItem[] };
const cache = new Map<string, Cached>();
const TTL = 1000 * 60 * 60 * 6; // 6h

export const listTrendingWeek = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => schema.parse(data ?? {}))
  .handler(async ({ data }): Promise<{ items: TrendingItem[]; configured: boolean }> => {
    const apiKey = getServerEnv("TMDB_API_KEY");
    if (!apiKey) return { items: [], configured: false };

    const cached = cache.get(data.kind);
    if (cached && Date.now() - cached.at < TTL) return { items: cached.items, configured: true };

    const path = `trending/${data.kind}/week`;
    const base = `https://api.themoviedb.org/3/${path}?language=pt-BR&page=1`;

    try {
      let res = await fetch(base, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      if (!res.ok) {
        res = await fetch(`https://api.themoviedb.org/3/${path}?api_key=${apiKey}&language=pt-BR&page=1`);
      }
      if (!res.ok) return { items: [], configured: true };
      const items = mapItems(await res.json(), data.kind);
      cache.set(data.kind, { at: Date.now(), items });
      return { items, configured: true };
    } catch (err) {
      console.error("TMDB trending failed", err);
      return { items: [], configured: true };
    }
  });

function mapItems(payload: unknown, kind: "all" | "movie" | "tv"): TrendingItem[] {
  const raw = payload as { results?: Array<Record<string, unknown>> };
  return (raw.results ?? [])
    .map((r) => {
      const mt = (r.media_type as string | undefined) ?? (kind === "all" ? undefined : kind);
      if (mt !== "movie" && mt !== "tv") return null;
      const type = mt as "movie" | "tv";
      const title = (type === "movie" ? r.title : r.name) as string | undefined;
      const dateStr = (type === "movie" ? r.release_date : r.first_air_date) as string | undefined;
      return {
        id: r.id as number,
        type,
        title: title ?? "Sem título",
        year: dateStr ? Number(dateStr.slice(0, 4)) || null : null,
        poster_path: (r.poster_path as string | null) ?? null,
        overview: (r.overview as string) ?? "",
        vote_average: Math.round(((r.vote_average as number) ?? 0) * 10) / 10,
      } satisfies TrendingItem;
    })
    .filter((x): x is TrendingItem => x !== null)
    .slice(0, 20);
}
