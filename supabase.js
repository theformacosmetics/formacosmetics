// Creates the single shared Supabase client (window.db).
// Requires the supabase-js UMD build to be loaded first:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
(function () {
  const c = window.FORMA_CONFIG;
  if (!window.supabase) { console.error('supabase-js failed to load'); return; }
  if (c.SUPABASE_URL.includes('YOUR-PROJECT') || c.SUPABASE_ANON_KEY.startsWith('YOUR-')) {
    console.warn('Forma: set SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js');
  }
  window.db = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
})();
