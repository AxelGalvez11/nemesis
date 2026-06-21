// Supabase Edge Function: watch-digest (Live Monitoring, WS-D, increment 6 — email layer).
//
// TWO entrypoints, one function:
//   • POST {user_id}  (SERVICE-ROLE): build + send this user's same-day digest of LOUD alerts. The
//     scheduler fans this out per user, the same way watch-check is fanned out per watch.
//   • GET  ?unsubscribe=<user_id>&token=<hmac>  (PUBLIC, token-gated): one-click unsubscribe from an
//     emailed link — no session, so the signed token proves which user (see unsubscribe-token.ts).
//
// DORMANT BY DESIGN: with no RESEND_API_KEY / RESEND_FROM configured, POST is a safe no-op (it reports
// "email not configured" and does NOT consume the alerts), so deploying this function changes nothing
// until the owner finishes the gated Resend setup (verified domain + secret). The content is built by
// the unit-tested pure buildWatchDigest; this file is thin I/O (verified by deno check, exercised in the
// attended probe). Guardrails honored: only loud EVIDENCE alerts are emailed — the quiet feed and the
// walled "not verified evidence" news never reach an email (buildWatchDigest drops them).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { buildWatchDigest, type WatchDigestGroup } from "../../../packages/shared/src/watch-digest.ts";
import type { WatchEvent } from "../../../packages/shared/src/watch-events.ts";
import { sendEmail } from "./resend.ts";
import { buildUnsubscribeUrl, signUnsubscribe, verifyUnsubscribe } from "./unsubscribe-token.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? ""; // e.g. "PharmaOrb <alerts@pharmaorb.app>"
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.pharmaorb.app"; // the user-facing app, for watch links
const MAX_ALERTS_PER_DIGEST = 50;

serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });

  // Public, token-gated unsubscribe. Accept GET (the user clicks the link) AND POST (mailbox providers
  // issue a POST per RFC 8058 one-click, driven by the List-Unsubscribe-Post header we send). Routed
  // BEFORE the service-key gate — this path authenticates with the signed token, not the service key.
  if (url.searchParams.has("unsubscribe") && (req.method === "GET" || req.method === "POST")) {
    return await handleUnsubscribe(url.searchParams.get("unsubscribe") ?? "", url.searchParams.get("token") ?? "");
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SB_URL || !SERVICE_KEY) return json({ error: "server not configured" }, 500);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token !== SERVICE_KEY) return json({ error: "service role required" }, 401);

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const userId = (body.user_id ?? "").trim();
  if (!userId) return json({ error: "user_id required" }, 400);

  try {
    return json(await sendUserDigest(userId), 200);
  } catch (e) {
    console.error("watch-digest failed:", (e as Error).message);
    return json({ error: "digest failed" }, 500);
  }
});

async function sendUserDigest(userId: string) {
  if (await isOptedOut(userId)) return { ok: true, sent: false, reason: "opted_out" };

  const events = await loadUndigestedAlertEvents(userId);
  if (events.length === 0) return { ok: true, sent: false, reason: "no_alerts" };

  // Group the user's alerts by watch, attaching each watch's title for the digest headings.
  const titles = await loadWatchTitles([...new Set(events.map((e) => e.watch_id))]);
  const byWatch = new Map<string, WatchEvent[]>();
  for (const e of events) {
    const arr = byWatch.get(e.watch_id) ?? [];
    arr.push(e);
    byWatch.set(e.watch_id, arr);
  }
  const token = await signUnsubscribe(userId, SERVICE_KEY);
  const unsubscribeUrl = buildUnsubscribeUrl(SB_URL, userId, token);
  const groups: WatchDigestGroup[] = [...byWatch.entries()].map(([watchId, evs]) => ({
    watchTitle: titles.get(watchId) ?? "Your watch",
    watchUrl: `${APP_URL}/app/monitor/${watchId}`,
    events: evs,
  }));

  const digest = buildWatchDigest({ groups, unsubscribeUrl });
  if (!digest) return { ok: true, sent: false, reason: "no_alerts" };

  // Dormant until Resend is configured: report, but do NOT consume the alerts (so activation sends them).
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return { ok: true, sent: false, reason: "email_not_configured", would_send: { alerts: digest.alertCount } };
  }

  const email = await loadUserEmail(userId);
  if (!email) return { ok: true, sent: false, reason: "no_email" };

  const result = await sendEmail({
    apiKey: RESEND_API_KEY,
    from: RESEND_FROM,
    to: email,
    subject: digest.subject,
    html: digest.html,
    text: digest.text,
    unsubscribeUrl,
  });
  if (!result.ok) return { ok: false, sent: false, reason: result.error ?? "send_failed" };

  await markDigested(events.map((e) => e.id));
  return { ok: true, sent: true, alerts: digest.alertCount, watches: digest.watchCount, message_id: result.id };
}

