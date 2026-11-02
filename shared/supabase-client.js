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
  const bridge = window.webkit?.messageHandlers?.windowNative;
  if (!bridge) {
    window.MINDS_SUPABASE = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return;
  }

  // Inside the Window iPhone app the app owns the session: one sign-in (in the app),
  // one owner of the refresh token (the Keychain). The page only borrows the current
  // access token through the bridge (contract v1, apps/isabella-ios/BRIDGE.md) and
  // never refreshes or stores a session of its own.
  const call = async (type, payload) => {
    try { return await bridge.postMessage(Object.assign({}, payload || {}, { v: 1, type })); }
    catch (error) { return { v: 1, ok: false, error: String(error?.message || error) }; }
  };
  window.WINDOW_NATIVE = Object.freeze({ available: true, version: 1, call });
  try { localStorage.removeItem('sb-' + new URL(config.url).hostname.split('.')[0] + '-auth-token'); } catch {}

  let cached = null;
  let pending = null;
  const listeners = new Set();
  const current = () => {
    if (cached && cached.expires_at - 60 > Date.now() / 1000) return Promise.resolve(cached);
    if (!pending) {
      pending = call('session.get')
        .then(reply => (cached = reply?.ok && reply.session?.access_token ? reply.session : null))
        .finally(() => { pending = null; });
    }
    return pending;
  };
  const asSession = s => s ? {
    access_token: s.access_token,
    token_type: 'bearer',
    expires_at: s.expires_at,
    expires_in: Math.max(0, Math.round(s.expires_at - Date.now() / 1000)),
    user: { id: s.user?.id, email: s.user?.email || undefined, aud: 'authenticated', role: 'authenticated' }
  } : null;
  const signInInApp = async () => {
    void call('session.signIn');
    return { data: { user: null, session: null }, error: { message: 'En la app Window se entra desde la pantalla de la app.' } };
  };

  const client = window.supabase.createClient(config.url, config.publishableKey, {
    accessToken: async () => (await current())?.access_token ?? null
  });
  client.auth = Object.freeze({
    getSession: async () => ({ data: { session: asSession(await current()) }, error: null }),
    getUser: async () => ({ data: { user: asSession(await current())?.user || null }, error: null }),
    refreshSession: async () => {
      cached = null;
      const session = asSession(await current());
      return { data: { session, user: session?.user || null }, error: null };
    },
    onAuthStateChange: (callback) => {
      listeners.add(callback);
      current().then(s => { if (listeners.has(callback)) callback('INITIAL_SESSION', asSession(s)); });
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
    signOut: async () => { cached = null; await call('session.signOut'); return { error: null }; },
    signInWithOtp: signInInApp,
    verifyOtp: signInInApp
  });
  window.MINDS_SUPABASE = client;
})();