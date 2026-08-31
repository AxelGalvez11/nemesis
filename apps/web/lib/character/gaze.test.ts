// The character faces forward, watches the page, and glances away now and then.
//
// 🔴 THE OWNER'S REPORT, IN ONE SENTENCE, BECAUSE IT CONTAINS BOTH HALVES (2026-08-26): *"This
// should be forward facing, not just looking around. Well, it should look around occasionally, but
// not… it looks like it's just looking behind. It should be looking at text, composer. Right now
// it's just sort of drifted off."*
//
// Half of this suite is real unit testing — `gaze.ts` is pure, so the glance can simply be asked
// what it is doing at any millisecond. The other half is source assertions over the wiring, which
// catch a line being reverted and cannot catch the character looking wrong. What actually proved
// the fix was a rendered contact sheet of the poses at the angles the app plays them; the numbers
// that sheet produced are recorded in the tests below so nobody has to re-derive them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ANIMATION_BY_ID, DEFAULT_AVATAR, FACE_BY_ID, eyeFrames } from "@/lib/avatar";

import { MONTAGE } from "./montage";
import {
  CAP_PITCH,
  CAP_YAW,
  GLANCE_EVERY_MS,
  GLANCE_MS,
  GLANCE_PITCH,
  GLANCE_YAW,
  POINTER_MEMORY_MS,
  cappedTurn,
  gazeTarget,
  glanceAt,
  trackReach,
  glanceOffset,
  trackTurn,
} from "./gaze";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const AVATAR = read("../../components/avatar/nemesis-avatar.tsx");
const DOCK = read("../../components/character/character-dock.tsx");
const HOME = read("../../components/workspace/learn/canvas-home.tsx");
const THINKING = read("../../components/workspace/learn/canvas-thinking.tsx");
const EXPRESSIONS = read("../avatar/expressions.ts");

test("🔴 the character is looking at its target for most of every cycle", () => {
  // "Occasionally" is the word in the report, and it is measurable: the glance window is a small
  // fraction of the cycle. A character that is always mid-excursion is the sweeping behaviour this
  // replaced, whatever the amplitude.
  assert.ok(GLANCE_MS / GLANCE_EVERY_MS < 0.2, "the glance takes up more than a fifth of the time");
  let away = 0;
  const step = 25;
  for (let ms = 0; ms < GLANCE_EVERY_MS * 4; ms += step) {
    const g = glanceAt(ms);
    if (Math.abs(g.x) > 0.001 || Math.abs(g.y) > 0.001) away += 1;
  }
  const share = away / ((GLANCE_EVERY_MS * 4) / step);
  assert.ok(share < 0.2, `glancing ${(share * 100).toFixed(0)}% of the time, which is not occasionally`);
});

test("🔴 a glance leaves and comes back — it never parks", () => {
  // The thing that made the old pose read as "looking behind" was not the angle, it was HOLDING
  // the angle: `idle` has one step, so the authored three-quarter head was simply held forever.
  for (const cycle of [0, 1, 2, 5]) {
    const base = cycle * GLANCE_EVERY_MS;
    const start = glanceAt(base);
    const middle = glanceAt(base + GLANCE_MS / 2);
    const end = glanceAt(base + GLANCE_MS);
    assert.ok(Math.abs(start.y) < 0.001, `cycle ${cycle} starts already turned away`);
    assert.ok(Math.abs(end.y) < 0.001, `cycle ${cycle} has not come back`);
    assert.ok(Math.abs(middle.y) > 0.05, `cycle ${cycle} never actually goes anywhere`);
  }
});

