import { cullKeys, fibonacciSphere } from "../geometry";
import { FBM_3D, SIMPLEX_3D } from "../noise-glsl";
import { applyCommon, COMMON_PARAMS, createPoints } from "../shader-common";
import type { Candidate } from "../types";

/**
 * D — Topographic Blob. The second reference-chasing candidate, and the one that
 * gets its rows a completely different way from A.
 *
 * A's rows are PARAMETRIC — latitude rings, so they always run the same way
 * around the object no matter what the surface does. D's rows are ISO-LEVELS of
 * the noise field itself: the shader computes an elevation, multiplies it up
 * into bands, and keeps only the points sitting near a band boundary. The rows
 * therefore wander, close into loops, pinch and split exactly the way contour
 * lines on a topographic map do, because that is literally what they are.
 *
 * That is the difference worth judging between the two: A gives regular rows on
 * an irregular surface, D gives irregular rows that describe the surface. D
 * feels mathematical; A feels woven.
 *
 * The point set is deliberately oversized — most points fail the contour test
 * and are dropped. That is the cost of doing it this way, and the metrics show
 * it as allocated-vs-visible rather than hiding it.
 */

const COUNT = 70000;

export const topographicBlob: Candidate = {
  id: "D",
  name: "Topographic Blob",
  blurb: "Point rows that behave like 3D contour lines — they wander, loop and pinch with the surface.",
  technique: "Fibonacci sphere + 3-octave fBm elevation, points kept only near fract() iso-levels",
  provenance: "Ours. The iso-level trick is standard contour-map maths; noise is Ashima/stegu snoise (MIT).",
  cost: "~30 lines GLSL. Oversampled by design: 70k allocated so the surviving contours are dense enough to read.",
  reference: true,
  noisePerPoint: 3,
  params: [
    ...COMMON_PARAMS,
    { key: "levels", label: "Contour levels", min: 2, max: 26, step: 0.5, def: 11, hint: "How many iso-bands the elevation is cut into" },
    { key: "lineWidth", label: "Contour width", min: 0.02, max: 0.32, step: 0.002, def: 0.085, hint: "Too wide and the rows merge back into a solid skin" },
    { key: "deform", label: "Deformation", min: 0, max: 0.6, step: 0.005, def: 0.26 },
    { key: "noiseFreq", label: "Noise frequency", min: 0.3, max: 3, step: 0.01, def: 1.05 },
  ],
  build: () => {
    const built = createPoints({
      count: COUNT,
      attributes: {
        position: { array: fibonacciSphere(COUNT), itemSize: 3 },
        aCull: { array: cullKeys(COUNT, 404), itemSize: 1 },
      },
      uniforms: {
        uLevels: { value: 11 },
        uLineWidth: { value: 0.085 },
        uDeform: { value: 0.26 },
        uFreq: { value: 1.05 },
      },
      includes: `
${SIMPLEX_3D}
${FBM_3D}
uniform float uLevels;
uniform float uLineWidth;
uniform float uDeform;
uniform float uFreq;
`,
      vertexBody: `
  vec3 base = normalize(position);
  vec3 q = base * uFreq + vec3(sin(uTime * 0.07) * 0.45, uTime * 0.055, cos(uTime * 0.09) * 0.45);

  // The elevation field. Everything below reads off this one number.
  float h = fbm3(q, 3, 2.0, 0.5);

  // Displace by elevation so the contours describe a real 3D surface rather than
  // being painted on a sphere.
  pos = base * (1.0 + uDeform * h);

  // Distance to the nearest iso-level, in level units. fract() gives position
  // within a band; min(f, 1-f) folds it so both edges of the band count.
  float lev = h * uLevels;
  float f = fract(lev);
  float toLevel = min(f, 1.0 - f);

  // Keep only what sits on a contour, with a soft shoulder so the rows have
  // weight in the middle and fade at their edges.
  alphaMul = 1.0 - smoothstep(uLineWidth * 0.45, uLineWidth, toLevel);

  sizeMul = 0.9 + 0.35 * h;
`,
    });

    return {
      object: built.points,
      allocated: COUNT,
      update: (t, p) => {
        applyCommon(built.set, t, p);
        built.set("uLevels", p.levels ?? 11);
        built.set("uLineWidth", p.lineWidth ?? 0.085);
        built.set("uDeform", p.deform ?? 0.26);
        built.set("uFreq", p.noiseFreq ?? 1.05);
      },
      dispose: built.dispose,
    };
  },
};
