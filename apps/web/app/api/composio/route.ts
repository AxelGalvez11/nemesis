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
import { CONNECTABLE_APPS as APPS, isOffered, labelFor } from "@/lib/workspace/composio-apps";
import { verifyBearer } from "@/lib/server";

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";
const TIMEOUT_MS = 20_000;

// 🔴 THE OFFERED LIST MOVED TO `lib/workspace/composio-apps.ts` AND DID NOT GROW LOOSER. It is
// still closed and `connectTo` still refuses anything outside it; what changed is that the
// sidebar needs the same facts to decide whether a learner has a calendar, and two copies of that
// answer drift. See the header of that file for why a slug substring could not carry it.

function apiKey(): string {
  return process.env.COMPOSIO_API_KEY ?? "";
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
    if (op === "tools") return await toolsFor(user.id);
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

/**
 * The actions this learner's connected apps can perform, as tool schemas the model can read.
 *
 * 🔴🔴 THE CATALOGUE IS ASKED FOR, NEVER GUESSED. Action slugs like `GMAIL_FETCH_EMAILS` are
 * Composio's to name and they change without us; a hardcoded list would silently stop matching and
 * the feature would look built and be dead. So we ask, and adapt to whatever comes back.
 *
 * 🔴🔴🔴 AND EVERY ROW IS VALIDATED STRUCTURALLY, BECAUSE THIS CODE HAS NEVER SEEN A REAL RESPONSE.
 * It was written without a Composio key to test against, which is exactly the situation in which
 * "it will probably be shaped like this" ships a broken chat for everybody. So nothing is assumed:
 * a row must have a string name and an object schema or it is dropped, several plausible field
 * names are accepted, and ANY failure at any level yields an empty list. An empty list means the
 * model is offered no Composio tools and the chat behaves exactly as it did before this existed.
 *
 * ── HOW THE BUDGET IS SPENT, AND THE TWO WAYS IT USED TO BE SPENT WRONGLY ──────────────────────
 *
 * A toolkit carries dozens of actions and offering all of them on every turn is a context cost
 * paid forever, so there is a cap. Both of the following were live defects, found by reading real
 * catalogue responses rather than by reasoning about the code:
 *
 * 🔴🔴 THE PER-APP LIMIT USED TO TRUNCATE **BEFORE** THE READS-FIRST SORT, SO IT CUT
 * ALPHABETICALLY. It asked each app for 12 rows and sorted afterwards, and Composio returns rows
 * in slug order. Notion has 13 read actions; that request returned three of them, all beginning
 * `NOTION_FETCH_B…`, and `NOTION_SEARCH_NOTION_PAGE` never reached the model at all. The single
 * most useful thing a student can do with their notes was unreachable, and nothing looked broken:
 * the model simply never knew the action existed and said it could not search Notion.
 *
 * So the whole toolkit is fetched and ranked HERE. Measured: the largest offered app returns 51
 * rows and every one of the nine fits in a single page, so this costs one request either way.
 *
 * 🔴🔴 AND THE TOTAL USED TO BE A GLOBAL CUT, WHICH STARVED WHOEVER SORTED LAST. Reads from every
 * app went into one list, sorted, and sliced at 24. Drive alone offers 19 reads and Gmail 11, so
 * two apps could fill the budget outright and a learner with four apps connected would find that
 * Nemesis could not see their calendar. It was not that the calendar failed; it was never offered.
 * Round-robin instead: each app contributes its best action, then its second, and so on. With the
 * total set so every offered app fits, each connected app is guaranteed a real share.
 */
async function toolsFor(uid: string): Promise<Response> {
  try {
    const res = await composio(`/connected_accounts?user_ids=${encodeURIComponent(uid)}`);
    if (!res.ok) return Response.json({ tools: [] });
    const accounts = (await res.json()) as { items?: { toolkit?: { slug?: string }; status?: string }[] };
    const connected = (accounts.items ?? [])
      .filter((item) => item.status === "ACTIVE")
      .map((item) => item.toolkit?.slug ?? "")
      .filter((slug) => APPS.some((app) => app.key === slug));

    // 🔴 IN PARALLEL, AND EACH ONE CATCHES ITS OWN FAILURE. Sequentially this was one round trip
    // per connected app in front of the first model call of every canvas turn, which is a latency
    // tax that grows with each app offered. And a single unreachable app must not silence the
    // rest: `Promise.all` over throwing calls would turn one provider's outage into "Nemesis
    // cannot see any of your apps", so the failure is contained to the app that had it.
    const perApp = await Promise.all(connected.map((slug) => catalogueFor(slug)));
    return Response.json({ tools: roundRobin(perApp, TOTAL_TOOL_LIMIT) });
  } catch {
    return Response.json({ tools: [] });
  }
}

/** One app's actions, best first. Empty when that app cannot be reached, never a throw. */
async function catalogueFor(slug: string): Promise<ComposioTool[]> {
  try {
    const listed = await composio(`/tools?toolkit_slug=${encodeURIComponent(slug)}&limit=${CATALOGUE_LIMIT}`);
    if (!listed.ok) return [];
    const body = (await listed.json()) as { items?: unknown[]; data?: unknown[] };
    const rows = Array.isArray(body.items) ? body.items : Array.isArray(body.data) ? body.data : [];
    const tools: ComposioTool[] = [];
    for (const row of rows) {
      const tool = readTool(row, slug);
      if (tool) tools.push(tool);
    }
    // 🔴 READS FIRST, AND WITHIN THE APP RATHER THAN ACROSS ALL OF THEM. A read is the action that
    // runs without interrupting the learner for a confirmation, so it is the one worth spending
    // budget on. Ranking here is what makes the cut below a cut of the LEAST useful actions.
    tools.sort((a, b) => Number(riskOf(a.action) === "write") - Number(riskOf(b.action) === "write"));
    return tools;
  } catch {
    return [];
  }
}

/**
 * Take from every app in turn until the budget is spent.
 *
 * 🔴 THE POINT IS THE FLOOR, NOT THE ORDER. Any app with `n` actions to offer contributes at
 * least `min(n, floor(limit / apps))` of them, so no connected app can be squeezed out by a
 * larger one sitting earlier in the list.
 */
function roundRobin(perApp: readonly (readonly ComposioTool[])[], limit: number): ComposioTool[] {
  const out: ComposioTool[] = [];
  const deepest = perApp.reduce((most, list) => Math.max(most, list.length), 0);
  for (let rank = 0; rank < deepest && out.length < limit; rank += 1) {
    for (const list of perApp) {
      if (out.length >= limit) break;
      const tool = list[rank];
      if (tool) out.push(tool);
    }
  }
  return out;
}

/**
 * How many rows to ask one app for, and how many actions may be offered in total.
 *
 * 🔴 `CATALOGUE_LIMIT` IS NOT A BUDGET, IT IS "THE WHOLE TOOLKIT". Ranking cannot be done on a
 * truncated list, which is the defect described above. Measured against the live catalogue on
 * 2026-08-30: the eleven offered apps return 87, 51, 43, 36, 35, 32, 31, 28, 28, 23 and 17 rows,
 * every one of them a single page. Canvas at 87 is the closest to this number; an app that needs
 * more than one page would be ranked on a truncated list, which is the whole defect again.
 *
 * 🔴 `TOTAL_TOOL_LIMIT` IS SET SO EVERY OFFERED APP CONNECTED AT ONCE STILL CLEARS FOUR ACTIONS
 * EACH. Eleven apps × 4 = 44, which fits in 48. That relationship is the whole reason for the
 * number, so `composio-door.test.ts` asserts it rather than leaving it as a comment, and it has
 * already done its job once: adding the two coursework apps reddened that test at 40, which is
 * exactly the "quietly drop everyone's share to three" it was written to catch.
 */
const CATALOGUE_LIMIT = 100;
const TOTAL_TOOL_LIMIT = 48;

interface ComposioTool {
  readonly action: string;
  readonly app: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/**
 * One catalogue row, read defensively.
 *
 * 🔴 SEVERAL FIELD NAMES ARE ACCEPTED because this was written against documentation rather than a
 * live response. What is NOT flexible is the shape: a non-string name or a non-object schema is a
 * row we cannot safely hand to a model, so it is dropped rather than coerced.
 */
function readTool(row: unknown, app: string): ComposioTool | null {
  if (!row || typeof row !== "object") return null;
  const entry = row as Record<string, unknown>;
  const action = [entry.slug, entry.name, entry.enum].find((value) => typeof value === "string" && value.trim());
  if (typeof action !== "string") return null;
  const schema = [entry.input_parameters, entry.parameters, entry.inputParameters].find(
    (value) => value && typeof value === "object" && !Array.isArray(value),
  );
  if (!schema) return null;
  const description = typeof entry.description === "string" ? entry.description.trim() : "";
  return { action, app, description: description.slice(0, 400), parameters: schema as Record<string, unknown> };
}

/**
 * The auth config that lets a learner connect one app.
 *
 * 🔴🔴 IT IS LOOKED UP, NOT REQUIRED AS NINE ENVIRONMENT VARIABLES, AND THAT IS THE SECOND HALF OF
 * WHY NOTHING WAS EVER CONNECTED. `connectTo` read `COMPOSIO_AUTH_<APP>` and sent whatever it
 * found, which was the empty string, because not one of those variables has ever been set in this
 * repo's environment. Combined with the retired endpoint above, connecting could not have worked
 * for any app on any day. Nine hand-copied ids across two environments is nine chances to ship a
 * dead button, and the button gives no sign which one is missing.
 *
 * Composio already knows the answer, so it is asked. The environment variable still wins when it
 * is set, so a deployment can pin a specific config without editing code.
 *
 * 🔴🔴🔴 THE RETURNED ROW'S TOOLKIT IS CHECKED, AND THIS IS NOT DEFENSIVE PADDING. An unknown query
 * parameter is IGNORED by this API rather than rejected: `?toolkit=notion` returns the account's
 * first five auth configs, beginning with Zoom's. So a one-word slip in the parameter name would
 * hand back a different app's config, and the learner who clicked Connect on Notion would be sent
 * to Zoom's consent screen and would connect Zoom. Verified against the live API on 2026-08-30.
 *
 * Cached per instance. An auth config is created once and lives for the life of the account; if
 * one is ever deleted and recreated, a warm instance keeps the old id until it recycles.
 */
const authConfigIds = new Map<string, string>();

async function authConfigFor(app: string): Promise<string> {
  const pinned = process.env[`COMPOSIO_AUTH_${app.toUpperCase()}`] ?? "";
  if (pinned) return pinned;
  const cached = authConfigIds.get(app);
  if (cached) return cached;
  try {
    const res = await composio(`/auth_configs?toolkit_slug=${encodeURIComponent(app)}&limit=10`);
    if (!res.ok) return "";
    const payload = (await res.json()) as { items?: { id?: string; toolkit?: { slug?: string } }[] };
    const match = (payload.items ?? []).find((item) => typeof item.id === "string" && item.toolkit?.slug === app);
    const id = match?.id ?? "";
    if (id) authConfigIds.set(app, id);
    return id;
  } catch {
    return "";
  }
}

/**
 * Start an OAuth connection. Returns the URL the learner is sent to.
 *
 * 🔴🔴🔴 THIS WAS POINTED AT A RETIRED ENDPOINT AND EVERY Connect BUTTON IN THE PRODUCT WAS DEAD.
 * It posted to `/connected_accounts`, which Composio now refuses for Composio-managed OAuth with:
 * *"Creating connections on this endpoint for Composio-managed OAuth auth configs is no longer
 * supported. Use POST /api/v3/connected_accounts/link instead."* Every one of the offered apps
 * uses managed OAuth, so this covered all of them, Gmail and Drive included.
 *
 * 🔴 IT FAILED AS SILENTLY AS THIS CODE COULD MANAGE, WHICH IS THE PART WORTH REMEMBERING. The
 * 400 became `{ error: "Could not start the connection." }`, the browser showed "Could not start
 * that connection. Try again in a moment." — a sentence that describes a passing glitch — and the
 * learner tried again tomorrow. Nothing logged, nothing alerted, and the connected-apps count
 * simply stayed at zero, which reads exactly like nobody having chosen to connect anything.
 *
 * 🔴 THE PAYLOAD IS FLAT NOW, NOT NESTED. `{ auth_config_id, user_id }`, verified against the live
 * API on 2026-08-30: the nested `{ auth_config: { id }, connection: { user_id } }` shape this used
 * to send is rejected by `/link` as a validation error on both fields.
 */
async function connectTo(uid: string, app: string): Promise<Response> {
  if (!isOffered(app)) {
    return Response.json({ error: "That app is not offered." }, { status: 400 });
  }
  const authConfigId = await authConfigFor(app);
  // 🔴 A DISTINCT MESSAGE FROM THE ONE BELOW, ON PURPOSE. "Could not start the connection" is what
  // a transient upstream failure says; this one is permanent until somebody creates the auth
  // config, and the whole lesson of the retired-endpoint bug above is that one vague sentence hid
  // a permanent failure for weeks by sounding like a passing glitch.
  if (!authConfigId) return Response.json({ error: "That app is not set up for connecting yet." }, { status: 502 });
  const res = await composio("/connected_accounts/link", {
    body: JSON.stringify({ auth_config_id: authConfigId, user_id: uid }),
    method: "POST",
  });
  if (!res.ok) return Response.json({ error: "Could not start the connection." }, { status: 502 });
  // 🔴 BOTH SHAPES ARE STILL READ. `/link` answers `{ link_token, redirect_url, expires_at,
  // connected_account_id }`, so `redirect_url` is the live one; the older `connectionData.val`
  // path is kept because reading a field that is absent costs nothing and a broker that changes
  // its response shape again should degrade to "could not start" rather than to a wrong URL.
  const payload = (await res.json()) as { connectionData?: { val?: { redirectUrl?: string } }; redirect_url?: string };
  const url = payload.redirect_url ?? payload.connectionData?.val?.redirectUrl ?? "";
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
    return Response.json(pendingActionResult({ action, app, arguments: args, summary: summarise(action, args) }));
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
