// Shared phone helpers. Signup OTP is stateless in signup-otp.server.ts so the VPS does not need an admin key.

export function sanitizePhone(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function normalizePhone(phone: string): string {
  const digits = sanitizePhone(phone);
  if (!digits) return "";
  // Já inclui código do país (mais de 11 dígitos) — mantém como está.
  if (digits.length > 11) return digits;
  // Número brasileiro com DDD (10 ou 11 dígitos) — adiciona 55 automaticamente.
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return digits;
}

