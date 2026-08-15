// Whether a procedure actually reaches a `KnowledgeObject` — the wiring `procedure-sequence.ts`
// and `objectivesForKnowledge` were both built and calibrated without.
//
// 🔴 THIS GOES THROUGH THE REAL BOUNDARY, NOT A `ListUnit` BUILT BY HAND. `procedure-sequence.ts`'s
// own tests construct `ListUnit`s directly and are correct about the algorithm; they cannot catch a
// defect in how a REAL parsed document reaches that algorithm. `unitsFromModel` names a list item's
// `CanonicalSourceUnitType` "list", never "listItem" — `orderedRunsIn` reads the latter — so a test
// built from `ListUnit`s by hand would stay green while every real document produced zero runs.
// `contextOf`/`modelOf` here are the same two functions `knowledge-extraction.test.ts` builds its
// fixtures with, for exactly that reason: they run a document through `buildSourceContext`, the
// boundary a real upload actually crosses.

import assert from "node:assert/strict";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext, type SourceContext } from "@/lib/sources/source-context";

import { EXTRACTION_VERSION, extractKnowledgeObjects } from "./knowledge-extraction";
import { objectivesForKnowledge } from "./learning-objective";

function stored(model?: DocumentModel, text = "Some words.") {
  return JSON.parse(JSON.stringify(structureEnvelope({ model, text, title: "A document" })));
}

function contextOf(model?: DocumentModel, text?: string): SourceContext {
  return buildSourceContext({ sourceId: "lib-1", sourceKind: "docx", structure: stored(model, text) });
}

function modelOf(blocks: Partial<DocBlock>[], units = 1): DocumentModel {
  return {
    blocks: blocks.map((b, i) => ({ headingPath: [], id: `b${i}`, kind: "paragraph", text: "", unit: 0, ...b }) as DocBlock),
    format: "docx",
    title: "A document",
    units: Array.from({ length: units }, (_, index) => ({ index, kind: "page" as const })),
  };
}

/** A numbered run of three steps under one heading — the working case most other tests start from. */
function filingMotion(): DocumentModel {
  return modelOf([
    { headingPath: [], id: "h1", kind: "heading", text: "Filing a motion" },
    { depth: 0, headingPath: ["Filing a motion"], id: "b1", kind: "listItem", marker: "1.", text: "Serve the opposing party." },
    { depth: 0, headingPath: ["Filing a motion"], id: "b2", kind: "listItem", marker: "2.", text: "File proof of service." },
    { depth: 0, headingPath: ["Filing a motion"], id: "b3", kind: "listItem", marker: "3.", text: "Notice the hearing date." },
  ]);
}

function procedureIn(context: SourceContext) {
  return extractKnowledgeObjects(context).objects.find((o) => o.type === "procedure");
}

// ── the working case ────────────────────────────────────────────────────────

test("a numbered run under a heading mints one procedure object with N steps", () => {
  const { objects, refusals } = extractKnowledgeObjects(contextOf(filingMotion()));
  const procedures = objects.filter((o) => o.type === "procedure");
  assert.equal(procedures.length, 1);
  assert.equal(procedures[0]?.steps?.length, 3);
  assert.deepEqual(refusals, []);
});

test("the statement is the run's own heading, never an interpretation of it", () => {
  const procedure = procedureIn(contextOf(filingMotion()));
  assert.equal(procedure?.statement, "Filing a motion");
});

test("with no heading, the statement is the run's own first step, not the whole run", () => {
  // 🔴 THE FIRST STEP ONLY. Folding every step's text into the statement would put step wording
  // inside identity (`knowledgeIdentityKey` hashes type + statement), so a document that rewords
  // its THIRD step would silently mint a second, unrelated procedure for the first two.
  const context = contextOf(modelOf([
    { depth: 0, headingPath: [], id: "b1", kind: "listItem", marker: "1.", text: "Preheat the oven." },
    { depth: 0, headingPath: [], id: "b2", kind: "listItem", marker: "2.", text: "Mix the batter." },
  ]));
  const procedure = procedureIn(context);
  assert.equal(procedure?.statement, "1. Preheat the oven.");
});

// ── the refusal, and it is silent rather than a pushed reason ──────────────

test("a bulleted run mints no procedure", () => {
  const context = contextOf(modelOf([
    { headingPath: [], id: "h1", kind: "heading", text: "Ingredients" },
    { depth: 0, headingPath: ["Ingredients"], id: "b1", kind: "listItem", marker: "•", text: "Flour." },
    { depth: 0, headingPath: ["Ingredients"], id: "b2", kind: "listItem", marker: "•", text: "Sugar." },
    { depth: 0, headingPath: ["Ingredients"], id: "b3", kind: "listItem", marker: "•", text: "Eggs." },
  ]));
  const { objects, refusals } = extractKnowledgeObjects(context);
  assert.deepEqual(objects.filter((o) => o.type === "procedure"), []);
  // 🔴 SILENT, LIKE A FIGURE WITH ONE LABEL — never a procedure-specific reason. A bulleted list is
  // the ordinary, correct case for most lists in most documents, so the procedure lane itself pushes
  // nothing. `no-tables` still fires here, but that reason belongs to the TABLE lane (this document
  // also happens to have no grid) and is unrelated to how the bullets were read.
  assert.deepEqual(refusals.map((r) => r.reason), ["no-tables"]);
});

