import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blockToText,
  buildDocument,
  countDocument,
  describeLocator,
  documentToText,
  figureCoverageOf,
  locate,
  tableToMarkdown,
  type DocBlock,
  type DocUnitKind,
} from "./document-model.ts";
import { deriveState, lostFigures } from "./extraction-coverage.ts";

function doc(
  blocks: readonly Omit<DocBlock, "id">[],
  unitKind: DocUnitKind = "body",
  units = 1,
) {
  return buildDocument({
    blocks,
    format: unitKind === "page" ? "pdf" : "docx",
    title: null,
    units: Array.from({ length: units }, (_, index) => ({ index, kind: unitKind })),
  });
}

const para = (text: string, unit = 0): Omit<DocBlock, "id"> => ({
  headingPath: [],
  kind: "paragraph",
  text,
  unit,
});

test("block ids are positional, unique and assigned by the builder", () => {
  const built = doc([para("one"), para("two"), para("three")]);
  assert.deepEqual(built.blocks.map((b) => b.id), ["b0", "b1", "b2"]);
  assert.equal(new Set(built.blocks.map((b) => b.id)).size, 3);
});

// 🔴 THE RULE THE WHOLE MODEL EXISTS TO ENFORCE.
// The old extractor returned a flat string, so any consumer wanting a citation
// had to invent one — and a Word document has no page to invent from. This
// asserts the model has no code path that prints a number for a body unit.
test("a body locator never renders a unit number", () => {
  const built = doc([{ ...para("clause 4"), headingPath: ["Terms", "Termination"] }]);
  const line = describeLocator(locate(built, built.blocks[0]!));
  assert.equal(line, "Terms › Termination");
  assert.ok(!/\d/.test(line), `a .docx locator must carry no number, got: ${line}`);
  assert.ok(!/page/i.test(line));
});

test("a body locator with no headings still says something true", () => {
  const built = doc([para("loose text")]);
  assert.equal(describeLocator(locate(built, built.blocks[0]!)), "this document");
});

test("a page locator is 1-based and says page", () => {
  const built = doc([{ ...para("body", 2), headingPath: ["Methods"] }], "page", 3);
  assert.equal(describeLocator(locate(built, built.blocks[0]!)), "page 3 · Methods");
});

test("a slide locator says slide, not page", () => {
  const built = buildDocument({
    blocks: [para("bullet", 4)],
    format: "pptx",
    title: null,
    units: Array.from({ length: 5 }, (_, index) => ({ index, kind: "slide" as const })),
  });
  assert.equal(describeLocator(locate(built, built.blocks[0]!)), "slide 5");
});

test("counts bucket every block exactly once", () => {
  const built = doc([
    { headingPath: [], kind: "heading", level: 1, text: "Intro", unit: 0 },
    para("text"),
    { depth: 0, headingPath: [], kind: "listItem", marker: "1.", text: "first", unit: 0 },
    { headingPath: [], kind: "table", table: { headerRows: 1, rows: [["a", "b"], ["1", "2"]] }, text: "", unit: 0 },
    { figure: {}, headingPath: [], kind: "figure", text: "Fig 1", unit: 0 },
    { headingPath: [], kind: "equation", text: "E=mc^2", unit: 0 },
  ]);
  const counts = countDocument(built);
  assert.equal(counts.blocks, 6);
  assert.equal(
    counts.headings + counts.paragraphs + counts.listItems + counts.tables + counts.figures + counts.equations,
    counts.blocks,
    "the buckets must reconcile with the block count",
  );
  assert.equal(counts.tableCells, 4);
});

// 🔴 A DISCLOSED SKIP IS NOT A GAP; AN UNDISCLOSED ONE IS.
// Under "Unknown ≠ complete", only a figure with neither a description nor a
// stated reason may hold a document back from complete.
test("figuresUnexamined separates a decision from an omission", () => {
  const built = doc([
    { figure: { description: "a dose-response curve" }, headingPath: [], kind: "figure", text: "", unit: 0 },
    { figure: { skipped: "decorative" }, headingPath: [], kind: "figure", text: "", unit: 0 },
    { figure: {}, headingPath: [], kind: "figure", text: "", unit: 0 },
  ]);
  const counts = countDocument(built);
  assert.equal(counts.figures, 3);
  assert.equal(counts.figuresUnexamined, 1);
});

