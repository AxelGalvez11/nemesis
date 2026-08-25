import { assert, assertEquals } from "jsr:@std/assert@1";
import { __backoffMs as backoffMs } from "./http.ts";

// ── the retry policy every science connector shares ───────────────────────────────────────────
//
// 🔴 THIS IS THE ONE PIECE OF THE HTTP LAYER THAT CAN TURN A POLITE CLIENT INTO AN ABUSIVE ONE.
// Everything else here either succeeds or fails; the backoff decides how hard we push a server that
// has just told us to stop. It had no floor and no ceiling, and both ends were reachable in
// production by a header we do not control.

const headers = (v?: string) =>
  ({ headers: { get: (k: string) => (k.toLowerCase() === "retry-after" && v !== undefined ? v : null) } }) as unknown as Response;

Deno.test("🔴🔴🔴 Retry-After: 0 does not mean retry immediately", () => {
  // Observed live 2026-08-24: export.arxiv.org sits behind Varnish and its 503 carries exactly
  // `retry-after: 0`. The old code returned 0ms, so a server saying "I am overloaded" was answered
  // with three instant retries — us behaving like the thing rate limits exist to stop.
  assert(backoffMs(headers("0"), 0) >= 1_000, "a zero Retry-After still produced an instant retry");
});

Deno.test("a header of '0' is not worse than having no header at all", () => {
  // The subtle half of the bug: `if (retryAfter)` treats the string "0" as present-and-truthy, so
  // the header short-circuited the exponential backoff that would otherwise have waited ~1s. The
  // presence of a Retry-After must never make us push harder than its absence would.
  const withZero = backoffMs(headers("0"), 0);
  const without = backoffMs(headers(undefined), 0);
  assert(withZero >= 1_000 && withZero <= without + 1_000, `zero-header backoff ${withZero}ms undercut the no-header backoff ${without}ms`);
});

Deno.test("🔴 an enormous Retry-After cannot park a request for an hour", () => {
  // 3600s is a legal value. Honouring it literally holds a socket open inside a function whose
  // whole wall-clock budget is 3 seconds. Above the ceiling the honest move is to fail now.
  assertEquals(backoffMs(headers("3600"), 0), 15_000);
});

Deno.test("a sensible Retry-After is honoured as given", () => {
  // The clamps must not flatten the useful middle — a server asking for 5s gets 5s.
  assertEquals(backoffMs(headers("5"), 0), 5_000);
});

Deno.test("a negative Retry-After is ignored rather than treated as time travel", () => {
  assert(backoffMs(headers("-30"), 0) >= 1_000);
});

Deno.test("an HTTP-date Retry-After falls through to exponential backoff", () => {
  // "Wed, 21 Oct 2026 07:28:00 GMT" is legal and Number() makes it NaN. Falling through is correct:
  // a wrong-but-plausible parse would produce a delay nobody could predict from the header.
  const ms = backoffMs(headers("Wed, 21 Oct 2026 07:28:00 GMT"), 0);
  assert(ms >= 1_000 && ms <= 1_300, `expected the ~1s exponential floor, got ${ms}ms`);
});

Deno.test("exponential backoff grows and then stops growing", () => {
  assert(backoffMs(headers(undefined), 0) < backoffMs(headers(undefined), 2), "backoff does not grow with attempts");
  assert(backoffMs(headers(undefined), 20) <= 15_000 + 250, "backoff has no ceiling");
});
