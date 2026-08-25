import assert from "node:assert/strict";
import { test } from "node:test";

import { BODY, EYE_H, EYE_SPLIT, EYE_W } from "@/lib/mascot/geometry";
import { STATE_ORDER } from "@/lib/mascot/states";

import { BS_EXPRESSIONS } from "./bible-strong-reference";
import {
  BLOUB_REST_H,
  BLOUB_REST_W,
  REFERENCE,
  bloubReferenceCharacter,
} from "./bloub-reference";
import { animationDuration, normaliseDoc, newDoc, HEAD_FLAT } from "./document";
import { expressionFrame } from "./frame";
import { sampleAnimation } from "./playback";

// ── The reference is a transcription, and these guards are what make that claim checkable
//
// 🔴 THE RAW NUMBERS ARE RESTATED HERE, DELIBERATELY. Asserting `REFERENCE` against
// itself would pass forever and prove nothing. These are read off
// `packages/shared/src/bloub/states.ts` and `face.ts` a second time, by hand, so the test
// and the table are two independent transcriptions of the same source — and a typo in
// either one shows up as a disagreement rather than as a silently wrong character.
//
// If bloub is ever re-vendored and its timings change, this file is what fails, and the
// fix is to re-read the source rather than to edit the expectation to match the table.

/** `packages/shared/src/bloub/states.ts`, `STATES[]`: id, duration, morph, blinkIn. */
const SOURCE_TIMING: readonly [string, number, number, boolean][] = [
  ["idle", 2.4, 0.45, false],
  ["thinking", 2.6, 0.4, true],
  ["wink", 1.6, 0.3, true],
  ["wide", 1.8, 0.55, true],
  ["alert", 2.4, 0.45, false],
  ["notify", 2.2, 0.5, true],
  ["exclaim", 2, 0.45, false],
  ["sleep", 2.4, 0.5, false],
  ["egg", 1.8, 0.4, true],
  ["hexagon", 1.6, 0.4, true],
  ["play", 2, 0.5, true],
  ["orbit", 3.4, 0.6, false],
  ["swirl", 1.3, 0.3, true],
  ["burst", 2.6, 0.4, false],
  ["comet", 2.4, 0.45, false],
];

/**
 * `states.ts` again: the eye sizes, in units of ball radius, before any ratio is taken.
 *
 * Keyed by STATE, because every state carries its own eye in the reference set — see the
 * note at the top of `bloub-reference.ts` on why sharing one face across eight states was
 * the bug that made most of the transcription come out as a circle.
 */
const SOURCE_EYES: Readonly<Record<string, [number, number]>> = {
  idle: [0.186, 0.412], // face.ts, EYE_W / EYE_H — the resting eye
  wide: [0.356, 0.875],
  notify: [0.505, 0.498],
  egg: [0.164, 0.385],
  hexagon: [0.177, 0.411],
  play: [0.18, 0.34],
  orbit: [0.18, 0.34], // shares play's eye exactly
};

/** `states.ts`: which body each state draws, and the catalogue shape it maps to. */
const SOURCE_SHAPES: Readonly<Record<string, string>> = {
  idle: "circle",
  thinking: "circle",
  wink: "circle",
  wide: "circle",
  alert: "column", // barItalic
  notify: "circle",
  exclaim: "column", // barUpright
  sleep: "circle",
  egg: "drop", // silhouette(egg)
  hexagon: "crystal", // silhouette(hexagon)
  play: "triangle", // spinningTriangle
  orbit: "circle",
  swirl: "circle",
  burst: "circle",
  comet: "circle",
};

test("🔴 every reference timing matches bloub's own state table", () => {
  assert.equal(REFERENCE.length, SOURCE_TIMING.length, "the reference has gained or lost a state");
  for (const [id, hold, morph, blinkIn] of SOURCE_TIMING) {
    const row = REFERENCE.find((r) => r.id === id);
    assert.ok(row, `${id} is missing from the reference`);
    assert.equal(row.hold, hold, `${id}: hold is ${row.hold}, bloub's duration is ${hold}`);
    assert.equal(row.morph, morph, `${id}: morph is ${row.morph}, bloub's is ${morph}`);
    assert.equal(row.blinkIn, blinkIn, `${id}: blinkIn is ${row.blinkIn}, bloub's is ${blinkIn}`);
  }
});

