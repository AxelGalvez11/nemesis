import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dateFacts,
  definitionFacts,
  extractFacts,
  inventoryFacts,
  outlineFacts,
  procedureFacts,
  splitDefinition,
  weightingFacts,
} from "./document-facts.ts";
import { buildDocument, type DocBlock, type DocumentModel } from "./document-model.ts";

function doc(blocks: readonly Omit<DocBlock, "id">[]): DocumentModel {
  return buildDocument({ blocks, format: "docx", title: null, units: [{ index: 0, kind: "body" }] });
}

const para = (text: string, headingPath: string[] = []): Omit<DocBlock, "id"> => ({
  headingPath,
  kind: "paragraph",
  text,
  unit: 0,
});

const step = (text: string, marker: string, headingPath: string[] = []): Omit<DocBlock, "id"> => ({
  depth: 0,
  headingPath,
  kind: "listItem",
  marker,
  text,
  unit: 0,
});

const table = (
  rows: string[][],
  headerRows = 1,
  headingPath: string[] = [],
): Omit<DocBlock, "id"> => ({
  headingPath,
  kind: "table",
  table: { headerRows, rows },
  text: "",
  unit: 0,
});

// ══════════════════════════════════════════════════════════════════════════
// 🔴 THE TEST THE WHOLE FILE EXISTS TO PASS.
//
// Two documents from unrelated fields sharing no vocabulary at all. If any
// extractor needed subject words, one of these would come back empty — and it
// would be the one nobody on this project thought to write a fixture for.
// ══════════════════════════════════════════════════════════════════════════

const lawSyllabus = doc([
  { headingPath: [], kind: "heading", level: 1, text: "Contract Law", unit: 0 },
  { headingPath: ["Contract Law"], kind: "heading", level: 2, text: "Assessment", unit: 0 },
  table(
    [
      ["Component", "Weight"],
      ["Moot court", "30%"],
      ["Case note", "20%"],
      ["Final paper", "50%"],
    ],
    1,
    ["Contract Law", "Assessment"],
  ),
  para("The final paper is due 14 August 2026.", ["Contract Law", "Assessment"]),
  { headingPath: ["Contract Law"], kind: "heading", level: 2, text: "Key Terms", unit: 0 },
  para("Estoppel — a bar preventing a party from asserting a fact inconsistent with an earlier position.", ["Contract Law", "Key Terms"]),
  para("Consideration — something of value exchanged by each party to make a promise binding.", ["Contract Law", "Key Terms"]),
  para("Rescission — the unmaking of a contract, returning the parties to their prior positions.", ["Contract Law", "Key Terms"]),
  step("Identify the offer and its terms.", "1.", ["Contract Law", "Key Terms"]),
  step("Establish whether acceptance was communicated.", "2.", ["Contract Law", "Key Terms"]),
  step("Test the consideration for sufficiency.", "3.", ["Contract Law", "Key Terms"]),
]);

const weldingManual = doc([
  { headingPath: [], kind: "heading", level: 1, text: "Shielded Metal Arc Welding", unit: 0 },
  { headingPath: ["Shielded Metal Arc Welding"], kind: "heading", level: 2, text: "Marking Scheme", unit: 0 },
  table(
    [
      ["Criterion", "Share"],
      ["Bead profile", "40%"],
      ["Penetration", "35%"],
      ["Housekeeping", "25%"],
    ],
    1,
    ["Shielded Metal Arc Welding", "Marking Scheme"],
  ),
  para("Practical assessment takes place on 2026-09-03.", ["Shielded Metal Arc Welding", "Marking Scheme"]),
  { headingPath: ["Shielded Metal Arc Welding"], kind: "heading", level: 2, text: "Glossary", unit: 0 },
  para("Undercut — a groove melted into the base metal beside the weld and left unfilled.", ["Shielded Metal Arc Welding", "Glossary"]),
  para("Kerf — the width of material removed by a cutting or grinding process.", ["Shielded Metal Arc Welding", "Glossary"]),
  para("Porosity — cavities formed by gas that was trapped during solidification.", ["Shielded Metal Arc Welding", "Glossary"]),
  step("Clean the joint down to bright metal.", "1.", ["Shielded Metal Arc Welding", "Glossary"]),
  step("Set the amperage for the electrode diameter.", "2.", ["Shielded Metal Arc Welding", "Glossary"]),
  step("Strike the arc and hold a short arc length.", "3.", ["Shielded Metal Arc Welding", "Glossary"]),
]);

