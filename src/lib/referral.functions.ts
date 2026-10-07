// Public referral link lookup: /r/<code> -> signup with the reseller id.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ code: z.string().trim().min(3).max(40) });

export const resolveReferralCode = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }): Promise<{ reseller: string | null }> => {
    const code = data.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) return { reseller: null };

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return { reseller: null };

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: uid, error } = await sb.rpc("resolve_referral_code", { _code: code });
    console.log("[referral] rpc result", uid, error?.message);
    if (error) {
      console.warn("[referral] resolve failed:", error.message);
      return { reseller: null };
    }
    return { reseller: typeof uid === "string" ? uid : null };
  });
