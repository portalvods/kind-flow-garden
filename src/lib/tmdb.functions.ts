import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getServerEnv } from "./env.server";

const searchSchema = z.object({
  query: z.string().trim().min(1).max(100),
});

export type TmdbResult = {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
};

export const searchTmdb = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => searchSchema.parse(data))
  .handler(async ({ data }): Promise<{ results: TmdbResult[]; configured: boolean }> => {
    const apiKey = getServerEnv("TMDB_API_KEY");
    if (!apiKey) return { results: [], configured: false };

    const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(
      data.query,
    )}&language=pt-BR&include_adult=false&page=1`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      if (!res.ok) {
        // fallback: try v3 api_key style
        const alt = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(
            data.query,
          )}&language=pt-BR&include_adult=false&page=1`,
        );
        if (!alt.ok) return { results: [], configured: true };
        return { results: mapResults(await alt.json()), configured: true };
      }
      return { results: mapResults(await res.json()), configured: true };
    } catch (err) {
      console.error("TMDB search failed", err);
      return { results: [], configured: true };
    }
  });

function mapResults(payload: unknown): TmdbResult[] {
  const raw = payload as { results?: Array<Record<string, unknown>> };
  return (raw.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 12)
    .map((r) => {
      const type = r.media_type as "movie" | "tv";
      const title = (type === "movie" ? r.title : r.name) as string;
      const dateStr = (type === "movie" ? r.release_date : r.first_air_date) as string | undefined;
      return {
        id: r.id as number,
        type,
        title: title ?? "Sem título",
        year: dateStr ? Number(dateStr.slice(0, 4)) || null : null,
        poster_path: (r.poster_path as string | null) ?? null,
        overview: (r.overview as string) ?? "",
      };
    });
}
