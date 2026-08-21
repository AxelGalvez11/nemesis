// The two facts about the engine's OUTPUT that the phone renderer parses rather than reads.
//
// 🔴 A PARSER NEEDS A GUARD IN A WAY A READER DOES NOT. `apps/web/components/bloub/bloub-bot.tsx`
// takes `eye.matrix` and `arc.grad.stops` and hands them to a browser, which is the thing that
// defines what they mean. `apps/mobile/src/components/bloub/BloubBot.tsx` cannot: react-native-svg
// has no SVG-attribute parser behind `setNativeProps`, so the phone renderer takes those same two
// values APART — a `matrix(a,b,c,d,e,f)` string into six numbers, and three hex stops into a flat
// native array. Both of those readings are assumptions about vendored code that nobody here wrote
// and that a re-vendor may change.
//
// And both fail SILENTLY if they stop holding. A matrix that no longer parses falls back to
// identity, which piles both eyes at the origin; a fourth gradient stop is simply dropped, which
// reads as a ring that fades wrong. Neither throws. So they are measured here instead.
//
// 🔴 THIS FILE LIVES IN `packages/shared`, NOT BESIDE THE RENDERER IT GUARDS. `apps/mobile` has 75
// `*.test.ts` files and NO `test` script, so `turbo run test` runs none of them — a guard written
// next to the phone renderer would be decorative, which `scripts/run-tests.mjs`'s own header calls
// worse than no guard because it reads as coverage. The filename is FLAT for the same reason that
// runner gives: it discovers tests with a non-recursive `readdirSync("src")`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { BotEngine } from "./bloub/engine.ts";
import { EXPRESSION_BY_ID } from "./bloub/expressions.ts";
import { RAYON } from "./bloub/repere.ts";
import { SHAPE_BY_ID } from "./bloub/skins.ts";
import { SEQUENCE, type StateId } from "./bloub/states.ts";
import { ARC_STOPS } from "./character/pool.ts";
import { stateForCanvas } from "./character/stations.ts";

const ALL: StateId[] = [...SEQUENCE, "swirl"];

/**
 * Every frame the renderer can be asked to draw — swept over ORDERED PAIRS, because during a
 * cross-fade the engine emits both states at once and the awkward cases live between animations
 * rather than inside one.
 *
 * 🔴 A NON-CIRCLE SILHOUETTE AND A NON-DEFAULT EXPRESSION, DELIBERATELY. The eye placement takes a
 * different route when the body is not a circle (the eyes are re-seated against the real contour)
 * and when an expression is morphing, and those are exactly the routes that could build the
 * transform differently. Sweeping only the default look would test the easy half.
 */
function* everyFrame() {
  const radii = SHAPE_BY_ID.get("goutte")?.radii ?? null;
  const expression = EXPRESSION_BY_ID.get("curieux") ?? null;
  for (const from of ALL) {
    for (const to of ALL) {
      const engine = new BotEngine(RAYON, from, radii, expression);
      engine.setState(to, 1);
      for (let i = 0; i <= 240; i += 1) yield engine.sample(i / 60);
    }
  }
}

test("🔴 every eye transform is a matrix() the phone renderer can take apart", () => {
  // `matrix(` + six comma-separated decimals, no spaces. The phone renderer splits on the commas;
  // an `a b c d e f` spelling, a `translate(...) rotate(...)` list, or scientific notation would
  // all leave it with identity and both eyes stacked at the origin, silently.
  const SHAPE = /^matrix\((-?\d+(\.\d+)?,){5}-?\d+(\.\d+)?\)$/;
  let seen = 0;
  for (const frame of everyFrame()) {
    for (const eye of frame.eyes) {
      seen += 1;
      assert.match(eye.matrix, SHAPE, `eye transform is no longer a plain matrix(): ${eye.matrix}`);
    }
  }
  // A sweep that stopped producing eyes would pass the loop above without asserting anything.
  assert.ok(seen > 50_000, `only ${seen} eye transforms sampled — the sweep stopped covering them`);
});

test("🔴 every gradient has exactly the number of stops both renderers preallocate", () => {
  // Web writes three fixed <stop> nodes; the phone builds a three-pair flat native array. A
  // four-stop gradient renders with its last colour dropped on both, which reads as a ring that
  // fades wrong rather than as a bug.
  for (const frame of everyFrame()) {
    for (const arc of frame.arcs) {
      assert.equal(arc.grad.stops.length, ARC_STOPS, `arc ${arc.id} has ${arc.grad.stops.length} stops`);
    }
  }
});

test("🔴 the Canvas front door can only ask for the three cheap animations", () => {
  // The phone renderer's cost is measured per state: idle, thinking and wide are 8 node writes and
  // ~5 KB of path strings a frame. `orbit` is 26 writes and ~10 KB — roughly 620 KB/s across the
  // bridge at 60fps — and `comet` is in between. Neither is reachable from `stateForCanvas`, and
  // this is what keeps that true: it is the function the Canvas derives its state through, so if a
  // future activity mapped onto a ring animation, the front door would get expensive without
  // anyone choosing it.
  const cheap = new Set<StateId>(["idle", "thinking", "wide"]);
  for (const thinking of [true, false]) {
    for (const preparing of [true, false]) {
      for (const listening of [true, false, undefined]) {
        const got = stateForCanvas({ thinking, preparing, listening });
        assert.ok(
          cheap.has(got),
          `stateForCanvas({thinking:${thinking},preparing:${preparing},listening:${listening}}) is "${got}" — measure it on a mid-range Android before letting the front door ask for it`,
        );
      }
    }
  }
});
