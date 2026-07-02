// Auth flows: signup with WhatsApp OTP, login by whatsapp-or-email, forgot password.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { issueOtp, sanitizePhone, verifyOtp } from "./otp.server";
import { issueSignupOtp, verifySignupOtp } from "./signup-otp.server";
import { createServerPublicSupabase } from "./supabase-public.server";

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
  whatsapp: z.string().min(8).max(20),
});

export const startPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => startResetSchema.parse(d))
  .handler(async ({ data }) => {
    const whatsapp = sanitizePhone(data.whatsapp);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("whatsapp", whatsapp)
      .maybeSingle();
    if (!profile) throw new Error("Nenhuma conta com este WhatsApp.");

    const { code } = await issueOtp({
      whatsapp,
      purpose: "reset",
      payload: { user_id: profile.id },
    });

    const { sendOtpMessage } = await import("./whatsapp.server");
    const res = await sendOtpMessage(whatsapp, code, "reset");
    if (!res.ok && res.error === "not_configured") {
      return { ok: true, whatsapp, devCode: code };
    }
    if (!res.ok) throw new Error(`Não foi possível enviar o código (${res.error}).`);
    return { ok: true, whatsapp };
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
    const { payload } = await verifyOtp({
      whatsapp: data.whatsapp,
      purpose: "reset",
      code: data.code,
    });
    if (!payload?.user_id) throw new Error("Sessão de recuperação inválida.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const user_id = payload.user_id as string;
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: data.new_password,
    });
    if (error) throw new Error(error.message);

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user_id);
    return { ok: true, email: userData.user?.email ?? "" };
  });
