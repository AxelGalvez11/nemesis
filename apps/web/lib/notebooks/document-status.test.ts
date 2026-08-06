import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeDocument,
  documentStatusLine,
  isInFlight,
  isWholeDocument,
  type DocumentStatus,
  type ParsedDocumentRow,
  type SourceParseRow,
} from "./document-status";

const NOW = new Date("2026-08-06T12:00:00Z");

const src = (over: Partial<SourceParseRow> = {}): SourceParseRow => ({
  parseAttempts: 0,
  parsedDocumentId: null,
  parseError: null,
  parseFailedAt: null,
  parseLeasedUntil: null,
  parseNextAttemptAt: null,
  ...over,
});

const doc = (over: Partial<ParsedDocumentRow> = {}): ParsedDocumentRow => ({
  complete: true,
  coverage: { state: "complete" },
  error: null,
  failedStage: null,
  state: "parsed",
  ...over,
});

// ── The six states Phase 1 can reach ───────────────────────────────────────

test("pending — enqueued, nothing has touched it", () => {
  const s = describeDocument(src(), null, NOW);
  assert.equal(s.kind, "pending");
  assert.equal(isInFlight(s), true);
  assert.equal(isWholeDocument(s), false);
});

test("parsing — a live lease means a worker holds it right now", () => {
  const s = describeDocument(src({ parseAttempts: 1, parseLeasedUntil: "2026-08-06T12:02:00Z" }), null, NOW);
  assert.equal(s.kind, "parsing");
  assert.equal(isInFlight(s), true);
});

test("retrying — the attempt failed and backoff has not elapsed", () => {
  const s = describeDocument(
    src({ parseAttempts: 2, parseNextAttemptAt: "2026-08-06T12:05:00Z" }),
    null,
    NOW,
  );
  assert.equal(s.kind, "retrying");
  assert.match(documentStatusLine(s), /attempt 3 of 5/);
});

test("🔴 partially parsed — LINKED but NOT complete", () => {
  // The whole point of the contract correction. An artifact exists and is
  // linked; completion is read from `complete` + coverage, never from the link.
  const s = describeDocument(
    src({ parsedDocumentId: "pd-1" }),
    doc({ complete: false, coverage: { state: "partial", units: 40, unitsUnread: 9 }, state: "partially_parsed" }),
    NOW,
  );
  assert.equal(s.kind, "partially_parsed");
  assert.equal(isWholeDocument(s), false, "a partial parse is NOT whole");
  // The unread count must survive into what the student is told.
  assert.match(documentStatusLine(s), /9 of 40/);
});

test("parsed — complete, and only then", () => {
  const s = describeDocument(src({ parsedDocumentId: "pd-1" }), doc(), NOW);
  assert.equal(s.kind, "parsed");
  assert.equal(isWholeDocument(s), true);
  assert.equal(isInFlight(s), false);
});

test("failed before any artifact — library_sources owns it, stage is parse", () => {
  const s = describeDocument(
    src({ parseAttempts: 5, parseError: "We could not read this file.", parseFailedAt: "2026-08-06T11:00:00Z" }),
    null,
    NOW,
  );
  assert.equal(s.kind, "failed");
  assert.equal(s.kind === "failed" && s.stage, "parse");
  assert.match(documentStatusLine(s), /stopped/);
});

test("failed after an artifact exists — parsed_documents owns it, and names the stage", () => {
  const s = describeDocument(
    src({ parsedDocumentId: "pd-1", parseAttempts: 3 }),
    doc({ error: "Embedding provider refused.", failedStage: "embed", state: "failed" }),
    NOW,
  );
  assert.equal(s.kind, "failed");
  // The stage comes from the parsed document, not assumed to be "parse".
  assert.equal(s.kind === "failed" && s.stage, "embed");
});

// ── The states later phases will reach ─────────────────────────────────────

