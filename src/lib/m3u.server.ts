// M3U parser + title normalization. Server-only.

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(hd|fhd|4k|sd|dublado|legendado|dual|leg|dub)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SERIES_RE = /\bS\s*(\d{1,2})\s*E\s*(\d{1,3})\b/i;

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
  const seenSeries = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXTINF")) continue;

    let url = "";
    for (let j = i + 1; j < lines.length && j < i + 5; j++) {
      const n = lines[j].trim();
      if (!n || n.startsWith("#")) continue;
      url = n;
      break;
    }
    if (!url) continue;

    const attrs: Record<string, string> = {};
    for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) {
      attrs[m[1]] = m[2];
    }
    const commaIdx = line.lastIndexOf(",");
    const displayName = (commaIdx >= 0 ? line.slice(commaIdx + 1) : attrs["tvg-name"] ?? "").trim();
    if (!displayName) continue;

    const category = attrs["group-title"]?.trim() || null;
    const categoryLower = (category ?? "").toLowerCase();

    const seriesMatch = displayName.match(SERIES_RE);
    const isSeries = !!seriesMatch || /s[eé]ries?\b/.test(categoryLower);

    let cleanTitle = displayName;
    if (seriesMatch && typeof seriesMatch.index === "number") {
      cleanTitle = displayName.slice(0, seriesMatch.index).trim().replace(/[-–—:|]+$/, "").trim();
    }

    const yearMatch = displayName.match(/\((19|20)\d{2}\)/) || displayName.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0].replace(/[()]/g, "")) : null;
    cleanTitle = cleanTitle.replace(/\s*\((19|20)\d{2}\)\s*/g, " ").trim();
    if (!cleanTitle) continue;

    const normalized = normalizeTitle(cleanTitle);
    if (!normalized) continue;

    const tvgId = attrs["tvg-id"];
    const tmdbId = tvgId && /^\d+$/.test(tvgId) ? Number(tvgId) : null;

    if (isSeries) {
      const key = `${normalized}|${year ?? ""}`;
      if (seenSeries.has(key)) continue;
      seenSeries.add(key);
    }

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
