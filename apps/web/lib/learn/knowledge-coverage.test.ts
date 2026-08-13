import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext, type SourceContext } from "@/lib/sources/source-context";

import { extractKnowledgeObjects } from "./knowledge-extraction";
import {
  coverageOfSource,
  emptyCoverage,
  policyOwnsCanvas,
  supportedKnowledge,
  withSourceCoverage,
  type CanvasCoverage,
} from "./knowledge-coverage";
import type { KnowledgeObject } from "./knowledge-types";

// 🔴 THE REAL EXTRACTOR RUNS IN EVERY TEST BELOW. Handing `coverageOfSource` knowledge objects
// written by hand would prove only that this file agrees with itself: the whole question is whether
// what the extractor ACTUALLY takes out of a document accounts for what the document is made of, so
// the two have to be exercised together or the guard cannot fail when they drift apart.

function contextOf(model: DocumentModel): SourceContext {
  return buildSourceContext({
    sourceId: "lib-1",
    sourceKind: "pdf",
    structure: JSON.parse(JSON.stringify(structureEnvelope({ model, text: "Some words.", title: "A document" }))),
  });
}

function modelOf(blocks: Partial<DocBlock>[]): DocumentModel {
  return {
    blocks: blocks.map(
      (b, i) => ({ headingPath: [], id: `b${i}`, kind: "paragraph", text: "", unit: 0, ...b }) as DocBlock,
    ),
    format: "pdf",
    title: "A document",
    units: [{ index: 0, kind: "page" }],
  };
}

const GLOSSARY_ROWS = [
  ["Term", "Definition"],
  ["Photosynthesis", "Conversion of light energy into chemical energy stored as sugar."],
  ["Chlorophyll", "Pigment that absorbs light, mostly in the blue and red wavelengths."],
  ["Stomata", "Pores in a leaf surface that let carbon dioxide in and water vapour out."],
];

const GLOSSARY_TABLE: Partial<DocBlock> = {
  headingPath: ["Key Terms"],
  id: "t1",
  kind: "table",
  table: { headerRows: 1, rows: GLOSSARY_ROWS },
  text: "",
};

/** One source's real coverage: extract from it, then account for it. */
function coverOne(model: DocumentModel) {
  const context = contextOf(model);
  const extraction = extractKnowledgeObjects(context);
  return {
    coverage: coverageOfSource({ context, objects: extraction.objects }),
    outcome: extraction.outcome,
  };
}

/** A whole canvas made of exactly these sources, all of them durable and read. */
function canvasOf(...models: DocumentModel[]) {
  let coverage = emptyCoverage(models.length);
  let outcome: ReturnType<typeof coverOne>["outcome"] = "complete";
  for (const model of models) {
    const one = coverOne(model);
    if (one.outcome === "failed") outcome = "failed";
    else if (one.outcome === "degraded" && outcome !== "failed") outcome = "degraded";
    coverage = withSourceCoverage(coverage, one.coverage);
  }
  return policyOwnsCanvas({ coverage, outcome });
}

// ── the case the whole rule exists for ──────────────────────────────────────

test("🔴 a long prose source containing one association table is NOT policy-owned", () => {
  // THE defect this boundary prevents. Ownership is whole-page: taking this canvas would replace a
  // lecture with a single flashcard and there would be no error, no gap and no way for the learner
  // to reach the paragraphs they attached. `.some(association)` — and any majority threshold —
  // takes it.
  const lecture = modelOf([
    { id: "h1", kind: "heading", text: "Photosynthesis" },
    { id: "p1", text: "Light-dependent reactions occur in the thylakoid membrane, where photosystem II splits water." },
    { id: "p2", text: "The Calvin cycle then fixes carbon dioxide using the ATP and NADPH produced upstream." },
    { id: "p3", text: "Rubisco is the enzyme responsible, and it is famously inefficient under warm conditions." },
    GLOSSARY_TABLE,
  ]);

  const decision = canvasOf(lecture);
  assert.equal(decision.owns, false);
  assert.equal(decision.refusal, "unsupported-content");
  // The table IS covered. The prose is what refuses it — which is the point: this is not a failure
  // to extract, it is material no supported knowledge type represents.
  assert.equal(decision.coverage.represented, 1);
  assert.equal(decision.coverage.unrepresented, 3);
});

test("🔴 an association-only source IS policy-owned, with no URL parameter anywhere", () => {
  const glossary = modelOf([{ id: "h1", kind: "heading", text: "Key Terms" }, GLOSSARY_TABLE]);

  const decision = canvasOf(glossary);
  assert.equal(decision.owns, true);
  assert.equal(decision.refusal, null);
  assert.equal(decision.coverage.unrepresented, 0);
  assert.equal(decision.coverage.substantive, 1);
});

