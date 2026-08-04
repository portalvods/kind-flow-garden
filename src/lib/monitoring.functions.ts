import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const trackUserActivity = createServerFn({ method: "POST" })
  .handler(async ({ request }) => {
    // In a real TanStack Start env, we'd get the user from auth middleware
    // For now, this is a placeholder for the logic
    return { success: true };
  });

export const getOnlineUsersCount = createServerFn({ method: "GET" })
  .handler(async () => {
    const { count, error } = await supabaseAdmin
      .from('user_sessions')
      .select('*', { count: 'exact', head: true })
      .gt('last_active_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Last 5 mins
    
    return count || 0;
  });

export const getSystemStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    // Check Evolution API
    let evoStatus = false;
    try {
      const { data: settings } = await supabaseAdmin
        .from('site_settings')
        .select('evolution_api_url, evolution_api_key')
        .single();
      
      if (settings?.evolution_api_url) {
        const res = await fetch(`${settings.evolution_api_url}/instance/status`, {
          headers: { 'apikey': settings.evolution_api_key }
        });
        evoStatus = res.ok;
      }
    } catch (e) {
      evoStatus = false;
    }

    // Check TMDB
    let tmdbStatus = false;
    try {
      const res = await fetch(`https://api.themoviedb.org/3/authentication?api_key=${process.env['TMDB_API_KEY'] || 'de22da47e31e5dc677391d32e52de55c'}`);
      tmdbStatus = res.ok;
    } catch (e) {
      tmdbStatus = false;
    }

    return { evolution: evoStatus, tmdb: tmdbStatus };
  });