test("🔴 every face is the measured ratio against bloub's resting eye", () => {
  // The one arithmetic step between the source and the shipped table. Recomputed here
  // from the raw sizes rather than copied from the table it is checking.
  assert.equal(BLOUB_REST_W, 0.186);
  assert.equal(BLOUB_REST_H, 0.412);
  for (const [id, [w, h]] of Object.entries(SOURCE_EYES)) {
    const row = REFERENCE.find((r) => r.id === id);
    assert.ok(row, `${id} is missing from the reference`);
    assert.ok(
      Math.abs(row.w - w / BLOUB_REST_W) < 0.005,
      `${id}.w is ${row.w}, the measured ratio is ${(w / BLOUB_REST_W).toFixed(3)}`,
    );
    assert.ok(
      Math.abs(row.h - h / BLOUB_REST_H) < 0.005,
      `${id}.h is ${row.h}, the measured ratio is ${(h / BLOUB_REST_H).toFixed(3)}`,
    );
  }
});

test("🔴 every state wears the silhouette bloub draws for it", () => {
  // The failure this catches is the one the owner spotted on screen: a reference set that
  // is a circle everywhere because the states were sharing one face, and a face carried
  // the shape. Eight of the fifteen are circles, which is exactly why a wrong mapping here
  // looks almost right.
  for (const [id, shape] of Object.entries(SOURCE_SHAPES)) {
    const row = REFERENCE.find((r) => r.id === id);
    assert.ok(row, `${id} is missing from the reference`);
    assert.equal(row.shape, shape, `${id} wears ${row.shape}, bloub draws ${shape}`);
  }
});

test("🔴 the reference is drawn with the reference's eye, not with ours", () => {
  // bloub's eyes are capsules. Ours are the body's own superellipse at a small scale,
  // which is fuller in the corners at the same width and height — so a transcription
  // rendered with our eye is visibly not the transcription.
  assert.equal(bloubReferenceCharacter("c").eyeShape, "capsule");
});

test("🔴 the wink's height split is the reference's, to the precision the model allows", () => {
  // bloub: inner 0.464 tall, outer 0.089 — a ratio of 5.21 : 1. Our `asym` varies eye
  // height by (1 +/- 0.02a), so the ratio it produces is (1 + 0.02a) / (1 - 0.02a). This
  // is the only face whose numbers are derived rather than read, so it is the only one
  // where the derivation can be wrong without looking wrong.
  const wink = REFERENCE.find((r) => r.id === "wink")!;
  const produced = (1 + 0.02 * wink.asym) / (1 - 0.02 * wink.asym);
  const wanted = 0.464 / 0.089;
  assert.ok(Math.abs(produced - wanted) / wanted < 0.02, `wink splits ${produced.toFixed(2)}:1, bloub splits ${wanted.toFixed(2)}:1`);

  // And its mean height is the mean of the two the reference draws.
  const meanWanted = (0.464 / BLOUB_REST_H + 0.089 / BLOUB_REST_H) / 2;
  assert.ok(Math.abs(wink.h - meanWanted) < 0.005, `wink.h is ${wink.h}, the mean ratio is ${meanWanted.toFixed(3)}`);
});

test("🔴 every animation step names a face that exists", () => {
  // A step naming a face that is not there would be dropped by the repair — leaving an
  // animation that plays nothing, silently.
  const character = bloubReferenceCharacter("c");
  const ids = new Set(character.expressions.map((e) => e.id));
  for (const anim of character.animations) {
    for (const step of anim.steps) {
      assert.ok(ids.has(step.expressionId), `${anim.name} names "${step.expressionId}", which does not exist`);
    }
  }
});

