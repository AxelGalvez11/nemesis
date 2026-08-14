import assert from "node:assert/strict";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext, type SourceContext } from "@/lib/sources/source-context";

import { EXTRACTION_VERSION, extractKnowledgeObjects } from "./knowledge-extraction";
import { knowledgeIdentityKey } from "./knowledge-identity";

function stored(model?: DocumentModel, text = "Some words.") {
  return JSON.parse(JSON.stringify(structureEnvelope({ model, text, title: "A document" })));
}

function contextOf(model?: DocumentModel, text?: string): SourceContext {
  return buildSourceContext({ sourceId: "lib-1", sourceKind: "pdf", structure: stored(model, text) });
}

function modelOf(blocks: Partial<DocBlock>[], units = 1): DocumentModel {
  return {
    blocks: blocks.map((b, i) => ({ headingPath: [], id: `b${i}`, kind: "paragraph", text: "", unit: 0, ...b }) as DocBlock),
    format: "pdf",
    title: "A document",
    units: Array.from({ length: units }, (_, index) => ({ index, kind: "page" as const })),
  };
}

const GLOSSARY = [
  ["Term", "Definition"],
  ["Photosynthesis", "Conversion of light energy into chemical energy stored as sugar."],
  ["Chlorophyll", "Pigment that absorbs light, mostly in the blue and red wavelengths."],
  ["Stomata", "Pores in a leaf surface that let carbon dioxide in and water vapour out."],
];

function glossaryContext(rows = GLOSSARY, headerRows = 1): SourceContext {
  return contextOf(modelOf([
    { id: "h1", kind: "heading", text: "Key Terms" },
    { headingPath: ["Key Terms"], id: "t1", kind: "table", table: { headerRows, rows }, text: "" },
  ]));
}

// ── the working case ────────────────────────────────────────────────────────

test("a two-column glossary yields one association per data row", () => {
  const { objects, refusals } = extractKnowledgeObjects(glossaryContext());
  assert.equal(objects.length, 3);
  assert.deepEqual(refusals, []);
  assert.deepEqual(objects.map((o) => o.pair?.left), ["Photosynthesis", "Chlorophyll", "Stomata"]);
});

test("the header row is not learned as a pair", () => {
  const { objects } = extractKnowledgeObjects(glossaryContext());
  assert.equal(objects.some((o) => o.pair?.left === "Term"), false);
});

test("a grid that states no header rows keeps every row, rather than guessing one away", () => {
  // 🔴 A grid whose first row is data is common, and promoting it to a header on a hunch silently
  // deletes a real pair from every one of them.
  const { objects } = extractKnowledgeObjects(glossaryContext(GLOSSARY.slice(1), 0));
  assert.equal(objects.length, 3);
});

test("every object says it came from a table row, and under which rules", () => {
  const { objects } = extractKnowledgeObjects(glossaryContext());
  assert.equal(objects.every((o) => o.derivation === "table-row"), true);
  assert.equal(objects.every((o) => o.extractionVersion === EXTRACTION_VERSION), true);
});

test("every object carries a durable anchor, not a canvas citation", () => {
  const { objects } = extractKnowledgeObjects(glossaryContext());
  const anchor = objects[0]!.sourceAnchors?.[0];
  assert.equal(anchor?.sourceId, "lib-1");
  assert.equal(anchor?.unitId, "t1");
  assert.equal(anchor?.page, 1);
  assert.equal(anchor?.quote?.exact, "Photosynthesis");
  assert.equal(objects[0]!.sourceRefs, undefined, "a canvas-local ref would be meaningless here");
});

test("two rows of one table anchor to two different places", () => {
  const { objects } = extractKnowledgeObjects(glossaryContext());
  const quotes = objects.map((o) => o.sourceAnchors?.[0]?.quote?.exact);
  assert.equal(new Set(quotes).size, 3);
});

test("the section a grid sat under groups its items during first encoding", () => {
  const { objects } = extractKnowledgeObjects(glossaryContext());
  assert.equal(objects.every((o) => o.pair?.groupLabel === "Key Terms"), true);
});

