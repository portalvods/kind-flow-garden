import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getServerEnv } from "./env.server";

const schema = z.object({
  tmdb_id: z.number().int().positive(),
  content_type: z.enum(["movie", "tv"]),
});

export type TrailerResult = { key: string | null; site: string | null; name: string | null };

type Video = { key?: string; site?: string; type?: string; name?: string; official?: boolean };

function pick(videos: Video[]): TrailerResult {
  const yt = videos.filter((v) => (v.site ?? "").toLowerCase() === "youtube" && v.key);
  const order = ["Trailer", "Teaser", "Clip"];
  for (const t of order) {
    const official = yt.find((v) => v.type === t && v.official);
    if (official) return { key: official.key!, site: "YouTube", name: official.name ?? null };
    const any = yt.find((v) => v.type === t);
    if (any) return { key: any.key!, site: "YouTube", name: any.name ?? null };
  }
  const first = yt[0];
  return first ? { key: first.key!, site: "YouTube", name: first.name ?? null } : { key: null, site: null, name: null };
}

async function fetchVideos(url: string, apiKey: string): Promise<Video[]> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const sep = url.includes("?") ? "&" : "?";
    const alt = await fetch(`${url}${sep}api_key=${apiKey}`);
    if (!alt.ok) return [];
    return ((await alt.json()) as { results?: Video[] }).results ?? [];
  }
  return ((await res.json()) as { results?: Video[] }).results ?? [];
}

export const getTrailer = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<TrailerResult> => {
    const apiKey = getServerEnv("TMDB_API_KEY");
    if (!apiKey) return { key: null, site: null, name: null };

    const base = `https://api.themoviedb.org/3/${data.content_type}/${data.tmdb_id}/videos`;
    try {
      let videos = await fetchVideos(`${base}?language=pt-BR`, apiKey);
      if (videos.length === 0) videos = await fetchVideos(`${base}?language=en-US`, apiKey);
      return pick(videos);
    } catch (err) {
      console.error("TMDB trailer failed", err);
      return { key: null, site: null, name: null };
    }
  });