test("🔴 headings and empty figures alone do not prevent ownership", () => {
  // Section titles are navigation, and a figure nobody captioned or examined is not content that
  // went missing — it never survived `readableUnits`. Neither is a reason to refuse a glossary.
  const decorated = modelOf([
    { id: "h1", kind: "heading", text: "Unit 3" },
    { id: "h2", kind: "heading", text: "Key Terms" },
    { id: "f1", kind: "figure", text: "" },
    GLOSSARY_TABLE,
    { id: "h3", kind: "heading", text: "Further reading" },
  ]);

  const decision = canvasOf(decorated);
  assert.equal(decision.owns, true);
  assert.equal(decision.coverage.substantive, 1, "only the table is substantive");
});

test("a captioned figure IS substantive, and refuses the canvas", () => {
  // The deliberate direction of error. A captioned diagram is real teachable material this runtime
  // cannot teach, so it blocks — a false negative, which costs a learner the new runtime for a
  // while, rather than a false positive, which costs them the diagram.
  const withFigure = modelOf([
    GLOSSARY_TABLE,
    { figure: { description: "A cross-section of a leaf." }, id: "f1", kind: "figure", text: "Figure 1" },
  ]);

  const decision = canvasOf(withFigure);
  assert.equal(decision.owns, false);
  assert.equal(decision.refusal, "unsupported-content");
});

// ── a grid is covered completely, or it is not covered ──────────────────────

test("🔴 a glossary row too long to be a pair leaves its table unrepresented", () => {
  // The silent-loss case. Something DOES come out of this table, so "did any knowledge come from
  // this unit" would call it covered and the over-long rows would never be seen again.
  const rows = [...GLOSSARY_ROWS, ["Transpiration", "x".repeat(700)]];
  const partial = modelOf([{ ...GLOSSARY_TABLE, table: { headerRows: 1, rows } }]);

  const one = coverOne(partial);
  assert.equal(one.coverage.represented, 0);
  assert.equal(one.coverage.unrepresented, 1);
  assert.equal(canvasOf(partial).owns, false);
});

test("🔴 a three-column table is unrepresented rather than partly read", () => {
  // The extractor refuses this grid entirely (`table-not-pairs`), and the refusal has to survive
  // into ownership: a `Drug | Brand | Class` table holds real relationships nothing here can teach.
  const matrix = modelOf([
    {
      id: "t1",
      kind: "table",
      table: { headerRows: 1, rows: [["Drug", "Brand", "Class"], ["losartan", "Cozaar", "ARB"]] },
      text: "",
    },
  ]);

  const decision = canvasOf(matrix);
  assert.equal(decision.owns, false);
  assert.equal(decision.refusal, "unsupported-content");
});

test("a table whose rows are all pairs is represented in full", () => {
  const one = coverOne(modelOf([GLOSSARY_TABLE]));
  assert.equal(one.coverage.substantive, 1);
  assert.equal(one.coverage.represented, 1);
  assert.equal(one.coverage.unrepresented, 0);
});

// ── unsupported knowledge cannot enter the associative runtime ──────────────

test("🔴 a causal knowledge object counts as no coverage at all", () => {
  // Nothing extracts causal knowledge today, so this is the shape of the mistake rather than a
  // situation production can reach: if a second knowledge type is added and this filter is not
  // widened with a built interaction, its material must go on refusing the canvas — never quietly
  // counting as covered and letting a mechanism be drilled as a flashcard.
  const context = contextOf(modelOf([GLOSSARY_TABLE]));
  const causal: KnowledgeObject[] = [
    {
      id: "k-causal",
      sourceAnchors: [{ sourceId: "lib-1", unitId: "t1" }],
      statement: "ACE inhibition lowers aldosterone",
      type: "causal",
    },
  ];

  assert.deepEqual(supportedKnowledge(causal), []);
  const coverage = coverageOfSource({ context, objects: causal });
  assert.equal(coverage.represented, 0);
  assert.equal(coverage.unrepresented, 1);
});

test("supportedKnowledge keeps associations that yield a recall objective", () => {
  const context = contextOf(modelOf([GLOSSARY_TABLE]));
  const { objects } = extractKnowledgeObjects(context);
  assert.equal(objects.length, 3);
  assert.equal(supportedKnowledge(objects).length, 3);
});

// ── the checks the unit counts cannot make ──────────────────────────────────

test("🔴 a source that was never read refuses the canvas, whatever the others say", () => {
  // A durable glossary beside an ephemeral lecture. The lecture has no library row, so it never
  // enters extraction and contributes nothing to the counts — `unrepresented` is 0 and every unit
  // check passes while a whole document is invisible. This is the only clause that catches it.
  const glossary = coverOne(modelOf([GLOSSARY_TABLE]));
  const coverage: CanvasCoverage = withSourceCoverage(emptyCoverage(2), glossary.coverage);

  assert.equal(coverage.unrepresented, 0, "the counts alone look perfect");
  const decision = policyOwnsCanvas({ coverage, outcome: "complete" });
  assert.equal(decision.owns, false);
  assert.equal(decision.refusal, "source-not-read");
});