for (const [name, sample] of [["a law syllabus", lawSyllabus], ["a welding manual", weldingManual]] as const) {
  test(`every extractor works on ${name} with no shared vocabulary`, () => {
    assert.equal(outlineFacts(sample).length, 3, "headings");
    assert.equal(definitionFacts(sample).length, 3, "a run of term-and-gloss lines");
    assert.equal(procedureFacts(sample).length, 1, "one numbered run");
    assert.equal(dateFacts(sample).length, 1, "one date");
    assert.equal(weightingFacts(sample).length, 1, "one scheme summing to 100");
  });
}

// 🔴 THE LABEL COMES FROM THE DOCUMENT, NOT FROM US.
// "Assessment" and "Marking Scheme" are the same shape and different words, and
// nothing in the code knows either of them.
test("a weighting is labelled by whatever the document called its section", () => {
  assert.deepEqual(weightingFacts(lawSyllabus)[0]!.headingPath, ["Contract Law", "Assessment"]);
  assert.deepEqual(weightingFacts(weldingManual)[0]!.headingPath, [
    "Shielded Metal Arc Welding",
    "Marking Scheme",
  ]);
});

test("a weighting reports its parts and what they sum to", () => {
  const [weighting] = weightingFacts(weldingManual);
  assert.equal(weighting!.total, 100);
  assert.deepEqual(weighting!.weights, [
    { label: "Bead profile", percent: 40 },
    { label: "Penetration", percent: 35 },
    { label: "Housekeeping", percent: 25 },
  ]);
});

test("a table of numbers that do not add up to a whole is not a weighting", () => {
  const sample = doc([table([["Item", "Count"], ["Rods", "12%"], ["Plates", "4%"]])]);
  assert.deepEqual(weightingFacts(sample), []);
});

test("a bare number is not a share", () => {
  const sample = doc([table([["Part", "Value"], ["A", "60"], ["B", "40"]])]);
  assert.deepEqual(weightingFacts(sample), []);
});

// ── Definitions ───────────────────────────────────────────────────────────

test("a label, a dash and a gloss make a definition", () => {
  assert.deepEqual(splitDefinition("Torque — the rotational equivalent of linear force."), {
    meaning: "the rotational equivalent of linear force.",
    term: "Torque",
  });
  assert.deepEqual(splitDefinition("Res judicata - a matter already judged may not be relitigated."), {
    meaning: "a matter already judged may not be relitigated.",
    term: "Res judicata",
  });
});

// 🔴 THE COLON WAS SUPPORTED AND WAS REMOVED ON EVIDENCE, NOT ON TASTE.
// Across 124 real course documents it produced 925 "definitions", roughly four
// in five of which were form fields, worksheet prompts or case-study labels.
// This test exists so the colon cannot be quietly reinstated by someone who
// notices a glossary it would have caught.
test("a colon is not a definition separator", () => {
  assert.equal(splitDefinition("LinkedIn: linkedin.com/in/somebody-with-a-long-handle"), null);
  assert.equal(splitDefinition("Question #1: What are the two main problems listed?"), null);
  assert.equal(splitDefinition("Res judicata: a matter already judged may not be relitigated."), null);
});

// 🔴 AN ENUMERATOR IS A POSITION IN A LIST WEARING A TERM'S SHAPE.
test("a numeric item label is not a term", () => {
  assert.equal(splitDefinition("5) Relief of itch — topical local anaesthetics are used"), null);
  assert.equal(splitDefinition("Question #3 — what counselling points apply to this case"), null);
  assert.equal(splitDefinition("Step 4. Confirm identity — ask for name and date of birth"), null);
});

// 🔴 A KNOWN, DELIBERATE GAP, RECORDED SO IT IS NOT MISTAKEN FOR AN OVERSIGHT.
// A trailing letter — "Answer D", "Option B" — is an enumerator too, and is NOT
// rejected here. Rejecting a trailing single capital would also throw away
// "Vitamin D", "Hepatitis B" and "Grade A", which are real terms in real
// disciplines. The run rule is what handles answer options in practice, since
// they arrive as a run only when the whole set does.
test("a trailing letter is left alone, because real terms end that way too", () => {
  assert.ok(splitDefinition("Vitamin D — a fat-soluble vitamin the skin makes from sunlight"));
});

