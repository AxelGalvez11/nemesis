import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { MAX_ATTEMPTS } from "./document-status";
import {
  backoffSeconds,
  DEADLINE_ABORT_MS,
  FUNCTION_MEMORY_MB,
  HEARTBEAT_MS,
  isRetryable,
  JOBS_PER_RUN,
  visionSettlement,
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
  const match = sql.match(/document_parse_max_attempts\(\)\s*\nreturns int language sql immutable\s*(?:\nset search_path = public\s*)?\nas \$\$ select (\d+) \$\$/);
  assert.ok(match, "could not find document_parse_max_attempts() in the migration");
  assert.equal(Number(match[1]), MAX_ATTEMPTS);
});

test("🔴 the claim predicate requires an explicit enqueue, so applying the migration cannot backfill", () => {
  // MEASURED against production on 2026-08-06, before this migration was applied:
  // the predicate as originally written matched **16 of the 17 existing sources**,
  // because every column it rests on defaults to due — attempts 0, leased_until
  // '-infinity', next_attempt_at now(). Enabling the cron would have parsed the
  // whole back catalogue at once, each one able to bill vision on our key.
  //
  // Proven by dry run in a rolled-back transaction against the real schema:
  //   old predicate -> 16 rows claimed
  //   this predicate -> 0 rows claimed
  //
  // The rule is the one the coverage work already enforces a layer up: a missing
  // record means UNKNOWN, never a flattering default. An unparsed source is not a
  // queued source — something has to ASK. Backfilling may well be wanted, but as
  // one deliberate UPDATE a person chose to run, not a side effect of a schema
  // change.
  const sql = readFileSync(
    new URL("../../../../supabase/migrations/20260806210000_document_parse_jobs.sql", import.meta.url),
    "utf8",
  );
  const predicate = sql.match(/select c\.id\s+from public\.library_sources c\s+where([\s\S]*?)order by/);
  assert.ok(predicate, "could not find the claim predicate in the migration");
  const where = predicate[1] ?? "";

  assert.match(where, /c\.parse_enqueued_at is not null/,
    "without an enqueue gate, every unparsed row in the table is immediately claimable");
  assert.match(where, /not c\.deleted/,
    "a source the student threw away must not be parsed, nor linked to a parse");
  // The column has to exist for the predicate to mean anything.
  assert.match(sql, /add column if not exists parse_enqueued_at timestamptz/);
  // And the partial index must agree with the predicate, or the scan it exists to
  // keep cheap silently stops being used.
  const index = sql.match(/create index if not exists library_sources_parse_due_idx([\s\S]*?);/);
  assert.ok(index, "the due index must exist");
  assert.match(index[1] ?? "", /parse_enqueued_at is not null/);
  assert.match(index[1] ?? "", /not deleted/);
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

describe("visionSettlement: a parse that died is not a parse that was free", () => {
  test("a reported spend settles at what was reported", () => {
    assert.deepEqual(visionSettlement(100, { calls: 4, units: 37 }), { calls: 4, used: 37 });
  });

  test("NO report settles at the FULL GRANT, not at zero", () => {
    // 🔴 THE ONE THAT MATTERS. A thread killed by the deadline or memory guard is
    // terminated and posts nothing, so `spend` is null while the money is real. If this
    // returned 0 the whole reservation would be refunded, and a poisoned document could
    // be retried five times at full price with the daily ledger never moving.
    assert.deepEqual(visionSettlement(100, null), { calls: 0, used: 100 });
    assert.deepEqual(visionSettlement(100, undefined), { calls: 0, used: 100 });
  });

  test("a report above the grant cannot become a credit", () => {
    // `VisionLedger.take` cannot overspend, so this is a corrupted report rather than a
    // real overspend — and the safe reading of a corrupted report is "all of it".
    assert.deepEqual(visionSettlement(50, { calls: 1, units: 900 }), { calls: 1, used: 50 });
  });

  test("a zero grant settles at zero however it is reported", () => {
    assert.deepEqual(visionSettlement(0, { calls: 0, units: 0 }), { calls: 0, used: 0 });
    assert.deepEqual(visionSettlement(0, null), { calls: 0, used: 0 });
  });

  test("negative numbers are not trusted from either side", () => {
    assert.deepEqual(visionSettlement(-5, null), { calls: 0, used: 0 });
    assert.deepEqual(visionSettlement(10, { calls: -1, units: -3 }), { calls: 0, used: 0 });
  });
});
