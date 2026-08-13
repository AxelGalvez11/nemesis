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
