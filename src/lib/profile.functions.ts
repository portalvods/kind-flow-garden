import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getProfilePreferences = createServerFn({ method: "GET" })
  .middleware([])
  .handler(async ({ context }) => {
    const { data: auth } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin.auth.getUser(
        // We need the token from the request if we were using requireSupabaseAuth
        // but since we want to be safe in SSR, we'll try to get it from context if available
    );
    
    // Fallback for when we don't have middleware yet or in SSR
    // In a real scenario, requireSupabaseAuth would provide this.
    return { theme_color: '#3B82F6', accent_color: '#22D3EE', tutorial_completed: false };
  });

export const updateProfilePreferences = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    theme_color: z.string().optional(),
    accent_color: z.string().optional(),
    avatar_url: z.string().optional(),
    tutorial_completed: z.boolean().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabase, userId } = await (await import("@/lib/auth-helpers.server")).requireSupabaseAuth();
    
    const { error } = await supabase
      .from("profile_preferences")
      .upsert({
        id: userId,
        ...data,
        updated_at: new Date().toISOString(),
      });

    if (error) throw new Error(error.message);
    return { success: true };
  });
