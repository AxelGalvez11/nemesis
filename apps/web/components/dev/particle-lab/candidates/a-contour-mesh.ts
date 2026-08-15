import { cullKeys, ringSphere } from "../geometry";
import { FBM_3D, SIMPLEX_3D } from "../noise-glsl";
import { applyCommon, COMMON_PARAMS, createPoints } from "../shader-common";
import type { Candidate } from "../types";

/**
 * A — Contour Mesh. The most literal reading of the reference: thousands of dots
 * arranged into flowing rows that wrap an organic deforming surface.
 *
 * Two decisions carry the whole look:
 *
 * 1. Points are DENSE along a row and SPARSE between rows. An even sphere
 *    distribution cannot produce banding at any density — the rows have to be
 *    built in, which is why this uses latitude rings rather than a Fibonacci
 *    spiral like B.
 * 2. The rows FLOW along themselves, faster at the equator than near the poles.
 *    That differential motion is what stops it reading as a spinning globe: the
 *    object can sit almost still while its surface keeps reorganising.
 *
 * Positions are reconstructed in the vertex shader from (band, along) rather than
 * stored, which is what makes the flow animatable at all — a baked position
 * buffer can only be rotated, not travelled along.
 */

const BANDS = 72;
const ALONG_DENSITY = 430;

export const contourMesh: Candidate = {
  id: "A",
  name: "Contour Mesh",
  blurb: "Dots packed into flowing rows that wrap a slowly deforming organic surface.",
  technique: "Latitude-ring point lattice + 4-octave fBm radial displacement, positions rebuilt per-frame in the vertex shader",
  provenance: "Ours. Ring lattice is plain parametric geometry; noise is Ashima/stegu snoise (MIT).",
  cost: "~55 lines GLSL + the shared 100-line MIT noise file. No runtime dependency beyond three.js.",
  reference: true,
  noisePerPoint: 4,
  params: [
    ...COMMON_PARAMS,
    { key: "deform", label: "Deformation", min: 0, max: 0.55, step: 0.005, def: 0.2 },
    { key: "noiseFreq", label: "Noise frequency", min: 0.3, max: 3.5, step: 0.01, def: 1.15 },
    { key: "bandStep", label: "Row spacing", min: 1, max: 4, step: 1, def: 1, hint: "Keeps every Nth row — 1 shows all 72" },
    { key: "flow", label: "Row flow", min: 0, max: 0.35, step: 0.002, def: 0.055, hint: "Travel along the rows. This is the motion, not the rotation." },
  ],
  build: () => {
    const ring = ringSphere(BANDS, ALONG_DENSITY);
    const count = ring.count;

    // Which ring (as an integer) each point belongs to, so `bandStep` can keep
    // every Nth row without rebuilding the buffer.
    const bandIndex = new Float32Array(count);
    for (let i = 0; i < count; i++) bandIndex[i] = Math.round((ring.band[i] ?? 0) * BANDS - 0.5);

    const built = createPoints({
      count,
      attributes: {
        // Carried only so three.js can infer a vertex count — the shader rebuilds
        // every position from (band, along) so the rows can be travelled along.
        position: { array: ring.positions, itemSize: 3 },
        aBand: { array: ring.band, itemSize: 1 },
        aAlong: { array: ring.along, itemSize: 1 },
        aBandIndex: { array: bandIndex, itemSize: 1 },
        aCull: { array: cullKeys(count, 101), itemSize: 1 },
      },
      uniforms: {
        uDeform: { value: 0.2 },
        uFreq: { value: 1.15 },
        uBandStep: { value: 1 },
        uFlow: { value: 0.055 },
      },
      includes: `
${SIMPLEX_3D}
${FBM_3D}
uniform float uDeform;
uniform float uFreq;
uniform float uBandStep;
uniform float uFlow;
attribute float aBand;
attribute float aAlong;
attribute float aBandIndex;
const float PI = 3.14159265359;
`,
      vertexBody: `
  // Rows near the equator travel faster than rows near the poles. Uniform flow
  // reads as a rotating globe; differential flow reads as a surface in motion.
  float bandSpeed = 0.55 + 0.75 * sin(aBand * PI);
  float u = fract(aAlong + uTime * uFlow * bandSpeed);
  float phi = aBand * PI;
  float sr = sin(phi);
  vec3 base = vec3(cos(u * 2.0 * PI) * sr, cos(phi), sin(u * 2.0 * PI) * sr);

  // Drifting through the noise domain on three different periods keeps the
  // surface evolving without ever repeating or sliding in one direction.
  vec3 q = base * uFreq + vec3(sin(uTime * 0.11) * 0.6, uTime * 0.085, cos(uTime * 0.13) * 0.6);
  float h = fbm3(q, 4, 2.0, 0.5);

  pos = base * (1.0 + uDeform * h);

  // Raised ground gets slightly larger dots, which is what makes the rows read
  // as contours over a solid rather than as stripes on a ball.
  sizeMul = 1.0 + 0.38 * h;

  // Row thinning. mod() on the integer ring index, so rows drop out whole.
  if (mod(aBandIndex, uBandStep) > 0.5) {
    alphaMul = 0.0;
    sizeMul = 0.0;
  }
`,
    });

    return {
      object: built.points,
      allocated: count,
      update: (t, p) => {
        applyCommon(built.set, t, p);
        built.set("uDeform", p.deform ?? 0.2);
        built.set("uFreq", p.noiseFreq ?? 1.15);
        built.set("uBandStep", Math.max(1, Math.round(p.bandStep ?? 1)));
        built.set("uFlow", p.flow ?? 0.055);
      },
      dispose: built.dispose,
    };
  },
};
