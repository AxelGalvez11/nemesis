import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  backoffSeconds,
  describeParse,
  isRetryable,
  MAX_ATTEMPTS,
  parseStatusLine,
  secretMatches,
  type SourceParseRow,
} from "./parse-worker";

const NOW = new Date("2026-08-06T12:00:00Z");
const row = (over: Partial<SourceParseRow> = {}): SourceParseRow => ({
  parseAttempts: 0,
  parsedDocumentId: null,
  parseError: null,
  parseFailedAt: null,
  parseLeasedUntil: null,
  parseNextAttemptAt: null,
  ...over,
});

test("🔴 a parsed source is never described as ready", () => {
  // This phase advances to `parsed`. Nothing has indexed it, so it is NOT
  // retrieval-ready. If `describeParse` could ever return "ready", a UI would
  // eventually print it, and a student would believe search covers this file.
  const status = describeParse(row({ parsedDocumentId: "pd-1" }), NOW);
  assert.equal(status.kind, "parsed");
  assert.notEqual(status.kind as string, "ready");
  assert.doesNotMatch(parseStatusLine(status).toLowerCase(), /\bready\b/);
});

test("a live lease reads as parsing; an expired one falls back to queued", () => {
  const live = describeParse(row({ parseLeasedUntil: "2026-08-06T12:00:30Z" }), NOW);
  assert.equal(live.kind, "parsing");
  // An expired lease is exactly how a dead worker looks. It must return to the
  // queue rather than appear stuck "parsing" forever.
  const dead = describeParse(row({ parseAttempts: 1, parseLeasedUntil: "2026-08-06T11:59:30Z" }), NOW);
  assert.equal(dead.kind, "queued");
});

test("a future retry time only means retrying once something has been tried", () => {
  // A brand new row defaults next_attempt_at to its creation instant, which can
  // be a hair in the future. Reporting that as "retrying" would tell a student a
  // failure happened before anything ran.
  const fresh = describeParse(row({ parseAttempts: 0, parseNextAttemptAt: "2026-08-06T12:00:10Z" }), NOW);
  assert.equal(fresh.kind, "queued");

  const backingOff = describeParse(row({ parseAttempts: 2, parseNextAttemptAt: "2026-08-06T12:05:00Z" }), NOW);
  assert.equal(backingOff.kind, "retrying");
});

test("terminal failure explains itself and stops promising more attempts", () => {
  const status = describeParse(
    row({ parseAttempts: 5, parseError: "We could not read this file.", parseFailedAt: "2026-08-06T11:00:00Z" }),
    NOW,
  );
  assert.equal(status.kind, "failed");
  const line = parseStatusLine(status);
  assert.match(line, /stopped/);
  assert.match(line, /retry it yourself/);
});

test("🔴 an unknown failure is RETRYABLE — guessing permanent strands a good file", () => {
  assert.equal(isRetryable(new Error("socket hang up")), true);
  assert.equal(isRetryable(new Error("fetch failed")), true);
  assert.equal(isRetryable(undefined), true);
  // The parser's own refusals are the only permanent ones: they will not read
  // differently on the fourth try.
  assert.equal(isRetryable(new Error("unsupported file type: .heic")), false);
  assert.equal(isRetryable(new Error("PDF is encrypted")), false);
  assert.equal(isRetryable(new Error("not a zip archive")), false);
});

test("backoff doubles and is capped at 30 minutes", () => {
  assert.equal(backoffSeconds(1), 30);
  assert.equal(backoffSeconds(2), 60);
  assert.equal(backoffSeconds(3), 120);
  assert.equal(backoffSeconds(4), 240);
  // Without a cap the 12th attempt would be ~17 hours away, which is
  // indistinguishable from never for someone studying tonight.
  assert.equal(backoffSeconds(20), 1800);
});

test("🔴 the TypeScript attempt limit matches the one the SQL claim predicate uses", () => {
  // The claim predicate filters on document_parse_max_attempts(). If these drift,
  // the worker tells students "attempt 3 of 5" while the database has already
  // stopped picking the job up. Read the migration rather than trusting a comment.
  const sql = readFileSync(
    new URL("../../../../supabase/migrations/20260806210000_document_parse_jobs.sql", import.meta.url),
    "utf8",
  );
  const match = sql.match(/document_parse_max_attempts\(\)\s*\n?returns int language sql immutable as \$\$ select (\d+) \$\$/);
  assert.ok(match, "could not find document_parse_max_attempts() in the migration");
  assert.equal(Number(match[1]), MAX_ATTEMPTS);
});

test("the worker secret comparison rejects length and content mismatches", () => {
  assert.equal(secretMatches("abc123", "abc123"), true);
  assert.equal(secretMatches("abc123", "abc124"), false);
  assert.equal(secretMatches("abc", "abc123"), false);
  // A missing secret on either side must never authenticate.
  assert.equal(secretMatches(null, "abc123"), false);
  assert.equal(secretMatches("abc123", null), false);
  assert.equal(secretMatches("", ""), false);
});
