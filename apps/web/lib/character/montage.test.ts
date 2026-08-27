// The faces the character wears while nothing is happening.
//
// Owner, 2026-08-27: *"it still does not do expressions after a while of following the mouse"*, and
// then, plainly: *"it essentially needs to follow mouse but also do montage of expressions"*.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { FACE_BY_ID } from "@/lib/avatar";
import { EXPRESSION_IDS } from "@/lib/avatar/expressions";

import { MONTAGE, MONTAGE_CHOICES, MONTAGE_HOLD_MS, MONTAGE_LEFT_OUT, montageFace, resolveMontage } from "./montage";

const resting = { restingMs: 0, atRest: true, busy: false };

test("🔴 every face in the montage exists and is one of the sixteen", () => {
  // The same mistake this caught once already, in the schedule proposal: `playful` is a GAZE LOOP,
  // not a feeling, and a montage naming it would draw a blank frame nobody could attribute.
  for (const id of [...MONTAGE, ...MONTAGE_LEFT_OUT]) {
    assert.ok(FACE_BY_ID.has(id), `${id} is not a drawable face`);
    assert.ok(EXPRESSION_IDS.includes(id), `${id} is not one of the sixteen feelings`);
  }
  assert.equal(MONTAGE.length + MONTAGE_LEFT_OUT.length, EXPRESSION_IDS.length, "the sixteen are not all accounted for");
});

test("🔴🔴 angry and scared are left out, because at rest they read as being about the learner", () => {
  // Rule three: a feeling points at itself, never at the learner. At rest there is nothing else
  // happening for a face to be about, so those two are the only ones a person can take personally.
  // The front page cycles all sixteen and is right to — it is a showcase with nothing at stake.
  assert.deepEqual([...MONTAGE_LEFT_OUT].sort(), ["angry", "scared"]);
  for (const id of MONTAGE_LEFT_OUT) assert.ok(!MONTAGE.includes(id), `${id} is both in and out`);
});

test("🔴🔴 it runs ONLY at rest, and never over something the character is doing", () => {
  assert.equal(montageFace({ ...resting, atRest: false }), null, "a montage face is painted over a working character");
  assert.equal(montageFace({ ...resting, busy: true }), null, "a montage face is painted over a poke");
  assert.notEqual(montageFace(resting), null, "the montage never runs at all");
});

test("it changes face on its own schedule and comes back round", () => {
  const at = (ms: number) => montageFace({ ...resting, restingMs: ms });
  assert.equal(at(0), at(MONTAGE_HOLD_MS - 1), "the face changed inside one hold");
  assert.notEqual(at(0), at(MONTAGE_HOLD_MS), "the face never changes");
  assert.equal(at(0), at(MONTAGE_HOLD_MS * MONTAGE.length), "the cycle does not return to where it started");
});

test("🔴 unhurried, but not so slow that nobody ever catches two", () => {
  // 🔴 REPOINTED 2026-08-27: 9s → 5s (owner: *"its still not doing the expression montage i want"*).
  // The floor's reasoning holds — the commonest thing a learner does here is READ, and a face
  // changing every second in the corner of their eye pulls at attention they are spending
  // elsewhere. The CEILING is the half that was missing: an expression moves the eyes only, on a
  // 76px character, so it is a quiet change to begin with, and at nine seconds most people never
  // saw two in a row and concluded nothing was happening.
  assert.ok(MONTAGE_HOLD_MS >= 3_000, `${MONTAGE_HOLD_MS}ms is a flicker beside someone trying to read`);
  assert.ok(MONTAGE_HOLD_MS <= 7_000, `${MONTAGE_HOLD_MS}ms is slow enough that nobody notices it happening`);
});

test("🔴🔴 the learner's own list is used, and a bad one never leaves the character faceless", () => {
  // Owner, 2026-08-27: *"allow me to pick the expressions for the montage"*. It is stored in
  // `localStorage`, so it can be anything: from an older build, hand-edited, or emptied.
  assert.equal(montageFace({ ...resting, chosen: ["happy"] }), "happy", "a chosen list is ignored");
  assert.equal(montageFace({ ...resting, chosen: ["happy"], restingMs: MONTAGE_HOLD_MS * 3 }), "happy", "one chosen face should hold");
  assert.deepEqual(resolveMontage(["happy", "not-a-face"]), ["happy"], "an unknown id is drawn instead of dropped");
  // 🔴 EMPTY MEANS THE DEFAULT, NOT NOTHING. "No expressions" is already expressible by leaving one
  // ticked, and a character frozen on one face is a better failure than a blank one.
  assert.deepEqual(resolveMontage([]), MONTAGE);
  assert.deepEqual(resolveMontage(["nope"]), MONTAGE);
  assert.deepEqual(resolveMontage(null), MONTAGE, "null is 'not read from storage yet'");
});

test("🔴 every face the picker offers is real, and it offers ALL sixteen", () => {
  // The card draws each one with the live engine, so a bad id is a blank tile the owner would be
  // asked to choose from. And the default is a recommendation, not a cage: `angry` and `scared` are
  // off by default and still offered, because someone who wants a grumpy character may have one.
  for (const choice of MONTAGE_CHOICES) {
    assert.ok(FACE_BY_ID.has(choice.id), `the picker offers ${choice.id}, which is not a drawable face`);
    assert.ok(choice.label.trim().length > 0, `${choice.id} has no label for the card`);
  }
  assert.equal(MONTAGE_CHOICES.length, EXPRESSION_IDS.length, "the picker does not offer all sixteen");
  for (const id of [...MONTAGE, ...MONTAGE_LEFT_OUT]) {
    assert.ok(MONTAGE_CHOICES.some((c) => c.id === id), `${id} is in the default set but not offered`);
  }
});

test("🔴🔴 BOTH surfaces run the montage, not just the canvas", () => {
  // This is most of why the owner kept saying he could not see it: it was wired into the dock and
  // the FRONT DOOR renders `NemesisAvatar` directly, so every layer the dock composes has to be
  // repeated there. The character was doing its montage on the screen he was not looking at.
  const home = readFileSync(new URL("../../components/workspace/learn/canvas-home.tsx", import.meta.url), "utf8");
  const dock = readFileSync(new URL("../../components/character/character-dock.tsx", import.meta.url), "utf8");
  assert.match(home, /useMontage\(/, "the front door's greeter stopped pulling faces");
  assert.match(home, /animation=\{greeterFace\}/, "the greeter computes a montage face and then draws something else");
  assert.match(dock, /useMontage\(/, "the canvas character stopped pulling faces");
});

test("two characters on one page are not in step", () => {
  // The front door hands over to the canvas, and for a moment both exist.
  assert.notEqual(montageFace({ ...resting, seed: 0 }), montageFace({ ...resting, seed: 1 }));
});

test("🔴 the montage is addressed from a clock, not advanced by a timer", () => {
  // Same construction as the blink schedule: asking about a moment an hour in costs the same as
  // the first second, and it cannot drift. A counter would also make every character on a page
  // march in step, which is what `seed` exists to prevent.
  const src = readFileSync(new URL("./montage.ts", import.meta.url), "utf8");
  assert.match(src, /Math\.floor\(restingMs \/ MONTAGE_HOLD_MS\)/, "the montage advances by counting rather than by asking the clock");
});
