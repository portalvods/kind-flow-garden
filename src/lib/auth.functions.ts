// Auth flows: signup with WhatsApp OTP, login by whatsapp-or-email, forgot password.
import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes, randomInt } from "crypto";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { sanitizePhone } from "./otp.server";
import { issueSignupOtp, verifySignupOtp } from "./signup-otp.server";

// Rate limit: max N OTP requests per key in `windowSeconds`.
async function enforceOtpRateLimit(bucket: string, key: string, max: number, windowSeconds: number) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: number | null; error: { message: string } | null }>;
    }).rpc("rate_limit_check_and_hit", { _bucket: bucket, _key: key, _window_seconds: windowSeconds });
    if (error) {
      console.warn("[rate-limit] check failed:", error.message);
      return;
    }
    if ((data ?? 0) >= max) {
      throw new Error(`Muitas tentativas. Aguarde alguns minutos e tente novamente.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Muitas tentativas")) throw err;
    console.warn("[rate-limit] unavailable:", err instanceof Error ? err.message : String(err));
  }
}

function getIp(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    return "unknown";
  }
}


async function isWhatsappAlreadyRegistered(whatsapp: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: boolean | null; error: { message: string } | null }>;
    }).rpc("whatsapp_exists", { _whatsapp: whatsapp });

    if (error) {
      console.warn("[signup] whatsapp duplicate check failed:", error.message);
      return false;
    }

    return data === true;
  } catch (err) {
    console.warn("[signup] whatsapp duplicate check unavailable:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ---- Signup: request OTP ----
const startSignupSchema = z.object({
  full_name: z.string().trim().min(2).max(80),
  whatsapp: z.string().trim().min(10).max(20),
  email: z.string().trim().email().max(150),
  password: z.string().min(6).max(72),
});

export const startSignup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => startSignupSchema.parse(d))
  .handler(async ({ data }) => {
    const whatsapp = sanitizePhone(data.whatsapp);

    // Rate limit: max 5 signup OTPs per IP/hour, 3 per whatsapp/hour.
    await enforceOtpRateLimit("otp:signup:ip", getIp(), 5, 3600);
    await enforceOtpRateLimit("otp:signup:wa", whatsapp, 3, 3600);

    if (await isWhatsappAlreadyRegistered(whatsapp)) {
      throw new Error("Esse WhatsApp já está cadastrado. Entre com seu e-mail e senha ou use Esqueci a senha.");
    }

    const { code, token } = issueSignupOtp({
      full_name: data.full_name,
      email: data.email,
      whatsapp,
    });

    const { sendOtpMessage } = await import("./whatsapp.server");
    const res = await sendOtpMessage(whatsapp, code, "signup");
    if (!res.ok && res.error === "not_configured") {
      return {
        ok: true,
        whatsapp,
        token,
        devCode: code, // exposed only when WA not configured
        message: "WhatsApp não conectado — código exibido apenas em modo desenvolvimento.",
      };
    }
    if (!res.ok) throw new Error(`Não foi possível enviar o código (${res.error}).`);
    return { ok: true, whatsapp, token };
  });

// ---- Signup: verify OTP + create account ----
const verifySignupSchema = z.object({
  whatsapp: z.string().min(8).max(20),
  code: z.string().length(6),
  token: z.string().min(20),
});

export const verifySignup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => verifySignupSchema.parse(d))
  .handler(async ({ data }) => {
    const payload = verifySignupOtp({
      whatsapp: data.whatsapp,
      code: data.code,
      token: data.token,
    });

    return { ok: true, email: payload.email, full_name: payload.full_name, whatsapp: payload.whatsapp };
  });

// ---- Login: look up email by WhatsApp so the client can signInWithPassword ----
const lookupSchema = z.object({
  identifier: z.string().trim().min(3).max(150),
});

export const emailFromIdentifier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => lookupSchema.parse(d))
  .handler(async ({ data }): Promise<{ email: string }> => {
    const id = data.identifier.trim();
    if (id.includes("@")) return { email: id };

    const whatsapp = sanitizePhone(id);
    if (whatsapp.length < 10) throw new Error("WhatsApp inválido.");

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Não foi possível validar seu acesso. Tente novamente.");
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: email, error } = await sb.rpc("email_by_whatsapp", { _whatsapp: whatsapp });
    if (error) throw new Error("Não foi possível validar seu acesso. Tente novamente.");
    if (!email) throw new Error("Nenhuma conta encontrada com esse WhatsApp.");
    return { email: email as string };
  });

// ---- Forgot password: start (via WhatsApp OTP) ----
// Works on VPS WITHOUT the service role key: the code+token are stored in
// public.password_resets (hashed) and the password change happens via a
// SECURITY DEFINER RPC that updates auth.users directly.
const startResetSchema = z.object({
  whatsapp: z.string().trim().min(8).max(20),
});

function hashCode(code: string, token: string): string {
  return createHash("sha256").update(`wa-reset:${token}:${code}`).digest("hex");
}
function hashToken(token: string): string {
  return createHash("sha256").update(`wa-reset-token:${token}`).digest("hex");
}
function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

const RESET_TTL_SECONDS = 15 * 60;

export const startPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => startResetSchema.parse(d))
  .handler(async ({ data }) => {
    const whatsapp = sanitizePhone(data.whatsapp);
    if (whatsapp.length < 10) throw new Error("WhatsApp inválido (com DDD).");

    // Rate limit: max 3 reset OTPs per IP/hour, 3 per whatsapp/hour.
    await enforceOtpRateLimit("otp:reset:ip", getIp(), 3, 3600);
    await enforceOtpRateLimit("otp:reset:wa", whatsapp, 3, 3600);

    const { createServerPublicSupabase } = await import("./supabase-public.server");
    const sb = createServerPublicSupabase();
    if (!sb) throw new Error("Backend indisponível. Verifique SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY na VPS.");

    const code = generateSixDigitCode();
    const token = generateToken();

    const { error: rpcErr } = await (sb as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }).rpc("request_wa_password_reset", {
      _whatsapp: whatsapp,
      _code_hash: hashCode(code, token),
      _token_hash: hashToken(token),
      _ttl_seconds: RESET_TTL_SECONDS,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    const { sendOtpMessage } = await import("./whatsapp.server");
    const res = await sendOtpMessage(whatsapp, code, "reset");
    if (!res.ok && res.error === "not_configured") {
      return {
        ok: true,
        whatsapp,
        token,
        devCode: code, // shown only when WhatsApp isn't configured
        message: "WhatsApp não conectado — código exibido apenas em modo desenvolvimento.",
      };
    }
    if (!res.ok) throw new Error(`Não foi possível enviar o código (${res.error}).`);
    return { ok: true, whatsapp, token };
  });

// ---- Forgot password: verify OTP + set new password ----
const verifyResetSchema = z.object({
  whatsapp: z.string().min(8).max(20),
  code: z.string().length(6),
  token: z.string().min(20),
  new_password: z.string().min(6).max(72),
});

export const completePasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => verifyResetSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { createServerPublicSupabase } = await import("./supabase-public.server");
    const sb = createServerPublicSupabase();
    if (!sb) throw new Error("Backend indisponível. Verifique SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY na VPS.");

    const { error } = await (sb as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }).rpc("complete_wa_password_reset", {
      _token_hash: hashToken(data.token),
      _code_hash: hashCode(data.code, data.token),
      _new_password: data.new_password,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });
