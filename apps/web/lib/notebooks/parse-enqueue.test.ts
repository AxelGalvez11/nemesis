import assert from "node:assert/strict";
import { test } from "node:test";

import { decideEnqueue, writesRow, type EnqueueCandidate } from "./parse-enqueue";

const src = (over: Partial<EnqueueCandidate> = {}): EnqueueCandidate => ({
  contentHash: null,
  deleted: false,
  parseEnqueuedAt: null,
  parseFailedAt: null,
  parsedContentHash: null,
  parsedDocumentId: null,
  parsedParserVersion: null,
  reprocessTarget: null,
  storagePath: "user/abc.pdf",
  ...over,
});

/** A source that HAS been read: linked parse, matching bytes, current reader. */
const parsed = (over: Partial<EnqueueCandidate> = {}): EnqueueCandidate =>
  src({
    contentHash: "sha-abc",
    parsedContentHash: "sha-abc",
    parsedDocumentId: "pd-1",
    parsedParserVersion: "extract-2026-08-13",
    ...over,
  });

const NOW = { intent: "reprocess", parserVersion: "extract-2026-08-13" } as const;

test("a fresh upload is queued", () => {
  const d = decideEnqueue(src());
  assert.equal(d.action, "enqueue");
  assert.equal(writesRow(d), true);
});

test("🔴 re-asking for a queued source does NOT reset its backoff", () => {
  // The whole retry ladder depends on this. A source that has failed twice is
  // sitting on a four-minute wait by design. Any caller that fires on page load
  // — a Library view kicking what it sees, a student refreshing because nothing
  // looks like it is happening — would clear that wait every few seconds. The
  // exponential backoff would be computed, written, and immediately discarded,
  // and a poisoned file would retry as fast as the cron runs until it burned
  // all five attempts.
  const d = decideEnqueue(src({ parseEnqueuedAt: "2026-08-06T11:00:00Z" }));
  assert.equal(d.action, "already-queued");
  assert.equal(writesRow(d), false, "no write means no reset");
});

test("🔴 a source that gave up IS requeued — the retry button must do something", () => {
  // A failed source still carries its enqueue stamp, so an order that checked
  // `already-queued` first would make retry a no-op and leave the student with
  // a button that does nothing.
  const d = decideEnqueue(src({
    parseEnqueuedAt: "2026-08-06T11:00:00Z",
    parseFailedAt: "2026-08-06T11:30:00Z",
  }));
  assert.equal(d.action, "requeue");
  assert.equal(writesRow(d), true);
});

test("an existing parse wins over every retry column", () => {
  // The work is done. Whatever the bookkeeping says, asking again asks for
  // nothing — and a requeue here would hand the queue a job with no work in it.
  const d = decideEnqueue(src({
    parseFailedAt: "2026-08-06T11:30:00Z",
    parsedDocumentId: "pd-1",
  }));
  assert.equal(d.action, "already-parsed");
  assert.equal(writesRow(d), false);
});

test("a deleted source is not work", () => {
  const d = decideEnqueue(src({ deleted: true }));
  assert.equal(d.action, "not-readable");
  assert.equal(writesRow(d), false);
});

test("a half-finished upload has no bytes to read", () => {
  // A row whose object never arrived would be fetched, fail as missing, and
  // burn attempts for a file that was never there.
  const d = decideEnqueue(src({ storagePath: null }));
  assert.equal(d.action, "not-readable");
  assert.equal(writesRow(d), false);
});

test("enqueueing the same source repeatedly converges after one write", () => {
  // Idempotency stated as a sequence rather than a single call: the first ask
  // queues it, and every ask after that is inert until something changes.
  let row = src();
  const first = decideEnqueue(row);
  assert.equal(first.action, "enqueue");
  row = { ...row, parseEnqueuedAt: "2026-08-06T11:00:00Z" };
  for (let i = 0; i < 5; i += 1) {
    assert.equal(writesRow(decideEnqueue(row)), false, `ask ${i + 2} must not write`);
  }
});

// ------------------------------------------------------------------ reprocess

