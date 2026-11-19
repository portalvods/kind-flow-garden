// M3U parser + title normalization. Server-only.

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\((?:19|20)\d{2}\)/g, " ")
    .replace(/\b(hd|fhd|uhd|4k|1080p|720p|2160p|sd|dublado|legendado|dual|leg|dub)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SERIES_RE = /\b(?:S\s*\d{1,2}\s*[- .]?\s*E\s*\d{1,3}|\d{1,2}x\d{1,3}|T(?:emp(?:orada)?)?\s*\d{1,2}\s*[- .]?\s*(?:EP?|epis[oó]dio)\s*\d{1,3}|temporada\s*\d{1,2})\b/i;

// The separator is the first comma outside quoted attributes; titles may contain commas.
function displayTitle(line: string): string {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if ((c === '"' || c === "'") && (!quote || quote === c)) quote = quote ? "" : c;
    if (c === "," && !quote) return line.slice(i + 1).trim();
  }
  return "";
}

export type ParsedItem = {
  kind: "movie" | "series";
  title: string;
  title_normalized: string;
  year: number | null;
  category: string | null;
  tmdb_id: number | null;
  stream_url: string;
};

export function parseM3u(text: string): ParsedItem[] {
  const lines = text.split(/\r?\n/);
  const out: ParsedItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^\uFEFF/, "").trim();
    if (!/^#EXTINF\b/i.test(line)) continue;

    let url = "";
    for (let j = i + 1; j < lines.length; j++) {
      const n = lines[j].trim();
      if (/^#EXTINF\b/i.test(n)) break;
      if (!n || n.startsWith("#")) continue;
      url = n;
      break;
    }
    if (!url) continue;

    const attrs: Record<string, string> = {};
    for (const m of line.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)) {
      attrs[m[1].toLowerCase()] = m[3];
    }
    const displayName = displayTitle(line) || attrs["tvg-name"]?.trim();
    if (!displayName) continue;

    const category = attrs["group-title"]?.trim() || null;
    const categoryLower = (category ?? "").toLowerCase();

    const seriesMatch = displayName.match(SERIES_RE);
    const isSeries = !!seriesMatch || /\b(s[eé]ries?|series|novelas?|animes?|temporadas?)\b/.test(categoryLower) || /\/series\//i.test(url);
    const isMovie = /\b(filmes?|movies?|vod|cinema)\b/.test(categoryLower) || /\/movie\//i.test(url);
    const isLive = /\b(canais|channels?|live|ao vivo|abertos|esportes|noticias)\b/.test(categoryLower) || /\/live\//i.test(url);
    if (isLive && !isSeries && !isMovie) continue;

    let cleanTitle = displayName;
    if (seriesMatch && typeof seriesMatch.index === "number") {
      cleanTitle = displayName.slice(0, seriesMatch.index).trim().replace(/[-–—:|]+$/, "").trim();
    }

    const yearMatch = cleanTitle.match(/\((?:19|20)\d{2}\)/) || cleanTitle.match(/\s(?:19|20)\d{2}\s*$/);
    const year = yearMatch ? Number(yearMatch[0].replace(/[()]/g, "")) : null;
    cleanTitle = cleanTitle.replace(/\s*\((19|20)\d{2}\)\s*/g, " ").trim();
    if (yearMatch && !yearMatch[0].includes("(")) cleanTitle = cleanTitle.replace(/\s(?:19|20)\d{2}\s*$/, "").trim();
    if (!cleanTitle) continue;

    const normalized = normalizeTitle(cleanTitle);
    if (!normalized) continue;

    // Numeric tvg-id usually identifies a provider stream, NOT a TMDB title.
    const explicitId = attrs["tmdb-id"] ?? attrs["tmdb_id"] ?? attrs["tvg-id"]?.match(/^tmdb[:/-](\d+)$/i)?.[1];
    const tmdbId = explicitId && /^\d+$/.test(explicitId) && Number(explicitId) > 0 ? Number(explicitId) : null;

    const key = `${isSeries ? "series" : "movie"}|${normalized}|${year ?? ""}|${tmdbId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      kind: isSeries ? "series" : "movie",
      title: cleanTitle.slice(0, 240),
      title_normalized: normalized.slice(0, 240),
      year,
      category: category ? category.slice(0, 200) : null,
      tmdb_id: tmdbId,
      stream_url: url.slice(0, 2000),
    });
  }
  return out;
}
