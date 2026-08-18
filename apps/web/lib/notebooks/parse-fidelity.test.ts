/**
 * The failures a count-based comparison cannot see.
 *
 * Every test here is built so that the OLD comparison — characters, blocks, tables, cells — comes
 * out identical on both sides. If any of these could be caught by counting, it would already have
 * been caught.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildDocument, type DocBlock, type DocTable, type DocUnit } from "@nemesis/shared";

import {
  MAX_CLEAN_CROSSINGS,
  columnInterleave,
  orderAgreement,
  tableFidelity,
} from "./parse-fidelity";

const page: DocUnit = { index: 0, kind: "page", size: { height: 792, width: 612 } };

/** A paragraph-shaped block at a position, so a test reads as a page layout rather than as data. */
const para = (text: string, x: number, y: number, width = 230): Omit<DocBlock, "id"> => ({
  headingPath: [],
  kind: "paragraph",
  rect: { height: 40, width, x, y },
  text,
  unit: 0,
});

const pageOf = (blocks: readonly Omit<DocBlock, "id">[]) =>
  buildDocument({ blocks, format: "pdf", title: null, units: [page] });

// Left column at x=60, right column at x=330. A 612-point page: the gutter is real.
const LEFT = 60;
const RIGHT = 330;

test("a single-column page is not accused of interleaving", () => {
  const model = pageOf([
    para("The first paragraph of an ordinary single column of text.", LEFT, 100, 490),
    para("The second paragraph, sitting directly beneath the first one.", LEFT, 150, 490),
    para("And a third, continuing down the page in the usual way.", LEFT, 200, 490),
    para("A fourth for good measure, still in one column.", LEFT, 250, 490),
  ]);
  const report = columnInterleave(model);
  assert.equal(report.findings[0]?.columns, 1);
  assert.equal(report.interleavedUnits, 0);
});

test("a two-column page read DOWN each column is clean", () => {
  const model = pageOf([
    para("Left column, first paragraph of the argument.", LEFT, 100),
    para("Left column, second paragraph continuing it.", LEFT, 150),
    para("Left column, third and final paragraph here.", LEFT, 200),
    para("Right column, where the argument resumes.", RIGHT, 100),
    para("Right column, second paragraph of that half.", RIGHT, 150),
    para("Right column, the last paragraph on the page.", RIGHT, 200),
  ]);
  const report = columnInterleave(model);
  const finding = report.findings[0]!;
  assert.equal(finding.columns, 2, "the gutter must be found");
  assert.equal(finding.crossings, 1, "reading left then right crosses exactly once");
  assert.equal(finding.interleaved, false);
});

test("🔴🔴 a two-column page read ACROSS the gutter is caught, and a character count cannot see it", () => {
  // The SAME six paragraphs as the test above, in the order a parser produces when it reads by
  // horizontal band instead of by column. Identical characters, identical blocks, identical
  // everything the shadow evaluator counts.
  const model = pageOf([
    para("Left column, first paragraph of the argument.", LEFT, 100),
    para("Right column, where the argument resumes.", RIGHT, 100),
    para("Left column, second paragraph continuing it.", LEFT, 150),
    para("Right column, second paragraph of that half.", RIGHT, 150),
    para("Left column, third and final paragraph here.", LEFT, 200),
    para("Right column, the last paragraph on the page.", RIGHT, 200),
  ]);
  const report = columnInterleave(model);
  const finding = report.findings[0]!;
  assert.equal(finding.columns, 2);
  assert.equal(finding.crossings, 5, "every step crosses the gutter");
  assert.ok(finding.crossings > MAX_CLEAN_CROSSINGS);
  assert.equal(finding.interleaved, true);
  assert.equal(report.interleavedUnits, 1);
});

test("a full-width heading does not invent a gutter", () => {
  // A banner across the top of a one-column page has a centre of its own; if it were allowed into
  // the gutter search it could split a page that has no columns at all.
  const model = pageOf([
    para("A HEADING THAT RUNS THE WHOLE WIDTH OF THE PAGE", LEFT, 60, 490),
    para("The opening paragraph beneath the heading.", LEFT, 110, 490),
    para("A second paragraph beneath that one.", LEFT, 160, 490),
    para("A third paragraph, still a single column.", LEFT, 210, 490),
  ]);
  assert.equal(columnInterleave(model).findings[0]?.columns, 1);
});

