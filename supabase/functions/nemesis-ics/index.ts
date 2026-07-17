// Supabase Edge Function: nemesis-ics
//
// Serves a student's Mac-rendered ICS calendar feed to native calendar apps
// (iPhone Calendar subscribes via webcal://.../functions/v1/nemesis-ics?token=...).
// This endpoint is the delivery half of the ONE scoped plaintext exception in the
// phone sync design (owner decision D3): the feed carries dates + titles only —
// the Mac renderer never emits note contents into it.
//
// Auth model: capability token, NOT a JWT. Native calendar clients cannot attach
// bearer tokens, so the URL carries a 256-bit random token that maps to exactly
// one user's feed row (calendar_feeds.token, unique-indexed). Unknown token = 404
// with no detail. The service role is used ONLY to look up that single row.
//
// DEPLOY NOTE: must be deployed with verify_jwt=false (same trap as nemesis-llm/
// search/media) — calendar apps send no Authorization header at all.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const TOKEN_RE = /^[0-9a-f]{64}$/;

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("method not allowed", { status: 405 });
  }

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) {
    return new Response("not found", { status: 404 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("nemesis-ics: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response("server error", { status: 500 });
  }

  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/calendar_feeds?token=eq.${token}&select=ics,updated_at`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    },
  );
  if (!lookup.ok) {
    console.error(`nemesis-ics: feed lookup failed (${lookup.status})`);
    return new Response("server error", { status: 500 });
  }

  const rows = (await lookup.json()) as Array<{ ics: string; updated_at: string }>;
  if (rows.length !== 1) {
    return new Response("not found", { status: 404 });
  }

  return new Response(req.method === "HEAD" ? null : rows[0].ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Calendar apps poll on their own schedule; a short private cache keeps
      // repeat polls cheap without letting feeds go stale for long.
      "Cache-Control": "private, max-age=300",
      "Last-Modified": new Date(rows[0].updated_at).toUTCString(),
    },
  });
});
