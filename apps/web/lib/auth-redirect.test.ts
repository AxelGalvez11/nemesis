// npx tsx lib/auth-redirect.test.ts
import assert from "node:assert/strict";
import { DEFAULT_LANDING_PATH, resolveAuthRedirectUrl, sanitizeNextPath, signInRedirect } from "./auth-redirect";

assert.equal(
  resolveAuthRedirectUrl("/app", {
    envAppUrl: "http://localhost:3000",
    origin: "https://app.enternemesis.com",
  }),
  "https://app.enternemesis.com/app",
);

assert.equal(
  resolveAuthRedirectUrl("/app", { envAppUrl: "", origin: undefined }),
  "https://app.enternemesis.com/app",
);

assert.equal(
  resolveAuthRedirectUrl("/app", {
    envAppUrl: "https://app.enternemesis.com",
    origin: "http://localhost:3100",
  }),
  "http://localhost:3100/app",
);

assert.equal(sanitizeNextPath("/app/ask?c=123"), "/app/ask?c=123");
assert.equal(sanitizeNextPath("https://evil.example"), "/account");
assert.equal(sanitizeNextPath("//evil.example"), "/account");
assert.equal(sanitizeNextPath("/%2f%2fevil.example"), "/account");

// The pricing funnel rides on the query string surviving this: www.enternemesis.com's
// plan buttons link to /pricing?plan=<id>, and the app bounces a signed-out visitor
// through /sign-up?next=/pricing?plan=<id> so checkout can resume once they have an
// account. Drop the ?plan= here and every paid signup silently lands on the free tier.
assert.equal(sanitizeNextPath("/pricing?plan=pro"), "/pricing?plan=pro");
assert.equal(sanitizeNextPath("/pricing?plan=plus"), "/pricing?plan=plus");
assert.equal(sanitizeNextPath("/pricing?plan=max"), "/pricing?plan=max");
// Encoded once by encodeURIComponent on the way into ?next=, decoded on the way out.
assert.equal(sanitizeNextPath(decodeURIComponent("%2Fpricing%3Fplan%3Dpro")), "/pricing?plan=pro");
assert.equal(sanitizeNextPath("/%252f%252fevil.example"), "/account");
assert.equal(sanitizeNextPath("/%2e//evil.example"), "/account");
assert.equal(sanitizeNextPath("/\\evil.example"), "/account");
assert.equal(sanitizeNextPath("/app\nhttps://evil.example"), "/account");
assert.equal(sanitizeNextPath("/%E0%A4%A"), "/account");
assert.equal(sanitizeNextPath(null, "/account"), "/account");
assert.equal(sanitizeNextPath("https://evil.example", "/account"), "/account");
assert.equal(sanitizeNextPath("/account/billing", "/account"), "/account/billing");

// ── Where a learner lands, and the fact that it is ONE answer ────────────────
//
// 🔴 THIS WAS SPLIT ACROSS SIX CALL SITES AND NOBODY COULD SEE IT. Signing in put a learner on
// /sessions -- the chat surface the owner retired from navigation, which the sidebar does not list
// -- so their first screen was somewhere they could not themselves have navigated to. Five of the
// six were literal "/sessions"; the sixth was URL-ENCODED as "%2Fsessions" inside the confirmation
// email's redirect, invisible to a search for the other five.
assert.equal(DEFAULT_LANDING_PATH, "/learn", "the front door is /learn (acceptance §L)");

// 🔴 IT IS A FALLBACK, NEVER AN OVERRIDE. An explicit ?next= always wins. A default that could
// override a requested path would break a client this repo cannot update.
assert.equal(sanitizeNextPath("/library?import=coursework", DEFAULT_LANDING_PATH), "/library?import=coursework");
assert.equal(sanitizeNextPath(null, DEFAULT_LANDING_PATH), DEFAULT_LANDING_PATH);
// A hostile ?next= still falls back rather than navigating off-origin.
assert.equal(sanitizeNextPath("https://evil.example", DEFAULT_LANDING_PATH), DEFAULT_LANDING_PATH);

// ── The ROUND TRIP: gate -> ?next= -> where the learner actually lands ───────
//
// 🔴 THE ASSERTIONS ABOVE PROVED THE CONSUMER AND NOBODY EVER TESTED THE PRODUCER. That is why this
// shipped: `sanitizeNextPath` has always returned `search`, so every test here passed, while the
// three auth gates built `next` from `usePathname()` -- which excludes the query by definition. The
// parameter was gone before the sanitiser was ever handed it.
//
// This block therefore walks the WHOLE path a signed-out learner walks, rather than either half.
function landsOn(produce: (pathname: string, search: string) => string, pathname: string, search: string): string {
  const gate = produce(pathname, search);
  const raw = new URLSearchParams(gate.slice(gate.indexOf("?") + 1)).get("next");
  return sanitizeNextPath(raw, DEFAULT_LANDING_PATH);
}

// The shipped browser extension's deep link. This repo cannot update that client.
assert.equal(landsOn(signInRedirect, "/library", "?import=coursework"), "/library?import=coursework");
// A shared canvas link opened while logged out.
assert.equal(
  landsOn(signInRedirect, "/learn", "?canvas=213c2d47-0000-4000-8000-000000000000"),
  "/learn?canvas=213c2d47-0000-4000-8000-000000000000",
);
// Several parameters, and one carrying an encoded value, survive together.
assert.equal(landsOn(signInRedirect, "/learn", "?canvas=abc&tab=sources"), "/learn?canvas=abc&tab=sources");
assert.equal(landsOn(signInRedirect, "/pricing", "?plan=pro"), "/pricing?plan=pro");
// No query stays no query -- never a trailing "?".
assert.equal(landsOn(signInRedirect, "/learn", ""), "/learn");
assert.equal(signInRedirect("/learn"), "/sign-in?next=%2Flearn");
// Both shapes a caller may hold: window.location.search has the "?", useSearchParams() does not.
assert.equal(signInRedirect("/library", "import=coursework"), signInRedirect("/library", "?import=coursework"));
assert.equal(signInRedirect("/learn", "?"), "/sign-in?next=%2Flearn");
// A hostile pathname still cannot escape the origin once it comes back out.
assert.equal(landsOn(signInRedirect, "//evil.example", ""), DEFAULT_LANDING_PATH);

// 🔴 PERMANENT CONTROL -- DO NOT DELETE. This is the exact producer that shipped: pathname only.
// Without it a real fix and a no-op are indistinguishable, because every OTHER assertion in this
// file passes under both. It asserts the defect, so if someone reintroduces `usePathname()` alone
// the round-trip assertions above are the ones that fail, and this one explains why.
const producerThatShipped = (pathname: string, _search: string) => `/sign-in?next=${encodeURIComponent(pathname)}`;
assert.equal(landsOn(producerThatShipped, "/library", "?import=coursework"), "/library");
assert.notEqual(landsOn(producerThatShipped, "/library", "?import=coursework"), "/library?import=coursework");
assert.equal(landsOn(producerThatShipped, "/learn", "?canvas=213c2d47-0000-4000-8000-000000000000"), "/learn");

console.log("auth-redirect.test.ts OK");