test("a page with no geometry is skipped rather than guessed at", () => {
  // Word documents carry no rects. Reporting them as single-column would be a claim we cannot make.
  const model = buildDocument({
    blocks: [
      { headingPath: [], kind: "paragraph", text: "No rect on this block.", unit: 0 },
      { headingPath: [], kind: "paragraph", text: "Nor on this one.", unit: 0 },
    ],
    format: "docx",
    title: null,
    units: [{ index: 0, kind: "body" }],
  });
  const report = columnInterleave(model);
  assert.equal(report.unitsWithGeometry, 0);
  assert.equal(report.findings.length, 0);
});

// ── Tables ─────────────────────────────────────────────────────────────────────────────────────

const tableOf = (rows: string[][]): DocTable => ({ headerRows: 1, rows });

test("a table recovered identically agrees on both measures", () => {
  const grid = [
    ["Component", "Rated load", "Failure mode"],
    ["Bracket A", "12 kN", "shear"],
    ["Bracket B", "18 kN", "buckling"],
  ];
  const result = tableFidelity(tableOf(grid), tableOf(grid.map((r) => [...r])));
  assert.equal(result.valueAgreement, 1);
  assert.equal(result.positionAgreement, 1);
  assert.equal(result.shapeMatches, true);
});

test("🔴🔴 the same cells in the WRONG COLUMNS: values agree, positions do not", () => {
  // This is the failure the count-based comparator calls `safe`. One table on each side, three
  // rows, three columns, nine cells, every value present in both — and every row's meaning
  // destroyed, because the load and the failure mode have swapped columns.
  const ours = tableOf([
    ["Component", "Rated load", "Failure mode"],
    ["Bracket A", "shear", "12 kN"],
    ["Bracket B", "buckling", "18 kN"],
  ]);
  const theirs = tableOf([
    ["Component", "Rated load", "Failure mode"],
    ["Bracket A", "12 kN", "shear"],
    ["Bracket B", "18 kN", "buckling"],
  ]);

  const result = tableFidelity(ours, theirs);
  assert.equal(result.shapeMatches, true, "shape is identical, which is why counting fails here");
  assert.equal(result.valueAgreement, 1, "every value is present on both sides");
  assert.ok(
    result.positionAgreement < 0.6,
    `positions must disagree; got ${result.positionAgreement}`,
  );
  // The signature: the gap between the two numbers IS the finding.
  assert.ok(result.valueAgreement - result.positionAgreement > 0.35);
});

test("a table that genuinely lost cells shows it in the VALUE agreement", () => {
  const ours = tableOf([["Statute", "Section"], ["", ""]]);
  const theirs = tableOf([["Statute", "Section"], ["Limitation Act", "s.11"]]);
  const result = tableFidelity(ours, theirs);
  assert.ok(result.valueAgreement <= 1);
  const reverse = tableFidelity(theirs, ours);
  assert.ok(reverse.valueAgreement < 0.6, "half the values are missing from the other side");
});

test("blank positions on both sides are not counted as agreement", () => {
  // A sparse grid must not manufacture a high score out of empty space.
  const sparse = tableOf([["Term", ""], ["", ""], ["", ""]]);
  const other = tableOf([["Term", ""], ["", ""], ["", ""]]);
  const result = tableFidelity(sparse, other);
  assert.equal(result.cellsCompared, 1, "only the one position holding anything is compared");
});

test("a span recorded on one side and repeated on the other is not a disagreement", () => {
  // Covered positions are stored empty by design; `cellText` resolves what governs them, so a
  // notation difference does not read as a content difference.
  const spanned: DocTable = {
    headerRows: 1,
    cells: [
      { column: 0, colSpan: 2, row: 0, text: "Shared heading" },
      { column: 0, row: 1, text: "left" },
      { column: 1, row: 1, text: "right" },
    ],
    rows: [
      ["Shared heading", ""],
      ["left", "right"],
    ],
  };
  const repeated = tableOf([
    ["Shared heading", "Shared heading"],
    ["left", "right"],
  ]);
  assert.equal(tableFidelity(spanned, repeated).positionAgreement, 1);
});

// ── Sequence ───────────────────────────────────────────────────────────────────────────────────

const PASSAGES = [
  "The doctrine developed slowly across three distinct centuries of practice.",
  "Each successive court narrowed the exception a little further than the last.",
  "By the modern period the rule had been reduced almost to a formality.",
  "What survives today is largely the vocabulary rather than the substance.",
];