test("identity is content-derived, so the same glossary in another document converges", () => {
  const { objects } = extractKnowledgeObjects(glossaryContext());
  // Same rows, different source id, different unit ids, different page.
  const elsewhere = buildSourceContext({
    sourceId: "lib-OTHER",
    sourceKind: "docx",
    structure: stored(modelOf([
      { id: "z9", kind: "paragraph", text: "Unrelated opening paragraph.", unit: 3 },
      { headingPath: ["Glossary"], id: "z10", kind: "table", table: { headerRows: 1, rows: GLOSSARY }, text: "", unit: 3 },
    ], 4)),
  });
  const second = extractKnowledgeObjects(elsewhere);
  assert.deepEqual(second.objects.map((o) => o.identityKey), objects.map((o) => o.identityKey));
  // …while the anchors correctly disagree, because they are about the documents.
  assert.notEqual(second.objects[0]!.sourceAnchors?.[0]?.sourceId, objects[0]!.sourceAnchors?.[0]?.sourceId);
});

test("the stored key is the one knowledge-identity computes", () => {
  const { objects } = extractKnowledgeObjects(glossaryContext());
  assert.equal(objects[0]!.identityKey, knowledgeIdentityKey(objects[0]!));
});

// ── the refusals, each measured against a real failure ──────────────────────

test("a document whose table was flattened says SO, rather than reporting nothing to learn", () => {
  // 🔴 THE ACCEPTANCE DOCUMENT'S REAL PRODUCTION SHAPE. Its ruled table came back as one run-on
  // paragraph — "Term Definition Photosynthesis Conversion of light energy…" — with no delimiter
  // anywhere. Zero objects is the correct answer; zero objects with no reason is not, because the
  // caller could not then tell "this teaches no pairs" from "our parser lost the grid".
  const flattened = contextOf(modelOf([
    { id: "h1", kind: "heading", text: "Key Terms" },
    {
      headingPath: ["Key Terms"],
      id: "p1",
      kind: "paragraph",
      text: "Key Terms Learn these three terms and what each one does. Term Definition Photosynthesis Conversion of light energy into chemical energy stored as sugar. Chlorophyll Pigment that absorbs light.",
    },
  ]));
  const { objects, refusals } = extractKnowledgeObjects(flattened);
  assert.deepEqual(objects, []);
  assert.equal(refusals[0]?.reason, "no-tables");
});

test("a delimiter in prose is never read as an association", () => {
  // 🔴 MEASURED, NOT IMAGINED. These are real lines from production documents. An extractor that
  // read "X: Y" out of prose would mint every one of them as something to drill a student on.
  const prose = contextOf(modelOf([
    { id: "p1", kind: "paragraph", text: "Memphis: 102\nNashville: A209\nFriday Link: https://example.zoom.us/j/82138988688" },
    { id: "p2", kind: "paragraph", text: "93 – 100 A 77 – 79.99 C+ 90 – 92.99 A- 73 – 76.99 C" },
  ]));
  assert.deepEqual(extractKnowledgeObjects(prose).objects, []);
});

test("a legacy text-only parse reports a degraded parse, not an empty document", () => {
  const { objects, refusals } = extractKnowledgeObjects(contextOf(undefined, "Plenty of prose, no structure."));
  assert.deepEqual(objects, []);
  assert.equal(refusals[0]?.reason, "degraded-parse");
});

