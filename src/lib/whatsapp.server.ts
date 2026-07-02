// Server-side WhatsApp messaging (Evolution API) + template rendering.
import { sanitizePhone } from "./otp.server";
import { createServerPublicSupabase } from "./supabase-public.server";
import { getServerEnv } from "./env.server";

const DEFAULT_TEMPLATES: Record<string, string> = {
  received: "✅ Olá {cliente}, recebemos seu pedido: {titulo} ({tipo}).",
  admin_new_request: "📥 Novo pedido recebido\nCliente: {cliente}\nWhatsApp: {whatsapp}\nTítulo: {titulo}\nTipo: {tipo}\nFormato: {formato}\nObs: {obs}",
  analyzing: "🔎 Olá {cliente}, seu pedido {titulo} está em análise.",
  approved: "✅ Olá {cliente}, seu pedido {titulo} foi aprovado.",
  completed: "🎬 Olá {cliente}, seu pedido {titulo} foi concluído.",
  fixed: "🛠️ Olá {cliente}, seu pedido {titulo} foi corrigido.",
  rejected: "❌ Olá {cliente}, seu pedido {titulo} foi recusado. Motivo: {motivo}",
};

async function readStoredConfig(): Promise<{ baseUrl: string; apiKey: string; instance: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("key, value")
      .in("key", ["evolution_url", "evolution_api_key", "evolution_instance"]);
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.value) map[row.key as string] = String(row.value);
    }
    return {
      baseUrl: map.evolution_url ?? "",
      apiKey: map.evolution_api_key ?? "",
      instance: map.evolution_instance ?? "",
    };
  } catch (err) {
    console.warn("[whatsapp] could not read stored config", (err as Error).message);
    return { baseUrl: "", apiKey: "", instance: "" };
  }
}

async function getConfig() {
  const stored = await readStoredConfig();
  const baseUrl = stored.baseUrl || getServerEnv("EVOLUTION_API_URL") || "";
  const apiKey = stored.apiKey || getServerEnv("EVOLUTION_API_KEY") || "";
  const instance = stored.instance || getServerEnv("EVOLUTION_INSTANCE") || "";
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    instance,
    configured: !!(baseUrl && apiKey && instance),
  };
}

export async function sendWhatsapp(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getConfig();
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
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.apiKey,
        "x-api-key": cfg.apiKey,
        Authorization: `Bearer ${cfg.apiKey}`,
      },
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
  const supabasePublic = createServerPublicSupabase();
  if (!supabasePublic) return DEFAULT_TEMPLATES[key] ?? null;

  const { data } = await supabasePublic
    .from("message_templates")
    .select("content")
    .eq("key", key)
    .maybeSingle();
  return (data?.content as string | undefined) ?? DEFAULT_TEMPLATES[key] ?? null;
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
  const result = await sendWhatsapp(to, message);
  if (!result.ok) {
    console.warn(`[whatsapp] template "${key}" not sent:`, result.error);
  }
}

export function sendOtpMessage(to: string, code: string, purpose: "signup" | "reset"): Promise<{ ok: boolean; error?: string }> {
  const label = purpose === "signup" ? "confirmação do seu cadastro" : "recuperação da sua senha";
  const msg =
    `🔐 *Portal VOD*\n\nSeu código para ${label} é:\n\n*${code}*\n\nEle expira em 10 minutos. Se não foi você, ignore esta mensagem.`;
  return sendWhatsapp(to, msg);
}

export async function getAdminWhatsappNumber(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "admin_whatsapp")
      .maybeSingle();
    const stored = data?.value ? String(data.value) : "";
    return stored || getServerEnv("ADMIN_WHATSAPP") || null;
  } catch {
    return getServerEnv("ADMIN_WHATSAPP") || null;
  }
}
