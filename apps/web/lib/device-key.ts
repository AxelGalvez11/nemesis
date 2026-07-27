/**
 * Actually checking a device key, instead of glancing at how it starts.
 *
 * A device key (`nmk_…`) is the identity a phone or a browser presents to this
 * app's own HTTP routes. `nemesis-llm` mints them and `nemesis-search` verifies
 * them; a row lives in `device_keys` holding the SHA-256 of the key, never the
 * key itself, plus a `revoked` flag.
 *
 * The extract route used to accept any string beginning `nmk_` — no lookup, no
 * signature. That was survivable while the worst an impostor could do was spend
 * some CPU parsing a PDF. It stopped being survivable the moment the same route
 * started calling a paid multimodal model: a public URL that turns an arbitrary
 * upload into a billed API call is an open proxy on somebody else's account.
 * (The sibling URL route was never exposed the same way — it FORWARDS the key
 * to nemesis-search, which does this check for real.)
 *
 * The hash is byte-for-byte what nemesis-search computes (sha256Hex of the whole
 * key, prefix included, lowercase hex). Getting that wrong would not fail
 * loudly — it would reject every genuine key and break Library import, notebook
 * sources and chat attachments at once — so the pure half is unit-tested against
 * a known vector and the shape is copied rather than reinvented.
 */
import { createHash } from "node:crypto";

import { adminClient } from "@/lib/server";

/** Every device key starts this way. Necessary, nowhere near sufficient. */
export const DEVICE_KEY_PREFIX = "nmk_";

/** The `device_keys.key_hash` value for a key. PURE.
 *  Must stay identical to nemesis-search's sha256Hex. */
export function deviceKeyHash(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Shape check only — cheap, and lets an obviously malformed key be refused
 *  without touching the database. PURE. */
export function looksLikeDeviceKey(bearer: string): boolean {
  return bearer.startsWith(DEVICE_KEY_PREFIX) && bearer.length > DEVICE_KEY_PREFIX.length;
}

/** Pull the bearer token out of an Authorization header. PURE. */
export function bearerFrom(header: string | null): string {
  return (header ?? "").replace(/^Bearer\s+/i, "").trim();
}

export type DeviceKeyCheck =
  /** A real, unrevoked key. `userId` is who it belongs to. */
  | { ok: true; userId: string }
  /** Missing, malformed, unknown, or revoked — 401, no detail volunteered. */
  | { ok: false; reason: "invalid" }
  /** The lookup itself failed. NOT the caller's fault and NOT a pass: the
   *  route answers 503 so a database blip reads as "try again in a moment"
   *  rather than either "your device is broken" or, far worse, an open door. */
  | { ok: false; reason: "unavailable" };

/**
 * Verify a device key against `device_keys`.
 *
 * FAILS CLOSED in every branch. There is deliberately no "if the service role
 * key is missing, let it through" path — an environment without credentials is
 * an environment that cannot authenticate anyone, and the answer to that is to
 * stop, not to trust.
 *
 * One shape of answer for unknown, revoked and malformed keys, so this can't be
 * used to find out which keys exist.
 */
export async function verifyDeviceKey(bearer: string): Promise<DeviceKeyCheck> {
  if (!looksLikeDeviceKey(bearer)) return { ok: false, reason: "invalid" };

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const keyHash = deviceKeyHash(bearer);
  const { data, error } = await admin
    .from("device_keys")
    .select("user_id,revoked")
    .eq("key_hash", keyHash)
    .maybeSingle();

  // A query error is an OUTAGE, not a verdict — telling the two apart is the
  // difference between "the database hiccuped" and "this key is forged".
  if (error) return { ok: false, reason: "unavailable" };
  if (!data || data.revoked) return { ok: false, reason: "invalid" };

  // Best-effort: when this key was last seen. Never blocks the request, and a
  // failure here must not turn a valid key into a rejected one.
  void admin
    .from("device_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", keyHash)
    .then(
      () => undefined,
      () => undefined,
    );

  return { ok: true, userId: data.user_id as string };
}
