import { cullKeys, fibonacciSphere } from "../geometry";
import { FBM_3D, SIMPLEX_3D } from "../noise-glsl";
import { applyCommon, COMMON_PARAMS, createPoints } from "../shader-common";
import type { Candidate } from "../types";

/**
 * B — Organic Membrane. The control case, and the simplest thing that could
 * work: one coherent dotted skin, evenly covered, with soft bulges and
 * depressions pushed through it by low-frequency noise.
 *
 * It is here partly to be chosen and partly to be a yardstick. If a candidate
 * with five times B's shader cost does not visibly beat B, that is a finding.
 *
 * The even coverage comes from the golden-angle spiral, which has no clumps and
 * no pole pinch — the two artefacts that make a dotted sphere look cheap.
 */

const COUNT = 24000;

export const organicMembrane: Candidate = {
  id: "B",
  name: "Organic Membrane",
  blurb: "One evenly-dotted skin with slow, soft bulges pushing through it.",
  technique: "Fibonacci-sphere point set + 3-octave fBm radial displacement",
  provenance: "Ours, ~20 lines. Noise is Ashima/stegu snoise (MIT). This is the baseline the owner predicted.",
  cost: "Lowest in the lab. ~20 lines GLSL on top of the shared noise file.",
  reference: false,
  noisePerPoint: 3,
  params: [
    ...COMMON_PARAMS,
    { key: "deform", label: "Deformation", min: 0, max: 0.6, step: 0.005, def: 0.22 },
    { key: "noiseFreq", label: "Noise frequency", min: 0.3, max: 3, step: 0.01, def: 0.95 },
  ],
  build: () => {
    const built = createPoints({
      count: COUNT,
      attributes: {
        position: { array: fibonacciSphere(COUNT), itemSize: 3 },
        aCull: { array: cullKeys(COUNT, 202), itemSize: 1 },
      },
      uniforms: {
        uDeform: { value: 0.22 },
        uFreq: { value: 0.95 },
      },
      includes: `
${SIMPLEX_3D}
${FBM_3D}
uniform float uDeform;
uniform float uFreq;
`,
      vertexBody: `
  vec3 base = normalize(position);
  vec3 q = base * uFreq + vec3(sin(uTime * 0.09) * 0.5, uTime * 0.07, cos(uTime * 0.11) * 0.5);
  float h = fbm3(q, 3, 2.0, 0.5);

  pos = base * (1.0 + uDeform * h);
  sizeMul = 1.0 + 0.22 * h;
`,
    });

    return {
      object: built.points,
      allocated: COUNT,
      update: (t, p) => {
        applyCommon(built.set, t, p);
        built.set("uDeform", p.deform ?? 0.22);
        built.set("uFreq", p.noiseFreq ?? 0.95);
      },
      dispose: built.dispose,
    };
  },
};
