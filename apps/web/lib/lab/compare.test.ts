import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocument, type DocumentModel } from "@nemesis/shared";

import { COMPARED_ASPECTS, compareParses } from "./compare";
import { unitFlags, worthInspecting } from "./unit-flags";

/** A one-page document holding one table, built through the shared constructor rather than by hand
 *  so the ids and invariants are the real ones. */
function withTable(cells: { text: string; row: number; column: number; rowSpan?: number; colSpan?: number }[]): DocumentModel {
  return buildDocument({
    blocks: [
      {
        headingPath: [],
        kind: "table",
        table: { cells, headerRows: 1, rows: [["A", "B"], ["1", "2"]] },
        text: "",
        unit: 0,
      },
    ],
    format: "pdf",
    title: "t",
    units: [{ index: 0, kind: "page" }],
  });
}

function flat(text: string): DocumentModel {
  return buildDocument({
    blocks: [{ headingPath: [], kind: "paragraph", text, unit: 0 }],
    format: "pdf",
    title: "t",
    units: [{ index: 0, kind: "page" }],
  });
}

test("🔴 a lane that did not run is reported as such, never as agreement", () => {
  const comparison = compareParses(flat("hello"), null, "No paid parser is configured here.");
  assert.equal(comparison.ran, false);
  assert.equal(comparison.note, "No paid parser is configured here.");
  assert.deepEqual(comparison.disagreements, []);
  // The trap: an empty disagreement list plus ran:false must never be read as "they agreed".
  assert.equal(comparison.agreedUnits, 0);
});

test("🔴 losing a merged cell is a disagreement even when the character count is identical", () => {
  // The failure the owner named: all the right words extracted, assigned to the wrong grid.
  const kept = withTable([
    { colSpan: 2, column: 0, row: 0, text: "Dose" },
    { column: 0, row: 1, text: "5 mg" },
    { column: 1, row: 1, text: "oral" },
  ]);
  const lost = withTable([
    { column: 0, row: 0, text: "Dose" },
    { column: 0, row: 1, text: "5 mg" },
    { column: 1, row: 1, text: "oral" },
  ]);
  const comparison = compareParses(kept, lost);
  assert.equal(comparison.ran, true);
  const aspects = comparison.disagreements[0]?.differences.map((d) => d.aspect) ?? [];
  assert.ok(aspects.includes("mergedCells"), `expected mergedCells, got ${aspects.join(",")}`);
  // And text must NOT be what flagged it — the words are byte-identical.
  assert.ok(!aspects.includes("text"), "the two readings hold the same words");
});

test("🔴 the merge-losing lane must not look BIGGER than the lane that kept it", () => {
  // `rows` is a projection: a merged cell fills several grid positions. Counting rows would rank
  // the worse read higher, which is the inversion this comparison exists to prevent.
  const kept = withTable([
    { colSpan: 2, column: 0, row: 0, text: "Dose" },
    { column: 0, row: 1, text: "5 mg" },
    { column: 1, row: 1, text: "oral" },
  ]);
  const lost = withTable([
    { column: 0, row: 0, text: "Dose" },
    { column: 1, row: 0, text: "" },
    { column: 0, row: 1, text: "5 mg" },
    { column: 1, row: 1, text: "oral" },
  ]);
  const cellsKept = Number(compareParses(kept, lost).disagreements[0]?.differences.find((d) => d.aspect === "tableCells")?.a);
  const cellsLost = Number(compareParses(kept, lost).disagreements[0]?.differences.find((d) => d.aspect === "tableCells")?.b);
  assert.ok(cellsLost >= cellsKept, "this fixture deliberately gives the worse read MORE cells");
  // ...which is exactly why `mergedCells` is compared separately, and why the aspect ORDER puts
  // every structural fact ahead of the character count. Asserted on the contract itself, because in
  // this fixture `text` does not differ at all — the words are identical — and reading the order off
  // one result would silently pass on an empty list.
  assert.ok(
    COMPARED_ASPECTS.indexOf("mergedCells") < COMPARED_ASPECTS.indexOf("text"),
    "structure is compared before text",
  );
  assert.equal(COMPARED_ASPECTS.at(-1), "text", "text is last, never the headline metric");
});

test("identical readings disagree about nothing", () => {
  const comparison = compareParses(flat("same words"), flat("same  WORDS"));
  assert.equal(comparison.ran, true);
  assert.deepEqual(comparison.disagreements, []);
  assert.equal(comparison.agreedUnits, 1);
});

test("a different unit count is reported as a disagreement about what the document is", () => {
  const two = buildDocument({
    blocks: [{ headingPath: [], kind: "paragraph", text: "a", unit: 0 }],
    format: "pdf",
    title: "t",
    units: [{ index: 0, kind: "page" }, { index: 1, kind: "page" }],
  });
  const comparison = compareParses(flat("a"), two);
  assert.equal(comparison.unitsA, 1);
  assert.equal(comparison.unitsB, 2);
  assert.match(comparison.note ?? "", /how many units/);
});

test("🔴 the page strip flags a table, and a clean page is not flagged", () => {
  const flags = unitFlags(withTable([{ column: 0, row: 0, text: "Dose" }]), null);
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.table, true);
  assert.equal(worthInspecting(flags[0]!), true);
  assert.equal(worthInspecting(unitFlags(flat("just prose"), null)[0]!), false);
});

test("🔴 an unread page is flagged on the page coverage actually names", () => {
  // `UnitLoss.unit` shares the 0-based space of `DocUnit.index`. An off-by-one here sends the owner
  // to a page that is fine while the broken one looks clean.
  const model = buildDocument({
    blocks: [
      { headingPath: [], kind: "paragraph", text: "page one", unit: 0 },
      { headingPath: [], kind: "paragraph", text: "", unit: 1 },
    ],
    format: "pdf",
    title: "t",
    units: [{ index: 0, kind: "page" }, { index: 1, kind: "page" }],
  });
  const coverage = {
    figures: { described: 0, found: 0, reasons: {}, skipped: 0 },
    lostUnits: [{ unread: true, unit: 1 }],
    parserVersion: "test",
    state: "partial" as const,
    truncation: [],
    unitKind: "page" as const,
    units: 2,
    unitsBoth: 0,
    unitsNative: 1,
    unitsUnread: 1,
    unitsVision: 0,
    version: 1,
  };
  const flags = unitFlags(model, coverage);
  assert.equal(flags[0]!.unread, false, "page 1 was read and must not be flagged");
  assert.equal(flags[1]!.unread, true, "page 2 is the one coverage named");
});
