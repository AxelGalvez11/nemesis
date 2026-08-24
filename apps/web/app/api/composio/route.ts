// The only door between the browser and Composio.
//
// Owner's build order, workstream E, 2026-08-24: connect Nemesis to the apps a student already
// lives in — Drive, Gmail, Calendar first — so lectures, syllabus dates and mail can be read
// without leaving.
//
// 🔴🔴 THE KEY NEVER REACHES THE BROWSER, WHICH IS WHY THIS ROUTE EXISTS AT ALL. Every other
// agent tool in this product executes client-side against RLS-scoped tables, and that is safe
// precisely because the browser holds nothing but the learner's own session. Composio is
// different: one account-wide API key can act for EVERY connected user, so a key shipped to the
// client would be a key any learner could read out of the bundle and use against any other
// learner's mailbox. It lives in `COMPOSIO_API_KEY`, server-side, and is read only here.
//
// 🔴🔴 THE CALLER'S IDENTITY COMES FROM THEIR SUPABASE TOKEN, NEVER FROM THE REQUEST BODY. A
// `userId` field in the payload would be an invitation to act as somebody else — `verifyBearer`
// resolves who is asking, and that id is what is handed to Composio as the entity. A learner can
// therefore only ever reach their own connected accounts.
//
// 🔴🔴 WRITES ARE REFUSED HERE, NOT JUST IN THE UI. `riskOf` runs on this side of the network as
// well: an `execute` for a write action without `confirmed: true` comes back as a held action,
// whatever the client claimed. A gate that only exists in the browser is a gate a crafted request
// walks around, and the thing on the other side of it sends email.
//
// 🔴 UNCONFIGURED IS A FIRST-CLASS STATE, NOT AN ERROR. Without a key this answers `{configured:
// false}` and the Settings screen says "not set up yet". The product must behave exactly as it
// did before Composio existed until the owner sets the key.

import type { NextRequest } from "next/server";

import { heldForApproval, pendingActionResult, riskOf, summarise } from "@/lib/workspace/composio-actions";
import { verifyBearer } from "@/lib/server";

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";
const TIMEOUT_MS = 20_000;

/**
 * The apps a learner may connect, and what each is FOR.
 *
 * 🔴 A CLOSED LIST, AND THAT IS DELIBERATE. Composio brokers hundreds of apps; offering all of
 * them turns a study tool into an integrations directory, and every extra app is another OAuth
 * consent screen a student clicks through without reading. Owner's pick for the first three:
 * "my lectures, my school mail, my deadlines", which is one Google sign-in for all three.
 */
const APPS = [
  { detail: "Read lecture slides and notes you already keep there.", key: "googledrive", label: "Google Drive" },
  { detail: "Read your school mail, including the syllabus nobody forwards twice.", key: "gmail", label: "Gmail" },
  { detail: "See what is due, and put dates you mention on the calendar.", key: "googlecalendar", label: "Google Calendar" },
] as const;

type AppKey = (typeof APPS)[number]["key"];

function apiKey(): string {
  return process.env.COMPOSIO_API_KEY ?? "";
}

function labelFor(key: string): string {
  return APPS.find((app) => app.key === key)?.label ?? key;
}

