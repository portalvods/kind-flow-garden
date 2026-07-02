import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { sanitizePhone } from "./otp.server";

const OTP_TTL_MS = 10 * 60 * 1000;

type SignupPayload = {
  purpose: "signup";
  whatsapp: string;
  code_hash: string;
  expires_at: number;
  data: {
    full_name: string;
    email: string;
    whatsapp: string;
  };
};

function getSigningSecret(): string {
  const secret = process.env.OTP_SIGNING_SECRET || process.env.LOVABLE_API_KEY || process.env.EVOLUTION_API_KEY;
  if (!secret) {
    throw new Error("Configuração de cadastro incompleta. Defina LOVABLE_API_KEY ou EVOLUTION_API_KEY na VPS.");
  }
  return secret;
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code: string, whatsapp: string): string {
  return createHash("sha256").update(`${whatsapp}:${code}`).digest("hex");
}

function encodePayload(payload: SignupPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded: string): SignupPayload {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SignupPayload;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getSigningSecret()).update(encodedPayload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueSignupOtp(data: { full_name: string; email: string; whatsapp: string }): {
  code: string;
  token: string;
  whatsapp: string;
} {
  const whatsapp = sanitizePhone(data.whatsapp);
  if (whatsapp.length < 10) throw new Error("Número de WhatsApp inválido.");

  const code = generateCode();
  const payload: SignupPayload = {
    purpose: "signup",
    whatsapp,
    code_hash: hashCode(code, whatsapp),
    expires_at: Date.now() + OTP_TTL_MS,
    data: {
      full_name: data.full_name,
      email: data.email.toLowerCase(),
      whatsapp,
    },
  };
  const encoded = encodePayload(payload);
  return { code, token: `${encoded}.${sign(encoded)}`, whatsapp };
}

export function verifySignupOtp(params: { token: string; whatsapp: string; code: string }): SignupPayload["data"] {
  const [encoded, signature] = params.token.split(".");
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) {
    throw new Error("Código inválido ou expirado. Solicite um novo.");
  }

  const payload = decodePayload(encoded);
  const whatsapp = sanitizePhone(params.whatsapp);
  const code = (params.code ?? "").trim();
  if (payload.purpose !== "signup" || payload.whatsapp !== whatsapp) {
    throw new Error("Código inválido. Solicite um novo.");
  }
  if (payload.expires_at < Date.now()) {
    throw new Error("Código expirado. Solicite um novo.");
  }
  if (hashCode(code, whatsapp) !== payload.code_hash) {
    throw new Error("Código incorreto.");
  }

  return payload.data;
}