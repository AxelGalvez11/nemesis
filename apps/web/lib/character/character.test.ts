import assert from "node:assert/strict";
import { test } from "node:test";

import { BotEngine } from "@/lib/bloub/engine";
import { DEMI_VIEWBOX, RAYON } from "@/lib/bloub/repere";
import { SEQUENCE, STATE_BY_ID, type StateId } from "@/lib/bloub/states";

import { ARC_POOL, ARC_STOPS, DOT_POOL } from "./pool";
import { speedOf, stationOf } from "./stations";

const ALL: StateId[] = [...SEQUENCE, "swirl"];

/**
 * Every frame the renderer can be asked to draw.
 *
 * 🔴 IT SWEEPS ORDERED PAIRS, NOT STATES. During a cross-fade the engine emits BOTH
 * states' decor at once, so the worst case never appears in any single animation — it
 * appears between two of them. Sweeping the 225 pairs is the difference between a pool
 * that holds and one that quietly drops the last two particles of an explosion.
 */
function* everyFrame() {
  for (const from of ALL) {
    for (const to of ALL) {
      const engine = new BotEngine(RAYON, from);
      engine.setState(to, 1);
      for (let i = 0; i <= 240; i += 1) yield engine.sample(i / 60);
    }
  }
}

test("🔴 the decor pool is big enough for every frame the engine can produce", () => {
  let dots = 0;
  let arcs = 0;
  for (const frame of everyFrame()) {
    dots = Math.max(dots, frame.dots.length);
    arcs = Math.max(arcs, frame.arcs.length);
  }
  // Not "the pool is some round number": the pool is sized ABOVE a measurement, and
  // this is the measurement. A new animation with more particles than the pool holds
  // renders with some of them missing and nothing else goes wrong — no error, no
  // warning, just an explosion that is quietly smaller than it was drawn to be.
  assert.ok(dots <= DOT_POOL, `${dots} dots exceeds the pool of ${DOT_POOL}`);
  assert.ok(arcs <= ARC_POOL, `${arcs} arcs exceeds the pool of ${ARC_POOL}`);
  // And the pool is not absurdly oversized either — that would be dead DOM on a
  // decorative element mounted on every canvas.
  assert.ok(DOT_POOL <= dots + 6, `the dot pool is ${DOT_POOL - dots} larger than it needs to be`);
  assert.ok(ARC_POOL <= arcs + 6, `the arc pool is ${ARC_POOL - arcs} larger than it needs to be`);
});

test("🔴 every gradient has exactly the number of stops the renderer preallocates", () => {
  // The renderer writes into three fixed <stop> nodes per arc rather than building
  // them per frame. A four-stop gradient would render with its last colour dropped,
  // which reads as a ring that fades wrong rather than as a bug.
  for (const frame of everyFrame()) {
    for (const arc of frame.arcs) {
      assert.equal(arc.grad.stops.length, ARC_STOPS, `arc ${arc.id} has ${arc.grad.stops.length} stops`);
    }
  }
});

test("🔴 nothing the engine draws leaves the viewBox", () => {
  // The viewBox is a module constant and must stay one: recomputing it per frame would
  // resize the element while it animates, which is a layout shift caused by decoration.
  // So instead the CONTENT has to stay inside it.
  let worst = 0;
  let where = "";
  for (const frame of everyFrame()) {
    for (const d of frame.dots) {
      const reach = Math.max(Math.abs(d.x) + d.r, Math.abs(d.y) + d.r);
      if (reach > worst) {
        worst = reach;
        where = `dot at ${d.x.toFixed(1)},${d.y.toFixed(1)}`;
      }
    }
  }
  assert.ok(worst <= DEMI_VIEWBOX, `${where} reaches ${worst.toFixed(1)}, past ${DEMI_VIEWBOX}`);
});

test("the character comes forward only for the states that mean the system has the floor", () => {
  // The rule is not "anything eye-catching". Coming to the middle says the learner is
  // waiting on real work, and it is worth nothing if a wink does it too.
  assert.equal(stationOf("thinking"), "centre");
  assert.equal(stationOf("orbit"), "centre");
  assert.equal(stationOf("comet"), "centre");
  for (const id of ["idle", "wink", "wide", "notify", "sleep", "egg"] as StateId[]) {
    assert.equal(stationOf(id), "corner", `${id} should not take the middle of the surface`);
  }
});

test("swirl plays slower than it was measured, and nothing else is retimed", () => {
  // Owner 2026-08-20. The dial lives outside the vendored table so re-vendoring stays a
  // plain copy; this asserts the dial is actually reaching the state it names.
  assert.ok(speedOf("swirl") < 1, "swirl is back at full speed");
  for (const id of ALL) {
    if (id === "swirl") continue;
    assert.equal(speedOf(id), 1, `${id} was retimed without being asked for`);
  }
});

test("every animation the lab lists is a real one", () => {
  // A typo in the lab's list renders an empty cell rather than failing, and an empty
  // cell looks like an animation that has not been built yet.
  for (const id of ALL) assert.ok(STATE_BY_ID.get(id), `${id} is not in the catalogue`);
});