test("🔴 a glance never reaches the angle the owner called looking behind", () => {
  // TRACK_YAW is 26 degrees of full deflection. Measured off the contact sheet: at about 14 degrees
  // both eyes sit well inside the silhouette; by 26 the far eye is against the rim; past 40 it
  // starts passing behind the body. The amplitude is capped well under the first of those.
  for (let ms = 0; ms < GLANCE_EVERY_MS * 3; ms += 17) {
    const g = glanceAt(ms);
    assert.ok(Math.abs(g.y) <= GLANCE_YAW + 1e-9, `yaw ${g.y} exceeded the cap at ${ms}ms`);
    assert.ok(Math.abs(g.x) <= GLANCE_PITCH + 1e-9, `pitch ${g.x} exceeded the cap at ${ms}ms`);
  }
  assert.ok(GLANCE_YAW < 0.62, "the glance now reaches far enough round to read as looking away");
});

test("a glance goes sideways and up, never down", () => {
  // A glance DOWN at nothing reads as the character losing interest in the page it is standing on.
  // `glanceOffset` returns a point to look AT, so up is a negative client y.
  let sides = new Set<number>();
  for (let ms = 0; ms < GLANCE_EVERY_MS * 8; ms += 31) {
    const o = glanceOffset(ms, 76);
    assert.ok(o.y <= 0.0001, `glanced downward at ${ms}ms (y ${o.y})`);
    if (Math.abs(o.x) > 1) sides.add(Math.sign(o.x));
  }
  // 🔴 AND NOT ALWAYS THE SAME SIDE. A glance that always went left would be a tic, and it would
  // also reintroduce exactly the fault being fixed: a head with a standing bias to one side.
  assert.equal(sides.size, 2, "every glance goes the same way");
});

test("the glance is expressed in the avatar's own reach, not in guessed pixels", () => {
  // `NemesisAvatar` normalises an aim against `max(width, height) * 2.5`, so a full deflection is
  // 2.5 character-widths away. Getting this wrong is silent: the glance simply comes out too small
  // or clamps flat, and both look like "it does not glance".
  const small = glanceOffset(GLANCE_MS / 2, 40);
  const big = glanceOffset(GLANCE_MS / 2, 80);
  assert.ok(Math.abs(big.x - small.x * 2) < 1e-6, "the glance does not scale with the character");
  assert.ok(Math.abs(small.x) <= 40 * 2.5 * GLANCE_YAW + 1e-9);
});

// ── Which way the head turns when the pointer moves ──────────────────────────
//
// Owner, 2026-08-28: *"it seems to have an inverted following because whenever my mouse goes up, the
// eyes go down, whenever the mouse goes down, the eyes go up"*, and then, so it could not be misread
// as a request for an inversion: *"I'm saying that it's already inverted, and I need it to be fixed
// because it's not tracking the mouse movement."*
//
// 🔴 THESE ARE MEASURED OFF THE DRAWN EYES, NOT OFF THE SIGN. Asserting `trackTurn(...).x < 0`
// restates the implementation and would have passed just as happily before the fix if the
// convention had been written down the other way round. `eyeFrames` returns where the pupils
// actually land in the SVG, where y runs DOWNWARD — so "the eyes went up" is a smaller number, and
// the test says the same thing the owner said.

/** The average height of the two drawn pupils, aiming at a normalised point. Smaller is higher. */
const eyeHeight = (aim: { x: number; y: number }): number => {
  const face = FACE_BY_ID.get("neutral")!;
  const [left, right] = eyeFrames(DEFAULT_AVATAR.surface, face, { turn: trackTurn(aim) });
  return (left.y + right.y) / 2;
};
/** The average side-to-side position of the two drawn pupils. Larger is further right. */
const eyeSide = (aim: { x: number; y: number }): number => {
  const face = FACE_BY_ID.get("neutral")!;
  const [left, right] = eyeFrames(DEFAULT_AVATAR.surface, face, { turn: trackTurn(aim) });
  return (left.x + right.x) / 2;
};

