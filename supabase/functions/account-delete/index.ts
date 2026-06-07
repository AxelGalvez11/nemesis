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

import { captureEdgeException } from "../_shared/sentry.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    captureEdgeException(e, { functionName: "account-delete" });
    console.error("account-delete unhandled error:", (e as Error).message);
    return json({ error: "account deletion failed" }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) return json({ error: "function not configured" }, 500);

  // ---- verify caller (authenticated, non-anonymous) ----
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401);

  // ---- explicit confirmation (irreversible) ----
  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body?.confirm !== true) {
    return json({ error: "confirmation required: pass { confirm: true }" }, 400);
  }

  // ---- service-role admin delete -> FK cascade / anonymize ----
  const res = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    captureEdgeException(new Error(`admin delete failed: ${res.status}`), {
      functionName: "account-delete",
      userId,
      extra: { detail },
    });
    console.error("account-delete admin DELETE failed:", res.status, detail);
    return json({ error: "account deletion failed" }, 502);
  }

  return json({ deleted: true });
}

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

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