// ── adjacency, read off the whole document rather than one unit at a time ──

test("a paragraph between two numbered lists mints two procedures", () => {
  const context = contextOf(modelOf([
    { headingPath: [], id: "h1", kind: "heading", text: "Filing a motion" },
    { depth: 0, headingPath: ["Filing a motion"], id: "b1", kind: "listItem", marker: "1.", text: "Serve." },
    { depth: 0, headingPath: ["Filing a motion"], id: "b2", kind: "listItem", marker: "2.", text: "File." },
    { headingPath: ["Filing a motion"], id: "p1", kind: "paragraph", text: "In the alternative:" },
    { depth: 0, headingPath: ["Filing a motion"], id: "b4", kind: "listItem", marker: "1.", text: "Move to strike." },
    { depth: 0, headingPath: ["Filing a motion"], id: "b5", kind: "listItem", marker: "2.", text: "Request a stay." },
  ]));
  const { objects } = extractKnowledgeObjects(context);
  const procedures = objects.filter((o) => o.type === "procedure");
  // Splicing across the paragraph would read four steps in one sequence where the document printed
  // two runs of two.
  assert.equal(procedures.length, 2);
  assert.deepEqual(procedures.map((p) => p.steps?.length), [2, 2]);
  // Each run is anchored to ITS OWN first unit, so the two objects have distinct ids however their
  // shared heading names them.
  assert.equal(new Set(procedures.map((p) => p.id)).size, 2);
});

// ── provenance ───────────────────────────────────────────────────────────

test("every procedure says it came from an ordered list, and under which rules", () => {
  const procedure = procedureIn(contextOf(filingMotion()));
  assert.equal(procedure?.derivation, "ordered-list");
  assert.equal(procedure?.extractionVersion, EXTRACTION_VERSION);
});

test("every step resolves back to the document on its own, not only the run as a whole", () => {
  const procedure = procedureIn(contextOf(filingMotion()));
  assert.equal(procedure?.sourceAnchors?.length, 3);
  assert.deepEqual(procedure?.sourceAnchors?.map((a) => a.unitId), ["b1", "b2", "b3"]);
  assert.deepEqual(procedure?.sourceAnchors?.map((a) => a.quote?.exact), [
    "1. Serve the opposing party.",
    "2. File proof of service.",
    "3. Notice the hearing date.",
  ]);
});

// ── identity: type + statement, never the steps ────────────────────────────

test("identity is the run's heading, not the wording of its steps", () => {
  const reworded = modelOf([
    { headingPath: [], id: "h1", kind: "heading", text: "Filing a motion" },
    { depth: 0, headingPath: ["Filing a motion"], id: "b1", kind: "listItem", marker: "1.", text: "Serve the opposing party." },
    { depth: 0, headingPath: ["Filing a motion"], id: "b2", kind: "listItem", marker: "2.", text: "Submit proof of service to the clerk." },
  ]);
  const original = procedureIn(contextOf(filingMotion()));
  const changed = procedureIn(contextOf(reworded));
  // 🔴 SAME IDENTITY. A document that rewords one step's sentence must not orphan everything a
  // learner has already demonstrated about the procedure — see `ObjectiveParameters.stepKey`,
  // which keeps the same promise one layer up, per step rather than per procedure.
  assert.equal(original?.identityKey, changed?.identityKey);
  // …while the payload correctly disagrees, because the steps really are different.
  assert.notDeepEqual(original?.steps, changed?.steps);
});

// ── this lane runs whether or not the document has a table ─────────────────

test("a document with no table anywhere still mints its procedures, and reports complete", () => {
  const { objects, outcome, refusals } = extractKnowledgeObjects(contextOf(filingMotion()));
  assert.equal(objects.filter((o) => o.type === "procedure").length, 1);
  assert.equal(outcome, "complete");
  assert.deepEqual(refusals, []);
});

// ── the objective lane, which is what makes any of this reach a learner ────

test("the objective lane produces one objective per step, cued by the procedure name then by the previous step", () => {
  const procedure = procedureIn(contextOf(filingMotion()))!;
  const objectives = objectivesForKnowledge(procedure);
  assert.equal(objectives.length, 3);
  assert.deepEqual(objectives.map((o) => o.cue), [
    "Filing a motion",
    "1. Serve the opposing party.",
    "2. File proof of service.",
  ]);
  assert.deepEqual(objectives.map((o) => o.answer), [
    "1. Serve the opposing party.",
    "2. File proof of service.",
    "3. Notice the hearing date.",
  ]);
});

test("each step's objective carries its own identity key — invisible unless you count", () => {
  // 🔴 THIS EXACT BUG HAS SHIPPED TWICE ALREADY, over a diagram's labels and a class's members: all
  // N objectives look individually correct and collapse to one key the moment something answers
  // them, which only counting distinct keys reveals.
  const procedure = procedureIn(contextOf(filingMotion()))!;
  const objectives = objectivesForKnowledge(procedure);
  assert.equal(new Set(objectives.map((o) => o.identityKey)).size, 3);
});
