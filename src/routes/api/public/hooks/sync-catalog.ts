import { createFileRoute } from "@tanstack/react-router";

// Sincronização automática do catálogo (M3U).
// Chamada por um agendador (pg_cron ou cron da VPS):
//   POST https://<seu-site>/api/public/hooks/sync-catalog?secret=<BOT_WEBHOOK_SECRET>
// Percorre todas as fontes ativas cujo intervalo já venceu e atualiza o catálogo.

async function runSync(secret: string) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { synchronizeCatalog } = await import("@/lib/catalog-sync.server");

  const { data: due, error } = await supabase.rpc("catalog_cron_due_sources", {
    _secret: secret,
  });
  if (error) throw new Error(error.message);

  const sources = (due ?? []) as Array<{ id: string; url: string; name: string }>;
  const results: Array<Record<string, unknown>> = [];

  for (const src of sources) {
    try {
      const result = await synchronizeCatalog(supabase, src, secret);
      results.push({ source: src.name, ...result });
    } catch (err) {
      const msg = (err as Error).message ?? "erro desconhecido";
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
    return Response.json({ ok: out.results.every((result) => result.ok === true), ...out });
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
