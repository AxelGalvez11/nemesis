// Supabase (GoTrue) returns terse, developer-facing error strings: "Invalid login credentials",
// "Email not confirmed", "Email rate limit exceeded". The auth pages used to print them verbatim.
// This maps the ones a learner can actually hit to a sentence that says what to do next; anything
// unrecognised falls through unchanged so a genuinely new error is still visible.

const RULES: Array<[RegExp, string]> = [
  [/invalid login credentials|invalid_credentials/i, "That email and password don't match. Check both, or use Forgot your password? to set a new one."],
  [/email not confirmed|email_not_confirmed/i, "You still need to confirm your email. Open the link we sent you, or ask for a new one below."],
  [/rate limit|too many requests|over_email_send_rate_limit/i, "Too many attempts in a short time. Wait a minute and try again."],
  [/password should be at least|weak_password|password is too short/i, "Pick a password of at least 8 characters."],
  [/already (?:been )?registered|already exists|user_already_exists/i, "That email already has a Nemesis account. Sign in instead."],
  [/invalid email|unable to validate email|validation_failed/i, "That doesn't look like a valid email address."],
  [/captcha|turnstile/i, "The security check failed. Reload the page and try again."],
  [/signups? not allowed|signup_disabled/i, "New sign-ups are paused right now. Try again later."],
  [/network|failed to fetch|fetch failed/i, "Nemesis could not reach the sign-in service. Check your connection and try again."],
  [/token has expired|otp_expired|expired/i, "That link has expired. Request a new one."],
  [/same password|same_password/i, "That's your current password. Choose a different one."],
];

export function friendlySignInError(message: string | null | undefined): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Something went wrong. Try again.";
  for (const [pattern, friendly] of RULES) {
    if (pattern.test(raw)) return friendly;
  }
  return raw;
}
