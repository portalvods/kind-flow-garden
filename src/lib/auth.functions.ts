// Auth flows: signup with WhatsApp OTP, login by whatsapp-or-email, forgot password.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sanitizePhone } from "./otp.server";
import { issueSignupOtp, verifySignupOtp } from "./signup-otp.server";
import { createServerPublicSupabase } from "./supabase-public.server";
import { getServerEnv } from "./env.server";

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
    // Already an email?
    if (id.includes("@")) return { email: id };

    const whatsapp = sanitizePhone(id);
    if (whatsapp.length < 10) throw new Error("WhatsApp inválido.");

    throw new Error("Na VPS, entre usando seu e-mail e senha. O login por WhatsApp precisa da chave administrativa do backend.");
  });

// ---- Forgot password: start ----
const startResetSchema = z.object({
  whatsapp: z.string().trim().email().max(150),
});

export const startPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => startResetSchema.parse(d))
  .handler(async ({ data }) => {
    const identifier = data.whatsapp.trim();
    if (!identifier.includes("@")) {
      throw new Error("Na VPS, a recuperação de senha precisa ser feita pelo e-mail cadastrado.");
    }

    const supabasePublic = createServerPublicSupabase();
    if (!supabasePublic) throw new Error("Backend não configurado na VPS.");

    const { error } = await supabasePublic.auth.resetPasswordForEmail(identifier, {
      redirectTo: `${getServerEnv("PUBLIC_SITE_URL") ?? getServerEnv("SITE_URL") ?? ""}/auth?mode=forgot`,
    });
    if (error) throw new Error(error.message);
    return { ok: true, whatsapp: identifier };
  });

// ---- Forgot password: verify + set new password ----
const verifyResetSchema = z.object({
  whatsapp: z.string().min(8).max(20),
  code: z.string().length(6),
  new_password: z.string().min(6).max(72),
});

export const completePasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => verifyResetSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; email: string }> => {
    void data;
    throw new Error("Abra o link de recuperação enviado por e-mail para definir a nova senha.");
  });
