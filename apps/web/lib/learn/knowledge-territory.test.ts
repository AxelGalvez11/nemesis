import assert from "node:assert/strict";
import { test } from "node:test";

import { knowledgeIdentityKey } from "./knowledge-identity";
import { hasGroundableAnchor, waysOfKnowing } from "./knowledge-provenance";
import { parseTerritory, type TerritoryRefusalReason } from "./knowledge-territory";
import type { KnowledgeObject } from "./knowledge-types";

const TOPIC = "the top 35 drugs in pharmacy";

const pair = (over: Record<string, unknown> = {}) => ({
  left: "losartan",
  leftRole: "generic",
  relationKind: "brand|generic",
  right: "Cozaar",
  rightRole: "brand",
  ...over,
});

const run = (pairs: unknown[], topic = TOPIC) =>
  parseTerritory({ text: JSON.stringify({ pairs }), topic });

const reasons = (pairs: unknown[]): TerritoryRefusalReason[] =>
  run(pairs).refusals.map((refusal) => refusal.reason);

// ── the thing the owner will actually do ─────────────────────────────────────────────────────────

test("🔴 ACCEPTANCE: a topic produces knowledge that can be asked about", () => {
  // The whole point. Someone types a topic instead of uploading a file, and Nemesis has something
  // specific to ask them — not 64 paragraphs to read.
  const { objects } = run([pair(), pair({ left: "lisinopril", right: "Zestril" })]);

  assert.equal(objects.length, 2);
  assert.equal(objects[0]?.type, "association");
  assert.ok(objects[0]?.pair, "an association without a pair produces no objective at all");
  assert.ok(objects[0]?.identityKey, "and without an identity it cannot outlive the session");
});

test("🔴 ACCEPTANCE: model knowledge carries NO anchor, so no citation can be fabricated", () => {
  // Contract rule 2. The quiet marker promises "here is the excerpt this came from". Model knowledge
  // has no excerpt, and a fabricated source is worse than no marker.
  const object = run([pair()]).objects[0]!;

  assert.equal(object.sourceAnchors, undefined, "not a dangling anchor, and not an empty one either");
  assert.equal(hasGroundableAnchor(object), false, "so nothing downstream may render a marker");
  assert.deepEqual(object.unanchoredProvenance, ["model"], "and the one honest thing is said plainly");
  assert.deepEqual(waysOfKnowing(object), [{ kind: "model" }]);
});

