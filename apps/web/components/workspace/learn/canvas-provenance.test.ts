// What the Sources panel is allowed to say about where a canvas's knowledge came from.
//
// 🔴 THE DEFECT THIS PINS (N10, graded FAIL 2026-08-13). On a canvas built entirely from model
// knowledge — a typed topic, nothing uploaded — the Sources panel said "Nothing attached yet."
// while fifty model-sourced knowledge objects sat behind it. That sentence is TRUE about
// attachments and FALSE about provenance, and the surface it appears on is the one a learner
// opens to ask "where did this come from?".
//
// The global invariant is that every claim the UI makes about the source traces back to source
// capability. "Nothing" is a claim about material that has a real, statable origin.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { modelKnowledgeDisclosed } from "./canvas-provenance";

const read = (file: string) => readFileSync(join(import.meta.dirname, file), "utf8");

const durable = { librarySourceId: "lib-1" };
const ephemeral = { librarySourceId: null };

// ------------------------------------------------------------------ the predicate

test("a typed topic with knowledge behind it discloses its model origin", () => {
  // N10 exactly: canvas 213c2d47, zero sources, 26 knowledge objects in the database.
  assert.equal(modelKnowledgeDisclosed([], 26), true);
});

test("a canvas with no knowledge at all discloses nothing — 'Nothing attached yet' is correct there", () => {
  // 🔴 THE LINE APPEARS BECAUSE MODEL KNOWLEDGE EXISTS, NOT BECAUSE THE CANVAS IS SOURCELESS.
  // A brand-new empty canvas genuinely has nothing behind it, and claiming otherwise would be
  // the same defect pointing the other way — decoration presented as provenance.
  assert.equal(modelKnowledgeDisclosed([], 0), false);
});

test("knowledge built on a durable source is NOT claimed as model knowledge", () => {
  // That knowledge was extracted from the attached document; saying it came from the model
  // would misattribute the learner's own material.
  assert.equal(modelKnowledgeDisclosed([durable], 40), false);
});

test("an EPHEMERAL attachment does not suppress the disclosure", () => {
  // 🔴 THE CONDITION MIRRORS THE RUNTIME'S OWN BRANCH, which is `sourceIds.length === 0` over
  // sources carrying a `librarySourceId` — NOT `sources.length === 0`. A canvas holding an
  // attachment with no library row still takes the topic path, so its knowledge genuinely came
  // from the model. Keying this on `sources.length` would go silent on exactly that canvas while
  // the panel listed a file that contributed nothing to what is being taught.
  assert.equal(modelKnowledgeDisclosed([ephemeral], 12), true);
});

test("one durable source among ephemeral ones is enough to suppress it", () => {
  assert.equal(modelKnowledgeDisclosed([ephemeral, durable], 12), false);
});

// ------------------------------------------------------------------ the surface

test("the Sources panel discloses model origin instead of only 'Nothing attached yet'", () => {
  const source = read("canvas-controls.tsx");

  // 🔴 THE FAILING STATE THIS CAPTURES: before the fix this file's ONLY empty-state branch was
  // the bare sentence, with no mention of model provenance anywhere in the panel.
  assert.match(
    source,
    /Generated from model knowledge/,
    "the sources panel must state where model-sourced knowledge came from",
  );

  // And the sentence it replaces must be CONDITIONAL on there being no model knowledge either —
  // otherwise both could render and the panel would contradict itself.
  const empty = /Nothing attached yet/.exec(source);
  assert.ok(empty, "the genuinely-empty sentence should still exist for genuinely empty canvases");
  const guard = source.slice(Math.max(0, empty.index - 400), empty.index);
  assert.match(
    guard,
    /modelKnowledge/,
    "'Nothing attached yet' must be guarded by the model-knowledge check, not reachable whenever sources are empty",
  );
});

test("no per-sentence provenance badge is introduced inline", () => {
  // 🔴 THE OTHER DIRECTION, AND IT ALREADY PASSED. N10's inline half was graded a PASS precisely
  // because nothing marks individual generated sentences. Fixing the panel must not buy the fix
  // by over-disclosing everywhere else. One line, in the Sources surface, and nowhere near the prose.
  const document = read("canvas-document.tsx");
  assert.doesNotMatch(document, /Generated from model knowledge/);
});