test("🔴 every face is previewed over a state this engine actually has", () => {
  for (const state of REFERENCE) {
    assert.ok(
      (STATE_ORDER as readonly string[]).includes(state.mode),
      `${state.id} previews over "${state.mode}", which is not a mascot state`,
    );
  }
});

test("the reference character survives the repair unchanged", () => {
  // Every number in it has to be inside `LIMITS`, or opening the studio would silently
  // clamp the transcription — which is the failure this whole file exists to prevent.
  // `notify`'s width of 2.715 is the one that found the old ceiling of 2.5.
  const built = bloubReferenceCharacter("char-2");
  const repaired = normaliseDoc({ version: 1, characters: [built], selected: built.id }).characters[0]!;
  assert.deepEqual(repaired, built);
});

test("🔴 each reference animation runs for its state's own measured length", () => {
  const character = bloubReferenceCharacter("char-2");
  for (const state of REFERENCE) {
    const anim = character.animations.find((a) => a.id === state.id);
    assert.ok(anim, `${state.id} has no animation`);
    assert.equal(anim.steps.length, 1, `${state.id} is a sequence; the reference is one arrival and one hold`);
    assert.ok(
      Math.abs(animationDuration(anim) - (state.morph + state.hold)) < 1e-9,
      `${state.id} runs ${animationDuration(anim)}s, the reference is ${state.morph + state.hold}s`,
    );
  }
});

test("🔴 a blinkIn state actually shuts its eyes during the arrival, and a non-blinkIn one does not", () => {
  // The arrival blink is the reference's signature move and it is invisible in a still.
  // Nine of the fifteen states use it; a wiring mistake would lose all nine at once and
  // nothing else about the animation would look wrong.
  const character = bloubReferenceCharacter("char-2");
  const lidAt = (id: string, t: number) =>
    sampleAnimation(character.animations.find((a) => a.id === id)!, character.expressions, t).lid;

  // 🔴 SAMPLED ACROSS THE ARRIVAL, NOT AT ITS MIDPOINT. The first version of this test
  // checked the lid at exactly `morph / 2` and failed at 0.270 — because a real lid closes
  // faster than it opens (75ms down, 115ms up), so the fully-shut instant sits slightly
  // BEFORE the centre of the blink. Asserting on one instant was asserting on that
  // asymmetry by accident; what the effect actually promises is that the eye is shut at
  // some point during the change, which is what this measures.
  for (const state of REFERENCE) {
    const samples = Array.from({ length: 41 }, (_, i) => lidAt(state.id, (i / 40) * state.morph));
    const shut = Math.min(...samples);
    if (state.blinkIn) {
      assert.ok(shut < 0.05, `${state.id} should blink across its arrival; the lid never went below ${shut.toFixed(3)}`);
    } else {
      assert.equal(shut, 1, `${state.id} does not blink in the reference; the lid reached ${shut.toFixed(3)}`);
    }
  }
});

test("the arrival blink is over by the time the hold begins", () => {
  // A blink still closing after the morph would read as the character being sleepy rather
  // than as punctuation on the change.
  const character = bloubReferenceCharacter("char-2");
  for (const state of REFERENCE.filter((s) => s.blinkIn)) {
    const anim = character.animations.find((a) => a.id === state.id)!;
    const lid = sampleAnimation(anim, character.expressions, state.morph + 0.05).lid;
    assert.ok(lid > 0.9, `${state.id}'s arrival blink is still closing into the hold: ${lid.toFixed(3)}`);
  }
});

// ── Both references are drawn on a round body, and the shipped character is not ──

