import assert from "node:assert/strict";
import { test } from "node:test";

import { EXPRESSIONS } from "@/lib/mascot/expressions";
import { SHAPES } from "@/lib/mascot/shapes";

import {
  DOC_VERSION,
  LIMITS,
  animationDuration,
  characterOf,
  freshId,
  newCharacter,
  newDoc,
  normaliseDoc,
  seedExpressions,
  toExpressionDef,
} from "./document";
import { expressionsToTypeScript, keyFor } from "./export";
import { applyBody, expressionFrame } from "./frame";
import { blinkLidAt, sampleAnimation } from "./playback";

// ── Repair ──────────────────────────────────────────────────────────────────────
//
// 🔴 EVERY CASE HERE IS A DOCUMENT THE STUDIO CAN ACTUALLY BE HANDED. localStorage
// outlives a deploy, so the document being read was written by a build that no longer
// exists; the Export panel accepts a file, so it may have been hand-edited; and the
// devtools console can write anything at all into the key. None of those is exotic, and
// the failure mode for all three is the same — a studio that opens blank, which reads as
// "your work is gone".

test("garbage in, a usable document out", () => {
  for (const input of [null, undefined, 0, "", "nope", [], {}, { characters: [] }, { characters: "x" }]) {
    const doc = normaliseDoc(input);
    assert.equal(doc.version, DOC_VERSION);
    assert.ok(doc.characters.length >= 1, `no characters for ${JSON.stringify(input)}`);
    assert.ok(
      doc.characters.some((c) => c.id === doc.selected),
      "selected does not name a character in the document",
    );
  }
});

test("🔴 a character with no faces gets the shipped nine, not an empty studio", () => {
  const doc = normaliseDoc({ characters: [{ id: "c", name: "X", expressions: [] }] });
  assert.equal(doc.characters[0]!.expressions.length, Object.keys(EXPRESSIONS).length);
});

test("🔴 out-of-range numbers are clamped, not passed through", () => {
  // A hand-edited file, or a document from a build whose limits were wider. Both reach
  // the renderer, and `h: 0` is an eye no blink can reopen.
  const doc = normaliseDoc({
    characters: [
      {
        id: "c",
        name: "X",
        expressions: [{ id: "e", name: "E", h: 0, w: 1e6, rise: -50, tilt: 999, asym: -999, curve: 7 }],
        body: { scale: 40, stretch: -3, shapeMix: 12, taper: 9, pinch: -9, ripple: 9 },
      },
    ],
  });
  const e = doc.characters[0]!.expressions[0]!;
  assert.equal(e.h, LIMITS.h.min);
  assert.equal(e.w, LIMITS.w.max);
  assert.equal(e.rise, LIMITS.rise.min);
  assert.equal(e.tilt, LIMITS.tilt.max);
  assert.equal(e.asym, LIMITS.asym.min);
  assert.equal(e.curve, LIMITS.curve.max);

  const b = doc.characters[0]!.body;
  assert.equal(b.scale, LIMITS.scale.max);
  assert.equal(b.stretch, LIMITS.stretch.min);
  assert.equal(b.shapeMix, LIMITS.shapeMix.max);
  assert.equal(b.taper, LIMITS.taper.max);
  assert.equal(b.pinch, LIMITS.pinch.min);
  assert.equal(b.ripple, LIMITS.ripple.max);
});

test("🔴 NaN and Infinity never survive the repair", () => {
  // One non-finite number reaching the renderer takes up residence in the gaze mix and
  // the character never looks at anything again — the engine refuses a non-finite look
  // target for exactly this reason. The document is the other door into the same bug.
  const doc = normaliseDoc({
    characters: [
      {
        id: "c",
        name: "X",
        expressions: [{ id: "e", name: "E", h: NaN, w: Infinity, curve: -Infinity }],
        body: { scale: NaN },
      },
    ],
  });
  const e = doc.characters[0]!.expressions[0]!;
  for (const v of [e.h, e.w, e.rise, e.tilt, e.asym, e.curve, doc.characters[0]!.body.scale]) {
    assert.ok(Number.isFinite(v), `${v} is not finite`);
  }
});

