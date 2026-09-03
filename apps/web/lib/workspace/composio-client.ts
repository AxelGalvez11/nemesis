// The browser's side of the Composio door.
//
// 🔴🔴 IT CARRIES NO SECRET, AND IT CANNOT. Every call goes to `/api/composio`, which holds the
// account-wide key server-side; this module carries the learner's own Supabase token so the
// route can work out who is asking. There is deliberately no way to reach Composio from here
// without passing through that route.
//
// 🔴 THE CLIENT-SIDE GATE IS A COURTESY, NOT THE GATE. `heldForApproval` runs here so a
// confirmation card can appear before a round trip, but the route re-runs the identical check and
// wins. If they ever disagree, the learner gets one extra click — the only direction this is
// allowed to be wrong in.
//
// 🔴 UNCONFIGURED IS NOT AN ERROR. Without a key on the server this reports `configured: false`
// and every surface says "not set up yet"; nothing throws and nothing retries.

import { supabase } from "@/lib/supabase";

import { heldForApproval, pendingActionResult, summarise, type PendingAction } from "./composio-actions";
import type { ConnectableApp } from "./composio-apps";

// 🔴 ONE DEFINITION, RE-EXPORTED. This interface used to be declared here as well as in the
// route's app list, so the two described the same wire object and only agreed by hand. When the
// list gained a `group` (the settings screen needs it to stop reading as a directory) the copy
// here would have kept describing the older shape, and the screen would have grouped nothing
// while the server dutifully sent the field.
// (imported at the top of the file, re-exported here so callers keep one import site.)
export type { ConnectableApp };

export interface ConnectionStatus {
  readonly configured: boolean;
  readonly apps: readonly ConnectableApp[];
  readonly connected: readonly string[];
}

export const NOT_CONFIGURED: ConnectionStatus = { apps: [], configured: false, connected: [] };

