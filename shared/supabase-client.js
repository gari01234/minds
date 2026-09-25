/* MINDS - Theory v0.10 · public Supabase client configuration
   The publishable key is intentionally safe for browser use. RLS protects user data.
   Never put a service_role/secret key in this repository. */
(() => {
  const config = {
    url: 'https://lodexwyyynlarkqgkyhy.supabase.co',
    publishableKey: 'sb_publishable_ALAQ5tHd9m5vB7oM9jpj9A_9IAOep2X'
  };
  window.MINDS_SUPABASE_CONFIG = Object.freeze(config);
  if (!window.supabase?.createClient) {
    console.warn('[MINDS] Supabase client library did not load; local mode remains available.');
    window.MINDS_SUPABASE = null;
    return;
  }
  window.MINDS_SUPABASE = window.supabase.createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();