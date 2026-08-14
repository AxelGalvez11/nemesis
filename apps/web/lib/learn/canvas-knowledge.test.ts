import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { mergeObjectives, type ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";

// Attaching a source emptied a canvas that was already teaching.
//
// 🔴 MEASURED LIVE ON 2026-08-13, ON THE SERVING COMMIT. A canvas with a healthy topic territory —
// 24 knowledge objects, a question on every open, resolving in about 18 seconds — was given a
// spreadsheet. Everything beneath the boundary worked perfectly: a real `library_sources` row, a
// clean synchronous parse, `complete: true`, both worksheets recovered with every row intact.
//
// The canvas then rendered NOTHING. Two independent cold loads, blank at 20s and 49s.
//
// The mechanism is the path switch in `ensureKnowledgeForCanvas`: the moment `sourceIds` is
// non-empty, the canvas stops taking the path that was working and takes the document path, and the
// territory it already had is never consulted again. It is not deleted — it is abandoned.
//
// 🔴 THE INVARIANT, IN THE OWNER'S OWN WORDS: "changing provenance must not change knowledge
// identity, learner evidence history, or objective continuity." Attaching a source IS a provenance
// event. A canvas that was answering questions must still be answering the same questions one
// second afterwards.

const knowledge = (statement: string): KnowledgeObject => ({
  id: statement,
  identityKey: `k:${statement}`,
  statement,
  type: "association",
  unanchoredProvenance: ["model"],
});

const anchored = (statement: string): KnowledgeObject => ({
  ...knowledge(statement),
  derivation: "table-row",
  sourceAnchors: [{ sourceId: "lib-1", unitId: "u1" } as never],
  sourceRefs: [{ excerptId: "s1:e1", sourceId: "s1" }],
  unanchoredProvenance: [],
});

const objective = (key: string, source: KnowledgeObject): ResolvedObjective => ({
  knowledge: source,
  objective: {
    answer: "b",
    capability: "recall",
    cue: "a",
    identityKey: key,
    identityVersion: 2,
    knowledgeIdentityKey: source.identityKey!,
    label: key,
    parameters: {},
    rowId: `row:${key}`,
  },
});

test("🔴 ACCEPTANCE: attaching a source ADDS to what a canvas knows, it does not replace it", () => {
  // The regression, as a property. A canvas that could ask 3 questions before the upload must be
  // able to ask at least those 3 after it — whatever the document itself turned out to contain.
  const before = ["o1", "o2", "o3"].map((key) => objective(key, knowledge(key)));
  const fromDocument = [objective("o9", anchored("o9"))];

  const after = mergeObjectives(fromDocument, before);

  assert.equal(after.length, 4, "three carried plus one the document taught");
  for (const key of ["o1", "o2", "o3"]) {
    assert.ok(
      after.some((entry) => entry.objective.identityKey === key),
      `${key}: a canvas that was answering questions must still be answering them`,
    );
  }
});

test("🔴 a document that teaches NOTHING still leaves the canvas able to ask", () => {
  // The measured case exactly: the spreadsheet parsed cleanly and this lane read no pairs from it.
  // Zero from the document must mean zero ADDED, never zero TOTAL.
  const before = ["o1", "o2"].map((key) => objective(key, knowledge(key)));

  assert.equal(mergeObjectives([], before).length, 2);
});

test("🔴 one fact met twice is ONE objective, not two", () => {
  // 🔴 THE COST OF THE FIX, PAID HERE. Identity does not depend on provenance, which is what lets a
  // topic-minted fact and the same fact in a lecture be one object — so once both lanes contribute
  // to one canvas, the same objective genuinely arrives down both. It is one row and one evidence
  // history either way; what a duplicate would corrupt is the count of things left to learn.
  const shared = "o1";
  const merged = mergeObjectives(
    [objective(shared, anchored(shared))],
    [objective(shared, knowledge(shared)), objective("o2", knowledge("o2"))],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged.filter((entry) => entry.objective.identityKey === shared).length, 1);
});

test("🔴 the ANCHORED copy survives a tie, because only it can show where it came from", () => {
  // Both entries name the same objective row, so nothing durable turns on this. What turns on it is
  // which knowledge object reaches the surface — and preferring the carried, model-minted copy would
  // silently cost the citation marker on a fact the learner's own document states.
  const shared = "o1";
  const merged = mergeObjectives(
    [objective(shared, anchored(shared))],
    [objective(shared, knowledge(shared))],
  );

  assert.equal(merged[0]?.knowledge.sourceRefs?.length, 1, "the citation survives the merge");
  assert.deepEqual(merged[0]?.knowledge.unanchoredProvenance, []);
});

test("🔴 the carried territory is read, and it REACHES the merge", () => {
  // 🔴 A MERGE NOTHING FEEDS IS NOT A FIX, AND THIS TEST HAS ALREADY FAILED TO CATCH THAT ONCE.
  //
  // The first version asserted only that `carriedTerritory` appeared BEFORE `mergeObjectives` in the
  // source. Calibrating it by reintroducing the exact shipped defect — `mergeObjectives(fromDocument,
  // [])`, the canvas's own territory dropped on the floor — left every test GREEN, because the
  // positions were unchanged. A guard that stays green while the bug it names is live is not a
  // guard; it is the `RUNTIME-001` failure, reproduced in the test written to prevent it.
  //
  // So the assertion is now on the CALL, not the ordering. Positions still matter and are still
  // checked, but they are the weaker claim and can no longer stand in for the stronger one.
  const source = readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export async function ensureKnowledgeForCanvas"));

  const carry = code.indexOf("await carriedTerritory(");
  const grounded = code.indexOf("await groundedTerritory(");
  const merge = code.indexOf("mergeObjectives(");

  assert.ok(carry > 0, "the canvas's existing territory must actually be read");
  assert.ok(carry < grounded, "and read before the fallback decides there is nothing to teach");
  assert.ok(carry < merge, "and before the merge that is supposed to include it");

  // 🔴 THE ASSERTION THAT ACTUALLY CATCHES IT. Whatever `carriedTerritory` returned must be the
  // second argument to the merge, by name.
  const call = code.slice(merge);
  assert.match(
    call.slice(0, call.indexOf(")") + 1),
    /mergeObjectives\(\s*fromDocument,\s*carried\s*\)/,
    "🔴 the carried territory must be MERGED IN, not merely computed above the merge",
  );
});

test("🔴 the fallback does not run when the canvas already has a territory to carry", () => {
  // 🔴 IT WOULD CLOBBER THE TOPIC. The build-once marker is the canvas's ONE territory column, so a
  // grounded build here would overwrite the subject a topic canvas was started from and re-topic it
  // to its own filenames — the same "renaming must never re-teach" failure, through the back door.
  //
  // The honest cost is a real gap and it is stated in the code rather than hidden: a document
  // attached to a canvas that already has a model-built territory contributes only what the
  // deterministic grid lane can read from it. That is a follow-up. It is not a blank canvas.
  const source = readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export async function ensureKnowledgeForCanvas"));
  const guard = code.slice(code.indexOf("await groundedTerritory("));
  const condition = code.slice(0, code.indexOf("await groundedTerritory(")).split("\n").slice(-3).join("\n");

  assert.ok(guard.length > 0);
  assert.match(condition, /carried\.length === 0/, "a carried territory must suppress the rebuild");
  assert.match(condition, /extracted\.length === 0/, "and so must anything the grid lane read");
});

test("🔴🔴 reading MECHANISMS is not gated on what the grid lane found", () => {
  // 🔴 MEASURED LIVE, ON THE OWNER'S OWN CANVAS, THE HOUR THE CAUSAL LANE SHIPPED. The document
  // asserts *"Increasing resistance decreases current when voltage is held constant"* AND carries a
  // two-column glossary. The glossary made `extracted.length` non-zero, the causal read sat inside
  // `if (extracted.length === 0 && ...)`, and so the sentence was never read at all — the Canvas
  // asked "What is the generic for Diovan?". **One glossary table anywhere in a lecture hid every
  // mechanism in it.**
  //
  // A grid of terms and a paragraph asserting a cause are different content. The pair lane is
  // correctly a fallback; reading mechanisms is not, and must never be moved back inside that gate.
  const source = readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("export async function ensureKnowledgeForCanvas"));
  const fnEnd = code.indexOf("\n}\n");
  const body = code.slice(0, fnEnd);

  const call = body.indexOf("await mechanismsFor(");
  const fallback = body.indexOf("await groundedTerritory(");
  assert.ok(call > 0, "the mechanism lane must be called from the document path");
  assert.ok(fallback > 0, "and the pair fallback must still exist");
  assert.ok(call > fallback, "the mechanism read runs after the fallback, not inside it");

  // 🔴 THE ASSERTION THAT ACTUALLY CATCHES THE REGRESSION: no `extracted.length` test may stand
  // between the fallback branch closing and the mechanism read. Anyone re-nesting it has to delete
  // this line to do so.
  const between = body.slice(fallback, call);
  assert.doesNotMatch(between, /extracted\.length === 0/, "the mechanism read must not be re-gated on the grid lane");
});

test("🔴 carrying a territory checks the identity VERSION, and nothing else", () => {
  // 🔴 NOT `groundedReuse`, AND THE DISTINCTION IS THE WHOLE BUG. That function answers "may I skip
  // building?" — a spend question about MATERIAL, which refuses a topic-built territory as
  // `material-changed`. This asks "what did this canvas already know?", a continuity question about
  // the LEARNER, whose answer is the same however the territory was built. Reusing the first for the
  // second is what empties the canvas.
  const source = readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("async function carriedTerritory"));
  const body = fn.slice(0, fn.indexOf("\n}"));

  assert.match(body, /identityVersion !== KNOWLEDGE_IDENTITY_VERSION/);
  assert.doesNotMatch(body, /groundedReuse|materialSubject/, "the subject must not be able to refuse continuity");
});