async function call(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch("/api/composio", {
      body: JSON.stringify(payload),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Concurrent readers share ONE request, and that is a measured fix rather than tidiness.
 *
 * 🔴🔴 THE FRONT DOOR ASKED TWICE, EVERY TIME. Measured on production 2026-09-02, loading
 * `/learn` signed in: two `POST /api/composio` calls, both starting at 342 ms, taking 589 ms and
 * 713 ms — the same question, asked twice, each one a round trip to Composio's own API behind our
 * route. `use-connected-apps.ts` had built exactly this share for itself when the shell began
 * mounting two navs, and `canvas-home.tsx` called straight past it: a deduplicator one caller
 * cannot see is a deduplicator that does not work.
 *
 * 🔴 SO THE SHARE LIVES WITH THE CALL, NOT WITH ONE CALLER. Every reader of this status — the two
 * navs, the front door's connect row, the Plugins page, the settings screen — now merges into one
 * request whenever their calls overlap, and none of them has to know the others exist.
 *
 * 🔴 CLEARED WHEN IT SETTLES, NOT CACHED, WHICH IS THE OTHER HALF. This merges calls that overlap
 * and nothing more: the Plugins page and the settings screen re-read this immediately after a
 * connect or a disconnect, and a cache would hand them the answer from before the thing they just
 * did. A read that starts after the previous one finished is always fresh.
 */
let statusInFlight: Promise<ConnectionStatus> | null = null;

export function connectionStatus(): Promise<ConnectionStatus> {
  if (statusInFlight) return statusInFlight;
  const started = readConnectionStatus();
  statusInFlight = started;
  void started.then(
    () => { if (statusInFlight === started) statusInFlight = null; },
    () => { if (statusInFlight === started) statusInFlight = null; },
  );
  return started;
}

async function readConnectionStatus(): Promise<ConnectionStatus> {
  const body = await call({ op: "status" });
  if (!body) return NOT_CONFIGURED;
  return {
    apps: Array.isArray(body.apps) ? (body.apps as ConnectableApp[]) : [],
    configured: body.configured === true,
    connected: Array.isArray(body.connected) ? (body.connected as string[]) : [],
  };
}

/**
 * Begin connecting an app.
 *
 * 🔴🔴 THE LEARNER IS SENT TO THE PROVIDER'S OWN CONSENT SCREEN, AND NEMESIS NEVER SEES A
 * PASSWORD. That is the entire reason a broker is worth using: the sign-in happens on Google's
 * page, Composio holds the resulting token, and this product holds neither. Returns the URL
 * rather than navigating, so the caller decides — a function that redirected as a side effect
 * would be unable to say "that failed" at all.
 */
export async function beginConnect(app: string): Promise<string | null> {
  const body = await call({ app, op: "connect" });
  const url = typeof body?.url === "string" ? body.url : "";
  return url || null;
}

export async function disconnect(app: string): Promise<boolean> {
  const body = await call({ app, op: "disconnect" });
  return body?.ok === true;
}

/** An OpenAI-shaped tool the model can call, plus the app it belongs to. */
export interface ComposioToolDef {
  readonly type: "function";
  readonly function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Which app each offered action belongs to, so a call can be routed and named on its card. */
export type ComposioToolIndex = ReadonlyMap<string, string>;

/**
 * The tools this learner's connected apps offer, ready to hand to the model.
 *
 * 🔴🔴🔴 IT RETURNS AN EMPTY LIST FOR EVERY PROBLEM, AND THAT IS THE WHOLE SAFETY ARGUMENT OF THIS
 * FEATURE. No key, no connected apps, a network failure, a response shaped differently than
 * expected, a row missing a name: all of them produce `[]`, and `[]` means the model is offered
 * exactly the tools it was offered before Composio existed. This code was written without a live
 * key to test against, so the one thing it must never do is break the chat of somebody who never
 * connected anything.
 *
 * 🔴 THE NAME THE MODEL SEES IS THE ACTION SLUG, unchanged. Renaming it to something friendlier
 * would mean mapping back at execution time, and a mapping that loses an entry sends a call to the
 * wrong action — against somebody's real mailbox.
 */
export async function composioTools(): Promise<{ tools: readonly ComposioToolDef[]; index: ComposioToolIndex }> {
  const empty = { index: new Map<string, string>(), tools: [] as ComposioToolDef[] };
  const body = await call({ op: "tools" });
  if (!body || !Array.isArray(body.tools)) return empty;
  const tools: ComposioToolDef[] = [];
  const index = new Map<string, string>();
  for (const row of body.tools as unknown[]) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const name = typeof entry.action === "string" ? entry.action : "";
    const app = typeof entry.app === "string" ? entry.app : "";
    const parameters = entry.parameters;
    if (!name || !parameters || typeof parameters !== "object" || Array.isArray(parameters)) continue;
    const description = typeof entry.description === "string" ? entry.description : "";
    tools.push({
      function: { description, name, parameters: parameters as Record<string, unknown> },
      type: "function",
    });
    index.set(name, app);
  }
  return { index, tools };
}

/**
 * Run one model-issued tool call against a connected app.
 *
 * 🔴🔴 THE SAME CONTRACT AS `executeAgentTool`: this NEVER throws. A failure comes back as
 * `{error}` so the model can say something true about it, rather than the turn dying with an empty
 * bubble. That contract is why the caller can route to either executor without a try/catch.
 *
 * 🔴🔴 AND A WRITE COMES BACK HELD, NOT DONE. `runAction` refuses an unconfirmed write before the
 * network is touched, and the server refuses it again; either way what reaches the model is
 * `confirm_required` with an instruction not to claim it happened. `confirmed` is never set here —
 * only a learner's click can set it, which is the entire point.
 */
export async function runConnectedApp(
  call: { name: string; arguments: string },
  app: string,
): Promise<unknown> {
  let parsed: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(call.arguments || "{}") as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) parsed = raw as Record<string, unknown>;
  } catch {
    // 🔴 UNPARSEABLE ARGUMENTS ARE AN ERROR, NEVER AN EMPTY OBJECT. Running a send with `{}`
    // because the model's JSON was malformed is how an empty email reaches somebody.
    return { error: "Those instructions could not be read. Nothing was done." };
  }
  const result = await runAction({ action: call.name, app, arguments: parsed });
  if (result.kind === "held") return pendingActionResult(result.pending);
  if (result.kind === "failed") return { error: result.error };
  return { data: result.data };
}

export type RunResult =
  | { kind: "held"; pending: PendingAction }
  | { kind: "ran"; data: unknown }
  | { kind: "failed"; error: string };

/**
 * Run one action in a connected app.
 *
 * 🔴 A WRITE IS HELD BEFORE THE NETWORK IS TOUCHED. Not for speed — so that a learner who never
 * confirms has caused no request at all to leave their machine.
 */
export async function runAction(input: {
  app: string;
  action: string;
  arguments: Record<string, unknown>;
  confirmed?: boolean;
}): Promise<RunResult> {
  const confirmed = input.confirmed === true;
  if (heldForApproval(input.action, confirmed)) {
    const pending: PendingAction = {
      action: input.action,
      app: input.app,
      // Carried so an approval re-runs THIS, not a reissue of it. See the field's own note.
      arguments: input.arguments,
      summary: summarise(input.action, input.arguments),
    };
    // Built through the shared helper so the phrasing the model sees is identical on both sides.
    void pendingActionResult(pending);
    return { kind: "held", pending };
  }
  const body = await call({ action: input.action, app: input.app, arguments: input.arguments, confirmed, op: "execute" });
  if (!body) return { kind: "failed", error: "That app is not responding right now." };
  // The server re-ran the same gate and disagreed with us. It wins.
  if (body.confirm_required === true) {
    return { kind: "held", pending: body.pending_action as PendingAction };
  }
  if (typeof body.error === "string") return { kind: "failed", error: body.error };
  return { data: body.data ?? null, kind: "ran" };
}
