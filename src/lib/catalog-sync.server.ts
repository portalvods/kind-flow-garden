import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { parseM3u } from "./m3u.server";

export async function downloadPlaylist(url: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // The signal covers both the response headers and the entire large playlist body.
      const response = await fetch(url, {
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "application/x-mpegURL, audio/x-mpegurl, text/plain, */*" },
        signal: AbortSignal.timeout(300_000), redirect: "follow",
      });
      if (!response.ok) {
        if (attempt === 0 && response.status >= 500) { await response.body?.cancel(); continue; }
        throw new Error(`A fonte respondeu HTTP ${response.status}. Verifique o endereço e o acesso à lista.`);
      }
      const text = await response.text();
      if (!/^\s*(?:\uFEFF)?#EXT(?:M3U|INF)/im.test(text)) throw new Error("A fonte não retornou uma lista M3U válida.");
      const items = parseM3u(text);
      if (!items.length) throw new Error("Nenhum filme ou série válido encontrado. O catálogo anterior foi preservado.");
      return items;
    } catch (error) {
      const timeout = error instanceof Error && /TimeoutError|AbortError/.test(error.name);
      if (attempt === 0 && (timeout || error instanceof TypeError)) continue;
      if (timeout) throw new Error("A fonte não terminou de enviar a lista em 5 minutos. Verifique o servidor da lista e tente novamente.");
      if (error instanceof TypeError) throw new Error("Não foi possível conectar à fonte. Verifique o endereço e se o servidor está disponível.");
      throw error;
    }
  }
  throw new Error("Não foi possível baixar a lista.");
}

export async function synchronizeCatalog(client: SupabaseClient<Database>, source: { id: string; url: string }, secret?: string) {
  const run = crypto.randomUUID();
  const auth = secret ? { _secret: secret } : {};
  const { error: startError } = await client.rpc("catalog_sync_start", { _source_id: source.id, _run: run, ...auth });
  if (startError) throw new Error(startError.message);
  try {
    const items = await downloadPlaylist(source.url);
    const chunkSize = 500;
    const batches = Math.ceil(items.length / chunkSize);
    for (let batch = 0; batch < batches; batch++) {
      const args = { _source_id: source.id, _run: run, _batch: batch, _items: items.slice(batch * chunkSize, (batch + 1) * chunkSize) as unknown as Json, ...auth };
      let result = await client.rpc("catalog_sync_stage", args);
      if (result.error) result = await client.rpc("catalog_sync_stage", args); // Idempotent retry, never duplicate rows.
      if (result.error) throw new Error(result.error.message);
    }
    const { data, error } = await client.rpc("catalog_sync_commit", { _source_id: source.id, _run: run, _batches: batches, _total: items.length, ...auth });
    if (error) throw new Error(error.message);
    return data as { ok: true; movies: number; series: number; total: number };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronização";
    await client.rpc("catalog_sync_fail", { _source_id: source.id, _run: run, _error: message, ...auth });
    throw new Error(`Sincronização falhou: ${message}`);
  }
}