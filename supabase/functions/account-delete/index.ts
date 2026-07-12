// Supabase Edge Function: account-delete  (IMPLEMENTATION_PLAN.md §8 POST /auth/delete-account, §11 AC10)
//
// "Deletion must work" (the Phase-7 launch gate). Flow:
//   1. verify the caller's JWT against the auth server -> their own uid (never trust
//      a uid from the body; you can only delete YOURSELF).
//   2. require an explicit confirmation in the body (the app shows a typed/confirm gate).
//   3. service-role DELETE of auth.users(uid) -> every user-owned table CASCADEs
//      (0109/0116), and generated_answers ANONYMIZES (ON DELETE SET NULL: the row is
//      kept for the corpus/audit, the user link is severed). No per-table delete here;
//      the schema's FKs do the cascade, which the gate verifies by service-key readback.
//
// The service role lives ONLY in the function env (SUPABASE_SERVICE_ROLE_KEY), never in
// the app bundle. Anonymous sessions are rejected (same posture as `ask`).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// CORS: reflect only allowlisted app origins (was wildcard "*"). This is a browser-XHR
// target (the settings page calls it cross-origin), so the real origin is reflected for
// prod + local dev. Auth is still the bearer token; the allowlist is defense-in-depth.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.enternemesis.com",
  "https://app.pharmaorb.app",
  "https://pharmaorb.app",
  "https://www.pharmaorb.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8081",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:8081",
];

function isAllowedOrigin(origin: string): boolean {
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : "https://app.enternemesis.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) return json({ error: "function not configured" }, 500, req);

  // ---- verify caller (authenticated, non-anonymous) ----
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401, req);

  // ---- explicit confirmation (irreversible) ----
  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body?.confirm !== true) {
    return json({ error: "confirmation required: pass { confirm: true }" }, 400, req);
  }

  // ---- service-role admin delete -> FK cascade / anonymize ----
  const res = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    console.error("account-delete admin DELETE failed:", res.status, detail);
    return json({ error: "account deletion failed" }, 502, req);
  }

  return json({ deleted: true }, 200, req);
});

// Verify the bearer token against the auth server and return the caller's uid.
// Rejects anonymous sign-in sessions (a guest cannot delete a real account).
async function verifyUser(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string; is_anonymous?: boolean };
    if (!user.id || user.is_anonymous) return null;
    return user.id;
  } catch {
    return null;
  }
}

function json(payload: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