test("a three-column schedule is refused rather than sliced into pairs", () => {
  // 🔴 Column 1 beside column 2 here would be "8-17 ↔ Exam 1" — a calendar entry wearing an
  // association's clothes, which a student would then be drilled on as though it were knowledge.
  //
  // 🔴 THREE DATA ROWS, DELIBERATELY. This test used to carry ONE, and one row is refused by a
  // weaker rule that has nothing to do with schedules — `subjectColumnOf` declines any grid whose
  // single row makes every column trivially distinct. It therefore went green while proving
  // nothing about calendars. Three rows put it on the rule it names.
  //
  // 🔴 AND THE REASON CHANGED FROM `table-not-pairs` TO `table-no-subject` WITHOUT THE BEHAVIOUR
  // CHANGING. The old reason meant "this lane only reads two columns" — a fact about the
  // extractor, which is no longer true now that wider grids are read. The new one means "this grid
  // is keyed by a date, so nothing says what a row is about" — a fact about the document.
  const schedule = contextOf(modelOf([{
    id: "t1",
    kind: "table",
    table: {
      headerRows: 1,
      rows: [
        ["Date", "Topic", "Room"],
        ["8-17", "Exam 1", "Memphis 102"],
        ["8-24", "Lecture 4", "Memphis 102"],
        ["8-31", "Lab 2", "Memphis 118"],
      ],
    },
    text: "",
  }]));
  const { objects, refusals } = extractKnowledgeObjects(schedule);
  assert.deepEqual(objects, []);
  assert.equal(refusals[0]?.reason, "table-no-subject");
  assert.equal(refusals[0]?.unitId, "t1");
});

test("🔴 a wide grid of things and their properties becomes one relation per column", () => {
  // The shape that produced 0 knowledge objects from 561 candidate facts.
  const chart = contextOf(modelOf([{
    id: "t9",
    kind: "table",
    table: {
      headerRows: 1,
      rows: [
        ["Drug", "Class", "Indication", "Adverse effect"],
        ["lisinopril", "ACE inhibitor", "hypertension", "cough"],
        ["losartan", "ARB", "hypertension", "dizziness"],
        ["metoprolol", "beta blocker", "angina", "fatigue"],
      ],
    },
    text: "",
  }]));
  const { objects, refusals } = extractKnowledgeObjects(chart);

  // Three rows × three non-subject columns.
  assert.equal(objects.length, 9);
  assert.deepEqual(refusals, []);

  const lisinopril = objects.filter((o) => o.pair?.left === "lisinopril");
  assert.equal(lisinopril.length, 3);
  assert.deepEqual(
    lisinopril.map((o) => o.pair?.right).sort(),
    ["ACE inhibitor", "cough", "hypertension"],
  );

  // 🔴 THE SOURCE'S OWN WORD NAMES THE RELATION — `class`, never `is_a` (owner, 2026-08-14).
  const klass = lisinopril.find((o) => o.pair?.right === "ACE inhibitor");
  assert.equal(klass?.pair?.leftRole, "drug");
  assert.equal(klass?.pair?.rightRole, "class");
  assert.equal(klass?.relationKind, "class|drug");
  assert.match(klass?.statement ?? "", /^lisinopril — Class: ACE inhibitor$/);

  // 🔴 Each relation is its OWN object with its own identity, so a learner can hold the class
  // without the adverse effect. Nine relations, nine distinct identity keys.
  assert.equal(new Set(objects.map((o) => o.identityKey)).size, 9);
  assert.equal(new Set(objects.map((o) => o.id)).size, 9);
  // Every one of them anchored back to the document.
  assert.ok(objects.every((o) => (o.sourceAnchors?.length ?? 0) > 0));
});

test("a two-column grid of empty or essay-length cells is refused with its own reason", () => {
  const unusable = contextOf(modelOf([{
    id: "t1",
    kind: "table",
    table: { headerRows: 1, rows: [["A", "B"], ["", "orphan"], ["x".repeat(900), "y"], ["same", "same"]] },
    text: "",
  }]));
  const { objects, refusals } = extractKnowledgeObjects(unusable);
  assert.deepEqual(objects, []);
  assert.equal(refusals[0]?.reason, "table-rows-unusable");
});

test("one bad grid does not cost a good one its pairs", () => {
  const mixed = contextOf(modelOf([
    { id: "t1", kind: "table", table: { headerRows: 1, rows: [["Date", "Topic", "Room"], ["8-17", "Exam 1", "102"]] }, text: "" },
    { id: "t2", kind: "table", table: { headerRows: 1, rows: GLOSSARY }, text: "" },
  ]));
  const { objects, refusals } = extractKnowledgeObjects(mixed);
  assert.equal(objects.length, 3);
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0]?.unitId, "t1");
});

