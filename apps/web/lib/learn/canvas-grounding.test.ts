import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocument, structureEnvelope, type DocumentModel } from "@nemesis/shared";

import {
  anchorInUnit,
  buildSourceContext,
  type CanonicalSourceAnchor,
  type SourceContext,
} from "@/lib/sources/source-context";

import {
  buildExcerpts,
  buildExcerptsFromModel,
  excerptsFromSourceContext,
  groundCanonicalAnchor,
  groundingBlock,
  quotedExcerpt,
} from "./canvas-grounding";
import type { CanvasSource } from "./canvas-model";

test("a plain run of paragraphs becomes numbered excerpts with stable ids", () => {
  const excerpts = buildExcerpts("s1", "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.");
  assert.deepEqual(excerpts.map((e) => e.id), ["s1:e1", "s1:e2", "s1:e3"]);
  assert.equal(excerpts[1]?.text, "Second paragraph.");
});

test("a heading the document actually had becomes the excerpt's label", () => {
  // The extractor writes "## Slide 12" for slide decks. That label is real, so we keep it.
  const excerpts = buildExcerpts("s1", "## Slide 12\n\nSodium rushes in.\n\n## Slide 13\n\nThen calcium.");
  assert.equal(excerpts[0]?.label, "Slide 12");
  assert.equal(excerpts[0]?.text, "Sodium rushes in.");
  assert.equal(excerpts[1]?.label, "Slide 13");
});

test("a label carries to every excerpt under the same heading", () => {
  const excerpts = buildExcerpts("s1", "## Slide 4\n\nOne.\n\nTwo.\n\n## Slide 5\n\nThree.");
  assert.deepEqual(excerpts.map((e) => e.label), ["Slide 4", "Slide 4", "Slide 5"]);
});

test("text with no headings gets no labels rather than invented ones", () => {
  // Nemesis cannot cite below file level today. Making up "Page 3" would be a lie.
  const excerpts = buildExcerpts("s1", "Just prose.\n\nMore prose.");
  assert.deepEqual(excerpts.map((e) => e.label), [null, null]);
});

test("a very long paragraph is split so one excerpt is never the whole document", () => {
  const excerpts = buildExcerpts("s1", "word ".repeat(3000));
  assert.ok(excerpts.length > 1);
  for (const excerpt of excerpts) assert.ok(excerpt.text.length <= 2400, `${excerpt.text.length}`);
});

test("a long paragraph is split on sentence boundaries, not mid-word", () => {
  const sentence = "This is a complete sentence about ion channels. ";
  const excerpts = buildExcerpts("s1", sentence.repeat(120));
  for (const excerpt of excerpts) assert.ok(/\.$/.test(excerpt.text.trim()), excerpt.text.slice(-40));
});

test("blank and whitespace-only stretches produce no empty excerpts", () => {
  const excerpts = buildExcerpts("s1", "One.\n\n\n\n   \n\n\nTwo.");
  assert.equal(excerpts.length, 2);
});

test("empty text yields no excerpts at all", () => {
  assert.deepEqual(buildExcerpts("s1", "   \n\n  "), []);
});

test("ids stay stable when the same text is split twice", () => {
  const text = "A.\n\nB.\n\nC.";
  assert.deepEqual(buildExcerpts("s1", text), buildExcerpts("s1", text));
});

// ------------------------------------------------------------ prompt assembly

const SOURCE: CanvasSource = {
  id: "s1",
  title: "Cardiac lecture.pdf",
  kind: "pdf",
  excerpts: [
    { id: "s1:e1", label: "Slide 1", text: "Sodium influx depolarises the cell." },
    { id: "s1:e2", label: "Slide 2", text: "Calcium sustains the plateau." },
  ],
};

test("the grounding block tags every excerpt with the id the model must cite", () => {
  const text = groundingBlock([SOURCE]);
  assert.match(text, /\[s1:e1\]/);
  assert.match(text, /\[s1:e2\]/);
  assert.match(text, /Sodium influx depolarises the cell\./);
});

test("the grounding block names the source so the model knows what it is reading", () => {
  assert.match(groundingBlock([SOURCE]), /Cardiac lecture\.pdf/);
});

test("the grounding block includes the label the document gave the excerpt", () => {
  assert.match(groundingBlock([SOURCE]), /Slide 2/);
});

