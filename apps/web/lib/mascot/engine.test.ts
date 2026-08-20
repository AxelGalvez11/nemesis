import assert from "node:assert/strict";
import { test } from "node:test";

import { MascotEngine, renderPose, sampleState } from "./engine";
import { blinkLid } from "./face";
import { EXPRESSION_ORDER } from "./expressions";
import { BLINK_HALF } from "./face";
import { PointerGaze } from "./gaze";
import { REST } from "./pose";
import { STATE_ORDER, STATES, stateDuration, stillTime } from "./states";
import type { MascotFrame, MascotMode } from "./types";

/**
 * Every number in a frame, flattened — so "did anything change" is one comparison.
 *
 * The silhouette goes in as its own sampled points rather than as the path string: a
 * string compares equal or not, and these tests need to know HOW FAR two frames are
 * apart, which is the whole basis of "did that transition cut".
 */
function numbers(f: MascotFrame): number[] {
  const bead = (b: { cx: number; cy: number; rx: number; ry: number; tilt: number; alpha: number }) => [
    b.cx, b.cy, b.rx, b.ry, b.tilt, b.alpha,
  ];
  const path = f.body.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  return [
    f.body.cx, f.body.cy, f.body.tilt, f.body.rx, f.body.ry, f.body.alpha,
    ...path,
    ...f.satellites.flatMap(bead),
    ...f.eyes.flatMap((e) => [e.cx, e.cy, e.rx, e.ry, e.tilt]),
    f.glow, f.bodyAlpha,
  ];
}

/** The silhouette alone, for tests about the body that a blink would otherwise drown. */
function bodyNumbers(f: MascotFrame): number[] {
  const path = f.body.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  return [f.body.cx, f.body.cy, f.body.tilt, f.body.rx, f.body.ry, ...path];
}

function maxBodyDelta(a: MascotFrame, b: MascotFrame): number {
  const x = bodyNumbers(a);
  const y = bodyNumbers(b);
  if (x.length !== y.length) return Infinity;
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]! - y[i]!));
  return m;
}

/** Largest single-number difference between two frames. */
function maxDelta(a: MascotFrame, b: MascotFrame): number {
  const x = numbers(a);
  const y = numbers(b);
  if (x.length !== y.length) return Infinity;
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]! - y[i]!));
  return m;
}

test("sample(t) is a pure function of time", () => {
  const e = new MascotEngine("teaching", 0);
  e.setState("thinking", 1.0);
  e.setState("question", 1.9);

  // Ask out of order, repeatedly. Every answer must be identical to the first.
  const order = [3.4, 0.2, 2.05, 1.95, 0.2, 3.4, 1.11, 2.05];
  const seen = new Map<number, number[]>();
  for (const t of order) {
    const got = numbers(e.sample(t));
    const first = seen.get(t);
    if (!first) seen.set(t, got);
    else assert.deepEqual(got, first, `t=${t} answered differently on re-read`);
  }
});

test("re-reading a timestamp from inside a finished morph still works", () => {
  // The optimisation that breaks this is purging the previous state once its fade is
  // over. It looks free and it makes the engine non-replayable.
  const e = new MascotEngine("idle", 0);
  e.setState("insight", 0.5);
  const during = numbers(e.sample(0.7));
  e.sample(9.0); // walk past the end of the morph
  assert.deepEqual(numbers(e.sample(0.7)), during);
});

test("a state change lands without a visual cut", () => {
  const EPS = 1e-6;
  for (const mode of STATE_ORDER) {
    const e = new MascotEngine("teaching", 0);
    const before = e.sample(2 - EPS);
    e.setState(mode, 2);
    const after = e.sample(2);
    assert.ok(maxDelta(before, after) < 0.05, `${mode} jumped by ${maxDelta(before, after).toFixed(3)}`);
  }
});

test("a change landing INSIDE a running fade is continuous too", () => {
  // This is what the frozen composite pose exists for. Without it the new blend
  // starts from the outgoing state's FULL pose rather than the partly-blended frame
  // on screen, and the jump is large enough to see.
  const EPS = 1e-6;
  const e = new MascotEngine("idle", 0);
  e.setState("insight", 1.0);
  const mid = 1.0 + STATES.insight.morph * 0.4;
  const before = e.sample(mid - EPS);
  e.setState("incorrect", mid);
  const after = e.sample(mid);
  assert.ok(maxDelta(before, after) < 0.05, `jumped by ${maxDelta(before, after).toFixed(3)}`);
});

