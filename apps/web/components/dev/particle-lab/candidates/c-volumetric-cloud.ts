import { ballVolume, cullKeys } from "../geometry";
import { FBM_3D, SIMPLEX_3D } from "../noise-glsl";
import { applyCommon, COMMON_PARAMS, createPoints } from "../shader-common";
import type { Candidate } from "../types";

/**
 * C — Volumetric Cloud. Points fill a three-dimensional volume rather than a
 * shell, so the object has an inside.
 *
 * The trap here is smoke. Filling a ball with dots and fading them by depth
 * gives fog — the "generic AI orb". What keeps this coherent is a THRESHOLD: a
 * noise field is evaluated through the volume and only points above a cut-off
 * are drawn at all, so the visible object is a handful of connected lobes with
 * genuine empty space between them, not an even haze.
 *
 * Sampling the radius as a cube root is what makes the fill uniform by volume;
 * a linear radius piles two thirds of the points into the middle, which is
 * exactly the fuzzy-core look being avoided.
 */

const COUNT = 42000;

export const volumetricCloud: Candidate = {
  id: "C",
  name: "Volumetric Cloud",
  blurb: "Points occupying a real volume, cut down to a few coherent lobes with space between them.",
  technique: "Volume-uniform ball sampling + 2-octave fBm density threshold",
  provenance: "Ours, ~25 lines. Noise is Ashima/stegu snoise (MIT).",
  cost: "~25 lines GLSL. Highest allocated count in the lab, but most points are discarded before blending.",
  reference: false,
  noisePerPoint: 2,
  params: [
    ...COMMON_PARAMS,
    { key: "noiseFreq", label: "Noise frequency", min: 0.3, max: 3.5, step: 0.01, def: 0.85, hint: "Low values give a few big lobes; high values give speckle" },
    { key: "threshold", label: "Density threshold", min: -0.4, max: 0.6, step: 0.005, def: 0.06, hint: "Raise it to carve more empty space out of the volume" },
    { key: "edgeSoft", label: "Lobe edge softness", min: 0.02, max: 0.6, step: 0.005, def: 0.1 },
  ],
  build: () => {
    const built = createPoints({
      count: COUNT,
      attributes: {
        position: { array: ballVolume(COUNT, 31), itemSize: 3 },
        aCull: { array: cullKeys(COUNT, 303), itemSize: 1 },
      },
      uniforms: {
        uFreq: { value: 0.85 },
        uThreshold: { value: 0.06 },
        uEdge: { value: 0.1 },
      },
      includes: `
${SIMPLEX_3D}
${FBM_3D}
uniform float uFreq;
uniform float uThreshold;
uniform float uEdge;
`,
      vertexBody: `
  vec3 base = position;
  vec3 q = base * uFreq + vec3(sin(uTime * 0.08) * 0.5, uTime * 0.06, cos(uTime * 0.1) * 0.5);

  // TWO octaves, not three. The third octave adds detail finer than the point
  // spacing, so it does not read as structure — it reads as speckle, and speckle
  // is what makes a volumetric cloud look like sensor noise instead of an object.
  float m = fbm3(q, 2, 2.0, 0.5);

  pos = base;

  // Only the lobes survive. Everything below the cut-off gets zero alpha and is
  // discarded in the fragment shader before it ever costs a blend.
  alphaMul = smoothstep(uThreshold, uThreshold + uEdge, m);

  // Soften the outer boundary so the ball's edge is not a visible hard sphere.
  float r = length(base);
  alphaMul *= 1.0 - smoothstep(0.82, 1.0, r);

  sizeMul = 0.85 + 0.3 * m;
`,
    });

    return {
      object: built.points,
      allocated: COUNT,
      update: (t, p) => {
        applyCommon(built.set, t, p);
        built.set("uFreq", p.noiseFreq ?? 0.85);
        built.set("uThreshold", p.threshold ?? 0.06);
        built.set("uEdge", p.edgeSoft ?? 0.1);
      },
      dispose: built.dispose,
    };
  },
};
