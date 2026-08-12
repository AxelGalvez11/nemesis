import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyFurniture, documentFurniture, findFurniture, readingFlow } from "./document-furniture.ts";
import { buildDocument, type DocBlock } from "./document-model.ts";

function page(unit: number, blocks: { text: string; y: number; kind?: DocBlock["kind"] }[]) {
  return blocks.map((b) => ({
    headingPath: [],
    kind: b.kind ?? ("paragraph" as const),
    rect: { height: 0.02, width: 0.8, x: 0.1, y: b.y },
    text: b.text,
    unit,
  }));
}

/** 🔴 GENUINELY DIFFERENT PROSE PER PAGE. Body text that differs only by a digit
 *  ("Body 1", "Body 2") collapses to one key and correctly trips the template
 *  guard — which made three fixtures here fail until they were made realistic. */
const BODY = [
  "Absorption depends on gastric pH.",
  "Distribution follows plasma protein binding.",
  "Metabolism is largely hepatic.",
  "Excretion is renal and biliary.",
];

function doc(pages: ReturnType<typeof page>[]) {
  return buildDocument({
    blocks: pages.flat(),
    format: "pdf",
    title: "T",
    units: pages.map((_, i) => ({ index: i, kind: "page" as const })),
  });
}

// ── what furniture is ───────────────────────────────────────────────────────

test("a footer that changes only by its page number is still one running element", () => {
  // 🔴 THE DIGIT COLLAPSE IS LOad-BEARING. Compared literally, every page's
  // footer is unique and the repetition signal disappears completely.
  const model = doc([0, 1, 2, 3].map((i) => page(i, [
    { text: "Renal Pharmacotherapy", y: 0.04 },
    { text: BODY[i]!, y: 0.45 },
    { text: `Page ${i + 1} of 4`, y: 0.95 },
  ])));
  const found = findFurniture(model);
  const kinds = [...found.values()];
  assert.equal(kinds.filter((k) => k === "pageFooter").length, 4);
  assert.equal(kinds.filter((k) => k === "pageHeader").length, 4);
});

test("🔴 a heading at the top of every page is NOT furniture if its text differs", () => {
  // Section headings open pages. Measured: 12.3% of one-off text sits in the top
  // band, so a position-only rule would call these furniture and drop them.
  const model = doc([0, 1, 2, 3].map((i) => page(i, [
    { kind: "heading", text: `Section ${i + 1}: a different title`, y: 0.05 },
    { text: "Body.", y: 0.5 },
  ])));
  assert.equal(findFurniture(model).size, 0);
});

test("🔴 repeated text in the MIDDLE of the page is not furniture", () => {
  // 44.1% of repeated strings sit mid-page — repeated body content, such as a
  // table's repeated header row. Suppressing those would delete real data.
  const model = doc([0, 1, 2, 3].map((i) => page(i, [
    { text: "Dose adjustment required", y: 0.5 },
    { text: `Unique body ${i}.`, y: 0.7 },
  ])));
  assert.equal(findFurniture(model).size, 0);
});

test("🔴 text that drifts down the page is not furniture even if it repeats", () => {
  // A template prints furniture at a fixed offset. Something that wanders is
  // flowing with the content, which is what body text does.
  const model = doc([
    ...page(0, [{ text: "Confidential", y: 0.90 }]),
    ...page(1, [{ text: "Confidential", y: 0.60 }]),
    ...page(2, [{ text: "Confidential", y: 0.95 }]),
  ]);
  assert.equal(findFurniture(doc([[...model.blocks] as never])).size, 0);
});

test("🔴 a single-page document classifies NOTHING — uncertain stays ordinary text", () => {
  const model = doc([page(0, [
    { text: "Some Course Name", y: 0.03 },
    { text: "Body.", y: 0.5 },
    { text: "Page 1 of 1", y: 0.96 },
  ])]);
  assert.equal(findFurniture(model).size, 0, "no repetition signal exists, so nothing is guessed");
});

test("a repeated TABLE is never furniture — that would delete data to tidy a margin", () => {
  const model = doc([0, 1, 2, 3].map((i) => page(i, [
    { kind: "table", text: "Grid", y: 0.05 },
    { text: BODY[i]!, y: 0.5 },
  ])));
  assert.equal(findFurniture(model).size, 0);
});

test("🔴 A REAL WORKSHEET'S ANSWER BANK IS NOT A FOOTER — the fixture is a live defect", () => {
  // From `PPT_Recitation 1_Functional Groups_Blank.pdf`, 12 slides. Every slide
  // reprints the same lettered answer bank, whose fragments sit at y=0.242,
  // y=0.594 and y=0.913. Only the LAST falls in the footer band, so band-plus-
  // repetition alone deleted "I. Formoterol J. Trandolapril" from 11 of 12 pages
  // and kept the rest — a list quietly losing its final two options, which is the
  // worst shape this error can take.
  //
  // A page whose repeated material reaches the middle is built from a template,
  // and nothing on it can be told apart from margin furniture. So nothing is
  // classified, and it stays ordinary text.
  const model = doc([0, 1, 2, 3].map((i) => page(i, [
    { text: "A. Diphenhydramine C. Ciprofloxacin D. Phenoxymethylpenicillin", y: 0.242 },
    { text: "F. Simvastatin G. Chloral H. Lidocaine", y: 0.594 },
    { text: "I. Formoterol J. Trandolapril", y: 0.913 },
    { text: BODY[i]!, y: 0.75 },
  ])));
  assert.equal(findFurniture(model).size, 0, "the answer bank survives intact");
  assert.equal(readingFlow(model).length, model.blocks.length, "every option still reaches consumers");
});

