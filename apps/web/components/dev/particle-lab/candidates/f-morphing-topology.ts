import { cullKeys, fibonacciSphere, randomAttr } from "../geometry";
import { applyCommon, COMMON_PARAMS, createPoints } from "../shader-common";
import type { Candidate } from "../types";

/**
 * F — Morphing Topology. The object drifts between three related shapes without
 * ever appearing to dissolve.
 *
 * The "without dissolving" part is the entire problem, and it is solved by
 * CORRESPONDENCE: all three targets are generated from the SAME set of surface
 * directions, so point number 9,412 is the same point on all three shapes and
 * has a short, sensible path to travel. Morph systems that dissolve are almost
 * always morphing between two independently-sampled point sets, where every
 * point's nearest counterpart is somewhere random and the cloud has to pass
 * through mush to get there.
 *
 * A per-point stagger delays each dot slightly, so the change sweeps across the
 * object as a front instead of everything snapping at once.
 *
 * ARCHITECTURAL NOTE — this deliberately does NOT use GPGPU ping-pong textures.
 * That technique (which is what `MisterPrada/morph-particles` demonstrates) is
 * the right answer when targets are too numerous to hold as attributes or when
 * positions must accumulate state. Here, three targets at 24k points is 864 KB
 * of vertex attributes and needs no state at all, so a `mix()` in the vertex
 * shader does the same job with no framebuffers, no readback and no extra pass.
 * Nothing was copied from that repository — it carries NO LICENCE file, so its
 * code is not ours to reuse. Only the idea is, and the idea is not novel.
 */

const COUNT = 24000;

/**
 * The rest state. NOT a plain sphere — a gentle four-lobe undulation.
 *
 * A perfect sphere was the first version and it was the wrong call: the object
 * spends most of its time at or near a target, so if any target is a featureless
 * ball, the candidate reads as a featureless ball most of the time and its whole
 * point is invisible.
 */
function targetRest(dirs: Float32Array): Float32Array {
  const out = new Float32Array(dirs.length);
  for (let i = 0; i < dirs.length; i += 3) {
    const x = dirs[i] ?? 0;
    const y = dirs[i + 1] ?? 0;
    const z = dirs[i + 2] ?? 0;
    const r = 1 + 0.1 * Math.sin(Math.atan2(z, x) * 4) * (1 - y * y) + 0.07 * Math.cos(y * 5);
    out[i] = x * r;
    out[i + 1] = y * r;
    out[i + 2] = z * r;
  }
  return out;
}

/** Oblate, with a soft dimple pressed into one side. */
function targetDimpled(dirs: Float32Array): Float32Array {
  const out = new Float32Array(dirs.length);
  for (let i = 0; i < dirs.length; i += 3) {
    const x = dirs[i] ?? 0;
    const y = dirs[i + 1] ?? 0;
    const z = dirs[i + 2] ?? 0;
    // How close this direction is to the dimple's axis.
    const toward = Math.max(0, z * 0.8 + x * 0.6);
    const press = 1 - 0.48 * Math.pow(toward, 3);
    out[i] = x * 1.24 * press;
    out[i + 1] = y * 0.66 * press;
    out[i + 2] = z * 1.24 * press;
  }
  return out;
}

/** Three-lobed, strongest at the equator so the poles stay recognisable. */
function targetLobed(dirs: Float32Array): Float32Array {
  const out = new Float32Array(dirs.length);
  for (let i = 0; i < dirs.length; i += 3) {
    const x = dirs[i] ?? 0;
    const y = dirs[i + 1] ?? 0;
    const z = dirs[i + 2] ?? 0;
    const lon = Math.atan2(z, x);
    const equator = 1 - y * y;
    const r = 1 + 0.42 * Math.sin(lon * 3) * equator;
    out[i] = x * r;
    out[i + 1] = y * (1 + 0.2 * equator);
    out[i + 2] = z * r;
  }
  return out;
}

export const morphingTopology: Candidate = {
  id: "F",
  name: "Morphing Topology",
  blurb: "Slowly re-forms between three related shapes, sweeping across the object rather than dissolving.",
  technique: "Three corresponded target buffers + staggered smoothstep mix in the vertex shader",
  provenance: "Ours. Technique family is the same as MisterPrada/morph-particles (NO LICENCE — nothing copied); implemented with plain attributes, no GPGPU.",
  cost: "~40 lines GLSL + 3 position buffers (864 KB). No framebuffers, no compute pass, no noise at all.",
  reference: false,
  noisePerPoint: 0,
  params: [
    ...COMMON_PARAMS,
    { key: "morphSpeed", label: "Morph speed", min: 0.01, max: 0.5, step: 0.005, def: 0.075, hint: "Full shape changes per second" },
    { key: "stagger", label: "Stagger", min: 0, max: 0.9, step: 0.01, def: 0.55, hint: "0 snaps the whole object at once; high values sweep it across" },
    { key: "drift", label: "Idle drift", min: 0, max: 0.12, step: 0.001, def: 0.025, hint: "Keeps the object alive between morphs" },
  ],
  build: () => {
    const dirs = fibonacciSphere(COUNT);

    const built = createPoints({
      count: COUNT,
      attributes: {
        position: { array: targetRest(dirs), itemSize: 3 },
        aT1: { array: targetDimpled(dirs), itemSize: 3 },
        aT2: { array: targetLobed(dirs), itemSize: 3 },
        aRand: { array: randomAttr(COUNT, 77), itemSize: 1 },
        aCull: { array: cullKeys(COUNT, 606), itemSize: 1 },
      },
      uniforms: {
        uMorphSpeed: { value: 0.075 },
        uStagger: { value: 0.55 },
        uDrift: { value: 0.025 },
      },
      includes: `
uniform float uMorphSpeed;
uniform float uStagger;
uniform float uDrift;
attribute vec3 aT1;
attribute vec3 aT2;
attribute float aRand;
`,
      vertexBody: `
  float phase = uTime * uMorphSpeed;
  float leg = floor(phase);
  float f = fract(phase);

  // Each point starts its journey a little later than the last. Dividing by the
  // remaining window keeps every point still arriving exactly at f == 1, so the
  // shape is always fully formed at the hand-over instead of being caught mid-way.
  float delay = aRand * uStagger;
  float fi = smoothstep(0.0, 1.0, clamp((f - delay) / max(1e-3, 1.0 - uStagger), 0.0, 1.0));

  float m = mod(leg, 3.0);
  vec3 from = m < 0.5 ? position : (m < 1.5 ? aT1 : aT2);
  vec3 to   = m < 0.5 ? aT1      : (m < 1.5 ? aT2 : position);

  pos = mix(from, to, fi);

  // A slow breath so the object is never completely static between morphs.
  pos *= 1.0 + uDrift * sin(uTime * 0.6 + aRand * 6.283);

  // Points currently in motion sit very slightly forward. It reads as the change
  // moving through the object rather than the object flickering.
  float moving = fi * (1.0 - fi) * 4.0;
  sizeMul = 1.0 + 0.3 * moving;
`,
    });

    return {
      object: built.points,
      allocated: COUNT,
      update: (t, p) => {
        applyCommon(built.set, t, p);
        built.set("uMorphSpeed", p.morphSpeed ?? 0.075);
        built.set("uStagger", p.stagger ?? 0.55);
        built.set("uDrift", p.drift ?? 0.025);
      },
      dispose: built.dispose,
    };
  },
};