test("🔴 a step pointing at a deleted face is dropped, never repointed", () => {
  // Repointing it to a default produces an animation that plays without error and is not
  // the one the author made, which is worse than one that is visibly shorter.
  const doc = normaliseDoc({
    characters: [
      {
        id: "c",
        name: "X",
        expressions: [{ id: "keep", name: "Keep" }],
        animations: [
          {
            id: "a",
            name: "A",
            steps: [
              { expressionId: "keep", hold: 1 },
              { expressionId: "gone", hold: 1 },
              { expressionId: "keep", hold: 1 },
            ],
          },
        ],
      },
    ],
  });
  const steps = doc.characters[0]!.animations[0]!.steps;
  assert.equal(steps.length, 2);
  assert.ok(steps.every((s) => s.expressionId === "keep"));
});

test("duplicate ids are renamed rather than dropped", () => {
  const doc = normaliseDoc({
    characters: [
      { id: "same", name: "A", expressions: [{ id: "e", name: "1" }, { id: "e", name: "2" }] },
      { id: "same", name: "B" },
    ],
  });
  assert.equal(doc.characters.length, 2);
  assert.notEqual(doc.characters[0]!.id, doc.characters[1]!.id);
  const ids = doc.characters[0]!.expressions.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "two faces share an id");
});

test("a blink range given backwards is put in order, not rejected", () => {
  const doc = normaliseDoc({
    characters: [
      {
        id: "c",
        name: "X",
        expressions: [{ id: "e", name: "E" }],
        animations: [{ id: "a", name: "A", steps: [{ expressionId: "e" }], blink: { min: 6, max: 2 } }],
      },
    ],
  });
  const blink = doc.characters[0]!.animations[0]!.blink!;
  assert.ok(blink.min <= blink.max, `${blink.min} > ${blink.max}`);
});

