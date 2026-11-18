import { createClient } from "jsr:@supabase/supabase-js@2";

type AppRole = "admin" | "editor" | "reviewer";

type InviteBody = {
  email?: unknown;
  role?: unknown;
  display_name?: unknown;
};

const allowedRoles = new Set<AppRole>(["admin", "editor", "reviewer"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function envOrThrow(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  let allowedOrigin: string;
  try {
    allowedOrigin = envOrThrow("ALLOWED_SITE_ORIGIN");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Missing configuration");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const requestOrigin = request.headers.get("Origin");
  if (!requestOrigin || requestOrigin !== allowedOrigin) {
    return jsonResponse({ error: "Origin not allowed" }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, allowedOrigin);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing bearer token" }, 401, allowedOrigin);
  }

  let body: InviteBody;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return jsonResponse({ error: "Request body must be a JSON object" }, 400, allowedOrigin);
    }
    body = parsed as InviteBody;
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400, allowedOrigin);
  }

  if (
    body.display_name !== undefined &&
    body.display_name !== null &&
    typeof body.display_name !== "string"
  ) {
    return jsonResponse({ error: "display_name must be a string" }, 400, allowedOrigin);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role;
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() || null : null;

  if (!emailPattern.test(email) || email.length > 254) {
    return jsonResponse({ error: "A valid email is required" }, 400, allowedOrigin);
  }
  if (typeof role !== "string" || !allowedRoles.has(role as AppRole)) {
    return jsonResponse(
      { error: "role must be admin, editor, or reviewer" },
      400,
      allowedOrigin,
    );
  }
  if (displayName && displayName.length > 120) {
    return jsonResponse({ error: "display_name must be at most 120 characters" }, 400, allowedOrigin);
  }

  let supabaseUrl: string;
  let anonKey: string;
  let serviceRoleKey: string;
  try {
    supabaseUrl = envOrThrow("SUPABASE_URL");
    anonKey = envOrThrow("SUPABASE_ANON_KEY");
    serviceRoleKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Missing configuration");
    return jsonResponse({ error: "Server configuration error" }, 500, allowedOrigin);
  }

  // This client carries the caller JWT, so auth.getUser validates the token and
  // the profile query is evaluated by normal RLS rather than service-role bypass.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401, allowedOrigin);
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from("profiles")
    .select("role,is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Unable to verify caller profile", profileError.message);
    return jsonResponse({ error: "Unable to authorize caller" }, 500, allowedOrigin);
  }
  if (!callerProfile?.is_active || callerProfile.role !== "admin") {
    return jsonResponse({ error: "Active admin role required" }, 403, allowedOrigin);
  }

  // The service role key is injected by Supabase secrets and never sent to the
  // browser. It is used only after the caller has passed the checks above.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const redirectTo = Deno.env.get("INVITE_REDIRECT_URL")?.trim() || allowedOrigin;
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin
    .inviteUserByEmail(email, {
      redirectTo,
      data: { display_name: displayName },
    });

  if (inviteError || !inviteData.user) {
    console.error("Invitation failed", inviteError?.message ?? "No user returned");
    const conflict = inviteError?.message.toLowerCase().includes("already") ?? false;
    return jsonResponse(
      { error: conflict ? "A user with this email already exists" : "Invitation failed" },
      conflict ? 409 : 502,
      allowedOrigin,
    );
  }

  const invitedUserId = inviteData.user.id;
  const { error: profileWriteError } = await adminClient.from("profiles").upsert(
    {
      user_id: invitedUserId,
      email,
      display_name: displayName,
      role: role as AppRole,
      is_active: true,
    },
    { onConflict: "user_id" },
  );

  if (profileWriteError) {
    console.error("Profile creation failed", profileWriteError.message);
    // Avoid leaving an invited auth account without its authorization record.
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(invitedUserId);
    if (rollbackError) console.error("Invitation rollback failed", rollbackError.message);
    return jsonResponse({ error: "Invitation could not be completed" }, 500, allowedOrigin);
  }

  return jsonResponse(
    {
      user: {
        id: invitedUserId,
        email,
        role,
        display_name: displayName,
        is_active: true,
      },
    },
    201,
    allowedOrigin,
  );
});