test("a canvas with no sources at all is not owned", () => {
  const decision = policyOwnsCanvas({ coverage: emptyCoverage(0), outcome: "no-durable-source" });
  assert.equal(decision.owns, false);
  assert.equal(decision.refusal, "source-not-read");
});

test("🔴 a degraded parse refuses the canvas even when everything read is covered", () => {
  // Flat text survived and structure did not, so a grid may have been flattened out of sight before
  // anything could count it. What was read looks complete precisely because the rest is invisible.
  const coverage = withSourceCoverage(emptyCoverage(1), { represented: 1, substantive: 1, unrepresented: 0 });
  const decision = policyOwnsCanvas({ coverage, outcome: "degraded" });
  assert.equal(decision.owns, false);
  assert.equal(decision.refusal, "extraction-incomplete");
});

test("a source with nothing readable is not owned, and says so distinctly", () => {
  const coverage = withSourceCoverage(emptyCoverage(1), { represented: 0, substantive: 0, unrepresented: 0 });
  const decision = policyOwnsCanvas({ coverage, outcome: "complete" });
  assert.equal(decision.owns, false);
  assert.equal(decision.refusal, "nothing-teachable");
});

// ── the rule itself ─────────────────────────────────────────────────────────

test("🔴 ownership is an equality with zero — there is no threshold to tune", () => {
  // A majority rule would take a canvas that is 90% covered and hide the other 10%. Ownership must
  // move only when the last unrepresented unit goes.
  const nearly = withSourceCoverage(emptyCoverage(1), { represented: 99, substantive: 100, unrepresented: 1 });
  assert.equal(policyOwnsCanvas({ coverage: nearly, outcome: "complete" }).owns, false);

  const whole = withSourceCoverage(emptyCoverage(1), { represented: 100, substantive: 100, unrepresented: 0 });
  assert.equal(policyOwnsCanvas({ coverage: whole, outcome: "complete" }).owns, true);
});

test("two sources both fully covered are owned; one uncovered unit anywhere is not", () => {
  const glossary = modelOf([GLOSSARY_TABLE]);
  const other = modelOf([
    { id: "t2", kind: "table", table: { headerRows: 1, rows: [["Symbol", "Meaning"], ["Na", "sodium"]] }, text: "" },
  ]);
  assert.equal(canvasOf(glossary, other).owns, true);

  const withProse = modelOf([{ id: "p1", text: "One paragraph of ordinary explanation." }, GLOSSARY_TABLE]);
  assert.equal(canvasOf(glossary, withProse).owns, false);
});

// ── read, then decide, then write ───────────────────────────────────────────

test("🔴 nothing is written before the extraction has been judged trustworthy", () => {
  // 🔴 THE ORDERING IS THE PROTECTION AND IT SURVIVES RUNTIME-005 UNCHANGED — only the identity of
  // the gate moved, from `!ownership.owns` to `!production.produce`. The previous step lost a week
  // to exactly this shape: an insert path that passed its proof because the proof tested the index
  // instead of the write. Ordering is therefore asserted directly, against the source.
  const source = readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const read = code.indexOf("await Promise.all(");
  const disclose = code.indexOf("policyOwnsCanvas({ coverage, outcome })");
  const decide = code.indexOf("knowledgeProductionFor({ outcome })");
  const gate = code.indexOf("if (!production.produce");
  const write = code.indexOf("await saveKnowledge(");

  assert.notEqual(read, -1);
  assert.notEqual(decide, -1, "trust must be decided in canvas-knowledge, not by the caller");
  assert.notEqual(gate, -1);
  assert.notEqual(write, -1);
  assert.ok(read < decide, "sources are read before trust can be decided");
  assert.ok(decide < gate && gate < write, "a canvas this lane could not read must leave no rows behind");

  // 🔴 AND OWNERSHIP IS STILL COMPUTED, BECAUSE DISCLOSURE DEPENDS ON IT. RUNTIME-005 moved the
  // unrepresented fact from GATE to DISCLOSURE; deleting the computation rather than the gate would
  // have thrown away the number the surface reports and the one that tells a forced session from an
  // ordinary one.
  assert.notEqual(disclose, -1, "ownership must still be computed — it discloses, it no longer gates");
  assert.ok(read < disclose, "ownership is decided from the extraction, not before it");
});