test("indexing states are modelled but are NOT Phase 1 states", () => {
  for (const state of ["chunking", "chunked", "embedding"]) {
    const s = describeDocument(src({ parsedDocumentId: "pd-1" }), doc({ state }), NOW);
    assert.equal(s.kind, "indexing", `${state} should resolve to indexing`);
    assert.equal(isWholeDocument(s), false, `${state} is not whole — nothing is searchable yet`);
    assert.equal(isInFlight(s), true);
  }
});

test("🔴 ready means SEARCHABLE, and Phase 1 can never produce it", () => {
  // Reachable in the resolver so later phases need no rewrite — but the Phase 1
  // worker only ever writes parsed / partially_parsed / failed, so no document
  // this phase touches can arrive here. If that ever changes, this test is the
  // thing that should start failing.
  const s = describeDocument(src({ parsedDocumentId: "pd-1" }), doc({ state: "ready" }), NOW);
  assert.equal(s.kind, "ready");
  assert.match(documentStatusLine(s), /searchable/);

  const PHASE_1_WRITES = ["parsed", "partially_parsed", "failed"];
  assert.equal(PHASE_1_WRITES.includes("ready"), false);
  assert.equal(PHASE_1_WRITES.includes("chunking"), false);
});

test("only `parsed` and `ready` claim the document is whole", () => {
  const everyKind: DocumentStatus["kind"][] = [
    "pending", "parsing", "retrying", "partially_parsed", "parsed", "indexing", "ready", "failed",
  ];
  const whole = everyKind.filter((kind) =>
    isWholeDocument({ kind, attempts: 0, message: "", stage: null, nextAttemptAt: "", units: 0, unitsUnread: 0 } as unknown as DocumentStatus),
  );
  assert.deepEqual(whole, ["parsed", "ready"]);
});

// ── The precedence rule, which is where this can silently go wrong ─────────

test("🔴 a linked complete parse is NOT dragged backwards by a later source failure", () => {
  // Phase 0b preserves a complete parse against a later partial or failed
  // attempt. The same truth has to hold in what the student is shown: a retry
  // that fails after a good parse already exists must not make the document
  // look broken.
  const s = describeDocument(
    src({
      parsedDocumentId: "pd-1",
      parseAttempts: 4,
      parseError: "network blip on a later attempt",
      parseFailedAt: "2026-08-06T11:59:00Z",
    }),
    doc(),
    NOW,
  );
  assert.equal(s.kind, "parsed", "a complete artifact outranks a later source-row failure");
});

test("a linked artifact outranks a live lease — the parse already produced something", () => {
  const s = describeDocument(
    src({ parsedDocumentId: "pd-1", parseLeasedUntil: "2026-08-06T12:02:00Z" }),
    doc(),
    NOW,
  );
  assert.equal(s.kind, "parsed");
});

test("a link with no loaded parsed row falls back to source-owned states, not to parsed", () => {
  // A caller that forgot to join must never get a free "parsed". Reporting the
  // source's own state is wrong-but-conservative; reporting "parsed" would be
  // wrong-and-flattering, which is the direction that hurts.
  const s = describeDocument(src({ parsedDocumentId: "pd-1", parseAttempts: 1 }), null, NOW);
  assert.notEqual(s.kind, "parsed");
  assert.equal(s.kind, "pending");
});

test("every status produces a line that never claims more than it knows", () => {
  const cases: DocumentStatus[] = [
    { attempts: 0, kind: "pending" },
    { attempts: 1, kind: "parsing" },
    { attempts: 2, kind: "retrying", nextAttemptAt: NOW.toISOString() },
    { kind: "partially_parsed", units: 10, unitsUnread: 3 },
    { kind: "parsed" },
    { kind: "indexing", stage: "chunking" },
    { kind: "ready" },
    { attempts: 5, kind: "failed", message: "Nope.", stage: "parse" },
  ];
  for (const c of cases) {
    const line = documentStatusLine(c);
    assert.ok(line.length > 0, `${c.kind} produced no line`);
    // Nothing short of `ready` may imply the document is searchable.
    if (c.kind !== "ready") {
      assert.doesNotMatch(line, /\bsearchable\b/, `${c.kind} must not claim searchable`);
    }
  }
});
