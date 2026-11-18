// Copy these public browser settings into supabase-config.js.
// Use a Supabase anon/publishable key only. Never expose a service-role key in this file.
(() => {
  "use strict";

  const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

  function isServiceRoleKey(key) {
    if (/service[_-]?role/i.test(key) || key.startsWith("sb_secret_")) return true;
    try {
      const encoded = key.split(".")[1]?.replaceAll("-", "+").replaceAll("_", "/");
      const payload = encoded?.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
      return payload ? JSON.parse(atob(payload)).role === "service_role" : false;
    } catch {
      return false;
    }
  }

  const hasUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL)
    && !SUPABASE_URL.includes("YOUR_PROJECT_ID");
  const hasKey = SUPABASE_ANON_KEY.length > 20
    && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")
    && !isServiceRoleKey(SUPABASE_ANON_KEY);

  if (hasUrl && hasKey && window.supabase?.createClient) {
    window.medAtlasSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
})();
