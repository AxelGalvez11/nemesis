// Session-storage key used to hand a typed email from /sign-up to /sign-in without putting the
// address in the URL (query strings end up in logs and browser history; sessionStorage does not).
export const SIGN_IN_PREFILL_KEY = "nemesis.sign-in.prefill-email";

interface SignUpUserLike {
  identities?: unknown[] | null;
}

/**
 * Supabase signals "this email already has an account" two different ways depending on the
 * email-confirmation setting:
 *  - confirmations ON  → signUp "succeeds" but returns an obfuscated user whose `identities`
 *    array is empty (anti-enumeration behavior; no email is sent).
 *  - confirmations OFF → signUp fails with an explicit "already registered" error.
 * Both mean the visitor should be routed to sign-in instead of being shown a dead end.
 */
export function isAlreadyRegisteredSignUp(
  user: SignUpUserLike | null | undefined,
  errorMessage: string | null | undefined,
): boolean {
  // GoTrue phrasing varies: "User already registered", "... has already been registered",
  // "... already exists". Match the stable "already <registered|exists>" core.
  if (errorMessage) return /already\s+(?:been\s+)?(?:registered|exists)/i.test(errorMessage);
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}
