import { createFileRoute } from "@tanstack/react-router";

// Bot de recebimento: quando um contato manda mensagem para o WhatsApp
// conectado, tentamos criar um pedido automaticamente (identificando o
// cliente pelo número) e respondemos com o resultado.
//
// Configure na Evolution API:
//   URL: https://<seu-site>/api/public/webhooks/evolution?secret=<SECRET>
//   Eventos: MESSAGES_UPSERT

const KEYWORDS = [
  "pedido",
  "pedir",
  "quero",
  "queria",
  "solicito",
  "solicitar",
  "adicionar",
  "adiciona",
  "filme",
  "série",
  "serie",
  "novela",
  "anime",
  "desenho",
  "documentário",
  "documentario",
];

function extractText(msgData: any): string {
  const m = msgData?.message ?? {};
  return (
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.imageMessage?.caption ??
    m?.videoMessage?.caption ??
    m?.documentMessage?.caption ??
    m?.buttonsResponseMessage?.selectedDisplayText ??
    m?.listResponseMessage?.title ??
    ""
  ).toString();
}

function parseCommand(raw: string): { title: string; kind: "adicao" | "atualizacao" | "conserto"; contentType: "movie" | "tv" } | null {
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  // Precisa começar com uma palavra-chave OU ter :/-  ex: "pedido: X"
  let match: RegExpMatchArray | null = null;
  const kwPattern = new RegExp(
    `^\\s*(?:${KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})\\b[\\s:,\\-–—]*([\\s\\S]+)$`,
    "i",
  );
  match = text.match(kwPattern);
  if (!match) return null;

  let title = match[1].trim();
  // remove artigos e conectores iniciais tipo "o filme", "a série", "de", etc.
  title = title.replace(/^(?:o|a|os|as|um|uma|de|do|da|dos|das)\s+/i, "").trim();
  // remove sufixo tipo "por favor", "pfv", "pls"
  title = title.replace(/[.,]?\s*(?:por favor|pfv|pls|obrigado|obrigada)\s*[!.?]*$/i, "").trim();
  if (title.length < 2) return null;

  const kind: "adicao" | "atualizacao" | "conserto" =
    /\b(atualiz|nova\s+temporada|episódio novo|episodio novo)/i.test(lower)
      ? "atualizacao"
      : /\b(conserto|consertar|quebrad|não\s+abre|nao\s+abre|erro|com\s+erro|com\s+problema)/i.test(lower)
        ? "conserto"
        : "adicao";

  const contentType: "movie" | "tv" =
    /\b(s[eé]rie|novela|anime|desenho|temporada|epis[oó]dio|dorama)\b/i.test(lower) ? "tv" : "movie";

  return { title: title.slice(0, 200), kind, contentType };
}

export const Route = createFileRoute("/api/public/webhooks/evolution")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const providedSecret = url.searchParams.get("secret") ?? "";
        if (!providedSecret) return new Response("Unauthorized", { status: 401 });

        let payload: any = {};
        try { payload = await request.json(); } catch { /* ignore */ }

        const eventType: string = payload?.event ?? "";
        if (eventType && !/messages\.?upsert/i.test(eventType)) {
          return Response.json({ ok: true, skipped: "not_message" });
        }
        const msgData = payload?.data ?? payload;
        const key = msgData?.key ?? {};
        const fromMe = !!key?.fromMe;
        const remoteJid: string = key?.remoteJid ?? "";
        if (fromMe || !remoteJid || remoteJid.endsWith("@g.us")) {
          return Response.json({ ok: true, skipped: "self_or_group" });
        }
        const number = remoteJid.split("@")[0]?.replace(/\D/g, "");
        if (!number) return Response.json({ ok: true, skipped: "no_number" });

        const { supabase } = await import("@/integrations/supabase/client");

        const { data: cfg, error: cfgErr } = await supabase
          .rpc("bot_config_by_secret", { _secret: providedSecret });
        if (cfgErr) return new Response(`Config error: ${cfgErr.message}`, { status: 500 });
        const row = Array.isArray(cfg) ? cfg[0] : cfg;
        if (!row) return new Response("Unauthorized", { status: 401 });
        if (!row.enabled) return Response.json({ ok: true, skipped: "disabled" });

        const text = extractText(msgData);
        const parsed = parseCommand(text);

        const { sendWhatsapp } = await import("@/lib/whatsapp.server");

        // Se não parece pedido, aplica anti-flood e manda mensagem padrão.
        if (!parsed) {
          const { data: allowed } = await supabase.rpc("bot_try_hit", {
            _secret: providedSecret,
            _key: number,
            _ttl_seconds: 3600,
          });
          if (!allowed) return Response.json({ ok: true, skipped: "rate_limited" });
          try {
            await sendWhatsapp(number, row.message ?? "Olá!", { supabase: supabase as never });
          } catch (err) { console.error("[bot] greet failed", err); }
          return Response.json({ ok: true, replied: "greeting" });
        }

        // Pedidos pelo WhatsApp desativados no painel
        if (row.orders_enabled === false) {
          try {
            await sendWhatsapp(
              number,
              "⚠️ Os pedidos pelo WhatsApp estão temporariamente desativados. Por favor, faça sua solicitação diretamente no nosso site. 🙂",
              { supabase: supabase as never },
            );
          } catch (err) { console.error("[bot] orders-disabled reply failed", err); }
          return Response.json({ ok: true, skipped: "orders_disabled" });
        }

        // Tenta criar o pedido
        const { data: result, error: rpcErr } = await supabase.rpc("bot_create_request", {
          _secret: providedSecret,
          _whatsapp: number,
          _title: parsed.title,
          _content_type: parsed.contentType,
          _request_kind: parsed.kind,
        });
        if (rpcErr) {
          console.error("[bot] create failed", rpcErr);
          return new Response(`RPC error: ${rpcErr.message}`, { status: 500 });
        }

        const r = (result ?? {}) as { ok?: boolean; code?: string; limit?: number; used?: number };
        let reply = "";
        switch (r.code) {
          case "created":
            reply = `✅ Pedido registrado!\n\n🎬 *${parsed.title}*\nTipo: ${parsed.contentType === "tv" ? "Série" : "Filme"}\n\nVocê já usou ${r.used}/${r.limit} pedidos hoje. Vamos te avisar por aqui assim que estiver disponível.`;
            break;
          case "not_registered":
            reply = `Olá! Não encontrei seu número cadastrado no site. Crie uma conta em nosso portal usando este mesmo WhatsApp e depois é só mandar seu pedido por aqui. 🙂`;
            break;
          case "blocked":
            reply = `Sua conta está bloqueada. Entre em contato com o suporte.`;
            break;
          case "limit_reached":
            reply = `⚠️ Você já atingiu o limite diário de ${r.limit} pedidos. Tente novamente amanhã!`;
            break;
          case "empty_title":
            reply = `Não consegui identificar o nome do conteúdo. Envie assim:\n\n_pedido Vingadores Ultimato_\n_quero a série Breaking Bad_`;
            break;
          default:
            reply = `Não consegui processar seu pedido agora. Tente novamente em instantes.`;
        }

        try {
          await sendWhatsapp(number, reply, { supabase: supabase as never });
        } catch (err) {
          console.error("[bot] reply failed", err);
        }

        return Response.json({ ok: true, code: r.code, request_id: (result as any)?.request_id });
      },
    },
  },
});