// A prompt is not a meaning; turning one into a definition answers it with itself.
test("a gloss that is a question is not a meaning", () => {
  assert.equal(
    splitDefinition("Understanding — what did your doctor tell you this is for?"),
    null,
  );
});

// 🔴 A GLOSSARY IS A LIST. One dashed line in prose is an aside; three siblings
// sharing the shape under one heading is a glossary. This is what took real-file
// precision from roughly one in four to a clear majority.
test("a single dashed line is not a glossary, three consecutive ones are", () => {
  const one = doc([para("Torque — the rotational equivalent of linear force applied.")]);
  assert.deepEqual(definitionFacts(one), []);

  const three = doc([
    para("Torque — the rotational equivalent of linear force applied."),
    para("Moment — the turning effect produced about a chosen point."),
    para("Couple — two equal opposite forces producing rotation only."),
  ]);
  assert.equal(definitionFacts(three).length, 3);
});

test("a run is broken by a move to another section", () => {
  const sample = doc([
    para("Torque — the rotational equivalent of linear force applied.", ["A"]),
    para("Moment — the turning effect produced about a chosen point.", ["A"]),
    para("Couple — two equal opposite forces producing rotation only.", ["B"]),
  ]);
  assert.deepEqual(definitionFacts(sample), []);
});

// 🔴 PROSE CONTAINING A DASH IS NOT A DEFINITION.
test("a sentence that merely contains a dash is not split into one", () => {
  assert.equal(
    splitDefinition("The reading fell sharply overnight. It recovered — slowly — by morning."),
    null,
  );
});

test("a label too long to be a label is refused", () => {
  const long = "x".repeat(70);
  assert.equal(splitDefinition(`${long} — something that follows it at length`), null);
});

test("a gloss too short to be a meaning is refused", () => {
  assert.equal(splitDefinition("Amp — unit"), null);
});

test("a two-column table of short labels and long glosses is read as definitions", () => {
  const sample = doc([
    table(
      [
        ["Term", "Meaning"],
        ["Kerf", "the width of material removed by a cutting process"],
        ["Fillet", "a weld joining two surfaces at approximately a right angle"],
        ["Porosity", "cavities formed by gas trapped during solidification"],
      ],
      1,
    ),
  ]);
  const facts = definitionFacts(sample);
  assert.equal(facts.length, 3);
  assert.equal(facts[0]!.term, "Kerf");
  assert.ok(facts[0]!.meaning?.startsWith("the width"));
});

// 🔴 THE COLUMN SHAPE IS THE TEST, NOT THE HEADER TEXT — so a table of two
// short columns is not a glossary even though it has two columns.
test("a table of two short columns is not read as definitions", () => {
  const sample = doc([
    table([["Size", "Amps"], ["2.5 mm", "80"], ["3.2 mm", "120"], ["4.0 mm", "170"]]),
  ]);
  assert.deepEqual(definitionFacts(sample), []);
});

// ── Procedures ────────────────────────────────────────────────────────────

test("a procedure keeps its steps in order, with the markers stripped", () => {
  const [procedure] = procedureFacts(weldingManual);
  assert.deepEqual(procedure!.steps, [
    "Clean the joint down to bright metal.",
    "Set the amperage for the electrode diameter.",
    "Strike the arc and hold a short arc length.",
  ]);
  assert.equal(procedure!.blockIds.length, 3, "the fact points at all three steps");
});

// 🔴 A BULLETED LIST IS A SET, NOT A SEQUENCE. Reporting it as steps would
// invent an order the author never claimed.
test("a bulleted list of the same items is not a procedure", () => {
  const sample = doc([step("Clean it", "•"), step("Set it", "•"), step("Strike it", "•")]);
  assert.deepEqual(procedureFacts(sample), []);
});

test("two numbered items are not enough to be a procedure", () => {
  const sample = doc([step("First", "1."), step("Second", "2.")]);
  assert.deepEqual(procedureFacts(sample), []);
});

test("a heading between numbered runs separates them", () => {
  const sample = doc([
    step("a", "1."), step("b", "2."), step("c", "3."),
    { headingPath: [], kind: "heading", level: 2, text: "Next", unit: 0 },
    step("d", "1."), step("e", "2."), step("f", "3."),
  ]);
  assert.equal(procedureFacts(sample).length, 2);
});

