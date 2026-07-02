// Shared phone helpers. Signup OTP is stateless in signup-otp.server.ts so the VPS does not need an admin key.

export function sanitizePhone(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}
