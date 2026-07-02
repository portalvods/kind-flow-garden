// OTP utilities — server only. Uses service role to bypass RLS on otp_codes.
import { createHash, randomInt } from "crypto";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MIN_INTERVAL_MS = 60 * 1000; // 1 minute between sends per number
const MAX_ATTEMPTS = 5;

export function sanitizePhone(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

function hashCode(code: string, whatsapp: string): string {
  return createHash("sha256").update(`${whatsapp}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

type Purpose = "signup" | "reset";

export async function issueOtp(params: {
  whatsapp: string;
  purpose: Purpose;
  payload?: Record<string, unknown>;
}): Promise<{ code: string; whatsapp: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const whatsapp = sanitizePhone(params.whatsapp);
  if (whatsapp.length < 10) throw new Error("Número de WhatsApp inválido.");

  // Rate limit
  const { data: recent } = await supabaseAdmin
    .from("otp_codes")
    .select("created_at")
    .eq("whatsapp", whatsapp)
    .eq("purpose", params.purpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent && Date.now() - new Date(recent.created_at as string).getTime() < MIN_INTERVAL_MS) {
    throw new Error("Aguarde 1 minuto para reenviar o código.");
  }

  const code = generateCode();
  const code_hash = hashCode(code, whatsapp);
  const expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error } = await supabaseAdmin.from("otp_codes").insert({
    whatsapp,
    purpose: params.purpose,
    code_hash,
    payload: (params.payload ?? null) as never,
    expires_at,
  });
  if (error) throw new Error(error.message);
  return { code, whatsapp };
}

export async function verifyOtp(params: {
  whatsapp: string;
  purpose: Purpose;
  code: string;
}): Promise<{ payload: Record<string, unknown> | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const whatsapp = sanitizePhone(params.whatsapp);
  const code = (params.code ?? "").trim();
  if (code.length !== 6) throw new Error("Código inválido.");

  const { data: row, error } = await supabaseAdmin
    .from("otp_codes")
    .select("*")
    .eq("whatsapp", whatsapp)
    .eq("purpose", params.purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Nenhum código pendente. Solicite um novo.");
  if (new Date(row.expires_at as string).getTime() < Date.now())
    throw new Error("Código expirado. Solicite um novo.");
  if ((row.attempts as number) >= MAX_ATTEMPTS)
    throw new Error("Muitas tentativas. Solicite um novo código.");

  const expected = hashCode(code, whatsapp);
  if (expected !== row.code_hash) {
    await supabaseAdmin
      .from("otp_codes")
      .update({ attempts: (row.attempts as number) + 1 })
      .eq("id", row.id as string);
    throw new Error("Código incorreto.");
  }

  await supabaseAdmin
    .from("otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id as string);

  return { payload: (row.payload as Record<string, unknown> | null) ?? null };
}
