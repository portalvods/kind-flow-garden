// Server-side WhatsApp messaging (Evolution API) + template rendering.
import { sanitizePhone } from "./otp.server";

function getConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  return {
    baseUrl: baseUrl?.replace(/\/$/, "") ?? "",
    apiKey: apiKey ?? "",
    instance: instance ?? "",
    configured: !!(baseUrl && apiKey && instance),
  };
}

export async function sendWhatsapp(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = getConfig();
  if (!cfg.configured) {
    console.info("[whatsapp] Evolution API not configured; skipping notification");
    return { ok: false, error: "not_configured" };
  }
  const number = sanitizePhone(to);
  if (!number) return { ok: false, error: "invalid_number" };

  try {
    const url = `${cfg.baseUrl}/message/sendText/${encodeURIComponent(cfg.instance)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      body: JSON.stringify({ number, text: message }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[whatsapp] send failed", res.status, text);
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[whatsapp] send exception", err);
    return { ok: false, error: (err as Error).message };
  }
}

export async function getTemplate(key: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("message_templates")
    .select("content")
    .eq("key", key)
    .maybeSingle();
  return (data?.content as string | undefined) ?? null;
}

export function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    if (v === undefined || v === null || v === "") return "—";
    return String(v);
  });
}

export async function sendTemplate(
  to: string | null | undefined,
  key: string,
  vars: Record<string, string | number | null | undefined>,
): Promise<void> {
  if (!to) return;
  const tpl = await getTemplate(key);
  if (!tpl) {
    console.warn(`[whatsapp] template "${key}" not found`);
    return;
  }
  const message = renderTemplate(tpl, vars);
  await sendWhatsapp(to, message);
}

export function sendOtpMessage(to: string, code: string, purpose: "signup" | "reset"): Promise<{ ok: boolean; error?: string }> {
  const label = purpose === "signup" ? "confirmação do seu cadastro" : "recuperação da sua senha";
  const msg =
    `🔐 *Portal VOD*\n\nSeu código para ${label} é:\n\n*${code}*\n\nEle expira em 10 minutos. Se não foi você, ignore esta mensagem.`;
  return sendWhatsapp(to, msg);
}
