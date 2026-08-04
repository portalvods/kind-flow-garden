import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Simple middleware-like helper
async function getAuthenticatedContext() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: { user } } = await supabaseAdmin.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase: supabaseAdmin, userId: user.id };
}

export const getProfilePreferences = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const { supabase, userId } = await getAuthenticatedContext();
      const { data } = await supabase
        .from("profile_preferences")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      
      return data ?? { theme_color: '#3B82F6', accent_color: '#22D3EE', tutorial_completed: false };
    } catch {
      return { theme_color: '#3B82F6', accent_color: '#22D3EE', tutorial_completed: false };
    }
  });

export const updateProfilePreferences = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    theme_color: z.string().optional(),
    accent_color: z.string().optional(),
    avatar_url: z.string().optional(),
    tutorial_completed: z.boolean().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedContext();
    
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
