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

export interface ConnectableApp {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
}

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

export async function connectionStatus(): Promise<ConnectionStatus> {
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