test("two parses that told the same story in the same order agree completely", () => {
  const text = PASSAGES.join("\n");
  assert.equal(orderAgreement(text, text).agreement, 1);
});

test("🔴 the same passages in a scrambled order are caught, and the character count is identical", () => {
  const ours = [PASSAGES[0], PASSAGES[2], PASSAGES[1], PASSAGES[3]].join("\n");
  const theirs = PASSAGES.join("\n");
  assert.equal(ours.length, theirs.length, "identical characters, which is the point");

  const result = orderAgreement(ours, theirs);
  assert.equal(result.sharedPassages, 4, "every passage was recovered by both");
  assert.ok(result.agreement < 1, `a reordering must show; got ${result.agreement}`);
});

test("a fully reversed reading shows the strongest disagreement", () => {
  const result = orderAgreement([...PASSAGES].reverse().join("\n"), PASSAGES.join("\n"));
  assert.equal(result.sharedPassages, 4);
  assert.ok(result.agreement <= 0.25, `got ${result.agreement}`);
});

test("parses with nothing in common make no ordering claim", () => {
  // Zero shared passages is not a disagreement about order. Reporting it as one would flood the
  // report with documents whose only fault is that one parser read them and the other did not.
  const result = orderAgreement("A sentence about hydraulic pressure in a closed system.", "");
  assert.equal(result.sharedPassages, 0);
  assert.equal(result.agreement, 1);
});

test("fragments too short to be evidence are ignored", () => {
  // "Fig. 3" appearing in both parses is not proof they agree about anything.
  const result = orderAgreement("Fig. 3\nTable 1\np. 44", "p. 44\nTable 1\nFig. 3");
  assert.equal(result.sharedPassages, 0);
});

test("🔴🔴 orphaned fragments at the margin are not a column", () => {
  // The false positive that a corpus sweep found and the unit tests had not: a page of
  // single-column mathematics whose subscripts land as their own blocks out at the right margin.
  // Enough of them to pass a block count, nowhere near enough text to be a column.
  const body = (y: number) =>
    para("A paragraph of ordinary body text running across the measure of the page.", 90, y, 300);
  const orphan = (y: number, text: string) => para(text, 520, y, 20);

  const model = pageOf([
    body(100), orphan(105, "1 2"),
    body(150), orphan(155, "V"),
    body(200), orphan(205, "n"),
    body(250), orphan(255, "x"),
  ]);
  const finding = columnInterleave(model).findings[0]!;
  assert.equal(finding.columns, 1, "fragments carrying four characters are not a column of text");
  assert.equal(finding.interleaved, false);
});

test("a genuine two-column page is still found when both sides carry text", () => {
  // The guard above must not cost the real case: both columns hold comparable prose.
  const model = pageOf([
    para("Left column carrying a full measure of running prose about the topic.", 60, 100),
    para("Left column continuing with a second full paragraph of the argument.", 60, 150),
    para("Right column carrying its own full measure of running prose as well.", 330, 100),
    para("Right column continuing with a second full paragraph of that half.", 330, 150),
  ]);
  assert.equal(columnInterleave(model).findings[0]?.columns, 2);
});

test("🔴🔴 a diagram's scattered labels are not two columns of text", () => {
  // The second false positive a corpus sweep found: a full-page figure whose cell labels cluster
  // left and right with enough characters between them to pass a text-mass test. A column is made
  // of lines; a diagram is made of tokens.
  const label = (text: string, x: number, y: number) => para(text, x, y, 40);
  const model = pageOf([
    label("C C C C C NL", 60, 100), label("2", 60, 140), label("B U C C NL", 60, 180), label("3", 60, 220),
    label("U X C C C NL", 380, 100), label("1", 380, 140), label("L L L 1 -", 380, 180), label("4", 380, 220),
  ]);
  assert.equal(columnInterleave(model).findings[0]?.columns, 1);
});

test("a two-column page of running prose survives every guard", () => {
  const model = pageOf([
    para("The first paragraph of the left column, long enough to be a typeset line of prose.", 60, 100),
    para("The second paragraph of the left column, also a proper line of running text here.", 60, 150),
    para("The first paragraph of the right column, equally long and equally full of prose.", 330, 100),
    para("The second paragraph of the right column, closing the page with more real text.", 330, 150),
  ]);
  assert.equal(columnInterleave(model).findings[0]?.columns, 2, "the true case must still be found");
});
