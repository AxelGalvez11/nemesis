// The faces the character wears while nothing is happening.
//
// Owner, 2026-08-27: *"it still does not do expressions after a while of following the mouse"*, and
// then, plainly: *"it essentially needs to follow mouse but also do montage of expressions"*.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { FACE_BY_ID } from "@/lib/avatar";
import { EXPRESSION_IDS } from "@/lib/avatar/expressions";

import { MONTAGE, MONTAGE_HOLD_MS, MONTAGE_LEFT_OUT, montageFace } from "./montage";

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

test("🔴 slow, on the same reasoning as the doze threshold", () => {
  // The commonest thing a learner does here is READ. A face changing every couple of seconds in
  // the corner of their eye is a thing pulling at attention they are trying to spend elsewhere.
  assert.ok(MONTAGE_HOLD_MS >= 6_000, `${MONTAGE_HOLD_MS}ms is a flicker beside someone trying to read`);
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
