import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCoverage,
  coverageNoticeForModel,
  describeCoverage,
  deriveState,
  EXTRACTION_COVERAGE_VERSION,
  lossOnUnit,
  lostFigures,
  readCoverage,
  unitsRead,
  unlocatedRegions,
  unlocatedUnreadUnits,
  withTruncation,
  type ExtractionCoverage,
} from "./extraction-coverage.ts";

/** The shape a builder returns, narrowed — a string means the input did not add
 *  up, which every test below treats as a failure unless it is the point. */
function built(input: Parameters<typeof buildCoverage>[0]): ExtractionCoverage {
  const result = buildCoverage(input);
  assert.equal(typeof result, "object", `expected a record, got: ${String(result)}`);
  return result as ExtractionCoverage;
}

const noFigures = { found: 0, described: 0, skipped: 0, reasons: {} };

test("a fully readable document is complete and says nothing", () => {
  const coverage = built({ unitKind: "page", units: 12, unitsNative: 12 });
  assert.equal(coverage.state, "complete");
  assert.equal(describeCoverage(coverage), null, "a complete read must not produce a badge");
  assert.equal(coverageNoticeForModel(coverage), null, "a complete read must not spend prompt on a disclaimer");
});

test("🔴 the real defect: 40 of 300 pages read is PARTIAL, and says so", () => {
  // The exact shape this whole module exists for. Before it, this reached the
  // student and the model as a finished read of a 300-page book.
  const coverage = built({ unitKind: "page", units: 300, unitsNative: 0, unitsVision: 40, unitsUnread: 260 });
  assert.equal(coverage.state, "partial");
  assert.equal(unitsRead(coverage), 40);
  assert.match(describeCoverage(coverage) ?? "", /40 of 300 pages/);
  const notice = coverageNoticeForModel(coverage) ?? "";
  assert.match(notice, /260 of 300 pages could NOT be read/);
  assert.match(notice, /say so plainly/, "the model must be told what to do, not only what is missing");
});

test("the four unit counts are disjoint and must sum to the total", () => {
  assert.equal(typeof buildCoverage({ unitKind: "page", units: 10, unitsNative: 9 }), "string");
  assert.equal(typeof buildCoverage({ unitKind: "page", units: 10, unitsNative: 11 }), "string");
  assert.equal(typeof buildCoverage({ unitKind: "page", units: 10, unitsNative: 5, unitsVision: 3, unitsBoth: 1, unitsUnread: 1 }), "object");
  assert.equal(typeof buildCoverage({ unitKind: "page", units: 5, unitsNative: 2.5, unitsUnread: 2.5 }), "string");
  assert.equal(typeof buildCoverage({ unitKind: "page", units: 5, unitsNative: -1, unitsUnread: 6 }), "string");
});

test("a page can be read BOTH ways without losing either fact", () => {
  // A heading over a screenshot: real text AND content only the pixels carry.
  // Forcing it into one lane is how the screenshot's contents went missing.
  const coverage = built({ unitKind: "page", units: 36, unitsNative: 21, unitsBoth: 15 });
  assert.equal(coverage.state, "complete", "every page was read; nothing is missing");
  assert.equal(unitsRead(coverage), 36);
});

