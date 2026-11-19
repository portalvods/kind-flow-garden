import { describe, expect, test } from "vitest";
import { normalizeTitle, parseM3u } from "./m3u.server";

const playlist = (info: string, url = "https://example.test/movie/1.mp4") => `\uFEFF#EXTM3U\n  #EXTINF:-1 ${info}\n${url}`;
describe("precise list identification", () => {
  test("keeps commas in titles and quoted categories", () => {
    expect(parseM3u(playlist('group-title="Filmes, drama",Eu, Robô (2004)'))[0]).toMatchObject({ title: "Eu, Robô", year: 2004, title_normalized: "eu robo" });
  });
  test("does not confuse stream IDs with title IDs", () => {
    expect(parseM3u(playlist('tvg-id="66732",Outro Filme'))[0].tmdb_id).toBeNull();
    expect(parseM3u(playlist('tmdb-id="66732",Outro Filme'))[0].tmdb_id).toBe(66732);
  });
  test.each(["S01E02", "S01 E02", "1x02", "T01 EP02", "Temporada 1"])("groups episodes using %s", (episode) => {
    expect(parseM3u(playlist(`group-title='Séries',Dark ${episode}`, "https://example.test/series/2.mp4"))[0]).toMatchObject({ kind: "series", title_normalized: "dark" });
  });
  test("preserves numeric movie names", () => {
    expect(normalizeTitle("1917")).toBe("1917");
    expect(parseM3u(playlist(',1917 (2019)'))[0]).toMatchObject({ title: "1917", year: 2019 });
  });
  test("deduplicates variants without conflating remakes", () => {
    const text = [playlist(',Duna (2021) HD'), playlist(',Duna (2021) 4K'), playlist(',Duna (1984)')].join('\n');
    expect(parseM3u(text)).toHaveLength(2);
  });
  test("excludes live channels", () => {
    expect(parseM3u(playlist('group-title="Canais ao vivo",Notícias', 'https://example.test/live/1.ts'))).toEqual([]);
  });
  test("does not attach the next item's URL to a broken entry", () => {
    expect(parseM3u('#EXTM3U\n#EXTINF:-1,Sem URL\n#EXTINF:-1,Filme válido\nhttps://example.test/movie/2.mp4').map(x => x.title)).toEqual(["Filme válido"]);
  });
});