// ── Dates ─────────────────────────────────────────────────────────────────

test("dates are read from formats, not from surrounding words", () => {
  const sample = doc([
    para("Submit by 2026-08-14."),
    para("Hearing set for 3 September 2026."),
    para("Inspection on Oct 7, 2026 at the yard."),
  ]);
  assert.deepEqual(dateFacts(sample).map((f) => f.iso), ["2026-08-14", "2026-09-03", "2026-10-07"]);
});

// 🔴 AN AMBIGUOUS NUMERIC DATE IS NOT GUESSED AT.
// 03/04/2026 is March 4th in one country and April 3rd in another, and a wrong
// guess puts a calendar entry a month out while looking entirely correct.
test("an ambiguous numeric date produces no fact rather than a guess", () => {
  assert.deepEqual(dateFacts(doc([para("Due 03/04/2026 without fail.")])), []);
});

test("an impossible date keeps its text and claims no ISO value", () => {
  const facts = dateFacts(doc([para("Filed 2026-13-45 per the stamp.")]));
  assert.equal(facts.length, 0, "a month of 13 is not a date at all");
});

test("a date carries the section it was found in", () => {
  assert.deepEqual(dateFacts(lawSyllabus)[0]!.headingPath, ["Contract Law", "Assessment"]);
});

test("the same date written twice in one block is reported once", () => {
  const facts = dateFacts(doc([para("Due 2026-08-14, resubmission also 2026-08-14 if needed.")]));
  assert.equal(facts.length, 1);
});

// ── Inventory and provenance ──────────────────────────────────────────────

// 🔴 A FIGURE NOBODY READ MUST STILL APPEAR. Omitting it from the facts would
// undo the disclosure the coverage layer works to produce, one level up.
test("an unexamined figure is inventoried, and says so in a FIELD not in prose", () => {
  const sample = doc([{ figure: {}, headingPath: [], kind: "figure", text: "", unit: 0 }]);
  const [figure] = inventoryFacts(sample);
  assert.equal(figure!.kind, "figure", "the figure is still inventoried — the gap is not hidden");
  assert.equal(figure!.examined, false, "`examined` is where 'nobody looked' belongs");
  // `text` used to read "[Figure — not examined]", putting a fact about the
  // PARSER into a field meaning "what this figure says".
  assert.equal(figure!.text, "");
});

test("a described figure says so", () => {
  const sample = doc([
    { figure: { description: "Two curves crossing." }, headingPath: [], kind: "figure", text: "", unit: 0 },
  ]);
  assert.equal(inventoryFacts(sample)[0]!.examined, true);
});

test("a table's headers are reported only when the format marked them", () => {
  const marked = doc([table([["A", "B"], ["1", "2"]], 1)]);
  const unmarked = doc([table([["1", "2"], ["3", "4"]], 0)]);
  assert.deepEqual(inventoryFacts(marked)[0]!.headers, ["A", "B"]);
  assert.equal(inventoryFacts(unmarked)[0]!.headers, undefined);
});

// 🔴 A FACT WITHOUT PROVENANCE IS AN ASSERTION.
test("every fact carries a locator and block ids that exist in the document", () => {
  const ids = new Set(lawSyllabus.blocks.map((b) => b.id));
  const facts = extractFacts(lawSyllabus);
  assert.ok(facts.length > 5);
  for (const item of facts) {
    assert.ok(item.blockIds.length > 0, `${item.kind} names no block`);
    for (const id of item.blockIds) assert.ok(ids.has(id), `${item.kind} cites a missing block ${id}`);
    assert.ok(ids.has(item.locator.blockId));
    // A Word document has no pages, so no fact may claim one.
    assert.equal(item.locator.unitKind, "body");
  }
});

test("facts come back in document order", () => {
  const order = new Map(lawSyllabus.blocks.map((b, i) => [b.id, i]));
  const positions = extractFacts(lawSyllabus).map((f) => order.get(f.blockIds[0]!)!);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("one block may produce several facts, because they answer different questions", () => {
  const facts = extractFacts(lawSyllabus).filter((f) => f.blockIds[0] === lawSyllabus.blocks[2]!.id);
  assert.deepEqual(new Set(facts.map((f) => f.kind)), new Set(["weighting", "table"]));
});

test("an empty document yields no facts rather than empty ones", () => {
  assert.deepEqual(extractFacts(doc([para("")])), []);
});
