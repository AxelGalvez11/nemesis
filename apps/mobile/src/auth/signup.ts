// Pure mapping from a Supabase signUp result → the UI outcome. Kept separate from
// AuthProvider so it can be unit-tested under Deno without the Supabase client.

export interface SignUpOutcome {
  error: string | null;
  /** True when no session was minted and there's no error → an email confirmation
   *  is pending ("check your email"). */
  needsConfirmation: boolean;
}

// Errors that reveal an email is already registered. Supabase only returns these
// when email confirmation is OFF; with confirmation ON the existing-email case is
// already silent (no session, no error). We collapse them to the same "check your
// email" outcome so the non-enumeration guarantee lives in CODE, not just in the
// operator's Supabase config — it holds even if confirmation is later disabled.
const ACCOUNT_EXISTS_RE = /already\s*(registered|exists|been registered|in use)/i;

/**
 * Decide what the sign-up screen should show.
 *
 * - An "already registered" error → collapse to "check your email" (identical to a
 *   new email) so the UI never reveals whether an address exists (enumeration
 *   defense — holds regardless of the confirmation-ON/OFF config).
 * - Any other error (weak password, invalid email, …) → surface it.
 * - A session was returned → confirmation is OFF; the user is signed in.
 * - No session and no error → a confirmation email was sent (also the obfuscated
 *   already-registered case under confirmation-ON).
 */
export function deriveSignUpResult(
  data: { session: unknown | null } | null,
  error: { message: string } | null,
): SignUpOutcome {
  if (error) {
    if (ACCOUNT_EXISTS_RE.test(error.message)) return { error: null, needsConfirmation: true };
    return { error: error.message, needsConfirmation: false };
  }
  if (data?.session) return { error: null, needsConfirmation: false };
  return { error: null, needsConfirmation: true };
}