test("a half-read document says so in the grounding block", () => {
  // Otherwise the model reasons confidently from an absence and nobody can tell.
  const partial: CanvasSource = { ...SOURCE, coverageNote: "40 of 300 pages could be read." };
  assert.match(groundingBlock([partial]), /40 of 300 pages/);
});

test("no sources yields an empty grounding block, not a fake one", () => {
  assert.equal(groundingBlock([]), "");
});

test("grounding is capped so one enormous lecture cannot blow the context budget", () => {
  const huge: CanvasSource = {
    ...SOURCE,
    excerpts: Array.from({ length: 5000 }, (_, i) => ({
      id: `s1:e${i + 1}`,
      label: null,
      text: "A sentence about the heart that is reasonably long.",
    })),
  };
  const text = groundingBlock([huge]);
  assert.ok(text.length <= 130_000, `${text.length}`);
  assert.match(text, /not included/i);
});

test("quotedExcerpt returns the real text behind a citation", () => {
  const found = quotedExcerpt([SOURCE], { sourceId: "s1", excerptId: "s1:e2" });
  assert.equal(found?.excerpt.text, "Calcium sustains the plateau.");
  assert.equal(found?.source.title, "Cardiac lecture.pdf");
});

test("a citation pointing at nothing resolves to nothing rather than a plausible guess", () => {
  assert.equal(quotedExcerpt([SOURCE], { sourceId: "s1", excerptId: "s1:e99" }), null);
  assert.equal(quotedExcerpt([SOURCE], { sourceId: "s9", excerptId: "s1:e1" }), null);
});

// ── buildExcerptsFromModel ──────────────────────────────────────────────────
// The structural path. Everything below is something the text path gets WRONG,
// which is the reason this function exists.

/** A page holding a real grid, the shape a dosing chart or a grading rubric arrives in. */
function withTable() {
  return buildDocument({
    format: "pdf",
    title: "Syllabus",
    units: [{ index: 0, kind: "page" }],
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Grading", unit: 0 },
      {
        headingPath: ["Grading"],
        kind: "table",
        table: { headerRows: 1, rows: [["Component", "Weight"], ["Exams", "60%"], ["Labs", "40%"]] },
        text: "",
        unit: 0,
      },
      { headingPath: ["Grading"], kind: "paragraph", text: "Late work loses 10%.", unit: 0 },
    ],
  });
}

test("a table is exactly one excerpt, never split into pipe-soup", () => {
  // 🔴 THE DEFECT THIS REPLACES. The text path renders the grid to markdown and then
  // splits on blank lines, so a rubric reached the lesson as loose lines of "|" and a
  // citation could point at a row separated from its own headers.
  const excerpts = buildExcerptsFromModel("s1", withTable());
  const tables = excerpts.filter((e) => e.text.includes("| Exams | 60% |"));
  assert.equal(tables.length, 1, "the grid is one excerpt");
  assert.ok(tables[0]?.text.includes("| Component | Weight |"), "its headers travel with it");
  assert.ok(tables[0]?.text.includes("| Labs | 40% |"), "and so does every row");
});

test("a heading becomes the label of what follows, not an excerpt of its own", () => {
  const excerpts = buildExcerptsFromModel("s1", withTable());
  assert.ok(!excerpts.some((e) => e.text === "# Grading"), "the heading is not quotable");
  assert.deepEqual(excerpts.map((e) => e.label), ["Grading", "Grading"]);
});

test("ids are assigned in reading order, exactly like the text path", () => {
  const excerpts = buildExcerptsFromModel("s1", withTable());
  assert.deepEqual(excerpts.map((e) => e.id), ["s1:e1", "s1:e2"]);
});

test("a figure nobody looked at is not offered as evidence", () => {
  // `blockToText` renders it as the literal "[Figure — not examined]". The text path
  // turned that into a citable excerpt, so a model could cite OUR OWN disclosure as
  // though it were the document's content. Coverage already reports the gap.
  const model = buildDocument({
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
    blocks: [
      { figure: {}, headingPath: [], kind: "figure", text: "", unit: 0 },
      { headingPath: [], kind: "paragraph", text: "Real prose.", unit: 0 },
    ],
  });
  const excerpts = buildExcerptsFromModel("s1", model);
  assert.equal(excerpts.length, 1);
  assert.equal(excerpts[0]?.text, "Real prose.");
});

