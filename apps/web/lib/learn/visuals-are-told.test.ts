import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { turnRouterMessages, type TurnContext } from "./turn-router";

// ── a capability the model is not told about does not exist (workstream H) ───────────────────
//
// Owner's build order: *"Nemesis can draw sixteen kinds of things … but the model decides when to
// draw. So someone can have five conversations and never see one — and this is supposed to be the
// reason they chose you."*
//
// 🔴🔴🔴 THIS FILE EXISTS BECAUSE THE PROTECTION IT PROVIDES WAS ALREADY CLAIMED AND WAS NOT
// THERE. `turn-router.ts` carried this sentence:
//
//     "Anything added to canvas-visual.ts or subject-visuals.ts must be added HERE in the same
//      commit, and visual-route.test.ts now fails the build if it is not."
//
// It did not. `visual-route.test.ts` has thirty-nine tests and not one of them reads the turn
// packet. So the file documented a safety net that did not exist — which is worse than having no
// net, because the next person to add a renderer would read that sentence and trust it.
//
// 🔴🔴 AND THE FAILURE IT GUARDS AGAINST IS MEASURED, NOT HYPOTHETICAL. Between 2026-08-20 and
// 2026-08-24 the packet named EIGHT kinds while FIFTEEN were built, tested, merged and deployed.
// Circuits, sheet music, 3D surfaces, 3D molecules, the whole body atlas and the licensed figure
// shelf all existed and the model was told they did not. Production evidence from that window:
// asked for a series circuit it computed the right 320 Ω and described the diagram in words;
// asked to teach anatomy it wrote "[figure: relationship diagram of …]" — a prose description of
// the picture it wanted — against an atlas that resolves a named structure in microseconds.
//
// 🔴 THE MAPPING BELOW IS THE FORCING FUNCTION, and its incompleteness is the point. A new kind
// with no entry fails immediately, with a message naming both places to edit. That is the whole
// mechanism: it is not possible to add a renderer and quietly leave the model ignorant of it.

const kindsIn = (file: string): readonly string[] => {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  return [...new Set([...source.matchAll(/kind: "([a-z]+)"/g)].map((match) => match[1]!))].sort();
};

/** Every kind that a renderer can actually draw, read from the two files that define them. */
const RENDERABLE = [...new Set([...kindsIn("./canvas-visual.ts"), ...kindsIn("./subject-visuals.ts")])].sort();

/**
 * How the packet names each kind to the model.
 *
 * 🔴 LEARNER-FACING PHRASES, NOT SLUGS, because that is what the contract sentence is written in
 * — "a bar of music", not `score`. Matching on the slug would pass for a sentence that never
 * mentioned music, which is exactly the failure this guards.
 */
const PHRASE_FOR_KIND: Record<string, RegExp> = {
  anatomy: /an anatomical structure/,
  circuit: /a circuit/,
  code: /a traced snippet of code/,
  construction: /a geometric construction/,
  equation: /an equation/,
  figure: /a licensed textbook figure/,
  macromolecule: /a protein/,
  quantitative: /a plot/,
  relationship: /a diagram/,
  score: /a bar of music/,
  structure: /a molecule/,
  surface: /a 3D surface/,
  table: /a table/,
  timeline: /a timeline/,
  vectors: /a force diagram/,
};

const EMPTY: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: false,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  memory: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  stagedPassage: "",
  today: "Tuesday, 18 August 2026",
  webContext: "",
};

const PACKET = turnRouterMessages({ context: EMPTY, utterance: "explain how a series circuit works" })
  .map((message) => message.content)
  .join("\n");

test("🔴 the renderable kinds are read from the renderers, not from a list in this file", () => {
  // If this ever reads a hardcoded array, the guard becomes a copy that drifts alongside the one
  // it is supposed to be checking.
  assert.ok(RENDERABLE.length >= 15, `only ${RENDERABLE.length} kinds found — the source files moved or changed shape`);
  for (const expected of ["anatomy", "circuit", "score", "macromolecule", "surface"]) {
    assert.ok(RENDERABLE.includes(expected), `${expected} is no longer discoverable from the renderer files`);
  }
});

test("🔴🔴🔴 every kind a renderer can draw is named in the packet the model reads", () => {
  // Calibration: delete "a bar of music" from turn-router.ts's capability sentence and this
  // reddens naming `score`.
  const missing: string[] = [];
  for (const kind of RENDERABLE) {
    const phrase = PHRASE_FOR_KIND[kind];
    if (!phrase) continue; // reported by the next test, with better instructions
    if (!phrase.test(PACKET)) missing.push(kind);
  }
  assert.deepEqual(
    missing,
    [],
    "these renderers exist and the model is not told about them, so it will describe the picture in " +
      "words instead of drawing it — add each to the capability sentence in turn-router.ts",
  );
});

test("🔴🔴 a NEW kind cannot be added without telling the model about it", () => {
  // The forcing function. Adding a renderer to canvas-visual.ts or subject-visuals.ts and stopping
  // there fails here, with the two places to edit named in the message.
  const unmapped = RENDERABLE.filter((kind) => !PHRASE_FOR_KIND[kind]);
  assert.deepEqual(
    unmapped,
    [],
    "a renderer was added with no phrase for it. Two edits, same commit: (1) name it in the " +
      "capability sentence in lib/learn/turn-router.ts, in learner-facing words, and (2) add that " +
      "phrase to PHRASE_FOR_KIND in this file. A capability the model is not told about does not exist.",
  );
});

test("🔴 the packet's own claim about where it is guarded is true", () => {
  // The sentence that started this: turn-router.ts pointed at visual-route.test.ts, which never
  // checked the packet. A comment naming the wrong guard is worse than naming none, because the
  // next person to add a renderer reads it and trusts it.
  const router = readFileSync(new URL("./turn-router.ts", import.meta.url), "utf8");
  const claim = /`?visual-route\.test\.ts`? now fails the build/.test(router);
  assert.ok(!claim, "turn-router.ts still points at visual-route.test.ts, which does not read the packet");
  assert.match(router, /visuals-are-told\.test\.ts/, "turn-router.ts no longer names the guard that actually holds this");
});