// ── zero is a successful result, and says so ────────────────────────────────

test("🔴 a structured document with no grid is COMPLETE with a count of zero", () => {
  const noGrid = contextOf(modelOf([{ id: "p1", kind: "paragraph", text: "Prose only." }]));
  const result = extractKnowledgeObjects(noGrid);
  assert.equal(result.outcome, "complete");
  assert.equal(result.objects.length, 0);
  assert.equal(result.refusals[0]?.reason, "no-tables");
});

test("🔴 a flattened parse is DEGRADED, not complete — its grids may well have existed", () => {
  const result = extractKnowledgeObjects(contextOf(undefined, "Flat text, no structure."));
  assert.equal(result.outcome, "degraded");
  assert.equal(result.objects.length, 0);
});

test("an unreadable parse is FAILED, which is neither of the above", () => {
  const result = extractKnowledgeObjects(buildSourceContext({ sourceId: "s", sourceKind: "pdf", structure: null }));
  assert.equal(result.outcome, "failed");
});

test("a grid this lane refuses does not make the extraction incomplete", () => {
  // The three-column refusal is a statement about one table's shape, not evidence that structure
  // was lost. Reporting it as degraded would send someone hunting a parser bug that isn't there.
  const schedule = contextOf(modelOf([{
    id: "t1", kind: "table",
    table: { headerRows: 1, rows: [["Date", "Topic", "Room"], ["8-17", "Exam 1", "102"]] },
    text: "",
  }]));
  assert.equal(extractKnowledgeObjects(schedule).outcome, "complete");
});

// ── the relation the grid declared about itself ─────────────────────────────

test("a headed grid records what it called its own columns", () => {
  const { objects } = extractKnowledgeObjects(glossaryContext());
  assert.equal(objects.every((o) => o.relationKind === "definition|term"), true);
});

test("a grid that stated no header states no relationship rather than inventing one", () => {
  const { objects } = extractKnowledgeObjects(glossaryContext(GLOSSARY.slice(1), 0));
  assert.equal(objects.every((o) => o.relationKind === undefined), true);
});

// ── a table that ran across a page break ────────────────────────────────────

test("🔴 a continuation fragment inherits the relationship its first page printed", () => {
  // A real glossary prints "Generic | Brand" once and then runs for pages that repeat none of it.
  // Those fragments have headerRows: 0. Reading only the header row would leave them `unstated`,
  // unable to converge with the fragment that DID name the columns — the same table failing to
  // recognise itself. Delete the `content.columns` lookup and this goes red.
  const continuation = contextOf(modelOf([{
    id: "t1",
    kind: "table",
    table: {
      columns: ["Generic", "Brand"],
      headerRows: 0,
      headerSource: "inherited",
      rows: [["losartan", "Cozaar"], ["valsartan", "Diovan"]],
    },
    text: "",
  }]));
  const { objects } = extractKnowledgeObjects(continuation);
  assert.equal(objects.length, 2);
  assert.equal(objects.every((o) => o.relationKind === "brand|generic"), true);
});

test("a fragment with printed columns and one that inherited them are the same knowledge", () => {
  const printed = extractKnowledgeObjects(contextOf(modelOf([{
    id: "t1", kind: "table", text: "",
    table: { columns: ["Generic", "Brand"], headerRows: 1, headerSource: "present", rows: [["Generic", "Brand"], ["losartan", "Cozaar"]] },
  }])));
  const inherited = extractKnowledgeObjects(contextOf(modelOf([{
    id: "t9", kind: "table", text: "",
    table: { columns: ["Generic", "Brand"], headerRows: 0, headerSource: "inherited", rows: [["losartan", "Cozaar"]] },
  }])));
  assert.equal(printed.objects[0]!.identityKey, inherited.objects[0]!.identityKey);
});
