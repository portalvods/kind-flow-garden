import { createFileRoute } from "@tanstack/react-router";

// Bot de recebimento: quando um contato manda mensagem para o WhatsApp
// conectado, respondemos automaticamente com a mensagem configurada.
// Configure na Evolution API:
//   URL: https://<seu-site>/api/public/webhooks/evolution?secret=<SECRET>
//   Eventos: MESSAGES_UPSERT

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

        // Use anon client + SECURITY DEFINER RPCs (funciona sem service role na VPS)
        const { supabase } = await import("@/integrations/supabase/client");

        const { data: cfg, error: cfgErr } = await supabase
          .rpc("bot_config_by_secret", { _secret: providedSecret });
        if (cfgErr) {
          return new Response(`Config error: ${cfgErr.message}`, { status: 500 });
        }
        const row = Array.isArray(cfg) ? cfg[0] : cfg;
        if (!row) return new Response("Unauthorized", { status: 401 });
        if (!row.enabled) return Response.json({ ok: true, skipped: "disabled" });

        const { data: allowed } = await supabase.rpc("bot_try_hit", {
          _secret: providedSecret,
          _key: number,
          _ttl_seconds: 3600,
        });
        if (!allowed) return Response.json({ ok: true, skipped: "rate_limited" });

        try {
          const { sendWhatsapp } = await import("@/lib/whatsapp.server");
          await sendWhatsapp(number, row.message ?? "Olá!", { supabase: supabase as never });
        } catch (err) {
          console.error("[bot] send failed", err);
        }
        return Response.json({ ok: true, replied_to: number });
      },
    },
  },
});