test("🔴 the PRODUCTION gate cannot read coverage — that is what RUNTIME-005 undid", () => {
  // 🔴 THE REGRESSION THIS EXISTS TO CATCH IS A RE-FUSION, NOT A DELETION. `policyOwnsCanvas` asks a
  // whole-document question ("did we account for ALL of it?") and it answered "no" for every real
  // document — 6 of 6 production canvases refused, which is why `learner_evidence` could not become
  // non-zero through ordinary use. Trust ("did we read this reliably?") is a different question and
  // must stay a different one. `knowledgeProductionFor` takes `outcome` and nothing else, so a
  // coverage veto cannot be expressed through it without changing that signature — but a caller
  // could still AND one onto the gate line, and that is what is checked here.
  const source = readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // 🔴 THE CONDITION ONLY, NOT THE WHOLE LINE. The gate's RETURN payload carries `coverage` and
  // `ownership` on purpose — that is the disclosure half of RUNTIME-005, and a check blunt enough to
  // forbid them there would be demanding the opposite of what the task requires. So the slice stops
  // at `) return`.
  const gateLine = code.slice(code.indexOf("if (!production.produce")).split("\n")[0]!;
  const condition = gateLine.slice(0, gateLine.indexOf(") return"));
  assert.ok(condition.startsWith("if (!production.produce"), "the gate must be the trust decision");
  for (const forbidden of ["coverage", "unrepresented", "represented", "ownership", "owns"]) {
    assert.equal(
      condition.includes(forbidden),
      false,
      `production must not be gated on "${forbidden}" — that is the whole-document question RUNTIME-005 removed`,
    );
  }

  // The rule module itself must not know coverage exists, for the same reason `knowledge-coverage.ts`
  // must not know a bypass exists: a boundary that can see the other side of itself stops being one.
  const rule = readFileSync(new URL("./knowledge-production.ts", import.meta.url), "utf8");
  const ruleCode = rule.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(ruleCode.includes("coverage"), false, "the trust rule must not mention coverage");
  assert.equal(ruleCode.includes("unrepresented"), false, "nor what it failed to represent");
});

test("🔴 NO FLAG can mint knowledge from an extraction we could not trust", () => {
  // 🔴 THE ONE GATE ON THIS PATH THAT IS NOT BYPASSABLE, AND IT IS NOT AN OVERSIGHT.
  //
  // `bypassOwnership` may skip OWNERSHIP — that is a judgement about presentation, and overriding
  // it writes nothing untrue. Trust is a FACT about whether the source was read, and a flag that
  // overrode a fact would store a falsehood in a real learner's tables.
  //
  // What makes it unrecoverable is provenance: `saveKnowledge` upserts on `(user_id, identity_key)`
  // and there is NO forced-session marker, so knowledge minted from a flattened parse under
  // `?policy=force` converges with genuine extractions of the same identity and is indistinguishable
  // from a true one ever after. Downstream it becomes a question about something the source never
  // said, and the learner's wrong answer is recorded as THEIR gap — a source gap turned into a
  // learner gap by a query parameter.
  const source = readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const gate = code.indexOf("if (!production.produce");
  const write = code.indexOf("await saveKnowledge(");
  assert.notEqual(gate, -1);
  assert.notEqual(write, -1);

  const gateLine = code.slice(gate).split("\n")[0]!;
  const condition = gateLine.slice(0, gateLine.indexOf(") return"));
  for (const escape of ["bypass", "force", "override"]) {
    assert.equal(
      condition.includes(escape),
      false,
      `trust must not be conditional on "${escape}" — overriding whether we READ something writes a falsehood`,
    );
  }

  // And nothing between the refusal and the write may re-admit a canvas the gate turned away.
  assert.equal(
    code.slice(gate, write).includes("bypass"),
    false,
    "no bypass may re-enter the path between the trust gate and the write",
  );
});

test("🔴 the bypass changes what is WRITTEN, never what is DECIDED", () => {
  // A forced session must still report `owns: false` and its refusal, because that is the only
  // record that it was not the ordinary path — and the surface reads it to say so on screen. If
  // `bypassOwnership` ever reached `policyOwnsCanvas`, a test drive would become indistinguishable
  // from the product working, which is exactly the flaw in the `?policy=1` opt-in it replaces.
  const source = readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8");
  const call = source.slice(source.indexOf("policyOwnsCanvas({ coverage, outcome })"));
  assert.equal(call.startsWith("policyOwnsCanvas({ coverage, outcome })"), true);

  const rule = readFileSync(new URL("./knowledge-coverage.ts", import.meta.url), "utf8");
  assert.equal(rule.includes("bypass"), false, "the rule must not know a bypass exists");
  assert.equal(rule.includes("force"), false, "nor that anything can force it");
});

test("coverage accumulates without mutating what it was given", () => {
  const base = emptyCoverage(2);
  const next = withSourceCoverage(base, { represented: 1, substantive: 2, unrepresented: 1 });
  assert.deepEqual(base, emptyCoverage(2));
  assert.equal(next.sourcesAccounted, 1);
  assert.equal(next.sourcesTotal, 2);
});
