import assert from "node:assert/strict";
import { test } from "node:test";

import { sampleState } from "./engine";
import {
  BODY,
  EYE_H,
  EYE_RISE,
  EYE_SPLIT,
  EYE_W,
  PROFILE_SAMPLES,
  REST_INK,
  SATELLITES,
  VIEW,
  fitGaze,
  profileAt,
  silhouette,
} from "./geometry";
import { REST } from "./pose";
import { STATE_ORDER, stateDuration } from "./states";

const LOOKS = [
  { x: 0, y: 0, mix: 0 },
  { x: 1, y: 1, mix: 1 },
  { x: -1, y: -1, mix: 1 },
  { x: 1, y: -1, mix: 1 },
  { x: -1, y: 1, mix: 1 },
];

/**
 * 🔴 THE ONE TEST THAT PROTECTS THE LAYOUT.
 *
 * The viewBox is a module constant because a per-frame box would resize the element
 * sixty times a second. That is only safe if nothing ever leaves it — and eyeballing
 * twenty states will not find the one frame, at one gaze, at one instant, that pokes
 * out. So: every state, across its whole duration, at five extreme gazes, at two
 * intensities, at both ends of the voice range. If this fails, `EXCURSION` goes up;
 * nothing else moves.
 */
test("no state, at any time or gaze, leaves the viewBox", () => {
  const x1 = VIEW.x + VIEW.w;
  const y1 = VIEW.y + VIEW.h;
  const worst = { name: "", slack: Infinity };

  for (const mode of STATE_ORDER) {
    const span = Math.max(stateDuration(mode), 2.5);
    for (let i = 0; i <= 140; i++) {
      const t = (i / 140) * span;
      for (const look of LOOKS) {
        for (const intensity of [1, 0.5]) {
          for (const voice of [0, 1]) {
            const b = sampleState(mode, t, {
              look,
              intensity,
              clock: t,
              ctx: { confidence: 1, voice },
            }).bounds;
            const slack = Math.min(b.x0 - VIEW.x, x1 - b.x1, b.y0 - VIEW.y, y1 - b.y1);
            if (slack < worst.slack) {
              worst.slack = slack;
              worst.name = `${mode} @ ${t.toFixed(2)}s`;
            }
          }
        }
      }
    }
  }

  assert.ok(worst.slack >= 0, `${worst.name} leaves the viewBox by ${(-worst.slack).toFixed(2)} mark units`);
});

test("the resting body is the size the size prop promises", () => {
  assert.equal(REST_INK.w, BODY.rx * 2);
  assert.equal(REST_INK.h, BODY.ry * 2);
});

test("the silhouette is a superellipse, not an ellipse", () => {
  // At 45 degrees an ellipse's radius is exactly 1 in normalised terms. The whole
  // identity is that this one is not — if that stops being true, the character has
  // silently become the shape every other mascot already is.
  const r45 = profileAt(Math.PI / 4, { ...REST.body, taper: 0 });
  assert.ok(r45 > 1.05, `corner radius ${r45.toFixed(3)} — the body has gone elliptical`);
});

test("the silhouette is closed and evenly sampled in every state", () => {
  for (const mode of STATE_ORDER) {
    for (const t of [0, 0.3, 1.1]) {
      const pts = silhouette(sampleStatePose(mode, t));
      assert.equal(pts.length, PROFILE_SAMPLES, mode);
      for (const p of pts) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${mode} @ ${t}`);
      }
    }
  }
});

function sampleStatePose(mode: (typeof STATE_ORDER)[number], t: number) {
  // Reaches through the public sampler so the test cannot drift from what is rendered.
  const frame = sampleState(mode, t);
  assert.ok(frame.body.d.startsWith("M"), "path did not start with a move");
  assert.ok(frame.body.d.endsWith("Z"), "path was not closed");
  return { ...REST.body, ...{ scale: 1 } };
}

test("every fragment is emitted every frame, so a blend has something to interpolate", () => {
  for (const mode of STATE_ORDER) {
    assert.equal(sampleState(mode, 0.5).satellites.length, SATELLITES, mode);
  }
});

test("fitGaze never lets an eye's corner leave the body", () => {
  for (let gx = -1; gx <= 1.001; gx += 0.1) {
    for (let gy = -1; gy <= 1.001; gy += 0.1) {
      const offU = gx * 0.32;
      const offV = gy * 0.34;
      const k = fitGaze(EYE_SPLIT, EYE_RISE, offU, offV, EYE_W, EYE_H);
      assert.ok(k >= 0 && k <= 1, `k out of range: ${k}`);
      for (const side of [-1, 1]) {
        const u = Math.abs(EYE_SPLIT * side + offU * k) + EYE_W;
        const v = Math.abs(EYE_RISE + offV * k) + EYE_H;
        assert.ok(Math.hypot(u, v) <= 0.8001, `corner at ${Math.hypot(u, v).toFixed(4)}`);
      }
    }
  }
});

test("fitGaze scales the travel, never the separation", () => {
  // The eyes must not converge as the character looks away — the fit trims how far the
  // gaze carries them, and leaves the face's own geometry alone.
  const wide = sampleState("idle", 0, { look: { x: 1, y: 1, mix: 1 } });
  const centre = sampleState("idle", 0, { look: { x: 0, y: 0, mix: 1 } });
  const sepWide = Math.abs(wide.eyes[1].cx - wide.eyes[0].cx);
  const sepCentre = Math.abs(centre.eyes[1].cx - centre.eyes[0].cx);
  assert.ok(Math.abs(sepWide - sepCentre) < 1e-9, `${sepWide} vs ${sepCentre}`);
});