test("three changes chained inside one another stay continuous", () => {
  const EPS = 1e-6;
  const e = new MascotEngine("idle", 0);
  const marks: MascotMode[] = ["thinking", "searching", "question", "evaluating", "correct"];
  let t = 0.5;
  for (const m of marks) {
    const before = e.sample(t - EPS);
    e.setState(m, t);
    const after = e.sample(t);
    assert.ok(maxDelta(before, after) < 0.05, `${m} jumped by ${maxDelta(before, after).toFixed(3)}`);
    t += 0.09; // well inside every morph in the list
  }
});

test("no state is a no-op — each is visibly different from idle", () => {
  const idle = sampleState("idle", 0, { clock: 0 });
  for (const mode of STATE_ORDER) {
    if (mode === "idle") continue;
    const frame = sampleState(mode, stillTime(mode), { clock: 0 });
    assert.ok(maxDelta(idle, frame) > 0.3, `${mode} is indistinguishable from idle`);
  }
});

test("every state is distinguishable from every other at its still frame", () => {
  const frames = STATE_ORDER.map((m) => [m, sampleState(m, stillTime(m), { clock: 0 })] as const);
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const d = maxDelta(frames[i]![1], frames[j]![1]);
      assert.ok(d > 0.2, `${frames[i]![0]} and ${frames[j]![0]} differ by only ${d.toFixed(3)}`);
    }
  }
});

test("nothing anywhere produces a non-finite number", () => {
  for (const mode of STATE_ORDER) {
    const span = Math.max(stateDuration(mode), 3);
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * span;
      for (const intensity of [0, 0.5, 1]) {
        for (const voice of [0, 1]) {
          const frame = sampleState(mode, t, {
            intensity,
            ctx: { confidence: 0, voice },
            look: { x: -1, y: 1, mix: 1 },
            clock: t,
          });
          for (const n of numbers(frame)) {
            assert.ok(Number.isFinite(n), `${mode} @ ${t} produced ${n}`);
          }
        }
      }
    }
  }
});

test("reduced motion holds still but keeps the states apart", () => {
  for (const mode of STATE_ORDER) {
    const a = sampleState(mode, 0.1, { reduced: true });
    const b = sampleState(mode, 4.7, { reduced: true });
    assert.equal(maxDelta(a, b), 0, `${mode} still moves with reduced motion on`);
  }
  // ... and the twenty held frames are still twenty different pictures.
  const frames = STATE_ORDER.map((m) => sampleState(m, 0, { reduced: true }));
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      assert.ok(maxDelta(frames[i]!, frames[j]!) > 0.2, `${STATE_ORDER[i]} ≡ ${STATE_ORDER[j]}`);
    }
  }
});

test("reduced motion shortens transitions instead of cutting them", () => {
  const e = new MascotEngine("idle", 0);
  e.setState("insight", 1);
  const mid = e.sample(1 + STATES.insight.morph * 0.45 * 0.5, { reduced: true });
  const start = sampleState("idle", 0, { reduced: true });
  const end = sampleState("insight", 0, { reduced: true });
  assert.ok(maxDelta(mid, start) > 0.01 && maxDelta(mid, end) > 0.01, "transition was a cut");
});

test("the blink schedule is drawn from t, not accumulated", () => {
  // Walking backwards must give the same answers as walking forwards.
  const N = 1500;
  const forward: number[] = [];
  for (let i = 0; i < N; i++) forward.push(blinkLid(i * 0.02));
  const backward: number[] = [];
  for (let i = N - 1; i >= 0; i--) backward.push(blinkLid(i * 0.02));
  assert.deepEqual(backward.reverse(), forward);
});

test("blinks are occasional, complete, and sometimes doubled", () => {
  let shut = 0;
  let samples = 0;
  const closures: number[] = [];
  let wasOpen = true;
  for (let t = 0; t < 300; t += 0.01) {
    const lid = blinkLid(t);
    samples++;
    if (lid < 0.35) shut++;
    if (wasOpen && lid < 0.5) closures.push(t);
    wasOpen = lid > 0.5;
  }
  // Eyes open the overwhelming majority of the time.
  assert.ok(shut / samples < 0.05, `eyes shut ${((shut / samples) * 100).toFixed(1)}% of the time`);
  // Roughly one blink every 4-5s over five minutes.
  assert.ok(closures.length > 50 && closures.length < 110, `${closures.length} blinks in 300s`);
  // Some of them arrive in pairs.
  const doubles = closures.filter((t, i) => i > 0 && t - closures[i - 1]! < 0.3).length;
  assert.ok(doubles > 5, `only ${doubles} double blinks in 300s`);
});