test("🔴 a reference whose body is a circle draws a circle, not the Nemesis egg", () => {
  // 🔴 THIS IS THE BUG THE OWNER SAW AND NOTHING ELSE CAUGHT. `SHAPES.circle` is
  // r(theta) = 1 at every angle, so both references named it and both still rendered 14%
  // wider than tall — because the profile is drawn into the mark's own 41-by-36 box. It
  // passed every existing test: the profile WAS a circle, the area WAS normalised, the
  // silhouette WAS inside the viewBox. Only the picture was wrong. See `ROUND_STRETCH`.
  const doc = newDoc();
  for (const name of ["Bloub reference", "Bible Strong reference"]) {
    const c = doc.characters.find((x) => x.name === name)!;
    const face = c.expressions.find((e) => (e.shape ?? c.body.shape) === "circle");
    assert.ok(face, `${name} has no face on a circle body`);
    const f = expressionFrame(c, face, 0.9, { reduced: true });
    assert.ok(
      Math.abs(f.body.rx - f.body.ry) < 0.01,
      `${name} draws ${f.body.rx.toFixed(2)} by ${f.body.ry.toFixed(2)} — not round`,
    );
  }
});

test("🔴 the shipped character keeps its own box, which is NOT round", () => {
  // The other half of the claim: `ROUND_STRETCH` is a lever a reference pulls, not a
  // change to the mark. 41 by 36 IS Nemesis — if this ever goes round, the product's
  // character has been quietly redrawn by a studio fixture.
  const doc = newDoc();
  const us = doc.characters.find((x) => x.name === "Nemesis")!;
  const f = expressionFrame(us, us.expressions[0]!, 0.9, { reduced: true });
  assert.ok(f.body.rx > f.body.ry * 1.1, `Nemesis drew ${f.body.rx.toFixed(2)} by ${f.body.ry.toFixed(2)}`);
  assert.equal(us.body.stretch, 1);
  assert.equal(BODY.rx / BODY.ry > 1.1, true);
});

test("🔴 a converted eye reaches the picture as the number it was written as", () => {
  // 🔴 WHAT THIS PROVES, AND WHAT IT DOES NOT. It follows one number from the table all
  // the way to the drawn frame — through `toExpressionDef`, the engine's expression
  // layer, the containment fit — and asserts the picture still says what the table said.
  // That is the class the 14% bug belonged to: the numbers were right and the drawing was
  // not. It CANNOT catch a mistranscribed table, because it reads that same table; the
  // bloub timings above are guarded by hand-restated numbers for exactly that reason, and
  // their per-face source is a JSON export we do not carry a second copy of.
  //
  // Asserted with the head flat and the gaze centred: both legitimately move and
  // foreshorten an eye, and neither is what this is measuring.
  const c = newDoc().characters.find((x) => x.name === "Bible Strong reference")!;
  for (const id of ["small-attentive", "upward-side-glance", "downward-gaze"]) {
    const src = BS_EXPRESSIONS.find((e) => e.id === id)!;
    const face = c.expressions.find((e) => e.name.toLowerCase().replace(/ /g, "-") === id)!;
    const f = expressionFrame(c, face, 0.9, { reduced: true, head: HEAD_FLAT, look: null });
    const R = f.body.rx;
    const halfSeparation = Math.abs(f.eyes[1].cx - f.eyes[0].cx) / 2;
    assert.ok(Math.abs(f.eyes[0].rx / R - EYE_W * src.w) < 1e-3, `${id}: eye width off`);
    assert.ok(Math.abs(f.eyes[0].ry / R - EYE_H * src.h) < 5e-3, `${id}: eye height off`);
    assert.ok(Math.abs(halfSeparation / R - EYE_SPLIT * src.spread) < 1e-3, `${id}: eye separation off`);
  }
});

test("a fresh studio opens with the shipped character and both references", () => {
  const doc = newDoc();
  assert.equal(doc.characters.length, 3);
  assert.ok(doc.characters.some((c) => c.name === "Bible Strong reference"), "the second reference is missing");
  const reference = doc.characters.find((c) => c.name === "Bloub reference");
  assert.ok(reference, "the reference character is missing");
  assert.equal(reference.animations.length, 15);
  // One face per state, not one per distinct eye — see the note in `bloub-reference.ts`.
  assert.equal(reference.expressions.length, 15);
  // The shipped character is the one selected: the studio opens on something editable.
  assert.equal(doc.characters.find((c) => c.id === doc.selected)!.name, "Nemesis");
});