test("🔴 ACCEPTANCE: a topic-minted pair is the SAME OBJECT as the document-minted one", () => {
  // 🔴 THIS IS THE SENTENCE THAT JUSTIFIES THE WHOLE CONTRACT, AND IT IS WHY IDENTITY HAD TO BE
  // SEPARATED FROM PROVENANCE RATHER THAN THE CLAUSE SIMPLY DELETED.
  //
  // Someone types "top 35 drugs", demonstrates `losartan → Cozaar`, and uploads the lecture next
  // week. The lecture's extraction mints the same fact — from a real table, with a real anchor — and
  // it must land on the knowledge the topic already created, WITH their demonstration still attached.
  // If provenance were part of identity these would be two objects, and the learner would be asked
  // for something they had already proved, their history orphaned by an improvement.
  const fromTopic = run([pair()]).objects[0]!;

  const fromDocument: KnowledgeObject = {
    id: "doc:r1",
    pair: { id: "doc:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
    relationKind: "brand|generic",
    sourceAnchors: [{ quote: "losartan — Cozaar", sourceId: "s1", unitId: "u1" } as never],
    statement: "losartan — Cozaar",
    type: "association",
    unanchoredProvenance: [],
  };

  assert.equal(
    fromTopic.identityKey,
    knowledgeIdentityKey(fromDocument),
    "🔴 one fact, one object, however the learner met it",
  );
  // And the two differ in exactly the way they should: one can show you where it came from.
  assert.equal(hasGroundableAnchor(fromTopic), false);
  assert.equal(hasGroundableAnchor(fromDocument), true);
});

// ── the abstain boundary: named rules, no confidence score ───────────────────────────────────────

test("🔴 every validation rule drops its candidate, and each is calibrated by a violation", () => {
  // 🔴 THE ABSTAIN BOUNDARY IS STRUCTURAL, WHICH IS WHY THIS TEST CAN EXIST AT ALL. Had it been "the
  // model said it was confident", there would be nothing here to construct and nothing to turn red —
  // an unfalsifiable guard is not a guard. Every rule below is a property of the candidate, checked
  // without the model, and each line IS the reintroduction of the defect it guards against.
  assert.deepEqual(reasons([pair({ left: "  " })]), ["missing-side"]);
  assert.deepEqual(reasons([pair({ right: "" })]), ["missing-side"]);
  assert.deepEqual(reasons([pair({ right: "Losartan" })]), ["identical-sides"], "case and space folded");
  assert.deepEqual(reasons([pair({ left: "x".repeat(121) })]), ["side-too-long"], "a side that long is an explanation");
  assert.deepEqual(reasons([pair({ leftRole: "" })]), ["missing-roles"]);
  assert.deepEqual(reasons([pair({ rightRole: "" })]), ["missing-roles"]);
  assert.deepEqual(reasons([pair({ relationKind: "" })]), ["missing-relation-kind"]);
  assert.deepEqual(reasons([pair({ left: TOPIC })]), ["restates-the-topic"]);
  assert.deepEqual(reasons([pair(), pair()]), ["duplicate"], "the same fact twice is not two objectives");

  // And every one of those produced NOTHING, rather than a degraded object.
  for (const bad of [{ left: "" }, { right: "Losartan" }, { leftRole: "" }, { relationKind: "" }]) {
    assert.equal(run([pair(bad)]).objects.length, 0);
  }
});

test("🔴 a smaller clean territory is SUCCESS, not shortfall", () => {
  // The owner's stated preference, executed: asked for many, kept the ones that hold up. A parser
  // that padded the list to look complete would be inventing questions a real learner is graded on.
  const { objects, refusals } = run([
    pair(),
    pair({ left: "amlodipine", right: "Norvasc" }),
    pair({ leftRole: "" }),
    pair({ left: TOPIC }),
    pair({ right: "x".repeat(200) }),
  ]);

  assert.equal(objects.length, 2, "two survived");
  assert.equal(refusals.length, 3, "and the three that did not are COUNTED, never silently skipped");
});

test("🔴 an unreadable response yields nothing, and is never salvaged", () => {
  // Regex-scraping pairs out of malformed JSON is how a half-parsed hallucination becomes a
  // learner's objective. Refuse the whole response instead.
  const broken = parseTerritory({ text: "Here are some drugs: losartan is Cozaar…", topic: TOPIC });
  assert.deepEqual(broken.objects, []);
  assert.deepEqual(broken.refusals.map((r) => r.reason), ["unreadable-response"]);

  assert.deepEqual(parseTerritory({ text: "{}", topic: TOPIC }).objects, []);
});

// ── field-agnostic, which is a product invariant and not a style note ────────────────────────────

test("🔴 the same rules serve a law student and a mechanical engineer", () => {
  // Nemesis is a field-agnostic academic OS. A rule that only made sense for one subject would be
  // wrong however well it worked — so the parser is checked against subjects that share no
  // vocabulary with the pharmacy fixtures above.
  const law = run(
    [{ left: "Donoghue v Stevenson", leftRole: "case", relationKind: "case|holding", right: "manufacturer owes a duty of care", rightRole: "holding" }],
    "tort law",
  );
  const engineering = run(
    [{ left: "H7/h6", leftRole: "fit designation", relationKind: "designation|meaning", right: "close running clearance fit", rightRole: "meaning" }],
    "engineering fits and tolerances",
  );

  assert.equal(law.objects.length, 1);
  assert.equal(engineering.objects.length, 1);
  assert.notEqual(law.objects[0]?.identityKey, engineering.objects[0]?.identityKey);
});

// ── grounded mode: the same constructor, reading the learner's own material ──────────────────────
//
// 🔴 THE LANE §24 TURNS ON. Uploading a lecture used to generate a summary of it, because the
// deterministic table lane found nothing in a prose document and there was nothing else to show.
// This is what stands in the summary's place: the pairs the document itself states, anchored to the
// excerpts they were read from, so the first thing a learner meets is a question rather than a
// description of the file they just handed over.

const EXCERPT = {
  id: "s1:e4",
  label: "Insulin secretion",
  text: "Beta cells in the pancreatic islets release insulin in response to a rise in blood glucose.",
  unitId: "u7",
};

const SOURCE = {
  excerpts: [EXCERPT, { id: "s1:e5", label: null, text: "Glucagon opposes it.", unitId: "u8" }],
  id: "s1",
  kind: "pdf",
  librarySourceId: "lib-1c9e47ce",
  title: "Physiology of Diabetes Mellitus",
};

const grounded = (over: Record<string, unknown> = {}, sources: unknown[] = [SOURCE]) =>
  parseTerritory({
    sources: sources as never,
    text: JSON.stringify({
      pairs: [{
        excerptId: "s1:e4",
        left: "beta cells",
        leftRole: "cell type",
        relationKind: "cell|secretion",
        right: "insulin",
        rightRole: "hormone secreted",
        ...over,
      }],
    }),
    topic: "Physiology of Diabetes Mellitus",
  });

test("🔴 ACCEPTANCE: a document the table lane cannot read still produces something to ANSWER", () => {
  // The owner's own canvas, in miniature. `1. Physiology and Pathophysiology of Diabetes Mellitus 1
  // 2026.pdf` has `table_count: 0` in its stored parse, so `extractKnowledgeObjects` minted zero
  // objects and the policy had nothing to ask — which is why opening it wrote a summary instead.
  const { objects, refusals } = grounded();

  assert.equal(refusals.length, 0);
  assert.equal(objects.length, 1);
  assert.equal(objects[0]?.type, "association");
  assert.ok(objects[0]?.identityKey, "and it can outlive the session");
});

test("🔴 ACCEPTANCE: a grounded pair can be CITED, in both locator systems", () => {
  // The owner's explicit preserve-this. The `[1]` markers were working inside the overview being
  // removed, so the knowledge that replaces it has to carry what a marker renders from.
  const object = grounded().objects[0]!;

  // Canvas-local: what a citation marker resolves against today.
  assert.deepEqual(object.sourceRefs, [{ excerptId: "s1:e4", sourceId: "s1" }]);

  // Durable: what a SECOND canvas over the same lecture, or this one after a reparse, resolves
  // against. 🔴 The durable id, never the canvas-local "s1" — every canvas calls its first
  // attachment "s1", so anchoring on that would point a later canvas at a different document.
  assert.equal(object.sourceAnchors?.length, 1);
  assert.equal(object.sourceAnchors?.[0]?.sourceId, "lib-1c9e47ce");
  assert.equal(object.sourceAnchors?.[0]?.unitId, "u7");
  assert.ok(object.sourceAnchors?.[0]?.quote?.exact, "and a quote, so it survives a better parser");

  assert.equal(hasGroundableAnchor(object), true, "so a marker is ALLOWED to promise a source");
  assert.deepEqual(
    object.unanchoredProvenance,
    [],
    "🔴 empty, not [\"model\"] — this field holds only ways of knowing that CANNOT carry an anchor",
  );
});

test("🔴 the LANE is recorded, and it is not the deterministic one", () => {
  // A model reading prose and a grid reader reading cells carry different risk, and only one of
  // them can be re-derived by reading the document again. "3 associations extracted" must not read
  // as "3 table rows recovered".
  const object = grounded().objects[0]!;

  assert.equal(object.derivation, "model-prose");
  assert.equal(object.provenance?.lane, "model-prose");
  assert.equal(run([pair()]).objects[0]?.derivation, undefined, "and the topic lane claims neither");
});

test("🔴 ENRICH, NEVER DUPLICATE: grounding a fact does not change what fact it is", () => {
  // 🔴 THE INVARIANT THAT MAKES THIS LANE SAFE TO ADD AT ALL. Someone studies a topic, demonstrates
  // a fact, then uploads the lecture that states it. The lecture's pairs must land on the knowledge
  // they already have, WITH their demonstrations attached — not mint a rival object that orphans
  // their history and asks them for something they already proved.
  const fromTopic = parseTerritory({
    text: JSON.stringify({
      pairs: [{ left: "beta cells", leftRole: "cell type", relationKind: "cell|secretion", right: "insulin", rightRole: "hormone secreted" }],
    }),
    topic: "diabetes",
  }).objects[0]!;
  const fromDocument = grounded().objects[0]!;

  assert.equal(fromTopic.identityKey, fromDocument.identityKey, "🔴 one fact, one object");
  // And they differ in exactly the way they should.
  assert.equal(hasGroundableAnchor(fromTopic), false);
  assert.equal(hasGroundableAnchor(fromDocument), true);
  assert.deepEqual(waysOfKnowing(fromTopic), [{ kind: "model" }]);
});

test("🔴 a pair the model cannot point at is REFUSED, and each refusal is calibrated", () => {
  // 🔴 THE STRICTER RULE, AND IT ONLY APPLIES WHERE MATERIAL EXISTS. A model holding the learner's
  // own lecture and asserting something it cannot locate has left the document — and storing that
  // would file model knowledge as though the lecture had said it, then ask the learner about it.
  const reason = (over: Record<string, unknown>, sources?: unknown[]) =>
    grounded(over, sources).refusals.map((refusal) => refusal.reason);

  assert.deepEqual(reason({ excerptId: undefined }), ["missing-excerpt"]);
  assert.deepEqual(reason({ excerptId: "  " }), ["missing-excerpt"]);
  assert.deepEqual(reason({ excerptId: "s1:e99" }), ["unresolvable-excerpt"], "an id we never showed it");
  assert.deepEqual(reason({ excerptId: "s9:e1" }), ["unresolvable-excerpt"], "nor a source it invented");
  assert.deepEqual(
    reason({}, [{ ...SOURCE, librarySourceId: undefined }]),
    ["unanchorable-excerpt"],
    "an unfiled source cannot support an anchor a later canvas could resolve",
  );
  assert.deepEqual(
    reason({}, [{ ...SOURCE, excerpts: [{ ...EXCERPT, unitId: undefined }] }]),
    ["unanchorable-excerpt"],
    "and neither can an excerpt that forgot which unit it came from",
  );

  // Every one of those produced NOTHING, rather than an object with a hopeful marker.
  for (const bad of [{ excerptId: undefined }, { excerptId: "s1:e99" }]) {
    assert.equal(grounded(bad).objects.length, 0);
  }
});

test("🔴 grounding is checked LAST, so a bad pair is refused for what is actually wrong with it", () => {
  // Reporting "unresolvable excerpt" for a candidate whose sides were empty would misdescribe what
  // the model did, and would send whoever reads the counts looking at the wrong thing.
  assert.deepEqual(grounded({ excerptId: "s1:e99", left: "" }).refusals.map((r) => r.reason), ["missing-side"]);
  assert.deepEqual(grounded({ excerptId: "s1:e99", relationKind: "" }).refusals.map((r) => r.reason), ["missing-relation-kind"]);
});

test("🔴 the topic lane is UNCHANGED by any of this", () => {
  // The grounded rules must not leak backwards. A topic canvas has no material, so requiring an
  // excerpt there would refuse every pair and close the front door a second time.
  const { objects, refusals } = run([pair()]);
  assert.equal(refusals.length, 0);
  assert.equal(objects[0]?.sourceAnchors, undefined);
  assert.deepEqual(objects[0]?.unanchoredProvenance, ["model"]);
  assert.equal(hasGroundableAnchor(objects[0]!), false);
});

test("🔴 an EMPTY source list is the topic lane, not a grounded lane with nothing in it", () => {
  // Otherwise a canvas whose sources have not loaded yet would refuse every pair for citing an
  // excerpt that does not exist — and report it as the model's fault.
  const { objects } = parseTerritory({ sources: [], text: JSON.stringify({ pairs: [pair()] }), topic: TOPIC });
  assert.equal(objects.length, 1);
  assert.deepEqual(objects[0]?.unanchoredProvenance, ["model"]);
});
