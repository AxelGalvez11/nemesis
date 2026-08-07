import assert from "node:assert/strict";
import { test } from "node:test";

import { decideEnqueue, writesRow, type EnqueueCandidate } from "./parse-enqueue";

const src = (over: Partial<EnqueueCandidate> = {}): EnqueueCandidate => ({
  deleted: false,
  parseEnqueuedAt: null,
  parseFailedAt: null,
  parsedDocumentId: null,
  storagePath: "user/abc.pdf",
  ...over,
});

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