test("the pointer is followed with inertia, never chased", () => {
  const g = new PointerGaze(300);
  g.update(0);
  g.point(600, 200, 300, 200); // hard right
  const first = g.update(0.016);
  assert.ok(first.x < 0.35, `snapped to ${first.x.toFixed(2)} in one frame`);
  let look = first;
  for (let t = 0.032; t < 1.2; t += 0.016) look = g.update(t);
  assert.ok(look.x > 0.6, `never caught up: ${look.x.toFixed(2)}`);
});

test("a pointer that stops relaxes its grip but keeps the head turned", () => {
  const g = new PointerGaze(300);
  g.update(0);
  g.point(600, 200, 300, 200);
  let look = g.update(0.016);
  // Let the aim settle on the (stationary) pointer first.
  for (let t = 0.032; t < 0.8; t += 0.016) look = g.update(t);
  const held = look.x;
  for (let t = 0.8; t < 4; t += 0.016) look = g.update(t);
  assert.ok(Math.abs(look.x - held) < 0.1, "the aim moved after the pointer stopped");
  assert.ok(look.mix < 0.7 && look.mix > 0.4, `mix settled to ${look.mix.toFixed(2)}`);
});

test("a non-finite pointer target is refused, not absorbed", () => {
  const g = new PointerGaze(300);
  g.update(0);
  g.point(600, 200, 300, 200);
  let good = g.update(0.016);
  for (let t = 0.032; t < 0.8; t += 0.016) good = g.update(t);
  g.point(NaN, 0, 0, 0); // a getBoundingClientRect on a hidden pane
  const after = g.update(0.816);
  assert.ok(Number.isFinite(after.x) && Number.isFinite(after.y));
  assert.ok(Math.abs(after.x - good.x) < 0.05);
});

test("setLook refuses a non-finite look", () => {
  const e = new MascotEngine("idle", 0);
  e.setLook({ x: 0.5, y: 0, mix: 1 });
  const good = e.sample(0.1);
  e.setLook({ x: NaN, y: 0, mix: 1 });
  assert.deepEqual(numbers(e.sample(0.1)), numbers(good));
});

test("intensity 0 is the plain mark, whatever the state", () => {
  const rest = renderPose(REST, { clock: 0 }, 0);
  for (const mode of STATE_ORDER) {
    const frame = sampleState(mode, stillTime(mode), { intensity: 0, clock: 0 });
    // Liveliness is deliberately NOT scaled by intensity, so allow the drift it adds
    // to the eyes; everything structural must be the mark itself.
    assert.ok(maxDelta(rest, frame) < 2.5, `${mode} at intensity 0 is not the resting blob`);
  }
});

test("changing expression morphs the face instead of swapping it", () => {
  const e = new MascotEngine("teaching", 0);
  const before = e.sample(1 - 1e-6, { expression: undefined });
  e.setExpression("bright", 1);
  const at = e.sample(1);
  assert.ok(maxDelta(before, at) < 0.02, `the face snapped by ${maxDelta(before, at).toFixed(3)}`);

  const mid = e.sample(1 + MascotEngine.EXPRESSION_MORPH * 0.5);
  const end = e.sample(1 + MascotEngine.EXPRESSION_MORPH * 2);
  assert.ok(maxDelta(mid, before) > 0.05, "nothing happened");
  assert.ok(maxDelta(mid, end) > 0.05, "the morph finished instantly");
});

test("clearing an expression fades back rather than snapping", () => {
  const e = new MascotEngine("teaching", 0);
  e.setExpression("wide", 0);
  const held = e.sample(1);
  e.setExpression(null, 1);
  const at = e.sample(1 + 1e-6);
  assert.ok(maxDelta(held, at) < 0.02, `the face snapped back by ${maxDelta(held, at).toFixed(3)}`);
});

test("a state change carries the expression across with it", () => {
  // `incorrect` is concerned and the `thinking` it becomes is narrow. The face has to
  // travel between them with the body, not flip when the mode does.
  const EPS = 1e-6;
  const e = new MascotEngine("incorrect", 0);
  const before = e.sample(1 - EPS);
  e.setState("thinking", 1);
  const after = e.sample(1);
  assert.ok(maxDelta(before, after) < 0.05, `the face jumped by ${maxDelta(before, after).toFixed(3)}`);
});

test("every expression reads differently on the same state", () => {
  const frames = EXPRESSION_ORDER.map(
    (id) => [id, sampleState("teaching", stillTime("teaching"), { expression: id, clock: 0 })] as const,
  );
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const d = maxDelta(frames[i]![1], frames[j]![1]);
      assert.ok(d > 0.15, `${frames[i]![0]} and ${frames[j]![0]} differ by only ${d.toFixed(3)}`);
    }
  }
});