test("a figure someone described IS evidence, and stays marked as a figure", () => {
  const model = buildDocument({
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
    blocks: [
      {
        figure: { description: "A nephron, labelled." },
        headingPath: [],
        kind: "figure",
        text: "Figure 2",
        unit: 0,
      },
    ],
  });
  const excerpts = buildExcerptsFromModel("s1", model);
  assert.equal(excerpts.length, 1);
  assert.ok(excerpts[0]?.text.startsWith("[Figure: Figure 2]"), "the caption is the document's");
  assert.ok(excerpts[0]?.text.includes("A nephron, labelled."), "the description is kept apart");
});

test("a unit's own name labels a block that sits under no heading", () => {
  const model = buildDocument({
    format: "pptx",
    title: "Deck",
    units: [{ index: 0, kind: "slide", label: "Clearance" }],
    blocks: [{ headingPath: [], kind: "paragraph", text: "GFR falls with age.", unit: 0 }],
  });
  assert.equal(buildExcerptsFromModel("s1", model)[0]?.label, "Clearance");
});

test("nothing is labelled when the document said nothing — a label is never invented", () => {
  const model = buildDocument({
    format: "docx",
    title: null,
    units: [{ index: 0, kind: "body" }],
    blocks: [{ headingPath: [], kind: "paragraph", text: "Loose prose.", unit: 0 }],
  });
  assert.equal(buildExcerptsFromModel("s1", model)[0]?.label, null);
});

test("the innermost heading wins, because that is where the block actually sits", () => {
  const model = buildDocument({
    format: "docx",
    title: null,
    units: [{ index: 0, kind: "body" }],
    blocks: [
      { headingPath: ["Contracts", "Consideration"], kind: "paragraph", text: "A promise.", unit: 0 },
    ],
  });
  assert.equal(buildExcerptsFromModel("s1", model)[0]?.label, "Consideration");
});

test("an over-long paragraph still splits on sentences, as it always did", () => {
  const long = `${"This is a full sentence about renal clearance. ".repeat(90)}`;
  const model = buildDocument({
    format: "docx",
    title: null,
    units: [{ index: 0, kind: "body" }],
    blocks: [{ headingPath: [], kind: "paragraph", text: long, unit: 0 }],
  });
  const excerpts = buildExcerptsFromModel("s1", model);
  assert.ok(excerpts.length > 1, "it was split");
  assert.ok(excerpts.every((e) => e.text.length <= 2400), "and every piece is quotable");
});

test("an oversized table is still not split — a partial grid is a different grid", () => {
  const rows = [["Drug", "Dose"], ...Array.from({ length: 400 }, (_, i) => [`Drug ${i}`, `${i} mg`])];
  const model = buildDocument({
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
    blocks: [{ headingPath: [], kind: "table", table: { headerRows: 1, rows }, text: "", unit: 0 }],
  });
  const excerpts = buildExcerptsFromModel("s1", model);
  assert.equal(excerpts.length, 1);
  assert.ok(excerpts[0]!.text.length > 2400, "kept whole even well past the excerpt ceiling");
});

test("empty blocks contribute nothing rather than an empty excerpt", () => {
  const model = buildDocument({
    format: "docx",
    title: null,
    units: [{ index: 0, kind: "body" }],
    blocks: [
      { headingPath: [], kind: "paragraph", text: "   ", unit: 0 },
      { headingPath: [], kind: "paragraph", text: "Real.", unit: 0 },
    ],
  });
  assert.deepEqual(buildExcerptsFromModel("s1", model).map((e) => e.text), ["Real."]);
});

// ── excerptsFromSourceContext + groundCanonicalAnchor ───────────────────────

function storedStructure(m?: DocumentModel, text = "Some words.") {
  return JSON.parse(JSON.stringify(structureEnvelope({ model: m, text, title: "A document" })));
}

function contextOf(m?: DocumentModel, text?: string): SourceContext {
  return buildSourceContext({ sourceId: "lib-1", sourceKind: "pdf", structure: storedStructure(m, text) });
}

