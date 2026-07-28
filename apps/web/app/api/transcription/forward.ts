// The enhance-transcript lane now LIVES in Supabase, not here.
//
// Owner 2026-07-27: "assembly should be in supabase now." The whole thing —
// metering, AssemblyAI, Groq fallback, diarization, cost reporting, cleanup —
// moved to supabase/functions/nemesis-transcribe, so the AssemblyAI key sits in
// Supabase's function secrets instead of Vercel's environment.
//
// These two routes stay as thin forwarders ON PURPOSE. The phone posts to
// `${APP_API_BASE}/api/transcription/*`, and an installed build cannot be
// re-pointed without shipping an app update — a forwarder moves the provider
// without stranding every phone already in the field. Once the clients call the
// function directly, both routes can be deleted.
//
// The caller's bearer token is passed through untouched: the function verifies
// it against the auth server itself and derives the uid from it, so there is no
// second place that decides who you are.

import { supabaseUrl } from "@/lib/env";
import { json } from "@/lib/server";

const FUNCTION_BASE = `${supabaseUrl}/functions/v1/nemesis-transcribe`;

/** Relay one transcription call to the edge function, preserving status and
 *  body. Any transport failure reads as a provider outage, which is what it is
 *  from the student's side. */
export async function forwardToFunction(request: Request, action: "submit" | "status"): Promise<Response> {
  if (!supabaseUrl) return json({ error: "Transcript enhancement is not configured yet." }, 503);

  // Read the body here rather than streaming it: these are two small JSON
  // objects, and a forwarded stream needs duplex support that not every runtime
  // on this path provides.
  const body = await request.text();
  const authorization = request.headers.get("authorization") ?? "";

  try {
    const res = await fetch(`${FUNCTION_BASE}/${action}`, {
      body,
      cache: "no-store",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      method: "POST",
    });
    const text = await res.text();
    return new Response(text, {
      headers: { "Content-Type": "application/json" },
      status: res.status,
    });
  } catch (error) {
    console.error("transcription forward failed", action, (error as Error)?.message);
    return json({ error: "The transcription provider is unavailable. Try again in a moment." }, 502);
  }
}
