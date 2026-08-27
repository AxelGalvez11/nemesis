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

import {
  GLANCE_EVERY_MS,
  GLANCE_MS,
  GLANCE_PITCH,
  GLANCE_YAW,
  POINTER_MEMORY_MS,
  gazeTarget,
  glanceAt,
  glanceOffset,
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

test("🔴 forward is a prop, it defaults to authored, and the app opts in everywhere", () => {
  assert.match(AVATAR, /facing\?: "authored" \| "forward";/, "the facing prop is gone");
  assert.match(AVATAR, /facing = "authored",/, "forward became the default, which would move the landing character");
  // The correction is taken off the DRAWN head, so a handover between two animations cannot swing.
  assert.match(AVATAR, /const level = state\.facing === "forward" \? played\.face\.head : null;/);
  assert.match(AVATAR, /\{ x: a\.atX - level\.x, y: a\.atY \+ spin - level\.y \}/);
  // 🔴 ROLL IS NOT CANCELLED. `curious` is the resting face with fifteen degrees of roll and
  // `expressions.ts` says outright that curiosity is carried by the roll; levelling it would delete
  // the expression rather than aim it.
  assert.equal(/level\.z/.test(AVATAR), false, "the roll is being cancelled, which flattens curious");
  for (const [name, src] of [["dock", DOCK], ["greeter", HOME], ["thinking", THINKING]] as const) {
    assert.match(src, /facing="forward"/, `the ${name} character is not levelled`);
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

test("🔴🔴 a moving pointer beats a focused text field — the report this rule was written for", () => {
  assert.equal(
    gazeTarget({ declared: null, focused: HERE, resting: COMPOSER, pointerAgeMs: 0, working: null }),
    null,
    "a focused field still freezes the gaze; the character will not follow the mouse",
  );
});

test("🔴 an explicit lookAt() still beats the pointer, because a surface asked", () => {
  // The one thing that outranks the cursor: Nemesis pointing at something it just drew.
  assert.deepEqual(
    gazeTarget({ declared: THERE, focused: HERE, resting: COMPOSER, pointerAgeMs: 0, working: null }),
    THERE,
  );
});

test("🔴 working outranks the pointer too, but not a declared target", () => {
  // Thinking eyes search, they do not follow (owner 2026-08-25).
  const sweep = { x: 300, y: 200 };
  assert.deepEqual(
    gazeTarget({ declared: null, focused: HERE, resting: COMPOSER, pointerAgeMs: 0, working: sweep }),
    sweep,
  );
  assert.deepEqual(
    gazeTarget({ declared: THERE, focused: null, resting: COMPOSER, pointerAgeMs: 0, working: sweep }),
    THERE,
    "a drawing Nemesis just made lost to its own thinking sweep",
  );
});

test("a pointer that has stopped rests on the focused field, then on the composer", () => {
  const still = POINTER_MEMORY_MS + 1;
  assert.deepEqual(
    gazeTarget({ declared: null, focused: HERE, resting: COMPOSER, pointerAgeMs: still, working: null }),
    HERE,
    "a focused field is not merely demoted, it is dropped",
  );
  assert.deepEqual(
    gazeTarget({ declared: null, focused: null, resting: COMPOSER, pointerAgeMs: still, working: null }),
    COMPOSER,
  );
});

test("a pointer that has never moved does not leave the character staring ahead", () => {
  // Touch devices, and a page opened without the mouse being touched. Before the composer
  // fall-back existed the head released to `turn = 0`, which is the authored three-quarter pose —
  // so the commonest state was the one that looked away. See the note at the top of this file.
  assert.deepEqual(
    gazeTarget({ declared: null, focused: null, resting: COMPOSER, pointerAgeMs: Infinity, working: null }),
    COMPOSER,
  );
  assert.equal(
    gazeTarget({ declared: null, focused: null, resting: null, pointerAgeMs: Infinity, working: null }),
    null,
    "with nothing to rest on, the honest answer is to hand the pointer back",
  );
});

test("🔴 the boundary is POINTER_MEMORY_MS exactly, and it is inclusive of 'still moving'", () => {
  const args = { declared: null, focused: HERE, resting: COMPOSER, working: null } as const;
  assert.equal(gazeTarget({ ...args, pointerAgeMs: POINTER_MEMORY_MS - 1 }), null, "still counts as moving");
  assert.deepEqual(gazeTarget({ ...args, pointerAgeMs: POINTER_MEMORY_MS }), HERE, "the memory never expires");
});