async function handleUnsubscribe(userId: string, token: string): Promise<Response> {
  if (!userId || !token || !(await verifyUnsubscribe(userId, token, SERVICE_KEY))) {
    return html("This unsubscribe link is invalid or expired.", 400);
  }
  await upsertOptOut(userId);
  return html("You've been unsubscribed from PharmaOrb monitoring emails. You can re-enable them anytime in the app.", 200);
}

// ── DB I/O (raw PostgREST + auth admin, service role) ─────────────────────────────────────────────
interface AlertEventRow extends WatchEvent {
  watch_id: string;
}

async function loadUndigestedAlertEvents(userId: string): Promise<AlertEventRow[]> {
  const u = new URL(`${SB_URL}/rest/v1/watch_events`);
  u.searchParams.set("user_id", `eq.${userId}`);
  u.searchParams.set("is_alert", "is.true");
  u.searchParams.set("digested_at", "is.null");
  u.searchParams.set("channel", "eq.evidence");
  u.searchParams.set(
    "select",
    "id,watch_id,channel,source_key,is_alert,alert_reason,title,url,provider,study_type,published_date,summary,detected_at,read_at",
  );
  u.searchParams.set("order", "detected_at.desc");
  u.searchParams.set("limit", String(MAX_ALERTS_PER_DIGEST));
  const res = await fetch(u, { headers: authHeaders() });
  if (!res.ok) throw new Error(`load alert events failed (${res.status})`);
  return await res.json() as AlertEventRow[];
}

async function loadWatchTitles(watchIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (watchIds.length === 0) return map;
  const u = new URL(`${SB_URL}/rest/v1/evidence_watches`);
  u.searchParams.set("id", `in.(${watchIds.join(",")})`);
  u.searchParams.set("select", "id,title");
  const res = await fetch(u, { headers: authHeaders() });
  if (!res.ok) throw new Error(`load watch titles failed (${res.status})`);
  for (const r of await res.json() as Array<{ id: string; title: string }>) map.set(r.id, r.title);
  return map;
}

async function isOptedOut(userId: string): Promise<boolean> {
  const u = new URL(`${SB_URL}/rest/v1/watch_email_optout`);
  u.searchParams.set("user_id", `eq.${userId}`);
  u.searchParams.set("select", "user_id");
  const res = await fetch(u, { headers: authHeaders() });
  if (!res.ok) throw new Error(`opt-out check failed (${res.status})`);
  return (await res.json() as unknown[]).length > 0;
}

async function upsertOptOut(userId: string): Promise<void> {
  const res = await fetch(`${SB_URL}/rest/v1/watch_email_optout`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(`opt-out write failed (${res.status})`);
}

async function markDigested(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const u = new URL(`${SB_URL}/rest/v1/watch_events`);
  u.searchParams.set("id", `in.(${eventIds.join(",")})`);
  const res = await fetch(u, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ digested_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`mark digested failed (${res.status})`);
}

async function loadUserEmail(userId: string): Promise<string | null> {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, { headers: authHeaders() });
  if (!res.ok) return null;
  return (await res.json() as { email?: string }).email ?? null;
}

function authHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// ── responses ─────────────────────────────────────────────────────────────────────────────────────
function cors(): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
}
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors(), "Content-Type": "application/json" } });
}
function html(message: string, status: number): Response {
  const body = `<!doctype html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;color:#0f172a"><h2>PharmaOrb</h2><p>${message}</p></body></html>`;
  return new Response(body, { status, headers: { ...cors(), "Content-Type": "text/html" } });
}