test("a decorative skip is not a gap, but a lost figure is", () => {
  const icons = built({
    unitKind: "slide",
    units: 40,
    unitsNative: 40,
    figures: { found: 71, described: 14, skipped: 57, reasons: { decorative: 57 } },
  });
  assert.equal(icons.state, "complete", "icons and rules must not mark a whole deck partial");
  assert.equal(lostFigures(icons.figures), 0);

  const real = built({
    unitKind: "slide",
    units: 40,
    unitsNative: 40,
    figures: { found: 71, described: 10, skipped: 61, reasons: { decorative: 4, "unreadable-format": 57 } },
  });
  assert.equal(real.state, "partial");
  assert.equal(lostFigures(real.figures), 57);
  assert.match(describeCoverage(real) ?? "", /57 pictures couldn't be read/);
});

test("figure counts must reconcile", () => {
  const bad = buildCoverage({
    unitKind: "slide",
    units: 3,
    unitsNative: 3,
    figures: { found: 10, described: 4, skipped: 4, reasons: {} },
  });
  assert.equal(typeof bad, "string");
});

test("truncation at EXTRACT is a gap; truncation at PROMPT is not", () => {
  // 🔴 The distinction that matters: an extract cut means the stored source is
  // short and nothing downstream can ever recover the rest. A prompt cut leaves
  // the source whole — a different question can still reach the rest of it.
  const extract = built({
    unitKind: "page", units: 4, unitsNative: 4,
    truncation: [{ stage: "extract", limit: 200_000, kept: 200_000, dropped: 45_000 }],
  });
  assert.equal(extract.state, "partial");
  assert.match(describeCoverage(extract) ?? "", /cut at 200,000 characters/);

  const prompt = built({
    unitKind: "page", units: 4, unitsNative: 4,
    truncation: [{ stage: "prompt", limit: 60_000, kept: 60_000, dropped: 9_000 }],
  });
  assert.equal(prompt.state, "complete", "the SOURCE is complete; the prompt budget is a separate story");
});

test("a truncation record that dropped nothing is not recorded at all", () => {
  const coverage = built({
    unitKind: "page", units: 2, unitsNative: 2,
    truncation: [{ stage: "extract", limit: 200_000, kept: 12, dropped: 0 }],
  });
  assert.deepEqual(coverage.truncation, []);
  assert.equal(coverage.state, "complete");
});

test("🔴 a late cut re-derives the state instead of inheriting it", () => {
  // A deck's coverage is known before its assembled text meets the ceiling. If
  // the state were carried over, the record would still read "complete" after
  // the cut — the silent-partial bug, one level down.
  const complete = built({ unitKind: "slide", units: 37, unitsNative: 37 });
  assert.equal(complete.state, "complete");
  const cut = withTruncation(complete, [{ stage: "extract", limit: 200_000, kept: 200_000, dropped: 8_400 }]);
  assert.equal(cut.state, "partial");
  assert.equal(cut.truncation.length, 1);
  assert.equal(complete.state, "complete", "the original record must not be mutated");
});

test("withTruncation ignores a cut that dropped nothing", () => {
  const complete = built({ unitKind: "slide", units: 3, unitsNative: 3 });
  assert.equal(withTruncation(complete, [{ stage: "extract", limit: 10, kept: 10, dropped: 0 }]), complete);
});

test("a document nothing could be read from is FAILED, not partial", () => {
  const coverage = built({ unitKind: "page", units: 8, unitsNative: 0, unitsUnread: 8 });
  assert.equal(coverage.state, "failed");
  assert.match(coverageNoticeForModel(coverage) ?? "", /Do not answer as though you have its contents/);
});

test("an empty document is not 'failed' — there is nothing to have failed at", () => {
  const coverage = built({ unitKind: "document", units: 0, unitsNative: 0 });
  assert.equal(coverage.state, "complete");
});

test("singular and plural read correctly", () => {
  const one = built({ unitKind: "page", units: 2, unitsNative: 1, unitsUnread: 1 });
  assert.match(describeCoverage(one) ?? "", /1 of 2 pages/);
  const figure = built({
    unitKind: "slide", units: 1, unitsNative: 1,
    figures: { found: 1, described: 0, skipped: 1, reasons: { "over-cap": 1 } },
  });
  assert.match(describeCoverage(figure) ?? "", /1 picture couldn't be read/);
});

// --- Survives the wire and the database -------------------------------------

test("🔴 a record survives JSON serialization and comes back identical", () => {
  // This is the regression that matters most: the field existed on the server
  // and was dropped between the route and the client. A round trip through the
  // exact transport (JSON) is the only test that would have caught it.
  const original = built({
    unitKind: "page",
    units: 300,
    unitsNative: 200,
    unitsVision: 30,
    unitsBoth: 10,
    unitsUnread: 60,
    figures: { found: 12, described: 8, skipped: 4, reasons: { decorative: 2, "over-cap": 2 } },
    truncation: [{ stage: "extract", limit: 200_000, kept: 200_000, dropped: 1_200 }],
  });
  const parsed = readCoverage(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(parsed, original);
});

test("readCoverage refuses anything that is not a record", () => {
  for (const value of [null, undefined, 42, "partial", [], {}, { units: 3 }]) {
    assert.equal(readCoverage(value), null, `expected null for ${JSON.stringify(value) ?? "undefined"}`);
  }
});

test("readCoverage tolerates an OLD row without inventing coverage", () => {
  // jsonb columns predate this type. A row written before it must parse as far
  // as it honestly can and be missing nothing that would be read as a claim.
  const legacy = readCoverage({
    unitKind: "slide", units: 5, unitsNative: 5, unitsVision: 0, unitsBoth: 0, unitsUnread: 0, state: "complete",
  });
  assert.ok(legacy);
  assert.equal(legacy.parserVersion, "unknown", "an unstamped row must not claim a parser version");
  assert.deepEqual(legacy.figures, noFigures);
  assert.deepEqual(legacy.truncation, []);
});

test("readCoverage drops a truncation entry that dropped nothing", () => {
  const parsed = readCoverage({
    unitKind: "page", units: 1, unitsNative: 1, unitsVision: 0, unitsBoth: 0, unitsUnread: 0, state: "complete",
    truncation: [{ stage: "extract", limit: 10, kept: 10, dropped: 0 }, { stage: "nonsense", dropped: 5 }],
  });
  assert.deepEqual(parsed?.truncation, []);
});

test("the version and parser stamp travel with every record", () => {
  const coverage = built({ unitKind: "page", units: 1, unitsNative: 1 });
  assert.equal(coverage.version, EXTRACTION_COVERAGE_VERSION);
  assert.ok(coverage.parserVersion.length > 0);
});

test("🔴 a picture a model looked at and found empty is not a gap", () => {
  // `FIGURE_PROMPT` asks for exactly "none" when an image carries no teaching
  // content, so `examined-empty` IS the decorative verdict — reached by looking
  // instead of by guessing from the shape of the box. Counting it as missing
  // content marked the better-checked document worse than the guessed-at one.
  const base = { unitKind: "page" as const, units: 10, unitsNative: 10, unitsVision: 0, unitsBoth: 0, unitsUnread: 0, truncation: [] };
  const emptyOnly = { ...base, figures: { described: 4, found: 10, reasons: { decorative: 3, "examined-empty": 3 }, skipped: 6 } };
  assert.equal(lostFigures(emptyOnly.figures), 0, "neither reason costs the student anything");
  assert.equal(deriveState(emptyOnly), "complete");

  // 🔴 THE CALIBRATION: one genuinely unreadable picture still downgrades it.
  const withUnreadable = {
    ...base,
    figures: { described: 4, found: 10, reasons: { decorative: 3, "examined-empty": 2, "unreadable-format": 1 }, skipped: 6 },
  };
  assert.equal(lostFigures(withUnreadable.figures), 1);
  assert.equal(deriveState(withUnreadable), "partial");
  assert.match(String(describeCoverage({ ...withUnreadable, state: "partial" })), /1 picture couldn't be read/);
});

test("deriveState is a pure function of the numbers", () => {
  const base = {
    version: 1, parserVersion: "t", unitKind: "page" as const,
    units: 10, unitsNative: 10, unitsVision: 0, unitsBoth: 0, unitsUnread: 0,
    figures: noFigures, truncation: [],
  };
  assert.equal(deriveState(base), "complete");
  assert.equal(deriveState({ ...base, unitsNative: 9, unitsUnread: 1 }), "partial");
  assert.equal(deriveState({ ...base, unitsNative: 0, unitsUnread: 10 }), "failed");
});

test("a region the parser saw and could not read is its own gap, not a picture", () => {
  // 🔴 MEASURED ON THE DOCLING PATH: 27 of 49 detected formulas across 5 real
  // course PDFs arrive with a bounding box and an EMPTY string. Filing them
  // under `figures` would make the sentence say "27 pictures couldn't be read"
  // about a document missing no pictures — a different false statement, not a
  // softer one.
  const coverage = built({ unitKind: "page", units: 4, unitsNative: 4, unreadableRegions: 27 });
  assert.equal(coverage.unreadableRegions, 27);
  assert.equal(coverage.figures.found, 0);
  assert.equal(coverage.state, "partial", "every page read, and still not complete");
  const sentence = describeCoverage(coverage);
  assert.ok(sentence && sentence.includes("27"), sentence ?? "no sentence");
  assert.ok(sentence && !sentence.includes("picture"), `must not call a formula a picture: ${sentence}`);
});

test("no unreadable regions leaves the record exactly as it was", () => {
  // The field must be invisible when it is zero, so an old row and a clean new
  // one are the same bytes on the wire and in jsonb.
  const coverage = built({ unitKind: "page", units: 1, unitsNative: 1 });
  assert.equal("unreadableRegions" in coverage, false);
  assert.equal(coverage.state, "complete");
});

test("a stored record keeps its figure reasons AND its unreadable regions", () => {
  // 🔴 THIS FAILED BEFORE THE FIX, AND IT FAILED SILENTLY. `readCoverage` knew
  // only four of the six skip reasons, so a row recording 12 pictures nobody had
  // examined -- the largest category there is -- came back with `reasons: {}`,
  // `lostFigures` 0 and `describeCoverage` NULL. The badge still said "partial"
  // because `state` is stored, which is exactly why nobody noticed: the warning
  // was right and the explanation was gone.
  const original = built({
    unitKind: "page",
    units: 3,
    unitsNative: 3,
    figures: { found: 12, described: 0, skipped: 12, reasons: { "not-examined": 12 } },
    unreadableRegions: 2,
  });
  const stored = JSON.parse(JSON.stringify(original)) as unknown;
  const parsed = readCoverage(stored);
  assert.ok(parsed, "a record we just wrote must survive its own round trip");
  assert.equal(parsed.figures.reasons["not-examined"], 12);
  assert.equal(lostFigures(parsed.figures), 12);
  assert.equal(parsed.unreadableRegions, 2);
  assert.equal(describeCoverage(parsed), describeCoverage(original), "what the student is told cannot change on the way out of storage");
});

test("examined-empty also survives storage", () => {
  const original = built({
    unitKind: "slide",
    units: 2,
    unitsNative: 2,
    figures: { found: 3, described: 1, skipped: 2, reasons: { "examined-empty": 2 } },
  });
  const parsed = readCoverage(JSON.parse(JSON.stringify(original)) as unknown);
  // 🔴 THE BOUNDARY IS WHAT THIS TEST IS FOR: the reason has to survive storage,
  // because the round trip is where the whole `reasons` map once silently
  // emptied. It must be READ BACK whatever the policy above it decides.
  assert.equal(parsed?.figures.reasons["examined-empty"], 2);
  // 🔴 AND IT COSTS NOTHING, which is the policy `lostFigures` now holds: a model
  // that looked and found no teaching content has told us there was nothing to
  // lose. This line asserted 2 when the reason was counted as missing content.
  assert.equal(lostFigures(parsed!.figures), 0);
  assert.equal(parsed?.state, "complete", "a document whose only skips were examined is whole");
});

// --- PARSER-002: the kinds behind unreadableRegions --------------------------

test("unreadableKinds derives unreadableRegions from its own sum", () => {
  const coverage = built({
    unitKind: "sheet",
    units: 3,
    unitsNative: 3,
    unreadableKinds: [
      { kind: "ambiguous-delimiter", count: 2 },
      { kind: "unsupported-number-format", count: 5 },
    ],
  });
  assert.equal(coverage.unreadableRegions, 7, "the count is derived, not independently supplied");
  assert.deepEqual(coverage.unreadableKinds, [
    { kind: "ambiguous-delimiter", count: 2 },
    { kind: "unsupported-number-format", count: 5 },
  ]);
  assert.equal(coverage.state, "partial");
});

test("passing unreadableRegions and unreadableKinds together is refused", () => {
  // Two numbers that must agree eventually disagree — so the caller picks one.
  const result = buildCoverage({
    unitKind: "sheet",
    units: 1,
    unitsNative: 1,
    unreadableRegions: 7,
    unreadableKinds: [{ kind: "chart", count: 7 }],
  });
  assert.equal(typeof result, "string");
});

test("a kind with a non-positive count is refused, not silently dropped from validation", () => {
  assert.equal(typeof buildCoverage({ unitKind: "sheet", units: 1, unitsNative: 1, unreadableKinds: [{ kind: "chart", count: 0 }] }), "string");
  assert.equal(typeof buildCoverage({ unitKind: "sheet", units: 1, unitsNative: 1, unreadableKinds: [{ kind: "chart", count: -1 }] }), "string");
  assert.equal(typeof buildCoverage({ unitKind: "sheet", units: 1, unitsNative: 1, unreadableKinds: [{ kind: "", count: 1 }] }), "string");
});

test("no unreadable kinds leaves the record exactly as it was", () => {
  const coverage = built({ unitKind: "sheet", units: 1, unitsNative: 1 });
  assert.equal("unreadableKinds" in coverage, false);
  assert.equal("unreadableRegions" in coverage, false);
});

test("🔴 unreadableKinds survives storage — the boundary that has died before", () => {
  // Same shape as the figure-reasons and unreadableRegions round-trip tests
  // above: build, serialize through JSON exactly as jsonb does, read back, and
  // require byte-for-byte equality rather than trusting the built object.
  const original = built({
    unitKind: "sheet",
    units: 2,
    unitsNative: 2,
    unreadableKinds: [
      { kind: "chart", count: 1 },
      { kind: "unsupported-number-format", count: 3 },
    ],
  });
  const parsed = readCoverage(JSON.parse(JSON.stringify(original)) as unknown);
  assert.deepEqual(parsed, original);
  assert.equal(parsed?.unreadableRegions, 4);
});

test("readCoverage preserves an unrecognized kind verbatim — the vocabulary is not this module's to filter", () => {
  const parsed = readCoverage({
    unitKind: "sheet", units: 1, unitsNative: 1, unitsVision: 0, unitsBoth: 0, unitsUnread: 0, state: "partial",
    unreadableRegions: 1,
    unreadableKinds: [{ kind: "a-kind-invented-after-this-file-was-written", count: 1 }],
  });
  assert.equal(parsed?.unreadableKinds?.[0]?.kind, "a-kind-invented-after-this-file-was-written");
});

test("readCoverage drops a kind entry with a non-positive or non-numeric count", () => {
  const parsed = readCoverage({
    unitKind: "sheet", units: 1, unitsNative: 1, unitsVision: 0, unitsBoth: 0, unitsUnread: 0, state: "partial",
    unreadableKinds: [{ kind: "chart", count: 0 }, { kind: "macro", count: "two" }, { kind: "pivot-table", count: 3 }],
  });
  assert.deepEqual(parsed?.unreadableKinds, [{ kind: "pivot-table", count: 3 }]);
});

test("an explicit empty unreadableKinds is not a breakdown that competes with unreadableRegions", () => {
  // A caller passing an empty array (an unused default) is not stating two
  // numbers that must agree — only a NON-EMPTY breakdown does that.
  const coverage = built({ unitKind: "page", units: 4, unitsNative: 4, unreadableRegions: 1, unreadableKinds: [] });
  assert.equal(coverage.unreadableRegions, 1);
  assert.equal("unreadableKinds" in coverage, false);
});

test("🔴 readCoverage re-derives unreadableRegions when a malformed kind entry is dropped, rather than trusting a now-stale stored total", () => {
  // Reproduces the boundary defect: raw storage claims 7 unreadable regions but
  // one kind entry is malformed and gets dropped during parsing, leaving only 3
  // explained. Trusting the stored 7 verbatim would let filtering silently
  // shrink what the record can account for while the number stays the same —
  // exactly the "two numbers that must agree eventually disagree" problem
  // `buildCoverage` refuses on write, reappearing on read instead.
  const parsed = readCoverage({
    unitKind: "sheet", units: 2, unitsNative: 2, unitsVision: 0, unitsBoth: 0, unitsUnread: 0, state: "partial",
    unreadableRegions: 7,
    unreadableKinds: [{ kind: "chart", count: 3 }, { kind: "macro", count: -1 }],
  });
  assert.equal(parsed?.unreadableRegions, 7, "the higher, stored total is kept — filtering never LOSES a count it cannot explain");
  assert.deepEqual(parsed?.unreadableKinds, [{ kind: "chart", count: 3 }]);

  // The other direction: kinds explain MORE than a (malformed or absent)
  // stored total says. The floor must rise to match what actually survived.
  const raised = readCoverage({
    unitKind: "sheet", units: 1, unitsNative: 1, unitsVision: 0, unitsBoth: 0, unitsUnread: 0, state: "partial",
    unreadableKinds: [{ kind: "chart", count: 1 }, { kind: "unsupported-number-format", count: 4 }],
  });
  assert.equal(raised?.unreadableRegions, 5);
});

// ---------------------------------------------------------------------------
// lostUnits — WHERE the loss happened, for the losses that can be placed.
// ---------------------------------------------------------------------------

test("lostUnits places a loss on the unit it happened on, and survives a round trip", () => {
  const coverage = built({
    unitKind: "page", units: 4, unitsNative: 3, unitsUnread: 1,
    unreadableRegions: 2,
    lostUnits: [{ unit: 2, unread: true }, { unit: 0, unreadableRegions: 2 }],
  });
  assert.equal(coverage.state, "partial");
  assert.deepEqual(lossOnUnit(coverage, 2), { unit: 2, unread: true });
  assert.deepEqual(lossOnUnit(coverage, 0), { unit: 0, unreadableRegions: 2 });
  assert.equal(lossOnUnit(coverage, 1), null, "a unit with nothing recorded against it has no entry");

  const parsed = readCoverage(JSON.parse(JSON.stringify(coverage)));
  assert.deepEqual(parsed?.lostUnits, coverage.lostUnits, "locality must survive storage, not just construction");
});

test("🔴 the totals are NEVER derived from lostUnits — unplaceable loss stays visible", () => {
  // The failure this field would otherwise introduce. Three regions were lost;
  // the parser could place only one. If `lostUnits` set the total, the other two
  // would cease to exist and every unit would read clean — parser incapacity
  // dressed up as absence of loss.
  const coverage = built({
    unitKind: "page", units: 5, unitsNative: 4, unitsUnread: 1,
    unreadableRegions: 3,
    lostUnits: [{ unit: 1, unreadableRegions: 1 }],
  });
  assert.equal(coverage.unreadableRegions, 3, "the authoritative total is untouched by how much of it could be placed");
  assert.equal(unlocatedRegions(coverage), 2, "the two regions nobody could place are still countable");
  assert.equal(unlocatedUnreadUnits(coverage), 1, "an unread unit nobody could name is still countable");
});

test("🔴 a document whose loss is fully placed reports nothing unlocated — the only case per-unit is honest", () => {
  const coverage = built({
    unitKind: "slide", units: 3, unitsNative: 2, unitsUnread: 1,
    unreadableRegions: 2,
    lostUnits: [{ unit: 0, unreadableRegions: 2 }, { unit: 2, unread: true }],
  });
  assert.equal(unlocatedRegions(coverage), 0);
  assert.equal(unlocatedUnreadUnits(coverage), 0);
});

test("a record with no lostUnits reports ALL of its loss as unlocated, never as absent", () => {
  // Every row written before this field existed. "We did not record where" must
  // read as "we do not know where", not as "there was nowhere".
  const coverage = built({ unitKind: "page", units: 24, unitsNative: 23, unitsUnread: 1, unreadableRegions: 4 });
  assert.equal("lostUnits" in coverage, false, "absent means not observed — an empty array would imply we looked");
  assert.equal(unlocatedRegions(coverage), 4);
  assert.equal(unlocatedUnreadUnits(coverage), 1);
});

test("a clean document has nothing located and nothing unlocated", () => {
  const coverage = built({ unitKind: "page", units: 9, unitsNative: 9 });
  assert.equal(unlocatedRegions(coverage), 0);
  assert.equal(unlocatedUnreadUnits(coverage), 0);
  assert.equal(lossOnUnit(coverage, 0), null);
});

test("buildCoverage refuses a breakdown that claims MORE loss than the totals admit", () => {
  const tooManyRegions = buildCoverage({
    unitKind: "page", units: 3, unitsNative: 3,
    unreadableRegions: 1,
    lostUnits: [{ unit: 0, unreadableRegions: 2 }],
  });
  assert.equal(typeof tooManyRegions, "string");
  assert.match(String(tooManyRegions), /2 regions located, but unreadableRegions is 1/);

  const tooManyUnread = buildCoverage({
    unitKind: "page", units: 3, unitsNative: 2, unitsUnread: 1,
    lostUnits: [{ unit: 0, unread: true }, { unit: 1, unread: true }],
  });
  assert.equal(typeof tooManyUnread, "string");
  assert.match(String(tooManyUnread), /2 units marked unread, but unitsUnread is 1/);
});

test("buildCoverage refuses a unit index that is not an index into this document", () => {
  for (const unit of [3, -1, 1.5]) {
    const result = buildCoverage({
      unitKind: "page", units: 3, unitsNative: 2, unitsUnread: 1,
      lostUnits: [{ unit, unread: true }],
    });
    assert.equal(typeof result, "string", `unit ${unit} must be refused`);
    assert.match(String(result), /is not an index into this document's 3 units/);
  }
});

test("buildCoverage refuses a duplicate unit and an entry that records no loss", () => {
  const duplicate = buildCoverage({
    unitKind: "page", units: 2, unitsNative: 2, unreadableRegions: 2,
    lostUnits: [{ unit: 0, unreadableRegions: 1 }, { unit: 0, unreadableRegions: 1 }],
  });
  assert.match(String(duplicate), /unit 0 appears twice/);

  // 🔴 An entry asserting neither kind of loss would read as "we looked at this
  // unit and it is fine" — a claim this field is not entitled to make. A clean
  // unit is expressed by omission.
  const empty = buildCoverage({
    unitKind: "page", units: 2, unitsNative: 2,
    lostUnits: [{ unit: 1 }],
  });
  assert.match(String(empty), /unit 1 records no loss/);
});

test("🔴 readCoverage drops a malformed entry, and that RAISES what is unlocated rather than hiding it", () => {
  // The mirror of the `unreadableKinds` re-derivation above, and it needs no
  // re-derivation for the same reason it is safe: no total depends on this
  // field, so losing an entry can only ever move confidence in the cautious
  // direction. Two of the three placements are unusable; the total stays 3 and
  // the unlocated count rises from 0 to 2.
  const parsed = readCoverage({
    unitKind: "page", units: 4, unitsNative: 4, unitsVision: 0, unitsBoth: 0, unitsUnread: 0, state: "partial",
    unreadableRegions: 3,
    lostUnits: [
      { unit: 0, unreadableRegions: 1 },
      { unit: 99, unreadableRegions: 1 },
      { unit: 2, unreadableRegions: 0 },
      { unit: "one", unreadableRegions: 1 },
    ],
  });
  assert.equal(parsed?.unreadableRegions, 3, "the total is not touched by filtering");
  assert.deepEqual(parsed?.lostUnits, [{ unit: 0, unreadableRegions: 1 }]);
  assert.equal(unlocatedRegions(parsed!), 2);
});

test("🔴 CALIBRATION: deriving the total from lostUnits makes unplaceable loss vanish", () => {
  // The mutation this whole field is shaped to prevent, written out so the guard
  // above is known to have teeth. `derived` is what `unreadableRegions` would be
  // if the breakdown set it (the way `unreadableKinds` legitimately does); the
  // real record keeps the measured total instead.
  const coverage = built({
    unitKind: "page", units: 6, unitsNative: 5, unitsUnread: 1,
    unreadableRegions: 9,
    lostUnits: [{ unit: 3, unreadableRegions: 1 }],
  });
  const derived = (coverage.lostUnits ?? []).reduce((total, loss) => total + (loss.unreadableRegions ?? 0), 0);
  assert.equal(derived, 1, "the breakdown accounts for exactly one region");
  assert.equal(coverage.unreadableRegions, 9, "and the record still knows nine were lost");
  assert.notEqual(derived, coverage.unreadableRegions, "if these were ever equal, eight losses would have been erased");
  assert.equal(unlocatedRegions(coverage), 8);
});