test("🔴🔴🔴 the mouse goes up and the eyes go UP — the inversion the owner reported", () => {
  const above = eyeHeight({ x: 0, y: -1 });
  const level = eyeHeight({ x: 0, y: 0 });
  const below = eyeHeight({ x: 0, y: 1 });
  assert.ok(above < level, `pointer above, eyes at ${above.toFixed(1)} against ${level.toFixed(1)} level`);
  assert.ok(level < below, `pointer below, eyes at ${below.toFixed(1)} against ${level.toFixed(1)} level`);
  // Calibration: drop the negation in `trackTurn` and both of these reverse. It is one character of
  // code, and for as long as it was two multiplies inside a rAF tick there was nothing to assert.
  assert.ok(below - above > 8, `the whole vertical range is ${(below - above).toFixed(1)}px, which is not tracking`);
});

test("🔴 and sideways is NOT negated, which is why this was only ever half a bug", () => {
  // Screen x and head yaw both run to the right, so the horizontal never had a conflict — and the
  // owner's report was only ever about the vertical. Negating both to "make it symmetrical" is the
  // obvious wrong fix and this is what refuses it.
  assert.ok(eyeSide({ x: -1, y: 0 }) < eyeSide({ x: 0, y: 0 }), "pointer left, eyes right");
  assert.ok(eyeSide({ x: 0, y: 0 }) < eyeSide({ x: 1, y: 0 }), "pointer right, eyes left");
});

test("🔴 a still pointer means a level head, not a turned one", () => {
  // `+ 0` normalises the negative zero out of `-0 * 15` — a real value, not a real angle.
  const t = trackTurn({ x: 0, y: 0 });
  assert.deepEqual({ pitch: t.x + 0, yaw: t.y + 0 }, { pitch: 0, yaw: 0 });
});

