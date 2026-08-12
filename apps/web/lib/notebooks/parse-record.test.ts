import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCoverage, readCoverage, type ExtractionCoverage } from "@nemesis/shared";

import { contentHashOf, pipelineStateFor, rowCounts, structureEnvelope } from "./parse-record";

function coverage(input: Parameters<typeof buildCoverage>[0]): ExtractionCoverage {
  const built = buildCoverage(input);
  assert.equal(typeof built, "object", `expected a record, got: ${String(built)}`);
  return built as ExtractionCoverage;
}

test("the pipeline state is DERIVED from the coverage, never chosen separately", () => {
  // 🔴 Two fields answering overlapping questions, written independently, will
  // disagree — and the flattering one gets believed. This is the derivation the
  // database's CHECK constraint also enforces from the other side.
  assert.equal(pipelineStateFor(coverage({ unitKind: "page", units: 4, unitsNative: 4 })), "parsed");
  assert.equal(
    pipelineStateFor(coverage({ unitKind: "page", units: 300, unitsVision: 40, unitsNative: 0, unitsUnread: 260 })),
    "partially_parsed",
  );
  assert.equal(
    pipelineStateFor(coverage({ unitKind: "page", units: 8, unitsNative: 0, unitsUnread: 8 })),
    "failed",
  );
});

test("`partially_parsed` is a resting state, not a failure", () => {
  // A 300-page scan with 40 pages transcribed IS parsed, and partially so. If
  // this collapsed to "failed" the text would be presented as unusable, and if
  // it collapsed to "parsed" the gap would vanish. Both halves have to survive.
  const partial = coverage({ unitKind: "page", units: 300, unitsVision: 40, unitsNative: 0, unitsUnread: 260 });
  assert.equal(pipelineStateFor(partial), "partially_parsed");
  assert.notEqual(pipelineStateFor(partial), "failed");
});

test("🔴 the structure column carries an explicit version, not a bare blob", () => {
  // Phase 2 replaces the contents of this column with a real unit/block model.
  // A row written today must be distinguishable from one written then WITHOUT
  // sniffing its keys, or some later reader guesses wrong on an edge case.
  const envelope = structureEnvelope({ text: "Digoxin has a narrow therapeutic index.", title: "Digoxin PK" });
  assert.equal(envelope.v, 1);
  assert.equal(envelope.shape, "text-only", "the shape names what this is: flat text, no units, no locators");
  assert.equal(envelope.title, "Digoxin PK");
  assert.equal(envelope.text, "Digoxin has a narrow therapeutic index.");
});

test("an untitled document keeps a null title rather than inventing one", () => {
  assert.equal(structureEnvelope({ text: "body", title: null }).title, null);
});

test("the content hash is sha256 of the bytes, and identical bytes hash identically", () => {
  // The file's PHYSICAL identity. The same lecture filed into two folders is two
  // placements and ONE parse, and this is what makes that true.
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
  const hash = contentHashOf(bytes);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, contentHashOf(new Uint8Array([0x25, 0x50, 0x44, 0x46])));
  assert.notEqual(hash, contentHashOf(new Uint8Array([0x25, 0x50, 0x44, 0x47])));
});

test("🔴 the persisted coverage survives the jsonb round trip byte-identically", () => {
  // The exact journey the record makes: object -> JSON -> jsonb column -> JSON
  // -> object. The whole point of persistence is that the caveat outlives the
  // request, so this is the regression that matters most in this PR.
  const original = coverage({
    unitKind: "slide",
    units: 37,
    unitsNative: 37,
    figures: { found: 71, described: 10, skipped: 61, reasons: { decorative: 4, "unreadable-format": 57 } },
    truncation: [{ stage: "extract", limit: 200_000, kept: 200_000, dropped: 8_400 }],
  });
  const throughDatabase = readCoverage(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(throughDatabase, original);
  assert.equal(throughDatabase?.state, "partial");
});

test("the derived `complete` flag the database constrains matches the coverage", () => {
  // The SQL is `complete = (coalesce(coverage->>'state','') = 'complete')`.
  // Mirrored here so a change to the contract's state values fails a fast test
  // rather than a migration.
  const derive = (c: ExtractionCoverage) => (JSON.parse(JSON.stringify(c)).state ?? "") === "complete";
  assert.equal(derive(coverage({ unitKind: "page", units: 2, unitsNative: 2 })), true);
  assert.equal(derive(coverage({ unitKind: "page", units: 2, unitsNative: 1, unitsUnread: 1 })), false);
  assert.equal(derive(coverage({ unitKind: "page", units: 2, unitsNative: 0, unitsUnread: 2 })), false);
});

test("🔴 an EMPTY coverage is not complete — unknown never means fine", () => {
  // A freshly claimed parse has `coverage = '{}'`, so the expression is false
  // and the column default had to move from true to false. A default of true
  // would have every new row claim completeness before anything was read.
  const derive = (raw: Record<string, unknown>) => ((raw.state as string | undefined) ?? "") === "complete";
  assert.equal(derive({}), false);
});

test("🔴 BOTH LANES COUNT THE ROW THE SAME WAY — they had silently disagreed", () => {
  // The worker read `coverage.figures.total`, which `FigureCoverage` does not
  // have, through an `as` cast that hid it from the compiler. Every document it
  // parsed stored `visual_count = 0` while the upload lane stored the real
  // number. Neither lane had a test on the column, which is why it survived.
  const record = coverage({
    unitKind: "slide",
    units: 12,
    unitsNative: 12,
    figures: { found: 9, described: 4, skipped: 5, reasons: { "not-examined": 5 } },
  });
  assert.deepEqual(rowCounts(record), { units: 12, visuals: 4 });
  // The field that did not exist would have produced this instead.
  assert.notEqual(rowCounts(record).visuals, 0, "a deck with four described pictures does not store zero");
});

test("a scan stores zero described pictures, and its inventory lives in the coverage", () => {
  // 🔴 NOT A BUG, AND WORTH PINNING SO IT IS NOT 'FIXED' LATER. `visual_count`
  // means what made it through to the student. An image-only PDF read nothing,
  // so zero is the honest column value — while `coverage.figures.found` still
  // records that three pictures are in there, which is what #486 persists.
  const record = coverage({
    unitKind: "page",
    units: 1,
    unitsNative: 0,
    unitsUnread: 1,
    figures: { found: 3, described: 0, skipped: 3, reasons: { "not-examined": 3 } },
  });
  assert.deepEqual(rowCounts(record), { units: 1, visuals: 0 });
  assert.equal(record.figures.found, 3, "the inventory is kept where consumers read it");
});

test("a record mangled crossing the worker's thread boundary counts rather than throwing", () => {
  // `runParseOnThread` returns `unknown` and the caller casts it. A malformed
  // record must not throw inside the write, taking a real parse down with it.
  const broken = undefined as unknown as ExtractionCoverage;
  assert.deepEqual(rowCounts(broken, 7), { units: 7, visuals: 0 });
});
