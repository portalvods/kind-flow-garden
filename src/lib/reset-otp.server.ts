// Stateless HMAC OTP token for password reset via WhatsApp.
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { sanitizePhone } from "./otp.server";
import { getServerEnv } from "./env.server";

const OTP_TTL_MS = 10 * 60 * 1000;

type ResetPayload = {
  purpose: "reset";
  whatsapp: string;
  code_hash: string;
  expires_at: number;
  data: { email: string; user_id: string };
};

function getSigningSecret(): string {
  const secret =
    getServerEnv("OTP_SIGNING_SECRET") ||
    getServerEnv("LOVABLE_API_KEY") ||
    getServerEnv("EVOLUTION_API_KEY");
  if (!secret) throw new Error("Configuração incompleta. Defina LOVABLE_API_KEY ou EVOLUTION_API_KEY na VPS.");
  return secret;
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code: string, whatsapp: string): string {
  return createHash("sha256").update(`reset:${whatsapp}:${code}`).digest("hex");
}

function encodePayload(p: ResetPayload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}
function decodePayload(s: string): ResetPayload {
  return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as ResetPayload;
}
function sign(encoded: string): string {
  return createHmac("sha256", getSigningSecret()).update(encoded).digest("base64url");
}
function safeEqual(a: string, b: string): boolean {
  const l = Buffer.from(a);
  const r = Buffer.from(b);
  return l.length === r.length && timingSafeEqual(l, r);
}

export function issueResetOtp(data: { whatsapp: string; email: string; user_id: string }): {
  code: string;
  token: string;
  whatsapp: string;
} {
  const whatsapp = sanitizePhone(data.whatsapp);
  if (whatsapp.length < 10) throw new Error("WhatsApp inválido.");
  const code = generateCode();
  const payload: ResetPayload = {
    purpose: "reset",
    whatsapp,
    code_hash: hashCode(code, whatsapp),
    expires_at: Date.now() + OTP_TTL_MS,
    data: { email: data.email.toLowerCase(), user_id: data.user_id },
  };
  const encoded = encodePayload(payload);
  return { code, token: `${encoded}.${sign(encoded)}`, whatsapp };
}

export function verifyResetOtp(params: { token: string; whatsapp: string; code: string }): ResetPayload["data"] {
  const [encoded, signature] = params.token.split(".");
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) {
    throw new Error("Código inválido ou expirado. Solicite um novo.");
  }
  const payload = decodePayload(encoded);
  const whatsapp = sanitizePhone(params.whatsapp);
  const code = (params.code ?? "").trim();
  if (payload.purpose !== "reset" || payload.whatsapp !== whatsapp) {
    throw new Error("Código inválido. Solicite um novo.");
  }
  if (payload.expires_at < Date.now()) throw new Error("Código expirado. Solicite um novo.");
  if (hashCode(code, whatsapp) !== payload.code_hash) throw new Error("Código incorreto.");
  return payload.data;
}
