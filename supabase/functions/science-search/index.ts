// Supabase Edge Function: science-search.
//
// Thin authenticated gateway over the ported scientific-database connector registry
// (supabase/functions/_shared/science, derived from synthetic-sciences/openscience, Apache-2.0 —
// see that dir's NOTICE.md). Two actions:
//   { action: "list" }                              → the connector catalog (id/name/domain/desc)
//   { action: "search", db, query, limit?, organism? } → one connector's normalized hits
//
// GATED, DEFAULT OFF: returns 503 unless SCIENCE_SEARCH_ENABLED === "true". This keeps ~39 new
// third-party API egress paths dark until the owner deliberately turns them on — nothing about the
// live product changes on deploy. Auth mirrors the /ask house pattern (verified bearer token,
// authenticated-only), same CORS allow-list and JSON envelope.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { registry } from "../_shared/science/index.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ALLOWED_ORIGINS = [
  "https://app.pharmaorb.app",
  "https://pharmaorb.app",
  "https://www.pharmaorb.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// Hard ceiling regardless of what the caller asks for (connectors clamp further to their own limits).
const MAX_LIMIT = 25;

function enabled(): boolean {
  return Deno.env.get("SCIENCE_SEARCH_ENABLED") === "true";
}

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : "https://app.pharmaorb.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(payload: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Verify the bearer token against the auth server. Returns user id or null. Mirrors /ask:
 *  authenticated-only, anonymous sign-in sessions rejected. */
async function verifyUser(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json() as { id?: string; is_anonymous?: boolean };
    if (!user.id || user.is_anonymous) return null;
    return user.id;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);

  // Feature gate FIRST — a disabled function reveals nothing and does no work.
  if (!enabled()) return json({ error: "science_search_disabled" }, 503, req);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401, req);

  let body: { action?: string; db?: string; query?: string; limit?: number; organism?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400, req);
  }

  const action = body.action;

  if (action === "list") {
    return json({ databases: registry.catalog() }, 200, req);
  }

  if (action === "search") {
    const db = typeof body.db === "string" ? body.db.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!db) return json({ error: "db is required" }, 400, req);
    if (!query) return json({ error: "query is required" }, 400, req);
    if (query.length > 500) return json({ error: "query too long" }, 400, req);

    const connector = registry.get(db);
    if (!connector) {
      return json({ error: "unknown_database", db, hint: "call { action: 'list' } for valid ids" }, 404, req);
    }

    const limit = Math.min(
      Math.max(1, Number.isFinite(body.limit) ? Math.floor(body.limit as number) : 10),
      MAX_LIMIT,
    );
    const organism = typeof body.organism === "string" ? body.organism.trim() : undefined;

    // Bound every external call — a slow third-party API must never hang the function.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12_000);
    try {
      const hits = await connector.search(query, { limit, organism, signal: ac.signal });
      return json({ db, query, hits }, 200, req);
    } catch (err) {
      // Connector/network failure is a clean 502 — the caller learns the upstream failed, not a stack.
      const message = err instanceof Error ? err.message : "connector error";
      return json({ error: "connector_failed", db, detail: message.slice(0, 200) }, 502, req);
    } finally {
      clearTimeout(timer);
    }
  }

  return json({ error: "unknown_action", hint: "use 'list' or 'search'" }, 400, req);
});
