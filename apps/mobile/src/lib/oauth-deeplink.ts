// Google / Apple sign-in on the phone, using iOS's in-app authentication sheet.
//
// WHY NOT THE NATIVE SHEET. expo-apple-authentication and expo-auth-session are
// native modules, and adding one changes the Expo runtime fingerprint — which
// orphans every over-the-air update and forces a fresh TestFlight build. So the
// phone borrows the flow the Mac app already uses, which is pure JS on this side.
//
// HOW IT WORKS. The phone never talks to the provider itself:
//
//   1. phone sheet -> app.enternemesis.com/auth/desktop?provider=google&state=<nonce>
//   2. that page runs the ordinary Supabase OAuth flow (so Supabase only ever
//      sees a WEB redirect it already allows — nothing has to be added to its
//      redirect list, and no cloud setting changes)
//   3. page    -> phone:  nemesis://auth/callback?refresh_token=<token>&state=<nonce>
//   4. phone exchanges that refresh token for a session and the page drops its
//      own copy, so exactly one side owns the token family.
//
// Step 3 is why this is a REFRESH token and not an access token in a URL
// fragment: the fragment form is what Supabase's implicit flow would hand back,
// and it puts a live access token in a URL. The page-to-app hand-off was built
// and reviewed for the Mac app (apps/web/app/auth/desktop/page.tsx) and is
// already in production; this reuses it rather than inventing a second one.

export type SocialProvider = "google" | "apple";

/** The shape the web page insists on before it will start a flow — kept
 *  byte-identical to STATE_PATTERN in apps/web/app/auth/desktop/page.tsx. A
 *  nonce this side generates and that side rejects is a silent dead end. */
export const AUTH_STATE_RE = /^[A-Za-z0-9-]{8,64}$/;

/** The deep link the web page sends back. Matched case-insensitively on the
 *  scheme and host because iOS does not promise to preserve their case. */
export const AUTH_CALLBACK_URL = "nemesis://auth/callback";

export function isValidAuthState(value: unknown): boolean {
  return typeof value === "string" && AUTH_STATE_RE.test(value);
}

/** Where to send the in-app authentication sheet to start provider sign-in.
 *
 *  Throws on a bad state rather than returning a URL the web page will refuse:
 *  a caller that skipped generating a nonce is a programming error, and the
 *  failure would otherwise surface as an unexplained error screen after two
 *  app switches. */
export function buildProviderSignInUrl(baseUrl: string, provider: SocialProvider, state: string): string {
  if (!isValidAuthState(state)) throw new Error("buildProviderSignInUrl: state must match AUTH_STATE_RE");
  const root = baseUrl.replace(/\/+$/, "");
  // The route is still called /auth/desktop because the shipped Mac app hard-codes
  // that path; client=phone only changes the page's wording so it stops telling an
  // iPhone user to go back to their Mac.
  return (
    `${root}/auth/desktop?provider=${encodeURIComponent(provider)}` +
    `&state=${encodeURIComponent(state)}&client=phone`
  );
}

export interface AuthCallback {
  refreshToken: string;
  state: string;
}

/** Pull the refresh token and nonce out of an incoming deep link, or null if
 *  this URL is not a well-formed auth callback.
 *
 *  HAND-PARSED, not `new URL()`. React Native's URL is a partial polyfill that
 *  mishandles custom schemes, and this runs on the one code path where being
 *  wrong means either failing to sign in or accepting something we shouldn't.
 *
 *  Returning a value here is NOT permission to use it — the caller still has to
 *  check the nonce against the sign-in it actually started. See AuthProvider. */
export function parseAuthCallback(url: string): AuthCallback | null {
  if (typeof url !== "string") return null;
  const queryAt = url.indexOf("?");
  if (queryAt < 0) return null;
  if (url.slice(0, queryAt).toLowerCase() !== AUTH_CALLBACK_URL) return null;

  let refreshToken = "";
  let state = "";
  for (const pair of url.slice(queryAt + 1).split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    // A bare flag ("&foo") carries no value; skip rather than reading undefined.
    if (eq < 0) continue;
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    let value: string;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // A stray "%" makes decodeURIComponent throw. A callback we cannot decode
      // is a callback we cannot trust.
      return null;
    }
    if (key === "refresh_token") refreshToken = value;
    else if (key === "state") state = value;
  }

  if (!refreshToken || !isValidAuthState(state)) return null;
  return { refreshToken, state };
}
