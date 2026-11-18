// Public browser configuration only. Use a Supabase anon/publishable key, never a service-role key.
(() => {
  "use strict";

  const SUPABASE_URL = "https://tlnplvzuxwyfkwgfsrel.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsbnBsdnp1eHd5Zmt3Z2ZzcmVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5ODE5NzIsImV4cCI6MjExMDU1Nzk3Mn0.bFoGiZzmFUvORtX_FSaZDiL3tCUpKkYdHP5XA1aVmWM";

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
    && !SUPABASE_ANON_KEY.includes("YOUR_")
    && !isServiceRoleKey(SUPABASE_ANON_KEY);

  if (hasUrl && hasKey && window.supabase?.createClient) {
    window.medAtlasSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
})();
