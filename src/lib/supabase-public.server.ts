import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getServerEnv } from "./env.server";

export function createServerPublicSupabase() {
  const url = getServerEnv("SUPABASE_URL") || getServerEnv("VITE_SUPABASE_URL");
  const key =
    getServerEnv("SUPABASE_PUBLISHABLE_KEY") ||
    getServerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    getServerEnv("VITE_SUPABASE_ANON_KEY");

  if (!url || !key) return null;

  return createClient<Database>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}