test("🔴 the ORDINARY ask can never reprocess, however stale the parse is", () => {
  // The default `{ intent: "parse" }` is what every caller that fires on render takes — a Library
  // view kicking what it sees, an attach handler, a status poll. If drift alone were enough to
  // reprocess, the first parser bump would have re-read the whole back catalogue the next time
  // anyone opened the Library: "Do not automatically spend money reprocessing every historical
  // document." Reprocessing requires a caller that says so.
  const stale = parsed({ parsedParserVersion: "extract-2026-08-06" });
  assert.equal(decideEnqueue(stale).action, "already-parsed");
  assert.equal(writesRow(decideEnqueue(stale)), false);
});

test("a stale parser version is a reprocess, and the reason names what moved", () => {
  const decision = decideEnqueue(parsed({ parsedParserVersion: "extract-2026-08-06" }), NOW);
  assert.deepEqual(decision, { action: "reprocess", reason: "parser-version-changed" });
  assert.equal(writesRow(decision), true);
});

test("replaced bytes are a reprocess, and outrank the version", () => {
  // The row now holds different bytes from the ones the parse is about. Reporting a version reason
  // here would send someone hunting for an extractor change the learner did not make.
  const decision = decideEnqueue(parsed({ contentHash: "sha-NEW" }), NOW);
  assert.deepEqual(decision, { action: "reprocess", reason: "content-changed" });
});

test("🔴 a reprocess of a CURRENT document still happens — the ask is its own trigger", () => {
  // Nothing has drifted: same reader, same bytes. A person asked anyway, because they believe the
  // parse is wrong, and the owner listed that as a trigger in its own right. Refusing here is the
  // version of this feature that looks correct and quietly does nothing for most requests.
  const decision = decideEnqueue(parsed(), NOW);
  assert.deepEqual(decision, { action: "reprocess", reason: "explicitly-requested" });
});

test("🔴🔴 asking twice charges once — the second ask writes NOTHING", () => {
  // 🔴 THE OWNER'S "idempotent", IN THE ONLY SENSE THAT COSTS MONEY. This is stated as a SEQUENCE
  // rather than as a single call, exactly like the enqueue idempotency test above it, because the
  // property is about what the SECOND ask does to a row the first one already changed.
  //
  // And it is `already-reprocessing` rather than a silent repeat for the same reason
  // `already-queued` exists: the reprocess write resets `parse_attempts` and makes the row due now,
  // so a second write would clear the wait a failing reprocess had earned and hold a poisoned file
  // at the front of the queue until it burned every attempt.
  let row = parsed({ parsedParserVersion: "extract-2026-08-06" });
  const first = decideEnqueue(row, NOW);
  assert.equal(first.action, "reprocess");
  assert.equal(writesRow(first), true);

  // What the write left behind.
  row = { ...row, parseEnqueuedAt: "2026-08-15T20:00:00Z", reprocessTarget: "extract-2026-08-13" };
  for (let i = 0; i < 5; i += 1) {
    const again = decideEnqueue(row, NOW);
    assert.equal(again.action, "already-reprocessing", `ask ${i + 2}`);
    assert.equal(writesRow(again), false, `ask ${i + 2} must not write`);
  }
});

test("🔴 a NEWER parser version reopens a pending reprocess rather than being swallowed", () => {
  // The pending-state check is an equality against the target, not a "something is pending" flag.
  // A reprocess queued for yesterday's reader must not silently satisfy a request made after a
  // better one shipped — that would be the pending state becoming a permanent lock.
  const row = parsed({ reprocessTarget: "extract-2026-08-13" });
  const decision = decideEnqueue(row, { intent: "reprocess", parserVersion: "extract-2026-09-01" });
  assert.equal(decision.action, "reprocess");
});

test("🔴 a deleted source is never reprocessed, however explicitly it is asked for", () => {
  // The old order checked `parsedDocumentId` before readability, so this case has to be re-proved
  // now that the parsed branch does its own checking: a reprocess of a deleted row, or of one whose
  // object never finished uploading, would hand the queue a job with no bytes behind it.
  assert.equal(decideEnqueue(parsed({ deleted: true }), NOW).action, "not-readable");
  assert.equal(decideEnqueue(parsed({ storagePath: null }), NOW).action, "not-readable");
});

test("🔴 an unparsed source takes the ordinary enqueue path even when a reprocess is asked for", () => {
  // "Read it again" and "read it" are the same request for a document nobody has read. Routing it
  // through the reprocess branch would set a target column for a parse that does not exist.
  assert.equal(decideEnqueue(src(), NOW).action, "enqueue");
});