test("🔴 a document round-trips through JSON unchanged", () => {
  // The whole export story rests on this: a backup that does not reload identically is
  // not a backup. Normalising twice must also be a no-op, or every save/load cycle would
  // drift the document a little further.
  const doc = normaliseDoc(newDoc());
  const once = normaliseDoc(JSON.parse(JSON.stringify(doc)));
  const twice = normaliseDoc(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(once, doc);
  assert.deepEqual(twice, once);
});

test("the studio opens on the shipped faces, not on invented ones", () => {
  // If these drift apart, an author 'fixing' a face in the studio is editing something
  // the product never had.
  for (const e of seedExpressions()) {
    const shipped = EXPRESSIONS[e.id as keyof typeof EXPRESSIONS];
    assert.ok(shipped, `${e.id} is not a shipped expression`);
    assert.deepEqual(
      { h: e.h, w: e.w, rise: e.rise, tilt: e.tilt, asym: e.asym, curve: e.curve },
      { h: shipped.h, w: shipped.w, rise: shipped.rise, tilt: shipped.tilt, asym: shipped.asym, curve: shipped.curve },
    );
  }
});

test("freshId never collides with what is already there", () => {
  assert.equal(freshId("e", ["e-1", "e-2"]), "e-3");
  assert.equal(freshId("e", []), "e-1");
  assert.equal(freshId("e", ["e-2"]), "e-1");
});

test("characterOf survives a selection that names nothing", () => {
  const doc = { ...newDoc(), selected: "does-not-exist" };
  assert.ok(characterOf(doc));
});

// ── The body layer ──────────────────────────────────────────────────────────────

test("🔴 an offset can never drive the outline past what geometry accepts", () => {
  // `taper` past ±1 folds the silhouette through itself and `pinch` past 1 closes the
  // waist to a point. Neither is reachable by adding a legal offset to a legal pose
  // unless the sum is checked — which is the whole reason the clamp is after the add.
  const pose = {
    body: {
      dx: 0, dy: 0, scale: 1, stretch: 1, squash: 1, tilt: 0,
      radii: SHAPES.blob, taper: 0.9, pinch: 0.9, ripple: 0.9, ripplePhase: 0, alpha: 1,
    },
    eye: { w: 0.1, h: 0.2, open: 1, split: 0.3, rise: 0, tilt: 0, wink: 0, curve: 0, asym: 0 },
    gazeX: 0, gazeY: 0,
    sat: { count: 0, spread: 0, phase: 0, size: 0, alpha: 0 },
    glow: 0, lift: 0, bodyAlpha: 1, liveliness: 1, lookGain: 0.5,
  } as unknown as Parameters<typeof applyBody>[0];

  const out = applyBody(pose, {
    shape: "blob", shapeMix: 0, scale: 1, stretch: 1, squash: 1, tilt: 0,
    taper: LIMITS.taper.max, pinch: LIMITS.pinch.max, ripple: LIMITS.ripple.max,
  });
  assert.ok(out.body.taper <= 1 && out.body.taper >= -1, `taper ${out.body.taper}`);
  assert.ok(out.body.pinch <= 1 && out.body.pinch >= 0, `pinch ${out.body.pinch}`);
  assert.ok(out.body.ripple <= 1 && out.body.ripple >= 0, `ripple ${out.body.ripple}`);
});

test("shapeMix at 0 leaves the state's own outline exactly alone", () => {
  // The shipped behaviour has to be reachable, and reachable as an identity rather than
  // as a blend that happens to round to the same numbers.
  const radii = SHAPES.lens;
  const pose = {
    body: {
      dx: 0, dy: 0, scale: 1, stretch: 1, squash: 1, tilt: 0,
      radii, taper: 0, pinch: 0, ripple: 0, ripplePhase: 0, alpha: 1,
    },
    eye: { w: 0.1, h: 0.2, open: 1, split: 0.3, rise: 0, tilt: 0, wink: 0, curve: 0, asym: 0 },
    gazeX: 0, gazeY: 0,
    sat: { count: 0, spread: 0, phase: 0, size: 0, alpha: 0 },
    glow: 0, lift: 0, bodyAlpha: 1, liveliness: 1, lookGain: 0.5,
  } as unknown as Parameters<typeof applyBody>[0];

  const out = applyBody(pose, {
    shape: "crystal", shapeMix: 0, scale: 1, stretch: 1, squash: 1, tilt: 0, taper: 0, pinch: 0, ripple: 0,
  });
  assert.equal(out.body.radii, radii, "the outline was rebuilt when it should have been untouched");
});

// ── Playback ────────────────────────────────────────────────────────────────────

const CHAR = newCharacter("Test", "c");
const ANIM = {
  id: "a",
  name: "A",
  steps: [
    { expressionId: "neutral", hold: 1, morph: 0, ease: "linear" as const },
    { expressionId: "bright", hold: 1, morph: 0, ease: "linear" as const },
    { expressionId: "narrow", hold: 2, morph: 0, ease: "linear" as const },
  ],
  playback: "loop" as const,
  blink: null,
};

test("🔴 sampling the same instant twice gives the same frame", () => {
  // The property the scrubber, the thumbnails and every test here rest on. It is lost
  // the moment anything in playback accumulates per frame or reads a clock of its own.
  for (const t of [0, 0.4, 1.7, 3.99, 12.5]) {
    assert.deepEqual(sampleAnimation(ANIM, CHAR.expressions, t), sampleAnimation(ANIM, CHAR.expressions, t));
  }
});

test("🔴 the timeline's bar widths are the truth", () => {
  // A step owns `morph + hold`, so the boundary between step i and step i+1 is the sum of
  // the lengths before it — which is exactly where the panel draws the edge of the bar.
  // Model the morph as time BETWEEN steps instead and every edge shifts.
  assert.equal(sampleAnimation(ANIM, CHAR.expressions, 0.5).step, 0);
  assert.equal(sampleAnimation(ANIM, CHAR.expressions, 1.5).step, 1);
  assert.equal(sampleAnimation(ANIM, CHAR.expressions, 2.5).step, 2);
  assert.equal(sampleAnimation(ANIM, CHAR.expressions, 3.9).step, 2);
  assert.equal(animationDuration(ANIM), 4);
});

test("a loop wraps back to the first step", () => {
  assert.equal(sampleAnimation(ANIM, CHAR.expressions, 4.5).step, 0);
  assert.equal(sampleAnimation(ANIM, CHAR.expressions, 8.5).step, 0);
});

test("🔴 a loop's seam is continuous, not a jump", () => {
  // The first step arrives from the LAST one when looping, which is the only thing that
  // makes a cycle read as a cycle. Drop that and the face snaps at the wrap.
  const withMorph = {
    ...ANIM,
    steps: ANIM.steps.map((s, i) => (i === 0 ? { ...s, morph: 0.5 } : s)),
  };
  const total = animationDuration(withMorph);
  const before = sampleAnimation(withMorph, CHAR.expressions, total - 0.001).def;
  const after = sampleAnimation(withMorph, CHAR.expressions, 0.001).def;
  // Two thousandths of a second apart: any real discontinuity is far larger than this.
  for (const k of ["h", "w", "curve", "rise"] as const) {
    assert.ok(Math.abs(before[k] - after[k]) < 0.05, `${k} jumps ${before[k]} → ${after[k]} at the seam`);
  }
});

test("`once` holds its last frame instead of restarting", () => {
  const once = { ...ANIM, playback: "once" as const };
  const end = sampleAnimation(once, CHAR.expressions, 99);
  assert.equal(end.step, 2);
  assert.equal(end.ended, true);
  assert.equal(sampleAnimation(once, CHAR.expressions, 2.5).ended, false);
});

test("back-and-forth reflects the clock rather than reversing the list", () => {
  // Reversing the list would leave step 0 with no predecessor to arrive from, so its
  // morph would be dropped on the way back and the return trip would be shorter.
  const png = { ...ANIM, playback: "pingpong" as const };
  assert.equal(animationDuration(png), 8);
  assert.equal(sampleAnimation(png, CHAR.expressions, 0.5).step, 0);
  assert.equal(sampleAnimation(png, CHAR.expressions, 4.5).step, 2);
  assert.equal(sampleAnimation(png, CHAR.expressions, 7.5).step, 0);
});

test("an animation with no steps is survivable", () => {
  const empty = { ...ANIM, steps: [] };
  const s = sampleAnimation(empty, CHAR.expressions, 3);
  assert.equal(s.step, -1);
  assert.ok(Number.isFinite(s.def.h));
});

test("🔴 blinking is drawn from t, so scrubbing backwards replays the same blinks", () => {
  // A countdown-to-the-next-blink implementation passes every forward test and fails
  // this one, and the studio's scrubber is the surface where that shows.
  const plan = { first: 1, min: 2, max: 4, dur: 0.3 };
  const forward = [0, 0.5, 1.1, 2, 3.4, 5.2, 9.9].map((t) => blinkLidAt(plan, t));
  const backward = [9.9, 5.2, 3.4, 2, 1.1, 0.5, 0].map((t) => blinkLidAt(plan, t)).reverse();
  assert.deepEqual(forward, backward);
});

test("the lid actually closes, and only around a blink", () => {
  // A guard that only proves determinism would pass with `blinkLidAt` returning 1 always.
  const plan = { first: 1, min: 2, max: 2, dur: 0.3 };
  assert.equal(blinkLidAt(plan, 0.5), 1, "closed before the first blink");
  const during = Math.min(...[1.05, 1.1, 1.15, 1.2].map((t) => blinkLidAt(plan, t)));
  assert.ok(during < 0.5, `the lid never closed: ${during}`);
  assert.equal(blinkLidAt(null, 5), 1, "a plan of null still blinked");
});

test("🔴 a hand-written blink plan cannot hang the tab", () => {
  // `LIMITS` prevents a slider from producing a gap near zero, but the Export panel
  // accepts a file and a slider is not the only door in. Found by this test: the first
  // implementation only guarded the exactly-zero case, so `min: 0, max: 0.001` walked
  // five million blinks to reach a scrub at t=5000 and locked the tab.
  for (const plan of [
    { first: 0, min: 0, max: 0, dur: 0.1 },
    { first: 0, min: 0, max: 0.001, dur: 0.1 },
    { first: 0, min: 1e-9, max: 1e-9, dur: 1e-9 },
  ]) {
    const started = Date.now();
    const lid = blinkLidAt(plan, 5000);
    assert.ok(Date.now() - started < 500, `blinkLidAt(${JSON.stringify(plan)}) did not terminate promptly`);
    assert.ok(Number.isFinite(lid) && lid >= 0 && lid <= 1, `lid out of range: ${lid}`);
  }
});

test("a non-finite time is answered rather than looped on", () => {
  assert.equal(blinkLidAt({ first: 1, min: 2, max: 3, dur: 0.3 }, Number.NaN), 1);
  assert.equal(blinkLidAt({ first: 1, min: 2, max: 3, dur: 0.3 }, Number.POSITIVE_INFINITY), 1);
});

// ── The dials actually reach the drawing ────────────────────────────────────────
//
// 🔴 THESE EXIST BECAUSE THE EYE CANNOT CHECK THEM. Verifying the studio in a browser
// means judging a 14px eye in a downscaled screenshot, where "the arch dial does nothing"
// and "the arch dial does something subtle" look identical. A dial wired to nothing is
// the single worst failure this tool can have — every face authored through it would be
// silently missing that axis — so each one is asserted to move the geometry it claims to.

test("🔴 every dial moves the geometry it is labelled with", () => {
  const character = newCharacter("Test", "c");
  const base = character.expressions.find((e) => e.id === "neutral")!;
  const frameOf = (patch: Partial<typeof base>) =>
    expressionFrame({ ...character }, { ...base, ...patch }, 0.9, { reduced: true });

  const rest = frameOf({});
  const [restL] = rest.eyes;

  // Height and width scale the eye's own half-extents.
  assert.ok(frameOf({ h: 2 }).eyes[0].ry > restL.ry, "height did not raise the eye");
  assert.ok(frameOf({ h: 0.2 }).eyes[0].ry < restL.ry, "height did not lower the eye");
  assert.ok(frameOf({ w: 2 }).eyes[0].rx > restL.rx, "width did not widen the eye");

  // Rise moves the pair up the face; negative is higher, and y is DOWN in this frame.
  assert.ok(frameOf({ rise: -0.3 }).eyes[0].cy < restL.cy, "rise did not lift the pair");
  assert.ok(frameOf({ rise: 0.3 }).eyes[0].cy > restL.cy, "rise did not drop the pair");

  // Tilt rotates both eyes equally; asymmetry sets one against the other.
  assert.ok(frameOf({ tilt: 20 }).eyes[0].tilt !== restL.tilt, "tilt did not rotate the eye");
  const asym = frameOf({ asym: 30 });
  assert.ok(asym.eyes[0].tilt !== asym.eyes[1].tilt, "asymmetry left the pair identical");
});

test("🔴 the arch dial bows the eye, and the two directions are not the same bow", () => {
  // `curve` is the one dial with no direct counterpart in the eye's own box — it is drawn
  // by sliding a disc of the body's ink into the eye (`lidCy`). That indirection is
  // exactly why it could be wired to nothing without anything else looking wrong, and it
  // is the axis the whole face relies on for warmth: there is no mouth.
  const character = newCharacter("Test", "c");
  const base = character.expressions.find((e) => e.id === "neutral")!;
  const lid = (curve: number) =>
    expressionFrame(character, { ...base, curve }, 0.9, { reduced: true }).eyes[0].lidCy;

  assert.notEqual(lid(0.8), lid(0), "a positive arch did not move the bow at all");
  assert.notEqual(lid(-0.8), lid(0), "a negative arch did not move the bow at all");
  assert.ok(
    Math.sign(lid(0.8)) !== Math.sign(lid(-0.8)),
    `pleased and concerned bow the same way: ${lid(0.8)} vs ${lid(-0.8)}`,
  );
});

test("🔴 the body dials reach the outline, not just the document", () => {
  const character = newCharacter("Test", "c");
  const face = character.expressions[0]!;
  const at = (body: Partial<typeof character.body>) =>
    expressionFrame({ ...character, body: { ...character.body, ...body } }, face, 0.9, { reduced: true });

  // The silhouette reaches the renderer as a path string; a dial that reaches it changes
  // that string. Comparing the string rather than a radius is deliberate — it is the
  // thing actually drawn, so it cannot pass while the last step quietly drops the value.
  const rest = at({}).body.d;
  assert.notEqual(at({ scale: 1.6 }).body.d, rest, "scale did not reach the outline");
  assert.notEqual(at({ stretch: 1.5 }).body.d, rest, "width did not reach the outline");
  assert.notEqual(at({ squash: 1.5 }).body.d, rest, "height did not reach the outline");
  assert.notEqual(at({ taper: 0.5 }).body.d, rest, "taper did not reach the outline");
  assert.notEqual(at({ pinch: 0.4 }).body.d, rest, "waist did not reach the outline");
  assert.notEqual(at({ ripple: 0.4 }).body.d, rest, "ripple did not reach the outline");
  assert.notEqual(at({ shape: "crystal", shapeMix: 1 }).body.d, rest, "the shape did not reach the outline");
  assert.notEqual(at({ tilt: 15 }).body.tilt, at({}).body.tilt, "tilt did not reach the outline");
});

// ── Export ──────────────────────────────────────────────────────────────────────

test("🔴 generated TypeScript keys are legal identifiers", () => {
  // The block is pasted straight into `expressions.ts`. A key that needs quoting turns
  // `EXPRESSIONS.deepThought` into `EXPRESSIONS["deep thought"]` at every call site.
  const names = ["Deep thought", "wide-eyed!", "  ", "Ça va", "123 go", "already"];
  for (const name of names) {
    const key = keyFor({ ...seedExpressions()[0]!, id: "expr-9", name });
    assert.ok(/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key), `${JSON.stringify(name)} produced ${JSON.stringify(key)}`);
  }
});

