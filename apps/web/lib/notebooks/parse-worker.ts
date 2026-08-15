/**
 * The document worker's decision-making, kept out of the route so it can be
 * tested without a server.
 *
 * 🔴 EVERYTHING AUTHORITATIVE COMES FROM THE DATABASE. The worker is handed a
 * trigger, never a payload: no storage path, no user id, no source id from the
 * caller. It claims rows, and the row tells it what to read and whose it is. A
 * request that could name a storage path could name someone else's.
 *
 * The lease token is the only thing standing between a slow worker and a newer
 * one's result, and it is checked in SQL — in the WHERE clause of every write —
 * not here. This module decides WHAT to do; the database decides whether this
 * worker is still allowed to do it.
 *
 * User-facing status is NOT here. It is derived from two records by the single
 * resolver in `document-status.ts`; a second opinion in this file would be a
 * second source of truth.
 */

import { PARSER_VERSION } from "@nemesis/shared";

// ── Timing ─────────────────────────────────────────────────────────────────

/**
 * How long a claim is good for, and how often it is renewed.
 *
 * 🔴 THE SPIKE'S 250 ms HEARTBEAT WAS A MEASURING INSTRUMENT, NOT A SETTING. It
 * existed to prove the event loop stays free in a worker_thread — at that
 * cadence the answer is unambiguous (50 of 50 ticks vs 0 of 49 inline). As a
 * production interval it would be four database round-trips a second per job,
 * for work measured in minutes.
 *
 * 15 s renewal against a 120 s lease survives SEVEN consecutive missed
 * heartbeats before anything can steal the job — enough margin for a slow
 * database moment or a vision call that pins the loop briefly — while still
 * reclaiming a genuinely dead worker's job within two minutes.
 */
export const LEASE_SECONDS = 120;
export const HEARTBEAT_MS = 15_000;

/**
 * 🔴 ONE JOB PER INVOCATION, ONE PARSER THREAD.
 *
 * A single 2,116-page PDF peaked at 1,067 MB threaded. Two of those is 2,134 MB,
 * which does technically fit inside the 3009 MB tier — so the honest reason for
 * this limit is NOT "two cannot fit". A unit test asserts that arithmetic
 * precisely so this comment cannot quietly become a lie.
 *
 * On paper 2,134 MB also clears MEMORY_ABORT_MB (2,400 MB). So NO ARITHMETIC
 * HERE FORBIDS TWO. The limit is precautionary, and the precaution is the point:
 *
 *   * 1,067 MB is a SINGLE-parse measurement. Nothing has measured two
 *     concurrent peaks. Concurrent heap growth under GC pressure is not
 *     additive-linear, and the paper sum assumes both jobs peak politely at
 *     different moments. Treating an unmeasured number as known is the mistake
 *     this whole spike existed to avoid.
 *   * The paper sum also leaves only ~266 MB under the guard for TWO fetch
 *     buffers, TWO vision page-slice sets and the runtime itself.
 *   * The failure mode is not a slow request. It is the platform killing the
 *     process, which loses the lease, the attempt bookkeeping and the honest
 *     failure record together.
 *
 * Raising this needs a benchmark of concurrent peaks, not an intuition that
 * small files are cheap. File size does not predict cost: a 33.5 MB deck parses
 * in 50 ms and a 13 MB PDF takes 12 seconds.
 */
export const JOBS_PER_RUN = 1;

// ── Resource guards ────────────────────────────────────────────────────────

/**
 * Measured peak, threaded, on the worst real document available: 1,067 MB.
 * The function is configured for 3009 MB — about 2.8× headroom.
 */
export const MEASURED_PEAK_MB = 1067;
export const FUNCTION_MEMORY_MB = 3009;

/**
 * Parent-side abort thresholds, both deliberately INSIDE the platform's limits.
 *
 * A worker that hits the platform's own ceiling is killed mid-write: no failure
 * row, no released lease, no coverage record — just a job that goes quiet and
 * waits for the lease to expire. Aborting ourselves first turns that into an
 * ordinary, recorded, retryable failure.
 */
export const MEMORY_ABORT_MB = 2400; // ~80% of the tier, ~2.2× the measured peak
export const DEADLINE_ABORT_MS = 240_000; // maxDuration is 300 s; leave 60 s to record the failure

/**
 * Units (pages/slides/sheets) a single attempt will parse.
 *
 * Cost tracks unit count, not bytes, so this — not the byte cap — is what stops
 * a small adversarial file from creating unbounded work. A few hundred KB of
 * generated PDF can declare a hundred thousand pages.
 *
 * 5,000 is chosen to sit above the largest real document measured (2,116 pages,
 * 12.3 s, 1,067 MB) with room to spare, while keeping the worst case bounded.
 *
 * 🔴 EXCEEDING IT IS A TRUNCATION, NOT AN ERROR, AND IT MUST REACH COVERAGE.
 * The existing byte cap, archive-expansion bounds and text/vision limits all
 * stay exactly as they are; this is one more bound, disclosed the same way.
 */
export const MAX_UNITS_PER_PARSE = 5_000;

// ── Failure classification ─────────────────────────────────────────────────

