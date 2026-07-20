// Phone Usage (cloud-first phone build spec §11): plan + AI-allowance summary
// for the Settings > Usage screen. Reads the SAME metered gateway Chat uses —
// nemesis-llm's `GET /usage` — with the SAME per-uid nmk_ device key api/chat.ts
// mints (the edge function's own comment marks this route "LOAD-BEARING: the
// settings page's allowance card reads this"; it's also what the desktop app's
// Account & usage view reads). So the numbers here are the exact ones chat
// spends against — not a separate ledger, and not the web app's
// buildCreditsSummary()/get_my_usage RPC path (that reads Ask/Deep-research/
// Monitors/Missions counters that don't exist on the phone).
//
// Device-key mint/read is intentionally DUPLICATED from api/chat.ts rather than
// imported (chat.ts keeps it private, and the phone settings-port task keeps
// this file self-contained). Keep the SecureStore key + mint request shape in
// sync with chat.ts if either ever changes. Pure parsing lives in
// usage-helpers.ts (dependency-free, Deno-testable) — this file is the I/O
// layer, same split as missions.ts/missions-helpers.ts.
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";
import { deviceKeyStoreFor, parseUsageSummary, type UsageResult } from "./usage-helpers";

// Re-exported so screens only need one import line; UsageResult itself stays
// local (it's only named in this file's own function signature below).
export type { UsageErrorKind, UsageSummary } from "./usage-helpers";
export { usagePercent } from "./usage-helpers";

const LLM_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/nemesis-llm`;

/** Mint a device key for the CURRENT session, only if it belongs to `uid` — a
 *  stale screen from a previous account must never mint under the new one
 *  (same invariant api/chat.ts::mintDeviceKey documents). */
async function mintDeviceKey(uid: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== uid) return null;
  try {
    const res = await fetch(`${LLM_BASE}/device-key`, {
      body: JSON.stringify({ label: "Nemesis iPhone" }),
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { key?: string };
    if (typeof body.key !== "string" || !body.key.startsWith("nmk_")) return null;
    await SecureStore.setItemAsync(deviceKeyStoreFor(uid), body.key);
    return body.key;
  } catch {
    return null;
  }
}

async function deviceKey(uid: string): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(deviceKeyStoreFor(uid));
    if (stored?.startsWith("nmk_")) return stored;
  } catch {
    // fall through to a fresh mint
  }
  return mintDeviceKey(uid);
}

/** Fetch the signed-in user's plan + today's/this month's AI usage. Never
 *  throws — a friendly error kind comes back instead so the screen can render
 *  offline/auth/generic copy without a crash. Mirrors api/chat.ts's
 *  401/403-then-remint-once retry so a revoked/restored-phone key recovers the
 *  same way chat does. A 200 with `remaining: 0` is a NORMAL result (the
 *  endpoint returns 200 even when the budget is exhausted) — that's rendered
 *  as a full bar by the caller, never as an error. */
export async function fetchUsageSummary(uid: string): Promise<UsageResult> {
  let key = await deviceKey(uid);
  if (!key) return { errorKind: "auth", ok: false };

  const call = (bearer: string) =>
    fetch(`${LLM_BASE}/usage`, { headers: { Authorization: `Bearer ${bearer}` }, method: "GET" });

  try {
    let res = await call(key);
    if (res.status === 401 || res.status === 403) {
      const fresh = await mintDeviceKey(uid);
      if (fresh) {
        key = fresh;
        res = await call(key);
      }
    }
    if (res.status === 401 || res.status === 403) return { errorKind: "auth", ok: false };
    if (!res.ok) return { errorKind: "generic", ok: false };
    const body = await res.json().catch(() => null);
    const summary = parseUsageSummary(body);
    return summary ? { ok: true, summary } : { errorKind: "generic", ok: false };
  } catch {
    return { errorKind: "unreachable", ok: false };
  }
}
