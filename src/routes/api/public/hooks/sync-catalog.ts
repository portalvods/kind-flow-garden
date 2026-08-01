import { createFileRoute } from "@tanstack/react-router";

// Sincronização automática do catálogo (M3U).
// Chamada por um agendador (pg_cron ou cron da VPS):
//   POST https://<seu-site>/api/public/hooks/sync-catalog?secret=<BOT_WEBHOOK_SECRET>
// Percorre todas as fontes ativas cujo intervalo já venceu e atualiza o catálogo.

async function runSync(secret: string) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { parseM3u } = await import("@/lib/m3u.server");

  const { data: due, error } = await supabase.rpc("catalog_cron_due_sources", {
    _secret: secret,
  });
  if (error) throw new Error(error.message);

  const sources = (due ?? []) as Array<{ id: string; url: string; name: string }>;
  const results: Array<Record<string, unknown>> = [];

  for (const src of sources) {
    try {
      const res = await fetch(src.url, { headers: { "User-Agent": "PortalVOD/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const items = parseM3u(text);
      const movies = items.filter((i) => i.kind === "movie").length;
      const series = items.filter((i) => i.kind === "series").length;

      const CHUNK = 2000;
      // primeiro lote substitui tudo; os demais são acrescentados
      let first = true;
      let inserted = 0;
      for (let i = 0; i < items.length || first; i += CHUNK) {
        const slice = items.slice(i, i + CHUNK);
        const { data: count, error: rpcErr } = await supabase.rpc(
          first ? "catalog_cron_replace" : "catalog_cron_append",
          { _secret: secret, _source_id: src.id, _items: slice as unknown as never },
        );
        if (rpcErr) throw new Error(rpcErr.message);
        inserted += Number(count ?? 0);
        first = false;
      }

      await supabase.rpc("catalog_cron_finish", {
        _secret: secret,
        _source_id: src.id,
        _status: "ok",
        _error: null as unknown as string,
        _movies: movies,
        _series: series,
      });
      results.push({ source: src.name, ok: true, inserted, movies, series });
    } catch (err) {
      const msg = (err as Error).message ?? "erro desconhecido";
      await supabase.rpc("catalog_cron_finish", {
        _secret: secret,
        _source_id: src.id,
        _status: "error",
        _error: msg,
        _movies: null as unknown as number,
        _series: null as unknown as number,
      });
      results.push({ source: src.name, ok: false, error: msg });
    }
  }

  return { checked: sources.length, results };
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const secret =
    url.searchParams.get("secret") ??
    request.headers.get("x-cron-secret") ??
    "";
  if (!secret) {
    return new Response(JSON.stringify({ error: "missing secret" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const out = await runSync(secret);
    return Response.json({ ok: true, ...out });
  } catch (err) {
    const msg = (err as Error).message ?? "erro";
    const unauthorized = /unauthorized/i.test(msg);
    return new Response(JSON.stringify({ ok: false, error: unauthorized ? "unauthorized" : msg }), {
      status: unauthorized ? 401 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/hooks/sync-catalog")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