// 🔴 REGRESSION AGAINST THE OLD FLATTENING.
// The tag strip turned every cell into its own line, so a grid arrived looking
// like prose. This asserts the grid survives as a grid.
test("a table renders as a grid, not as loose lines", () => {
  const markdown = tableToMarkdown({
    headerRows: 1,
    rows: [["Drug", "Dose"], ["A", "10 mg"], ["B", "20 mg"]],
  });
  assert.deepEqual(markdown.split("\n"), [
    "| Drug | Dose |",
    "| --- | --- |",
    "| A | 10 mg |",
    "| B | 20 mg |",
  ]);
});

test("no header separator is drawn when the format did not claim one", () => {
  const markdown = tableToMarkdown({ headerRows: 0, rows: [["1", "2"], ["3", "4"]] });
  assert.ok(!markdown.includes("---"), "a table of data must not gain a fabricated header");
  assert.equal(markdown.split("\n").length, 2);
});

test("a cell containing a pipe or a newline cannot break the grid", () => {
  const markdown = tableToMarkdown({ headerRows: 0, rows: [["a|b", "c\n  d"]] });
  assert.equal(markdown, "| a\\|b | c d |");
});

// 🔴 AN INFERENCE MUST NEVER BE INDISTINGUISHABLE FROM THE SOURCE.
test("a figure keeps its caption and its description apart", () => {
  const caption = blockToText({
    figure: { description: "Two curves crossing at 40 minutes." },
    headingPath: [],
    id: "b0",
    kind: "figure",
    text: "Figure 2. Plasma concentration.",
    unit: 0,
  });
  assert.equal(caption, "[Figure: Figure 2. Plasma concentration.]\nTwo curves crossing at 40 minutes.");
});

test("an unexamined figure says so rather than reading as empty", () => {
  const text = blockToText({ figure: {}, headingPath: [], id: "b0", kind: "figure", text: "", unit: 0 });
  assert.equal(text, "[Figure — not examined]");
});

test("a list item keeps the marker the numbering resolved", () => {
  const text = blockToText({
    depth: 1,
    headingPath: [],
    id: "b0",
    kind: "listItem",
    marker: "3.",
    text: "Reduce the dose",
    unit: 0,
  });
  assert.equal(text, "  3. Reduce the dose");
});

test("figure coverage charges for what was lost and not for furniture", () => {
  const built = doc([
    { figure: { description: "a curve" }, headingPath: [], kind: "figure", text: "", unit: 0 },
    { figure: { skipped: "decorative" }, headingPath: [], kind: "figure", text: "", unit: 0 },
    { figure: { skipped: "too-small" }, headingPath: [], kind: "figure", text: "", unit: 0 },
    { figure: { skipped: "unsupported" }, headingPath: [], kind: "figure", text: "", unit: 0 },
    { figure: {}, headingPath: [], kind: "figure", text: "", unit: 0 },
  ]);
  const coverage = figureCoverageOf(built);
  assert.equal(coverage.found, 5);
  assert.equal(coverage.described, 1);
  assert.equal(coverage.skipped, 4, "found minus described must always hold");
  assert.deepEqual(coverage.reasons, { decorative: 2, "not-examined": 1, "unreadable-format": 1 });
  // Two decorative skips cost nothing; the unsupported one and the unexamined
  // one are both content the student uploaded and did not get.
  assert.equal(lostFigures(coverage), 2);
});

// 🔴 THE PHASE 2 HONESTY FIX, ASSERTED.
// Every page's text was read, so the old record called the document complete —
// while a diagram on it had never been looked at by anything. Measured over 120
// real course PDFs, 1,089 figures are in exactly this state.
test("a fully-read page carrying an unexamined figure is partial, not complete", () => {
  const figures = figureCoverageOf(
    doc([{ figure: {}, headingPath: [], kind: "figure", text: "", unit: 0 }], "page", 1),
  );
  const base = {
    figures,
    parserVersion: "test",
    truncation: [],
    unitKind: "page" as const,
    units: 3,
    unitsBoth: 0,
    unitsNative: 3,
    unitsUnread: 0,
    unitsVision: 0,
    version: 1,
  };
  assert.equal(deriveState(base), "partial");
  assert.equal(
    deriveState({ ...base, figures: { described: 0, found: 0, reasons: {}, skipped: 0 } }),
    "complete",
    "with no figures at all the same pages are complete — the figure is the only difference",
  );
});

test("documentToText drops empty blocks but keeps every non-empty one", () => {
  const built = doc([
    { headingPath: [], kind: "heading", level: 2, text: "Method", unit: 0 },
    para(""),
    para("Step one."),
  ]);
  assert.equal(documentToText(built), "## Method\n\nStep one.");
});
