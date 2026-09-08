import { createFileRoute } from "@tanstack/react-router";
import { normalizePhone } from "@/lib/otp.server";

// Bot de recebimento: quando um contato manda mensagem para o WhatsApp
// conectado, tentamos criar um pedido automaticamente (identificando o
// cliente pelo número) e respondemos com o resultado.
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
        const number = normalizePhone(remoteJid.split("@")[0] ?? "");
        if (!number) return Response.json({ ok: true, skipped: "no_number" });


        const { supabase } = await import("@/integrations/supabase/client");

        const { data: cfg, error: cfgErr } = await supabase
          .rpc("bot_config_by_secret", { _secret: providedSecret });
        if (cfgErr) return new Response(`Config error: ${cfgErr.message}`, { status: 500 });
        const row = Array.isArray(cfg) ? cfg[0] : cfg;
        if (!row) return new Response("Unauthorized", { status: 401 });
        if (!row.enabled) return Response.json({ ok: true, skipped: "disabled" });

        const text = extractText(msgData);

        // Ignora risadas/ruído ("kkkkk", "hahaha", "rsrs", emojis soltos,
        // ou o mesmo caractere repetido) — o bot não responde a isso.
        const compact = text.replace(/\s/g, "");
        const isNoise =
          !compact ||
          /^[kK]+$/.test(compact) ||
          /^(?:ha|rs|hu|he)+!*$/i.test(compact) ||
          /^(.)\1*$/.test(compact) ||
          !/[a-zA-ZÀ-ÿ0-9]/.test(compact);
        if (isNoise) {
          return Response.json({ ok: true, skipped: "noise" });
        }

        const contactName: string | null = msgData?.pushName ?? null;
        const { sendWhatsapp } = await import("@/lib/whatsapp.server");

        const log = async (direction: "in" | "out", body: string) => {
          try {
            await supabase.rpc("bot_log_message", {
              _secret: providedSecret,
              _whatsapp: number,
              _direction: direction,
              _body: body,
              _name: contactName ?? undefined,
            });
          } catch (err) {
            console.warn("[bot] log failed", (err as Error).message);
          }
        };

        const say = async (body: string) => {
          try {
            await sendWhatsapp(number, body, { supabase: supabase as never });
            await log("out", body);
          } catch (err) {
            console.error("[bot] reply failed", err);
          }
        };

        await log("in", text);

        // Situação do cliente (pedidos, limite diário, bloqueio)
        const { data: statusRaw } = await supabase.rpc("bot_client_status", {
          _secret: providedSecret,
          _whatsapp: number,
        });
        const status = (statusRaw ?? { ok: false, code: "unknown" }) as any;

        if (status?.code === "not_registered") {
          await say(
            "Olá! Não encontrei seu número cadastrado no site. Crie uma conta em nosso portal usando este mesmo WhatsApp e depois é só falar comigo por aqui. 🙂",
          );
          return Response.json({ ok: true, code: "not_registered" });
        }
        if (status?.blocked) {
          await say("Sua conta está bloqueada. Entre em contato com o suporte.");
          return Response.json({ ok: true, code: "blocked" });
        }

        // Histórico recente para dar contexto à IA
        const { data: hist } = await supabase
          .from("wa_messages")
          .select("direction, body")
          .eq("whatsapp", number)
          .order("created_at", { ascending: false })
          .limit(7);
        const history = ((hist ?? []) as Array<{ direction: "in" | "out"; body: string }>)
          .slice(1)
          .reverse();

        const { askBotAi } = await import("@/lib/bot-ai.server");
        const decision = await askBotAi({
          message: text,
          status,
          ordersEnabled: row.orders_enabled !== false,
          history,
        });

        const parsed =
          decision?.action === "create_request" && decision.title
            ? {
                title: decision.title.slice(0, 200),
                kind: decision.request_kind ?? "adicao",
                contentType: decision.content_type ?? "movie",
              }
            : parseCommand(text);

        // Sem pedido identificado: responde com a IA (ou mensagem padrão do painel)
        if (!parsed) {
          if (decision?.reply) {
            await say(decision.reply);
            return Response.json({ ok: true, replied: "ai" });
          }
          const { data: allowed } = await supabase.rpc("bot_try_hit", {
            _secret: providedSecret,
            _key: number,
            _ttl_seconds: 3600,
          });
          if (!allowed) return Response.json({ ok: true, skipped: "rate_limited" });
          await say(row.message ?? "Olá!");
          return Response.json({ ok: true, replied: "greeting" });
        }

        // Pedidos pelo WhatsApp desativados no painel
        if (row.orders_enabled === false) {
          await say(
            decision?.reply ??
              "⚠️ Os pedidos pelo WhatsApp estão temporariamente desativados. Por favor, faça sua solicitação diretamente no nosso site. 🙂",
          );
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
            reply =
              decision?.reply ??
              `✅ Pedido registrado!\n\n🎬 *${parsed.title}*\nTipo: ${parsed.contentType === "tv" ? "Série" : "Filme"}\n\nVocê já usou ${r.used}/${r.limit} pedidos hoje. Vamos te avisar por aqui assim que estiver disponível.`;
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

        await say(reply);

        return Response.json({ ok: true, code: r.code, request_id: (result as any)?.request_id });
      },
    },
  },
});