test("🔴 exported numbers read back as the numbers that were authored", () => {
  // The point of the export is that nobody retypes six floats. A shortening step that
  // loses a digit would mean the shipped face is not the one on the stage.
  const character = newCharacter("Test", "c");
  const ts = expressionsToTypeScript(character);
  for (const e of character.expressions) {
    const def = toExpressionDef(e);
    const row = ts.split("\n").find((l) => l.trim().startsWith(`${keyFor(e)}:`));
    assert.ok(row, `no row for ${e.name}`);
    for (const k of ["h", "w", "rise", "tilt", "asym", "curve"] as const) {
      const found = new RegExp(`\\b${k}: (-?[0-9.]+)`).exec(row);
      assert.ok(found, `${k} missing from ${row}`);
      assert.ok(
        Math.abs(Number(found[1]) - def[k]) < 1e-4,
        `${e.name}.${k}: exported ${found[1]}, authored ${def[k]}`,
      );
    }
  }
});

test("a quote in a name cannot break out of the generated string", () => {
  const character = {
    ...newCharacter("Test", "c"),
    expressions: [{ ...seedExpressions()[0]!, name: 'He said "no"', note: 'a \\ b " c' }],
  };
  const ts = expressionsToTypeScript(character);
  assert.ok(ts.includes('\\"no\\"'), "the quote was not escaped");
  assert.ok(!/[^\\]"no"/.test(ts), "an unescaped quote survived");
});
