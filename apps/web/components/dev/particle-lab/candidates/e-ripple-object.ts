import { cullKeys, fibonacciSphere } from "../geometry";
import { FBM_3D, SIMPLEX_3D } from "../noise-glsl";
import { applyCommon, COMMON_PARAMS, createPoints } from "../shader-common";
import type { Candidate } from "../types";

/**
 * E — Ripple Object. A stable organic body with waves travelling through its
 * point structure.
 *
 * Two things keep this out of "physics demo" territory:
 *
 * 1. The wave is measured in GEODESIC distance from a source direction — the
 *    angle between a point and the source — so the rings travel over the
 *    surface and wrap around the far side, instead of being a flat sine sliding
 *    through a ball.
 * 2. The wave changes POINT SIZE as well as position. A displacement-only ripple
 *    disappears the moment you look at the silhouette head-on; modulating the
 *    dots means the wave is legible from any angle, which is the whole reason to
 *    build the object out of dots.
 *
 * Two sources on unrelated periods, so the interference never resolves into a
 * repeating pulse.
 */

const COUNT = 26000;

export const rippleObject: Candidate = {
  id: "E",
  name: "Ripple Object",
  blurb: "A settled organic body with waves travelling over its surface and through its dots.",
  technique: "Fibonacci sphere + fBm base shape + two geodesic travelling waves from drifting sources",
  provenance: "Ours, ~35 lines. Noise is Ashima/stegu snoise (MIT).",
  cost: "~35 lines GLSL. Cheapest animated candidate after B — the waves are trigonometry, not noise.",
  reference: false,
  noisePerPoint: 3,
  params: [
    ...COMMON_PARAMS,
    { key: "rippleStrength", label: "Ripple strength", min: 0, max: 0.3, step: 0.002, def: 0.075 },
    { key: "rippleFreq", label: "Ripple frequency", min: 1, max: 16, step: 0.1, def: 6.2, hint: "Rings between the source and the far side" },
    { key: "rippleSpeed", label: "Ripple speed", min: 0, max: 4, step: 0.02, def: 1.15 },
    { key: "deform", label: "Base deformation", min: 0, max: 0.5, step: 0.005, def: 0.14 },
  ],
  build: () => {
    const built = createPoints({
      count: COUNT,
      attributes: {
        position: { array: fibonacciSphere(COUNT), itemSize: 3 },
        aCull: { array: cullKeys(COUNT, 505), itemSize: 1 },
      },
      uniforms: {
        uRipple: { value: 0.075 },
        uRippleFreq: { value: 6.2 },
        uRippleSpeed: { value: 1.15 },
        uDeform: { value: 0.14 },
      },
      includes: `
${SIMPLEX_3D}
${FBM_3D}
uniform float uRipple;
uniform float uRippleFreq;
uniform float uRippleSpeed;
uniform float uDeform;

// One travelling wave from a source direction, falling off with distance so the
// far side of the object is calm rather than ringing.
float wave(vec3 n, vec3 src, float t, float freq, float speed) {
  float d = acos(clamp(dot(n, src), -1.0, 1.0));
  return sin(d * freq - t * speed) * exp(-d * 0.55);
}
`,
      vertexBody: `
  vec3 base = normalize(position);

  vec3 q = base * 0.9 + vec3(0.0, uTime * 0.04, 0.0);
  float h = fbm3(q, 3, 2.0, 0.5);

  // Two sources drifting on unrelated periods. Their interference never lands
  // back on itself, so the object never appears to "pulse".
  vec3 srcA = normalize(vec3(sin(uTime * 0.13), 0.45, cos(uTime * 0.13)));
  vec3 srcB = normalize(vec3(cos(uTime * 0.077), -0.62, sin(uTime * 0.091)));

  float w = wave(base, srcA, uTime, uRippleFreq, uRippleSpeed)
          + 0.55 * wave(base, srcB, uTime, uRippleFreq * 0.72, uRippleSpeed * 0.83);

  pos = base * (1.0 + uDeform * h + uRipple * w);

  // The wave in the dots themselves — this is what survives a head-on view.
  sizeMul = 1.0 + 0.55 * w;
  alphaMul = 0.78 + 0.22 * clamp(w + 1.0, 0.0, 2.0) * 0.5;
`,
    });

    return {
      object: built.points,
      allocated: COUNT,
      update: (t, p) => {
        applyCommon(built.set, t, p);
        built.set("uRipple", p.rippleStrength ?? 0.075);
        built.set("uRippleFreq", p.rippleFreq ?? 6.2);
        built.set("uRippleSpeed", p.rippleSpeed ?? 1.15);
        built.set("uDeform", p.deform ?? 0.14);
      },
      dispose: built.dispose,
    };
  },
};