test("🔴🔴 the measured poses were NOT edited — the character is aimed, not redrawn", () => {
  // The whole fix had to be a product decision layered over `lib/avatar`, because the owner ruled
  // on 2026-08-26: *"i said to put in the original animations and expressions NOT the custom built
  // ones"*. `neutral` is the pose `idle` holds and the one the report is about; its measured angles
  // stay exactly as imported. If this line ever changes, somebody has answered a gaze complaint by
  // editing the reference, which is the thing that ruling forbids.
  assert.match(
    EXPRESSIONS,
    /feeling\("neutral", \[28\.49, 28\.62, 0\]/,
    "the resting pose's measured angles were edited instead of aimed",
  );
});

test("🔴 facing is a prop, it defaults to authored, and the app opts in everywhere", () => {
  // 🔴 REPOINTED 2026-08-27. The product moved from `"forward"` to `"free"` on the owner's choice;
  // `"forward"` is KEPT and still asserted here, because the owner has moved this three times in
  // two days and the mode that gets deleted is the one that cannot be gone back to. Which mode the
  // SURFACES pass is asserted separately, and moves when the owner moves.
  assert.match(AVATAR, /facing\?: "authored" \| "forward" \| "free";/, "a facing mode was dropped");
  assert.match(AVATAR, /facing = "authored",/, "the default moved, which would move the landing character");
  // The correction is taken off the DRAWN head, so a handover between two animations cannot swing.
  assert.match(AVATAR, /const level = state\.facing === "forward" \? played\.face\.head : null;/);
  assert.match(AVATAR, /\{ x: a\.atX - level\.x, y: a\.atY \+ spin - level\.y \}/);
  // 🔴 ROLL IS NOT CANCELLED. `curious` is the resting face with fifteen degrees of roll and
  // `expressions.ts` says outright that curiosity is carried by the roll; levelling it would delete
  // the expression rather than aim it.
  assert.equal(/level\.z/.test(AVATAR), false, "the roll is being cancelled, which flattens curious");
  // 🔴 AND `"free"` GOES THROUGH THE CAP, WITH THE SPIN ADDED AFTER IT. A cap that saw the spin
  // would stop a poke dead at 42° and the poke would read as a twitch.
  assert.match(AVATAR, /cappedTurn\(played\.face\.head, \{ x: a\.atX, y: a\.atY \}\)/, "free facing stopped being capped");
  assert.match(AVATAR, /\{ x: free\.x, y: free\.y \+ spin \}/, "the spin is going through the cap");
  for (const [name, src] of [["dock", DOCK], ["greeter", HOME], ["thinking", THINKING]] as const) {
    assert.match(src, /facing="free"/, `the ${name} character does not face the way the owner chose`);
  }
});

test("🔴🔴 a still pointer stops claiming the gaze, and the composer gets it", () => {
  // The commonest state on this surface is a learner READING with their hand off the mouse. The
  // avatar releases the head to `turn = 0` when the pointer stops crossing the window, and before
  // the levelling above, `turn = 0` meant the authored three-quarter pose. So the one state the
  // character was guaranteed to be in was also the one where it looked away from the page.
  //
  // 🔴 REPOINTED 2026-08-26 EVENING, AND THE RULE IT PINNED IS NOW ARITHMETIC. These three source
  // matches described a run of early returns inside the dock's attention interval — which is
  // exactly why the precedence bug below them went unnoticed for weeks: a rule expressed as
  // control flow inside an effect cannot be asked a question. The order lives in `gazeTarget` now
  // and is tested directly at the bottom of this file; what is left here is that the dock still
  // MEASURES the two facts that rule needs.
  assert.ok(POINTER_MEMORY_MS > 1000 && POINTER_MEMORY_MS < 6000, "the pointer memory is not a few seconds");
  assert.match(DOCK, /pointerAgeMs: now - pointerAtRef\.current/, "the dock stopped telling gazeTarget how stale the pointer is");
  assert.match(DOCK, /const el = anchor \? document\.querySelector\(anchor\) : null;/, "the composer stopped being measured as the fallback");
  assert.match(DOCK, /resting: restingBox/, "the resting gaze stopped landing on the composer");
});

test("the dock does not re-render eight times a second to follow something that has not moved", () => {
  // 🔴 THE SAME DEFECT THIS FILE ALREADY FIXED ONCE FOR `travel`. Before the composer fallback, the
  // resting branch set `aimAt(null)` every tick and `Object.is(null, null)` let React bail out.
  // Aiming at an element instead hands React a fresh object eight times a second, and the whole
  // avatar engine hangs off this component.
  assert.match(DOCK, /const AIM_SETTLED_PX = 1;/);
  assert.match(DOCK, /Math\.abs\(was\.x - next\.x\) < AIM_SETTLED_PX/);
  assert.match(DOCK, /return was;/);
});

// ── What the character looks at, and in what order ───────────────────────────
//
// Owner, 2026-08-26: *"the mascot is not following the mouse at all. And in the app, it should
// follow the mouse … but also have moments where it does its own animations and expressions."*
//
// 🔴 THE CAUSE WAS A PRECEDENCE, NOT A BROKEN TRACKER. `resolveAttention` of an explicit `lookAt()`
// and `resolveAttention` of the FOCUSED ELEMENT were one value, checked above the pointer — so any
// focused field beat a moving cursor, for ever. The canvas's composer keeps focus after every send.
//
// Measured on the real component before the fix, averaging the drawn eye centres over 60 frames:
// with a field focused the gaze read **+58.9 with the pointer far LEFT and +58.4 far RIGHT**;
// with nothing focused the same sweep ran **-56.9 to +56.2**. After: **-57.2 to +56.0** focused.

const HERE = { x: 100, y: 100 };
const THERE = { x: 900, y: 400 };
const COMPOSER = { x: 500, y: 800 };
const CALM = { declared: null, focused: null, resting: COMPOSER, pointerAgeMs: 0, working: null, absorbed: false } as const;

test("🔴🔴 a moving pointer beats a focused text field — the report this rule was written for", () => {
  assert.deepEqual(
    gazeTarget({ ...CALM, focused: HERE }),
    { kind: "pointer" },
    "a focused field still freezes the gaze; the character will not follow the mouse",
  );
});

test("🔴 an explicit lookAt() still beats the pointer, because a surface asked", () => {
  // The one thing that outranks the cursor: Nemesis pointing at something it just drew.
  assert.deepEqual(gazeTarget({ ...CALM, declared: THERE, focused: HERE }), { kind: "at", point: THERE });
});

test("🔴 working outranks the pointer too, but not a declared target", () => {
  // Thinking eyes search, they do not follow (owner 2026-08-25).
  const sweep = { x: 300, y: 200 };
  assert.deepEqual(gazeTarget({ ...CALM, focused: HERE, working: sweep }), { kind: "at", point: sweep });
  assert.deepEqual(
    gazeTarget({ ...CALM, declared: THERE, working: sweep }),
    { kind: "at", point: THERE },
    "a drawing Nemesis just made lost to its own thinking sweep",
  );
});

test("a pointer that has stopped rests on the focused field, then on the composer", () => {
  const still = POINTER_MEMORY_MS + 1;
  assert.deepEqual(
    gazeTarget({ ...CALM, focused: HERE, pointerAgeMs: still }),
    { kind: "at", point: HERE },
    "a focused field is not merely demoted, it is dropped",
  );
  assert.deepEqual(gazeTarget({ ...CALM, pointerAgeMs: still }), { kind: "at", point: COMPOSER });
});

test("a pointer that has never moved does not leave the character staring ahead", () => {
  // Touch devices, and a page opened without the mouse being touched. Before the composer
  // fall-back existed the head released to `turn = 0`, which is the authored three-quarter pose —
  // so the commonest state was the one that looked away. See the note at the top of this file.
  assert.deepEqual(gazeTarget({ ...CALM, pointerAgeMs: Infinity }), { kind: "at", point: COMPOSER });
  assert.deepEqual(
    gazeTarget({ ...CALM, resting: null, pointerAgeMs: Infinity }),
    { kind: "pointer" },
    "with nothing to rest on, the honest answer is to hand the pointer back",
  );
});

test("🔴 the boundary is POINTER_MEMORY_MS exactly, and it is inclusive of 'still moving'", () => {
  const args = { ...CALM, focused: HERE } as const;
  assert.deepEqual(gazeTarget({ ...args, pointerAgeMs: POINTER_MEMORY_MS - 1 }), { kind: "pointer" }, "still counts as moving");
  assert.deepEqual(gazeTarget({ ...args, pointerAgeMs: POINTER_MEMORY_MS }), { kind: "at", point: HERE }, "the memory never expires");
});

// ── Following, and being absorbed ────────────────────────────────────────────
//
// Owner, 2026-08-28: *"make sure that there are moments where it's tracking mouse movement, but
// other moments where it's just doing its own thing, own expressions."* Asked twice before, on
// 2026-08-26 and 2026-08-27, and answered both times by changing the montage — which changed the
// FACE and never the head. Tracking was laid over every frame of every movement loop, so there were
// no other moments to see.

test("🔴🔴 being absorbed beats a moving pointer, or it could never happen at all", () => {
  // Ranked below the pointer this would only fire while the learner's hand was off the mouse — and
  // a learner with a hand on the mouse is the only person who was ever going to notice.
  assert.deepEqual(gazeTarget({ ...CALM, focused: HERE, absorbed: true }), { kind: "self" });
  assert.deepEqual(gazeTarget({ ...CALM, pointerAgeMs: Infinity, absorbed: true }), { kind: "self" });
});

test("🔴 but a surface that asked, and thinking, both still outrank it", () => {
  // A drawing Nemesis has just made is a fact about the lesson; being lost in thought is not.
  const sweep = { x: 300, y: 200 };
  assert.deepEqual(gazeTarget({ ...CALM, declared: THERE, absorbed: true }), { kind: "at", point: THERE });
  assert.deepEqual(gazeTarget({ ...CALM, working: sweep, absorbed: true }), { kind: "at", point: sweep });
});

// 🔴🔴 THE THREE TESTS THAT STOOD HERE MOVED TO `attention.test.ts` WITH THE CLOCK THEY COVERED.
// They pinned the 18s/6s cycle, that the window sat at the END of it, and that an absorbed stretch
// was handed a movement loop. All three were true and the character still wore an expression with
// the cursor driving its eyes, because a second clock in `montage.ts` chose the face and nothing
// lined the two up. The property that replaces all three is one sentence — watching you and
// wearing a face never share an instant — and it belongs beside the clock that now guarantees it.
//
// What stays in this file is PRECEDENCE: what being absorbed loses to, which is this file's subject.

test("🔴🔴 'self' is the ONLY answer that turns tracking off, and it really turns it off", () => {
  // Every other answer is a PLACE, and handing the avatar any place at all is still a stare. This
  // is the line that makes "doing its own thing" different from "watching something else".
  assert.match(DOCK, /if \(want\.kind === "self"\) \{\s+setTracking\(false\);/, "being absorbed no longer releases the pointer");
  assert.match(DOCK, /setTracking\(true\);/, "tracking is never turned back on");
  assert.match(DOCK, /track=\{tracking\}/, "the dock hard-codes tracking on again");
  // With tracking off the renderer eases its turn back to zero rather than freezing mid-follow.
  assert.match(AVATAR, /const want = looking \? trackTurn\(a\) : \{ x: 0, y: 0 \};/);
  assert.match(AVATAR, /a\.atX \+= \(want\.x - a\.atX\) \* TRACK_EASE;/, "the head snaps instead of easing");
});

// ── How far the pointer has to be before the head stops responding ───────────
//
// Owner, three times: *"the mascot is not following the mouse at all"*, *"it still does not follow
// mouse movements"*. Twice I answered that it did, on the strength of moving a pointer between two
// far corners and seeing a big swing. Both corners were SATURATED. Everything between them was a
// step, not a slope.

/** The real layout, measured on production: character above the composer, 1470px window. */
const REAL = { centre: { x: 389, y: 657 }, viewport: { width: 1470, height: 830 } };
const yawAt = (x: number) => {
  const reach = trackReach(REAL);
  return Math.max(-1, Math.min(1, (x - REAL.centre.x) / reach)) * 26;
};

test("🔴🔴🔴 no position on the page is clamped — which is what 'follows the mouse' means", () => {
  // The old reach was `character size x 2.5` = 190px at 76px, so the head was at full deflection
  // 190px away and 61% of the window drew the identical frame — the 61% holding the answer and the
  // composer. Calibration: put `2.5 * 76` back as the reach and every case below collapses to 26.
  const seen = [450, 550, 700, 900, 1100, 1400].map(yawAt);
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i]! > seen[i - 1]! + 0.5, `the head stopped responding between the last two samples: ${seen.join(", ")}`);
  }
});

