/**
 * The document worker's decision-making, kept out of the route so it can be
 * tested without a server.
 *
 * 🔴 EVERYTHING AUTHORITATIVE COMES FROM THE DATABASE. The worker is handed a
 * trigger, never a payload: no storage path, no user id, no source id from the
 * caller. It claims rows, and the row tells it what to read and whose it is. A
 * request that could name a storage path could name someone else's.
 *
 * The lease token is the only thing standing between a slow worker and a
 * newer one's result, and it is checked in SQL — in the WHERE clause of every
 * write — not here. This module decides WHAT to do; the database decides whether
 * this worker is still allowed to do it.
 */

import { PARSER_VERSION } from "@nemesis/shared";

/** How long a claim is good for. Renewed on a heartbeat while the parse runs. */
export const LEASE_SECONDS = 60;
/** Renewal cadence. Comfortably inside LEASE_SECONDS so one lost tick is survivable. */
export const HEARTBEAT_MS = 15_000;
/** Jobs per invocation. Bounded so one worker cannot monopolise a deploy's memory. */
export const JOBS_PER_RUN = 3;

/**
 * Mirrors `document_parse_max_attempts()` in SQL. Kept in sync by a test rather
 * than by hope — the claim predicate uses the SQL one, so a drift here only ever
 * shows up as a worker that reports the wrong number to a student.
 */
export const MAX_ATTEMPTS = 5;

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
  // A file we genuinely cannot read is not going to become readable. These are
  // the parser's own refusals, not transport failures.
  return !/unsupported (file|type|format)|password|encrypted|corrupt|not a (pdf|zip)/i.test(message);
}

/** What a student is told while a parse is in flight or has failed. */
export type ParseStatus =
  | { kind: "queued"; attempts: number }
  | { kind: "parsing"; attempts: number }
  | { kind: "retrying"; attempts: number; nextAttemptAt: string }
  | { kind: "failed"; attempts: number; message: string }
  | { kind: "parsed" };

export interface SourceParseRow {
  parsedDocumentId: string | null;
  parseAttempts: number;
  parseLeasedUntil: string | null;
  parseNextAttemptAt: string | null;
  parseFailedAt: string | null;
  parseError: string | null;
}

/**
 * Turn the row into something a person can act on.
 *
 * 🔴 "parsed" IS NOT "ready". This phase advances a source to parsed; nothing has
 * indexed it yet, so it is not retrieval-ready and no caller may present it as
 * such. The word `ready` is reserved for the state that means searchable, and
 * this function cannot return it.
 */
export function describeParse(row: SourceParseRow, now = new Date()): ParseStatus {
  if (row.parsedDocumentId) return { kind: "parsed" };
  if (row.parseFailedAt) {
    return {
      attempts: row.parseAttempts,
      kind: "failed",
      message: row.parseError ?? "We could not read this file.",
    };
  }
  const leasedUntil = row.parseLeasedUntil ? new Date(row.parseLeasedUntil) : null;
  if (leasedUntil && leasedUntil > now) return { attempts: row.parseAttempts, kind: "parsing" };

  const next = row.parseNextAttemptAt ? new Date(row.parseNextAttemptAt) : null;
  // A future retry time only means "retrying" if something has actually been
  // tried. A brand new row's next_attempt_at defaults to its creation instant.
  if (next && next > now && row.parseAttempts > 0) {
    return { attempts: row.parseAttempts, kind: "retrying", nextAttemptAt: next.toISOString() };
  }
  return { attempts: row.parseAttempts, kind: "queued" };
}

/** Plain-English status line. Says whether Nemesis is still working on it. */
export function parseStatusLine(status: ParseStatus): string {
  switch (status.kind) {
    case "parsed":
      return "Read and saved.";
    case "parsing":
      return "Reading this document now.";
    case "queued":
      return "Waiting to be read.";
    case "retrying":
      return `That attempt did not finish. Trying again — attempt ${status.attempts + 1} of ${MAX_ATTEMPTS}.`;
    case "failed":
      return `${status.message} We tried ${status.attempts} times and have stopped. You can retry it yourself.`;
  }
}

/**
 * The backoff the SQL computes, mirrored so it can be asserted in a unit test.
 * 30s, 60s, 120s … capped at 30 minutes. The jitter is excluded here because it
 * is random by design; the test asserts the base and the cap.
 */
export function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(attempts - 1, 0), 1800);
}

/** Identifies this worker instance in `parse_lease_owner`. Diagnosis only. */
export function workerName(): string {
  const region = process.env.VERCEL_REGION ?? "local";
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7);
  return `doc-worker/${PARSER_VERSION}/${region}/${sha}`;
}

/**
 * Constant-time-ish comparison for the worker secret.
 *
 * A plain `===` on secrets leaks length and prefix through timing. This is not a
 * high-value oracle — the caller would need a great many attempts — but the fix
 * costs three lines and the habit is worth more than the specific risk.
 */
export function secretMatches(provided: string | null, expected: string | null): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
