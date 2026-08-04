import { createServerFn } from "@tanstack/react-start";


export const trackUserActivity = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Fallback if supabaseAdmin throws (no service role key)
      const { error } = await supabaseAdmin.rpc('track_session');
      if (error) console.error('Error tracking session RPC:', error);
      return { success: !error };
    } catch (err) {
      // If we're on VPS and supabaseAdmin fails, we can't easily track without a key
      // unless we use a public client, but track_session is auth-only.
      // However, we want to fail silently for the user.
      console.warn('[monitoring] trackUserActivity failed (probably missing service role key on VPS):', (err as Error).message);
      return { success: false };
    }
  });

export const getOnlineUsersCount = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count, error } = await supabaseAdmin
        .from('user_sessions')
        .select('*', { count: 'exact', head: true })
        .gt('last_active_at', fiveMinsAgo);
      
      if (error) throw error;
      return count || 0;
    } catch (err) {
      console.error('Error fetching online users:', err);
      return 0;
    }
  });

export const getSystemStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    // Check Evolution API
    let evoStatus = false;
    try {
      const { createServerPublicSupabase } = await import("./supabase-public.server");
      const sb = createServerPublicSupabase();
      if (!sb) throw new Error("Supabase public client unavailable");

      const { data: allSettings } = await sb
        .from('site_settings')
        .select('key, value');
      
      const { readLocalWhatsappConfig } = await import("./env.server");
      const local = readLocalWhatsappConfig();

      const url = allSettings?.find(s => s.key === 'evolution_url')?.value || local.evolution_url;
      const key = allSettings?.find(s => s.key === 'evolution_api_key')?.value || local.evolution_api_key;
      const instance = allSettings?.find(s => s.key === 'evolution_instance')?.value || local.evolution_instance;
      
      if (url && key && instance) {
        // First try the status endpoint
        const res = await fetch(`${url.replace(/\/$/, '')}/instance/connectionStatus/${instance}`, {
          headers: { 'apikey': key }
        });
        
        if (res.ok) {
          const data = await res.json();
          // Connection status can be 'CONNECTED', 'CONNECTING', 'DISCONNECTED', etc.
          // In some versions it returns an object with state or instance info
          evoStatus = data.instance?.state === 'open' || data.state === 'open' || data.status === 'CONNECTED';
          
          // Fallback: If the response is OK but we can't parse the state, consider it online
          if (!evoStatus && res.status === 200) evoStatus = true;
        } else {
          // If connectionStatus fails, try a simpler ping to the instance
          const pingRes = await fetch(`${url.replace(/\/$/, '')}/instance/fetchInstances?instanceName=${instance}`, {
            headers: { 'apikey': key }
          });
          evoStatus = pingRes.ok;
        }
      } else {
        console.warn("[monitoring] Evolution API config missing in DB and local file");
      }
    } catch (e) {
      console.error("[monitoring] Evolution API check error:", e);
      evoStatus = false;
    }

    // Check TMDB
    let tmdbStatus = false;
    try {
      const tmdbKey = process.env['TMDB_API_KEY'] || 'de22da47e31e5dc677391d32e52de55c';
      const res = await fetch(`https://api.themoviedb.org/3/authentication?api_key=${tmdbKey}`);
      tmdbStatus = res.ok;
    } catch (e) {
      tmdbStatus = false;
    }

    return { evolution: evoStatus, tmdb: tmdbStatus };
  });

export const getActiveSessions = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from('user_sessions')
        .select(`
          id,
          last_active_at,
          created_at,
          profiles (
            full_name,
            whatsapp
          )
        `)
        .order('last_active_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching sessions:', err);
      return [];
    }
  });