/**
 * Which failures are worth trying again.
 *
 * 🔴 THE DEFAULT IS RETRYABLE, AND THAT IS DELIBERATE. An unknown failure is
 * more often a timeout, a cold bucket or a provider blip than a broken file, and
 * the attempt limit stops an unknown-but-permanent failure from spinning forever
 * anyway. Guessing "permanent" wrongly is worse: it strands a file the student
 * uploaded correctly, and nothing retries it.
 */
export function isRetryable(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  // The parser's own refusals are the only permanent ones — they will not read
  // differently on the fourth try.
  return !/unsupported (file|type|format)|password|encrypted|corrupt|not a (pdf|zip)/i.test(message);
}

/**
 * The backoff the SQL computes, mirrored so it can be asserted in a unit test.
 * 30 s, 60 s, 120 s … capped at 30 minutes. Jitter is excluded here because it
 * is random by design; the test asserts the base and the cap.
 */
export function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(attempts - 1, 0), 1800);
}

// ── Identity and auth ──────────────────────────────────────────────────────

/** Identifies this worker instance in `parse_lease_owner`. Diagnosis only. */
export function workerName(): string {
  const region = process.env.VERCEL_REGION ?? "local";
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7);
  return `doc-worker/${PARSER_VERSION}/${region}/${sha}`;
}

/**
 * Constant-time-ish comparison for the worker secret.
 *
 * A plain `===` on secrets leaks length and prefix through timing. Not a
 * high-value oracle on its own, but the fix costs three lines.
 */
export function secretMatches(provided: string | null, expected: string | null): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Strip anything that should never reach a log line or a student's screen.
 *
 * Failure messages are built from provider errors, which quote URLs — and a
 * Supabase storage URL carries a signed token in its query string. Logging the
 * raw message is how a credential ends up in an observability tool nobody
 * treats as secret.
 */
export function sanitizeError(cause: unknown): string {
  const raw = messageOf(cause);
  return raw
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\b(eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})\b/g, "<token>")
    .replace(/\b[Bb]earer\s+\S+/g, "<token>")
    .slice(0, 300);
}

/**
 * The readable part of anything that got thrown, rejected, or returned as an error.
 *
 * 🔴 `String(cause)` ON A PLAIN OBJECT IS `"[object Object]"`, AND THAT IS EXACTLY WHAT
 * PRODUCTION WROTE. The first document the worker ever got past its loading bug failed
 * with `parse_error = "[object Object]"` — a row that records that a parse failed, refuses
 * to say why, and is indistinguishable from every other cause. Supabase returns
 * `PostgrestError` as a PLAIN OBJECT, not an `Error`, so every database failure on this
 * path — the one class of failure most likely to need diagnosing — landed in that branch.
 *
 * Order matters: `message` first, because a `PostgrestError` has one and it is the useful
 * line; then the structured fields, which carry the constraint name or the missing
 * function; then JSON as a last resort. Sanitisation still runs over whatever comes out,
 * so widening this cannot leak a signed URL or a bearer token.
 */
function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  if (cause && typeof cause === "object") {
    const record = cause as Record<string, unknown>;
    const parts = ["message", "code", "details", "hint"]
      .map((key) => (typeof record[key] === "string" && record[key] ? `${key}=${record[key] as string}` : ""))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    try {
      return JSON.stringify(cause);
    } catch {
      // Circular, or holding something unserialisable. The constructor name is still
      // more than "[object Object]" ever was.
      return `unserialisable ${cause.constructor?.name ?? "object"}`;
    }
  }
  return String(cause ?? "unknown error");
}

// ── Vision settlement ──────────────────────────────────────────────────────

/** What a parse reported spending, when it lived long enough to report. */
export interface ReportedVisionSpend {
  readonly calls: number;
  readonly units: number;
}

/**
 * What to settle a vision reservation at.
 *
 * 🔴 SILENCE IS NOT ZERO. This is the whole decision, and it is one line, and getting it
 * backwards is the difference between a ceiling and a suggestion.
 *
 * A parse killed by the deadline guard, the memory guard, or the platform is TERMINATED —
 * `worker.terminate()` reclaims it in 9 ms and it never posts a message. So the run
 * reports no spend at all, while the images it had already sent to Gemini were already
 * billed. Reading that absence as "spent nothing" would refund the entire reservation
 * exactly in the case where the document was most expensive, and a poisoned file could
 * then be retried five times at full cost while the daily ledger stayed at zero.
 *
 * Unreported therefore settles at the FULL GRANT. That over-charges a parse that died
 * early having spent nothing — which is the acceptable direction, because it costs a
 * student some of one day's allowance rather than costing the owner an unbounded bill.
 *
 * Kept out of the route so it can be tested without a server, exactly as the header of
 * this file says.
 */
export function visionSettlement(
  granted: number,
  reported: ReportedVisionSpend | null | undefined,
): { used: number; calls: number } {
  if (!reported) return { calls: 0, used: Math.max(0, granted) };
  return {
    calls: Math.max(0, reported.calls),
    // Clamped to the grant: a report above what was reserved would otherwise settle as a
    // negative refund, which `settle_vision_units` also clamps — two clamps because this
    // one keeps the log line honest and that one keeps the ledger honest.
    used: Math.min(Math.max(0, granted), Math.max(0, reported.units)),
  };
}
