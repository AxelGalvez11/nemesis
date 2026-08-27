// The scatter, and why it was invisible for weeks.
//
// Owner, 2026-08-26: *"bloub has nice animations called burst, sleep, thinking, i want those"*, and
// then, told the sparks were computed but never drawn: *"Make the sparks visible"*.
//
// 🔴🔴 THE PORT DROPPED THE ONE FIELD THAT MADE THEM WORK. The reference gives every particle a
// `depth` and paints it as `mixHex(paper, ink, depth)` — a freshly thrown spark is nearly PAPER and
// reads as a bright speck ON the dark body; one that has spiralled into the core is ink and has
// been swallowed. Ours carried x, y, r and opacity, painted every dot in ink, and put them BEHIND
// an opaque body. Five ink dots under an ink body are five invisible dots.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ANIMATION_BY_ID, DEFAULT_AVATAR, FACE_BY_ID, MAX_SPARKS, VIEW_SIZE, animationDuration, avatarFrameAt, drawFace, mixHex, sparkScaleFor } from "./index";
import { sparkDots } from "./play";

const PLAN = FACE_BY_ID.get("burstIn")!.sparks!;

test("🔴🔴 a spark never leaves the body — which is WHY it has to be drawn in front", () => {
  // This is the measurement the whole design rests on, so it is asserted rather than remembered.
  // The core collapses fast and the sparks spiral in faster, so at no point in the animation is a
  // spark outside the silhouette. "Behind the body" is therefore the same as "not drawn".
  const total = animationDuration(ANIMATION_BY_ID.get("burst")!);
  let sawSpark = false;
  for (let t = 0; t <= total; t += 25) {
    const frame = avatarFrameAt("burst", t, DEFAULT_AVATAR);
    if (!frame?.sparks.length) continue;
    sawSpark = true;
    for (const spark of frame.sparks) {
      assert.ok(spark.depth >= 0 && spark.depth <= 1, `depth ${spark.depth} is outside 0..1 at ${t}ms`);
    }
  }
  assert.ok(sawSpark, "the burst draws no sparks at all any more");
});

test("🔴🔴 every spark carries a depth and none is hidden behind the body", () => {
  const dots = sparkDots(PLAN, 400);
  assert.ok(dots.length > 0, "no sparks are alive 400ms in");
  for (const dot of dots) {
    assert.notEqual(dot.depth, undefined, "a spark has no depth, so it will be painted in flat ink");
    assert.notEqual(dot.behind, true, "a spark is behind the body again, where it cannot be seen");
  }
});

test("🔴 the ramp runs the right way: thrown clear is pale, swallowed is ink", () => {
  // Depth is `1 - rho / 0.8R`, so it RISES as the spark falls inward. A ramp the other way round
  // would paint the ones being swallowed bright and the ones on the rim invisible.
  const early = sparkDots(PLAN, 60)[0];
  const late = sparkDots(PLAN, 560)[0];
  assert.ok(early && late);
  assert.ok(late.depth! > early.depth!, `depth fell from ${early.depth} to ${late.depth} as the spark was swallowed`);
});

test("🔴 the sparks come out of the frame separately, because each needs its own fill", () => {
  const face = FACE_BY_ID.get("burstIn")!;
  const frame = drawFace(DEFAULT_AVATAR.surface, { ...face, dots: sparkDots(PLAN, 400) });
  assert.ok(frame.sparks.length > 0, "sparks are being joined into the shared decor path again");
  // And they are NOT also in the joined paths, or they would be drawn twice, the second time flat.
  assert.equal(frame.dots, "", "a spark leaked into the front decor path, where it is painted flat ink");
  assert.equal(frame.dotsBehind, "", "a spark leaked into the behind path, where it cannot be seen");
});

test("the node pool is big enough for every spark the catalogue can ask for at once", () => {
  // 🔴 A CAP RATHER THAN A COUNT KEEPS THE NODE COUNT FIXED — this renderer writes attributes onto
  // elements it made once and never creates or destroys per frame. The cap only earns that if it
  // is never actually reached, so: walk the whole animation and check.
  const total = animationDuration(ANIMATION_BY_ID.get("burst")!);
  let most = 0;
  for (let t = 0; t <= total; t += 10) most = Math.max(most, sparkDots(PLAN, t).length);
  assert.ok(most > 0 && most <= MAX_SPARKS, `${most} sparks can be alive at once against a pool of ${MAX_SPARKS}`);
});

test("🔴🔴 a spark clears three screen pixels at the size the app actually draws at", () => {
  // Owner, 2026-08-27: *"the burst animation is not working well, it just shrinks transiently"* —
  // and it did, because the half of it that is a burst was ONE PIXEL WIDE. Every measured number
  // in this engine is a fraction of the body, which is right for the shapes and wrong for the
  // specks: `r0` is 0.04 of the body radius, and the reference draws at about 500px while the dock
  // draws at 76.
  const face = FACE_BY_ID.get("burstIn")!;
  const dots = sparkDots(PLAN, 400);
  const DOCK_PX = 76;
  const perUnit = DOCK_PX / VIEW_SIZE;
  const bare = Math.min(...dots.map((d) => d.r)) * perUnit;
  assert.ok(bare < 2, `the authored spark is already ${bare.toFixed(2)}px — this guard is describing the wrong problem`);

  // 🔴 THE SCALE THE COMPONENT ACTUALLY CHOOSES, not a number typed into this test. Written the
  // other way round — passing `sparkScale: 3` by hand — breaking `sparkScaleFor` left every test in
  // this file green, which was measured by breaking it.
  const scaled = drawFace(DEFAULT_AVATAR.surface, { ...face, dots }, { sparkScale: sparkScaleFor(DOCK_PX) });
  const radii = scaled.sparks.map((sp) => Number(sp.d.match(/A([\d.]+) /)?.[1] ?? 0));
  assert.ok(radii.length > 0, "no sparks were drawn at all");
  assert.ok(Math.min(...radii) * perUnit >= 2.9, `the smallest spark is ${(Math.min(...radii) * perUnit).toFixed(2)}px on screen`);

  // 🔴 AND THE PROPORTION IS UNTOUCHED WITHOUT IT: a caller that asks for nothing gets the
  // reference's own numbers, which is what the studio and every large render want.
  const plain = drawFace(DEFAULT_AVATAR.surface, { ...face, dots });
  const plainRadii = plain.sparks.map((sp) => Number(sp.d.match(/A([\d.]+) /)?.[1] ?? 0));
  assert.ok(Math.max(...plainRadii) < Math.max(...radii), "the scale is being applied even when nobody asked");
});

test("🔴 the readability floor only ever GROWS a spark, and lets go at large sizes", () => {
  assert.ok(sparkScaleFor(76) > 2.5, "the dock's character no longer grows its sparks");
  assert.ok(sparkScaleFor(160) > 1, "the centre station's character no longer grows them either");
  assert.equal(sparkScaleFor(600), 1, "a large render is no longer drawn at the reference's own proportion");
  assert.ok(sparkScaleFor(20) <= 4, "a tiny character wears bubbles");
  assert.equal(sparkScaleFor(0), 1, "a zero size does not produce a nonsense scale");
});

test("mixHex blends, clamps, and gives back the ends unchanged", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0), "#000000");
  assert.equal(mixHex("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixHex("#000000", "#ffffff", -3), "#000000", "an out-of-range depth is clamped, not wrapped");
  assert.equal(mixHex("#000000", "#ffffff", 9), "#ffffff");
});
