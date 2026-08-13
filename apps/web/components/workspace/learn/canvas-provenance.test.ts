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

const ANCHOR = { quote: { exact: "losartan (Cozaar)" }, sourceId: "lib-1", unitId: "b12" };

/** Known from model knowledge and from nothing else. */
const modelOnly = { sourceAnchors: [], unanchoredProvenance: ["model"] as const };
/** The same claim after a real source was found to state it — both ways of knowing. */
const grounded = { sourceAnchors: [ANCHOR], unanchoredProvenance: ["model"] as const };
/** Extracted from the learner's document and never model-known. */
const fromDocument = { sourceAnchors: [ANCHOR], unanchoredProvenance: [] as const };

// ------------------------------------------------------------------ the predicate

test("a typed topic with knowledge behind it discloses its model origin", () => {
  // N10 exactly: canvas 213c2d47, zero sources, 26 knowledge objects in the database.
  assert.equal(modelKnowledgeDisclosed([modelOnly, modelOnly]), true);
});

test("a canvas with no knowledge at all discloses nothing — 'Nothing attached yet' is correct there", () => {
  // 🔴 THE LINE APPEARS BECAUSE MODEL KNOWLEDGE EXISTS, NOT BECAUSE THE CANVAS IS SOURCELESS.
  // A brand-new empty canvas genuinely has nothing behind it, and claiming otherwise would be
  // the same defect pointing the other way — decoration presented as provenance.
  assert.equal(modelKnowledgeDisclosed([]), false);
});

test("knowledge built on a durable source is NOT claimed as model knowledge", () => {
  // That knowledge was extracted from the attached document; saying it came from the model
  // would misattribute the learner's own material.
  assert.equal(modelKnowledgeDisclosed([fromDocument, fromDocument]), false);
});

// ── the laundering, which is what this predicate was rewritten for ──────────

test("🔴 A SOURCE ARRIVING DOES NOT SILENCE THE DISCLOSURE WHILE MODEL-WRITTEN CLAIMS REMAIN", () => {
  // The exact shipped defect, in the exact shape Integration measured on 2026-08-13: a canvas
  // holding twenty-four model-written facts was given a spreadsheet stating five of them. The old
  // predicate asked `sources.every(s => !s.librarySourceId)`, so it went false on the attachment
  // alone and the panel presented the spreadsheet as the origin of all twenty-four.
  //
  // 🔴 THIS ASSERTION IS WHY THE INPUT HAD TO CHANGE, NOT MERELY THE CONDITION. The old signature
  // received the ATTACHMENTS and a COUNT; the mixed canvas is indistinguishable from the fully
  // grounded one under that input, so no rewrite of the old body could have made this pass.
  const mixed = [grounded, grounded, modelOnly, modelOnly];
  assert.equal(modelKnowledgeDisclosed(mixed), true, "claims nothing grounded are still model-written");
});

test("once every claim is genuinely grounded, the disclosure stops — it is not a permanent banner", () => {
  // The other direction, and it has to hold or the line becomes decoration that says nothing.
  // A claim known BOTH ways is grounded: `hasGroundableAnchor` is about anchors, never about
  // whether model knowledge was also involved, so a real excerpt exists to show.
  assert.equal(modelKnowledgeDisclosed([grounded, grounded]), false);
});

test("🔴 a claim with NO way of knowing at all is not announced as model knowledge", () => {
  // Unanchored is not the same as unsourced. An object carrying neither an anchor nor a stated
  // provenance is one nobody can say anything true about, and calling it model knowledge would be
  // inventing an origin rather than reporting one — the same failure the disclosure exists to fix,
  // pointed the other way.
  assert.equal(modelKnowledgeDisclosed([{ sourceAnchors: [], unanchoredProvenance: [] }]), false);
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
