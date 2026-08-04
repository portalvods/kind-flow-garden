import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const trackUserActivity = createServerFn({ method: "POST" })
  .handler(async () => {
    // We'll track using a simple update on the sessions table
    // Since we're in a server function, we'd ideally have the user ID from context
    // For now, the database function track_session handles this if called with a session
    const { error } = await supabaseAdmin.rpc('track_session');
    if (error) console.error('Error tracking session:', error);
    return { success: !error };
  });

export const getOnlineUsersCount = createServerFn({ method: "GET" })
  .handler(async () => {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count, error } = await supabaseAdmin
      .from('user_sessions')
      .select('*', { count: 'exact', head: true })
      .gt('last_active_at', fiveMinsAgo);
    
    if (error) {
      console.error('Error fetching online users:', error);
      return 0;
    }
    return count || 0;
  });

export const getSystemStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    // Check Evolution API
    let evoStatus = false;
    try {
      const { data: allSettings } = await supabaseAdmin
        .from('site_settings')
        .select('key, value');
      
      const url = allSettings?.find(s => s.key === 'evolution_url')?.value;
      const key = allSettings?.find(s => s.key === 'evolution_api_key')?.value;
      const instance = allSettings?.find(s => s.key === 'evolution_instance')?.value;
      
      if (url && key && instance) {
        const res = await fetch(`${url.replace(/\/$/, '')}/instance/connectionStatus/${instance}`, {
          headers: { 'apikey': key }
        });
        evoStatus = res.ok;
      }
    } catch (e) {
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
    
    if (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }
    return data || [];
  });