async function composio(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${COMPOSIO_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey(), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function POST(request: NextRequest) {
  if (!apiKey()) {
    // 🔴 200, NOT 500. "Not set up yet" is a state the Settings screen renders, not a failure it
    // has to interpret from a status code.
    return Response.json({ apps: APPS, configured: false });
  }

  const user = await verifyBearer(request);
  if (!user) return Response.json({ error: "Sign in to use your connected apps." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const op = typeof body.op === "string" ? body.op : "";
  try {
    if (op === "status") return await statusFor(user.id);
    if (op === "connect") return await connectTo(user.id, String(body.app ?? ""));
    if (op === "disconnect") return await disconnectFrom(user.id, String(body.app ?? ""));
    if (op === "execute") return await execute(user.id, body);
    return Response.json({ error: "Unknown operation." }, { status: 400 });
  } catch {
    // 🔴 NEVER LEAK THE UPSTREAM ERROR BODY. Composio's errors can echo request contents, and a
    // failed send would then put the learner's own draft into an error string.
    return Response.json({ error: "That app is not responding right now." }, { status: 502 });
  }
}

/** Which apps this learner has connected. */
async function statusFor(uid: string): Promise<Response> {
  const res = await composio(`/connected_accounts?user_ids=${encodeURIComponent(uid)}`);
  if (!res.ok) return Response.json({ apps: APPS, configured: true, connected: [] });
  const payload = (await res.json()) as { items?: { toolkit?: { slug?: string }; status?: string }[] };
  const connected = (payload.items ?? [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => item.toolkit?.slug ?? "")
    .filter(Boolean);
  return Response.json({ apps: APPS, configured: true, connected });
}

/** Start an OAuth connection. Returns the URL the learner is sent to. */
async function connectTo(uid: string, app: string): Promise<Response> {
  if (!APPS.some((entry) => entry.key === app)) {
    return Response.json({ error: "That app is not offered." }, { status: 400 });
  }
  const res = await composio("/connected_accounts", {
    body: JSON.stringify({ auth_config: { id: process.env[`COMPOSIO_AUTH_${app.toUpperCase()}`] ?? "" }, connection: { user_id: uid } }),
    method: "POST",
  });
  if (!res.ok) return Response.json({ error: "Could not start the connection." }, { status: 502 });
  const payload = (await res.json()) as { connectionData?: { val?: { redirectUrl?: string } }; redirect_url?: string };
  const url = payload.connectionData?.val?.redirectUrl ?? payload.redirect_url ?? "";
  if (!url) return Response.json({ error: "Could not start the connection." }, { status: 502 });
  return Response.json({ url });
}

async function disconnectFrom(uid: string, app: string): Promise<Response> {
  const res = await composio(`/connected_accounts?user_ids=${encodeURIComponent(uid)}&toolkit_slugs=${encodeURIComponent(app)}`);
  if (!res.ok) return Response.json({ ok: false }, { status: 502 });
  const payload = (await res.json()) as { items?: { id?: string }[] };
  for (const item of payload.items ?? []) {
    if (item.id) await composio(`/connected_accounts/${item.id}`, { method: "DELETE" });
  }
  return Response.json({ ok: true });
}

/**
 * Run one action for this learner.
 *
 * 🔴🔴 THE GATE IS HERE, ON THE SERVER, AND IT IS THE SAME `riskOf` THE CLIENT USES. Duplicated
 * deliberately: the client copy makes the confirmation card appear, and THIS copy is what makes
 * the card impossible to skip. If these two ever disagree, the server wins and the learner gets
 * an extra click — which is the direction this is allowed to be wrong in.
 */
async function execute(uid: string, body: Record<string, unknown>): Promise<Response> {
  const action = typeof body.action === "string" ? body.action : "";
  const args = (body.arguments ?? {}) as Record<string, unknown>;
  const confirmed = body.confirmed === true;
  if (!action) return Response.json({ error: "No action named." }, { status: 400 });

  if (heldForApproval(action, confirmed)) {
    const app = typeof body.app === "string" ? labelFor(body.app) : "that app";
    return Response.json(pendingActionResult({ action, app, summary: summarise(action, args) }));
  }

  const res = await composio("/tools/execute/" + encodeURIComponent(action), {
    body: JSON.stringify({ arguments: args, user_id: uid }),
    method: "POST",
  });
  if (!res.ok) return Response.json({ error: "That action did not go through." }, { status: 502 });
  const payload = (await res.json()) as { data?: unknown; successful?: boolean; error?: string };
  if (payload.successful === false) return Response.json({ error: payload.error ?? "That action did not go through." });
  // 🔴 THE RISK IS ECHOED BACK so the surface can say "done" only for things that actually ran,
  // and so a read never renders as though it had been approved by anybody.
  return Response.json({ data: payload.data ?? null, ran: true, risk: riskOf(action) });
}