// ── what classification does and does not do ────────────────────────────────

test("🔴 CLASSIFIED IS NOT DELETED — the block survives and stays addressable", () => {
  const model = doc([0, 1, 2, 3].map((i) => page(i, [
    { text: "PHCY 2119 Syllabus", y: 0.04 },
    { text: BODY[i]!, y: 0.5 },
  ])));
  const furniture = documentFurniture(model);
  assert.equal(furniture.length, 4);
  assert.equal(furniture[0]!.where, "pageHeader");
  // Still in the model, with its geometry and its unit, so a citation resolves.
  assert.ok(model.blocks.some((b) => b.id === furniture[0]!.block.id));
  assert.ok(furniture[0]!.block.rect, "keeps its rectangle");
  assert.equal(furniture[0]!.block.text, "PHCY 2119 Syllabus", "and its exact text");
});

test("reading flow drops furniture and keeps every word of the body", () => {
  const model = doc([0, 1, 2, 3].map((i) => page(i, [
    { text: "PHCY 2119 Syllabus", y: 0.04 },
    { text: BODY[i]!, y: 0.5 },
    { text: `Page ${i + 1} of 4`, y: 0.96 },
  ])));
  const flow = readingFlow(model);
  assert.equal(flow.length, 4, "one body paragraph per page");
  for (let i = 0; i < 4; i += 1) {
    assert.ok(flow.some((b) => b.text === BODY[i]!));
  }
  // 🔴 And the whole document is still reachable — nothing was destroyed.
  assert.equal(model.blocks.length, 12);
});

// ── classifyFurniture: the label, and everything it must not touch ──────────

test("🔴 classification changes the KIND and nothing else", () => {
  const model = doc([0, 1, 2, 3].map((i) => page(i, [
    { text: "PHCY 2119 Syllabus", y: 0.04 },
    { text: BODY[i]!, y: 0.5 },
    { text: `Page ${i + 1} of 4`, y: 0.96 },
  ])));
  const after = classifyFurniture(model);

  assert.equal(after.blocks.length, model.blocks.length, "no block appears or disappears");
  for (let i = 0; i < model.blocks.length; i += 1) {
    const before = model.blocks[i]!;
    const now = after.blocks[i]!;
    assert.equal(now.id, before.id, "the id is the locator — it must survive");
    assert.equal(now.text, before.text, "content is never rewritten by a label");
    assert.deepEqual(now.rect, before.rect);
    assert.equal(now.unit, before.unit);
    assert.deepEqual(now.headingPath, before.headingPath);
  }
  assert.equal(after.blocks.filter((b) => b.kind === "pageHeader").length, 4);
  assert.equal(after.blocks.filter((b) => b.kind === "pageFooter").length, 4);
});

test("🔴 a table keeps its grid and is never relabelled furniture", () => {
  const table = { cells: [{ column: 0, row: 0, text: "Dose" }], headerRows: 0, rows: [["Dose"]] };
  const model = buildDocument({
    blocks: [0, 1, 2, 3].flatMap((i) => [
      { headingPath: [], kind: "table" as const, rect: { height: 0.02, width: 0.8, x: 0.1, y: 0.04 }, table, text: "", unit: i },
      { headingPath: [], kind: "paragraph" as const, rect: { height: 0.02, width: 0.8, x: 0.1, y: 0.5 }, text: BODY[i]!, unit: i },
    ]),
    format: "pdf",
    title: "T",
    units: [0, 1, 2, 3].map((i) => ({ index: i, kind: "page" as const })),
  });
  const after = classifyFurniture(model);
  const tables = after.blocks.filter((b) => b.kind === "table");
  assert.equal(tables.length, 4, "every table is still a table");
  for (const t of tables) assert.deepEqual(t.table, table, "and still carries its grid");
});

test("classification is idempotent — running it twice cannot drift", () => {
  const model = doc([0, 1, 2, 3].map((i) => page(i, [
    { text: "Running Title", y: 0.04 },
    { text: BODY[i]!, y: 0.5 },
  ])));
  const once = classifyFurniture(model);
  const twice = classifyFurniture(once);
  assert.deepEqual(twice.blocks.map((b) => b.kind), once.blocks.map((b) => b.kind));
});

test("a document with no furniture is returned unchanged, by identity", () => {
  const model = doc([0, 1, 2, 3].map((i) => page(i, [{ text: BODY[i]!, y: 0.5 }])));
  assert.equal(classifyFurniture(model), model, "no allocation when there is nothing to say");
});