test("a shape morph stays smooth from end to end", () => {
  // What this actually guards: that a change of silhouette is INTERPOLATED and not
  // swapped. `slab` to `crystal` is the widest shape change in the catalogue, and the
  // cheap implementation of shape-changing — hand over the new profile once the
  // transition is past halfway — passes every other test in this file and fails here
  // with a jump of about eight mark units in one frame. Calibrated against exactly
  // that.
  // THE BODY ONLY, and a fixed liveness clock. Both states here carry `blinkIn`, so the
  // character deliberately blinks across the change; that is a real 75ms movement of the
  // eyes and it belongs to the blink tests, not to this one.
  const opts = { clock: 0 };
  const e = new MascotEngine("waiting", 0); // slab
  e.setState("insight", 1); // crystal
  let prev = e.sample(1, opts);
  for (let t = 1.02; t < 1 + STATES.insight.morph + 0.4; t += 0.02) {
    const now = e.sample(t, opts);
    assert.ok(
      maxBodyDelta(prev, now) < 2,
      `shape morph jumped ${maxBodyDelta(prev, now).toFixed(2)} at ${t.toFixed(2)}s`,
    );
    prev = now;
  }
});

test("arriving and leaving work from any state, and are continuous", () => {
  for (const mode of STATE_ORDER) {
    const gone = sampleState(mode, stillTime(mode), { presence: 0, clock: 0 });
    const here = sampleState(mode, stillTime(mode), { presence: 1, clock: 0 });
    assert.ok(gone.bodyAlpha === 0, `${mode} is still visible at presence 0`);
    assert.ok(gone.body.rx < here.body.rx * 0.45, `${mode} barely shrinks on the way out`);
    // No step anywhere along the ramp — a character that pops in has not arrived.
    let prev = gone;
    for (let p = 0.02; p <= 1.0001; p += 0.02) {
      const now = sampleState(mode, stillTime(mode), { presence: p, clock: 0 });
      assert.ok(maxBodyDelta(prev, now) < 2.2, `${mode} popped at presence ${p.toFixed(2)}`);
      prev = now;
    }
  }
});

test("a forced entry blink stays inside the change that asked for it", () => {
  // The failure this guards: a short morph put the blink's own opening frames BEFORE
  // the state changed, where nothing was overriding the lid — so the eye went from open
  // to nearly shut in the single frame the mode flipped.
  const EPS = 1e-6;
  for (const mode of STATE_ORDER) {
    if (!STATES[mode].blinkIn) continue;
    const e = new MascotEngine("teaching", 0);
    const before = e.sample(2 - EPS, { clock: 0 });
    e.setState(mode, 2);
    const after = e.sample(2, { clock: 0 });
    assert.ok(maxDelta(before, after) < 0.05, `${mode} blinked before its own change`);
  }
});

test("a second change mid-blink does not snap the lid open", () => {
  // A forced blink belongs to the moment it started, not to whichever state happens to
  // be current while it runs. Asking the current state instead makes the override vanish
  // the instant a second change lands, and the eye jumps from half-shut to open.
  const EPS = 1e-6;
  const e = new MascotEngine("teaching", 0);
  e.setState("thinking", 1); // blinkIn
  const mid = 1 + BLINK_HALF * 1.2;
  const before = e.sample(mid - EPS, { clock: 0 });
  e.setState("searching", mid); // no blinkIn
  const after = e.sample(mid, { clock: 0 });
  assert.ok(maxDelta(before, after) < 0.05, `the lid snapped by ${maxDelta(before, after).toFixed(3)}`);
});

test("the wink shuts one eye and only one", () => {
  const f = sampleState("wink", stillTime("wink"), { clock: 0 });
  const shut = Math.min(f.eyes[0].ry, f.eyes[1].ry);
  const open = Math.max(f.eyes[0].ry, f.eyes[1].ry);
  assert.ok(shut < open * 0.3, `both eyes are ${shut.toFixed(2)} / ${open.toFixed(2)}`);
  assert.ok(open > 3, "the open eye closed too");
});

test("only the states where the character IS the work take the middle", () => {
  // Guarding the LIST, not the mechanism: a state quietly acquiring `centre` is how a
  // mascot ends up walking into the middle of the page while the learner is reading.
  const centre = STATE_ORDER.filter((m) => STATES[m].station === "centre");
  assert.deepEqual([...centre].sort(), ["ingesting", "searching", "thinking"]);
});