const TERMS: string[][] = [["Term", "Definition"], ["Stomata", "Pores in a leaf surface."]];

function courseModel(): DocumentModel {
  return {
    blocks: [
      { headingPath: [], id: "h1", kind: "heading", text: "Key Terms", unit: 0 },
      { headingPath: ["Key Terms"], id: "t1", kind: "table", table: { headerRows: 1, rows: TERMS }, text: "", unit: 0 },
      { headingPath: ["Key Terms"], id: "p1", kind: "paragraph", text: "Learn these terms.", unit: 0 },
    ],
    format: "pdf",
    title: "A document",
    units: [{ index: 0, kind: "page" }],
  };
}

test("the canonical path builds the same excerpt shape the model path does", () => {
  const excerpts = excerptsFromSourceContext("s1", contextOf(courseModel()));
  assert.deepEqual(excerpts.map((e) => e.id), ["s1:e1", "s1:e2"]);
  assert.equal(excerpts.every((e) => e.label === "Key Terms"), true);
});

test("a table crosses the canonical path whole, with its cells intact", () => {
  const excerpts = excerptsFromSourceContext("s1", contextOf(courseModel()));
  assert.match(excerpts[0]!.text, /Stomata/);
  assert.match(excerpts[0]!.text, /Pores in a leaf surface/);
  // 🔴 One excerpt, not one per row. A grid with some of its rows is a different grid.
  assert.equal(excerpts.filter((e) => e.text.includes("Stomata")).length, 1);
});

test("every canonical excerpt remembers which unit it was cut from", () => {
  const excerpts = excerptsFromSourceContext("s1", contextOf(courseModel()));
  assert.deepEqual(excerpts.map((e) => e.unitId), ["t1", "p1"]);
});

test("a legacy text-only source still produces excerpts, with no unit identity to fake", () => {
  const excerpts = excerptsFromSourceContext("s1", contextOf(undefined, "One paragraph of prose."));
  assert.equal(excerpts.length, 1);
  assert.equal(excerpts[0]!.unitId, "u0");
  assert.equal(excerpts[0]!.label, null);
});

// ── the anchor → citation bridge ────────────────────────────────────────────

function canvasSourceFrom(context: SourceContext): CanvasSource {
  return {
    excerpts: excerptsFromSourceContext("s1", context),
    id: "s1",
    kind: "pdf",
    librarySourceId: "lib-1",
    title: "A document",
  };
}

test("a canonical anchor resolves to the canvas citation for the same text", () => {
  const context = contextOf(courseModel());
  const source = canvasSourceFrom(context);
  const unit = context.units.find((u) => u.id === "p1")!;
  const ref = groundCanonicalAnchor([source], anchorInUnit(unit, "Learn these terms."));
  assert.deepEqual(ref, { excerptId: "s1:e2", sourceId: "s1" });
});

test("an anchor from a DIFFERENT document does not resolve against this canvas", () => {
  // 🔴 THE DEFECT THIS PINS. Every canvas calls its first attachment "s1". Matching an anchor on
  // the canvas-local id instead of the durable one would resolve an anchor from someone else's
  // lecture to real text in this one — a citation that passes every check and points at the
  // wrong document. Change `librarySourceId` to `id` in groundCanonicalAnchor and this fails.
  const context = contextOf(courseModel());
  const source = canvasSourceFrom(context);
  const unit = context.units.find((u) => u.id === "p1")!;
  const foreign = { ...anchorInUnit(unit, "Learn these terms."), sourceId: "lib-OTHER" };
  assert.equal(groundCanonicalAnchor([source], foreign), null);
});

test("an anchor whose quote no longer exists yields no citation rather than a plausible one", () => {
  const source = canvasSourceFrom(contextOf(courseModel()));
  const gone: CanonicalSourceAnchor = {
    quote: { exact: "a sentence a better parser removed" },
    sourceId: "lib-1",
    unitId: "p1",
  };
  assert.equal(groundCanonicalAnchor([source], gone), null);
});

test("a source that was never filed cannot be cited canonically at all", () => {
  const unfiled: CanvasSource = { ...canvasSourceFrom(contextOf(courseModel())), librarySourceId: undefined };
  assert.equal(groundCanonicalAnchor([unfiled], { sourceId: "lib-1", unitId: "p1" }), null);
});
