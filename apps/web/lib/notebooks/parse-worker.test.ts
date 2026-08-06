import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MAX_ATTEMPTS } from "./document-status";
import {
  backoffSeconds,
  DEADLINE_ABORT_MS,
  FUNCTION_MEMORY_MB,
  HEARTBEAT_MS,
  isRetryable,
  JOBS_PER_RUN,
  LEASE_SECONDS,
  MAX_UNITS_PER_PARSE,
  MEASURED_PEAK_MB,
  MEMORY_ABORT_MB,
  sanitizeError,
  secretMatches,
} from "./parse-worker";

test("🔴 an unknown failure is RETRYABLE — guessing permanent strands a good file", () => {
  assert.equal(isRetryable(new Error("socket hang up")), true);
  assert.equal(isRetryable(new Error("fetch failed")), true);
  assert.equal(isRetryable(undefined), true);
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
  // stopped picking the job up. Read the migration rather than trust a comment.
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
  assert.equal(secretMatches(null, "abc123"), false);
  assert.equal(secretMatches("abc123", null), false);
  assert.equal(secretMatches("", ""), false);
});

// ── The resource rules, asserted against the measurements that set them ────

test("🔴 the heartbeat is a production interval, not the spike's measuring instrument", () => {
  // The spike used 250 ms to prove the event loop stays free. As a production
  // setting that is four database round-trips a second, per job, for work
  // measured in minutes.
  assert.ok(HEARTBEAT_MS >= 10_000 && HEARTBEAT_MS <= 20_000, "heartbeat must be 10-20 s");
  // Margin: how many consecutive heartbeats can be missed before the lease is
  // stealable. Below ~4 a single slow database moment costs a worker its job.
  const missableBeats = (LEASE_SECONDS * 1000) / HEARTBEAT_MS;
  assert.ok(missableBeats >= 4, `only ${missableBeats} missed beats of margin`);
  // And the lease must still reclaim a dead worker promptly.
  assert.ok(LEASE_SECONDS <= 300, "a dead worker's job must be reclaimable within minutes");
});

test("🔴 one job and one parser thread per invocation — the memory measurement forbids more", () => {
  assert.equal(JOBS_PER_RUN, 1);
  // 🔴 Two concurrent worst-case parses (2,134 MB) DO fit inside the 3009 MB
  // tier. Asserting that they do keeps the code comment honest: "two cannot
  // fit" would be a false justification, and this is where it would be caught.
  assert.ok(MEASURED_PEAK_MB * 2 < FUNCTION_MEMORY_MB,
    "two peaks fit the tier — so the limit must be justified by the abort guard, not the tier");
  // ...and they clear the abort guard too. There is NO arithmetic here that
  // forbids two. What forbids it is that nothing has MEASURED two concurrent
  // peaks: the paper sum assumes additive, politely-staggered peaks and leaves
  // only ~266 MB for two fetch buffers, two vision slice sets and the runtime.
  // This assertion exists so that if someone later raises JOBS_PER_RUN by
  // pointing at the arithmetic, they have to delete a test that says the
  // arithmetic was never the reason.
  assert.ok(MEASURED_PEAK_MB * 2 < MEMORY_ABORT_MB,
    "the guard does not forbid two either — the missing benchmark does");
  const headroomForEverythingElse = MEMORY_ABORT_MB - MEASURED_PEAK_MB * 2;
  assert.ok(headroomForEverythingElse < MEASURED_PEAK_MB / 2,
    "if two peaks ever leave generous headroom, benchmark them and revisit this");
});

test("memory and deadline guards sit INSIDE the platform limits", () => {
  // A worker killed by the platform writes nothing: no failure row, no released
  // lease, no coverage. Aborting first turns that into a recorded, retryable
  // failure.
  assert.ok(MEMORY_ABORT_MB < FUNCTION_MEMORY_MB, "abort before the platform does");
  assert.ok(MEMORY_ABORT_MB > MEASURED_PEAK_MB, "must not abort on a document we know completes");
  // maxDuration is 300 s; the guard leaves a full minute to record the failure.
  assert.ok(DEADLINE_ABORT_MS <= 240_000);
  assert.ok(300_000 - DEADLINE_ABORT_MS >= 60_000, "leave time to write the failure down");
});

test("🔴 the unit guard bounds adversarial work without refusing real documents", () => {
  // Cost tracks unit count, not bytes: a few hundred KB of generated PDF can
  // declare a hundred thousand pages, while a 33.5 MB deck parses in 50 ms.
  const LARGEST_REAL_DOCUMENT_UNITS = 2116;
  assert.ok(MAX_UNITS_PER_PARSE > LARGEST_REAL_DOCUMENT_UNITS,
    "the largest real document measured must still complete");
  assert.ok(MAX_UNITS_PER_PARSE <= 10_000, "the bound has to actually bound something");
});

test("🔴 sanitised errors never carry a signed URL or a token", () => {
  // Storage URLs carry a signed token in the query string. Logging a raw
  // provider error is how a credential reaches an observability tool nobody
  // treats as secret.
  const dirty = "download failed: https://x.supabase.co/storage/v1/object/sign/a.pdf?token=eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSM";
  const clean = sanitizeError(new Error(dirty));
  assert.doesNotMatch(clean, /https?:\/\//);
  assert.doesNotMatch(clean, /eyJ/);
  assert.match(clean, /<url>/);

  assert.doesNotMatch(sanitizeError(new Error("auth: Bearer sk-abc123xyz")), /sk-abc123xyz/);
  // Still useful to a person debugging.
  assert.match(sanitizeError(new Error("socket hang up")), /socket hang up/);
  // And bounded, so one enormous provider error cannot flood a column.
  assert.ok(sanitizeError(new Error("x".repeat(5000))).length <= 300);
});
