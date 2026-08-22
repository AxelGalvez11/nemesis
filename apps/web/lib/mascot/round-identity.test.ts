import assert from "node:assert/strict";
import test from "node:test";

import { sampleState } from "./engine";
import { REST } from "./pose";
import { SHAPES } from "./shapes";
import { STATE_ORDER, STATES } from "./states";

const samples = [0, 0.08, 0.2, 0.34, 0.5, 0.58, 0.7, 0.82, 1, 1.6, 2.4];

test("the canonical Nemesis body is an exact circle", () => {
  assert.ok(SHAPES.blob.length > 16);
  for (const radius of SHAPES.blob) assert.ok(Math.abs(radius - 1) < 1e-12);

  const frame = sampleState("idle", 0, { clock: 0 });
  assert.ok(Math.abs(frame.body.rx - frame.body.ry) < 1e-9, `rest renders ${frame.body.rx} x ${frame.body.ry}`);
});

test("every semantic state keeps the canonical circular radial profile", () => {
  for (const id of STATE_ORDER) {
    const state = STATES[id];
    for (const t of samples) {
      const pose = state.pose(t, { confidence: 1, voice: 0.5 });
      assert.equal(
        pose.body.radii,
        SHAPES.blob,
        `${id} selected or generated a non-circular silhouette at t=${t}`,
      );
      assert.equal(pose.body.taper, 0, `${id} tapered the circular silhouette at t=${t}`);
      assert.equal(pose.body.pinch, 0, `${id} pinched the circular silhouette at t=${t}`);
      assert.equal(pose.body.ripple, 0, `${id} rippled the circular silhouette at t=${t}`);
    }
  }
});

test("the signature jump has anticipation, flight, impact, rebound and settle", () => {
  const jump = STATES.success;
  const ctx = { confidence: 1, voice: 0 };
  const restX = REST.body.stretch;
  const restY = REST.body.squash;

  const anticipation = jump.pose(0.08, ctx);
  const apex = jump.pose(0.3, ctx);
  const impact = jump.pose(0.57, ctx);
  const rebound = jump.pose(0.65, ctx);
  const settled = jump.pose(1.05, ctx);

  assert.ok(anticipation.body.stretch > restX, "anticipation should widen");
  assert.ok(anticipation.body.squash < restY, "anticipation should compress vertically");

  assert.ok(apex.lift < -6, "apex should be visibly above rest");
  assert.ok(Math.abs(apex.body.stretch / restX - 1) < 0.08, "apex should return near round");

  assert.ok(impact.body.stretch / restX > 1.12, "landing should have a broad squish");
  assert.ok(impact.body.squash / restY < 0.9, "landing should compress vertically");

  assert.ok(rebound.lift < 0, "landing should release into a smaller rebound");
  assert.ok(rebound.body.squash > impact.body.squash, "rebound should recover height");

  assert.ok(Math.abs(settled.body.stretch - restX) < 1e-12, "jump should settle to round width");
  assert.ok(Math.abs(settled.body.squash - restY) < 1e-12, "jump should settle to round height");
  assert.ok(Math.abs(settled.lift) < 1e-12, "jump should settle on the baseline");
});

test("awaiting an answer is body-still rather than a loader", () => {
  const wait = STATES.waiting;
  const a = wait.pose(0.7, { confidence: 1, voice: 0 });
  const b = wait.pose(4.7, { confidence: 1, voice: 0 });

  assert.equal(a.body.stretch, b.body.stretch);
  assert.equal(a.body.squash, b.body.squash);
  assert.equal(a.body.tilt, b.body.tilt);
  assert.equal(a.sat.alpha, 0);
  assert.equal(b.sat.alpha, 0);
});
