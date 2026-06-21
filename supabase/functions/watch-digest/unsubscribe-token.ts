// Signed one-click unsubscribe token (WS-D increment 6, email layer). An emailed unsubscribe link is
// public (the recipient clicks it from their inbox, unauthenticated), so the link must prove WHICH user
// it is for without a session — otherwise anyone could unsubscribe anyone. The token is an HMAC over the
// user id keyed by a server secret (the service-role key, reused — no new secret to manage). Verifying
// recomputes the HMAC and compares in constant time. PURE except for Web Crypto (async); unit-tested.
//
// OPERATIONAL NOTE: because the secret IS the service-role key, rotating that key invalidates every
// unsubscribe link in already-sent emails (they 400 until the user gets a fresh digest). Acceptable; if
// link stability across key rotation is ever needed, switch to a dedicated, separately-rotated secret.

const enc = new TextEncoder();

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The stable unsubscribe token for a user (same user + secret → same token, so the link never rots). */
export function signUnsubscribe(userId: string, secret: string): Promise<string> {
  return hmacHex(secret, userId);
}

/** Constant-time verify that `token` was signed for THIS user with THIS secret. */
export async function verifyUnsubscribe(userId: string, token: string, secret: string): Promise<boolean> {
  const expected = await signUnsubscribe(userId, secret);
  if (token.length !== expected.length || token.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** The full public unsubscribe link emailed to the user (GET-handled by the watch-digest function). */
export function buildUnsubscribeUrl(supabaseUrl: string, userId: string, token: string): string {
  const u = new URL("/functions/v1/watch-digest", supabaseUrl);
  u.searchParams.set("unsubscribe", userId);
  u.searchParams.set("token", token);
  return u.toString();
}