test("🔴 the far corner is full deflection, so the range is actually used", () => {
  const reach = trackReach(REAL);
  const corners = [
    Math.hypot(REAL.centre.x, REAL.centre.y),
    Math.hypot(REAL.viewport.width - REAL.centre.x, REAL.centre.y),
    Math.hypot(REAL.centre.x, REAL.viewport.height - REAL.centre.y),
    Math.hypot(REAL.viewport.width - REAL.centre.x, REAL.viewport.height - REAL.centre.y),
  ];
  assert.equal(reach, Math.max(...corners), "the reach is not the distance to the furthest corner");
  // And it is nowhere near the old number, which is the whole point.
  assert.ok(reach > 190 * 4, `reach ${reach} is still character-sized`);
});

test("a tiny pane does not make the character hypersensitive", () => {
  // A few hundred pixels of viewport would otherwise mean a full head turn for a nudge.
  assert.ok(trackReach({ centre: { x: 40, y: 40 }, viewport: { width: 80, height: 80 } }) >= 260);
});

test("🔴 the glance is a FRACTION of full deflection, so it moved with the reach", () => {
  // Written in character-widths, as it was, a glance would have shrunk to a sixth of itself the
  // moment the reach became a property of the screen — and nothing would have failed.
  const reach = trackReach(REAL);
  const biggest = Math.max(
    ...Array.from({ length: 400 }, (_unused, i) => Math.abs(glanceOffset((i * GLANCE_EVERY_MS) / 40, reach).x)),
  );
  assert.ok(biggest > reach * 0.2, `the largest glance is ${Math.round(biggest)}px against a ${Math.round(reach)}px reach`);
  assert.ok(biggest < reach, "a glance reaches full deflection, which is a stare rather than a glance");
});

test("🔴🔴 the head is free again, and capped so an eye is never lost round the back", () => {
  // Owner 2026-08-27, having watched both settings side by side with the measured cost of each
  // printed under every character, left the model sheet's toggle on *Head free*. That reverses the
  // 2026-08-26 levelling. It does NOT reverse what levelling was fixing underneath: tracking ADDS
  // to the pose, and `farRightGlance` (35.3°, worn by `gaze-searching` and `gaze-proud`) plus
  // `TRACK_YAW` (26) is 61.3°, where the far eye is drawn at 4% of its size.
  const at = (poseYaw: number, track: number) => poseYaw + cappedTurn({ x: 0, y: poseYaw }, { x: 0, y: track }).y;

  assert.equal(at(0, 26), 26, "tracking from a level head is throttled for no reason");
  assert.equal(at(35.3, 26), CAP_YAW, "the pose plus full tracking is not capped");
  assert.ok(at(35.3, 26) < 61.3 - 15, "the cap does not actually bite where the defect was");

  // 🔴 THE TOTAL IS CAPPED, NOT THE TRACKING, and this is the case that proves the difference: the
  // pointer on the far side must still pull a turned head all the way back at full strength.
  assert.ok(Math.abs(at(35.3, -26) - 9.3) < 1e-9, "tracking back toward the middle was throttled");
  assert.equal(at(-35.3, -26), -CAP_YAW, "the cap is one-sided");

  // Every pose the montage plays is inside the cap on its own, so a pose is never clipped alone.
  for (const id of MONTAGE) {
    const a = ANIMATION_BY_ID.get(id);
    assert.ok(a, `${id} is not playable`);
    for (const step of a!.steps) {
      const face = FACE_BY_ID.get(step.face)!;
      assert.ok(Math.abs(face.head.y) <= CAP_YAW, `${step.face} is authored at ${face.head.y}°, past the cap`);
      assert.equal(cappedTurn(face.head, { x: 0, y: 0 }).y, 0, `${step.face} is bent by the cap with no tracking at all`);
    }
  }

  // 🔴 PITCH IS UNCAPPED ON PURPOSE. Yaw hides an eye because the face wraps round a solid and one
  // eye goes to the far side; pitch tilts both together and hides neither — measured, both eyes are
  // drawn at 116% of size at 15° of pitch and 113% at 43°, the widest the product can reach.
  assert.equal(CAP_PITCH, null, "a pitch cap was added; measure it before believing it does anything");
  assert.equal(cappedTurn({ x: 28.6, y: 0 }, { x: 15, y: 0 }).x, 15, "pitch tracking is being clipped");
});

test("🔴 every product surface faces the same way, or the hand-off swings", () => {
  // The front door's character flies into the canvas and BECOMES the dock's. If the two ends
  // disagreed about facing, the head would jump ~28° on the frame of the route swap.
  const files = ["../../components/character/character-dock.tsx", "../../components/workspace/learn/canvas-home.tsx", "../../components/workspace/learn/canvas-thinking.tsx"];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    // 🔴 THE PROP, NOT THE WORD. Two of these files discuss `facing="forward"` in a comment, as the
    // record of what this used to be and why it moved; a test that banned the string outright
    // would be asking the code to forget its own history.
    const passed = [...src.matchAll(/^\s*facing="(\w+)"/gm)].map((m) => m[1]);
    assert.ok(passed.length > 0, `${f} passes no facing at all`);
    assert.deepEqual([...new Set(passed)], ["free"], `${f} does not face the way the owner chose`);
  }
});
