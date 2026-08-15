import { cullKeys, fibonacciSphere } from "../geometry";
import { FBM_3D, SIMPLEX_3D } from "../noise-glsl";
import { applyCommon, COMMON_PARAMS, createPoints } from "../shader-common";
import type { Candidate } from "../types";

/**
 * G — Adaptive Field. Regions of the object compress and expand independently,
 * so the surface appears to be reorganising its own internal structure.
 *
 * Every other candidate here moves points ALONG THE NORMAL — in and out. That
 * changes the object's shape but never its point distribution, so the density
 * you see is the density that was baked into the buffer. G moves points
 * TANGENTIALLY instead: each dot slides across the surface, down the gradient of
 * a slow scalar field, so dots pile up in the field's valleys and thin out over
 * its ridges. The silhouette barely changes; the structure changes constantly.
 *
 * The gradient is taken in the point's own tangent plane by sampling the field
 * at two small offsets. That is 3 fBm evaluations per point rather than 1, which
 * is the cost of the effect and is reported in the metrics.
 *
 * Dots also shrink where they crowd, so a dense region reads as fine detail
 * rather than as a blot.
 */

const COUNT = 30000;

export const adaptiveField: Candidate = {
  id: "G",
  name: "Adaptive Field",
  blurb: "Dots slide across the surface into shifting dense and sparse regions — the structure reorganises, not the shape.",
  technique: "Fibonacci sphere + tangent-plane gradient descent on a drifting fBm scalar field",
  provenance: "Ours, ~45 lines. Noise is Ashima/stegu snoise (MIT).",
  cost: "~45 lines GLSL. 3 fBm evaluations per point for the finite-difference gradient.",
  reference: false,
  noisePerPoint: 9,
  params: [
    ...COMMON_PARAMS,
    { key: "fieldStrength", label: "Field strength", min: 0, max: 0.9, step: 0.005, def: 0.45, hint: "How far dots slide toward the field's valleys" },
    { key: "noiseFreq", label: "Field frequency", min: 0.3, max: 3, step: 0.01, def: 1.5 },
    { key: "contrast", label: "Density contrast", min: 0, max: 1.4, step: 0.01, def: 0.85, hint: "Shrinks dots where they crowd" },
    { key: "relief", label: "Surface relief", min: 0, max: 0.35, step: 0.005, def: 0.09 },
  ],
  build: () => {
    const built = createPoints({
      count: COUNT,
      attributes: {
        position: { array: fibonacciSphere(COUNT), itemSize: 3 },
        aCull: { array: cullKeys(COUNT, 707), itemSize: 1 },
      },
      uniforms: {
        uFieldStrength: { value: 0.45 },
        uFreq: { value: 1.5 },
        uContrast: { value: 0.85 },
        uRelief: { value: 0.09 },
      },
      includes: `
${SIMPLEX_3D}
${FBM_3D}
uniform float uFieldStrength;
uniform float uFreq;
uniform float uContrast;
uniform float uRelief;

// The scalar field the points migrate through. Drifting on three periods so it
// never scrolls in one direction.
float field(vec3 n, float t, float freq) {
  vec3 q = n * freq + vec3(sin(t * 0.06) * 0.5, t * 0.05, cos(t * 0.08) * 0.5);
  return fbm3(q, 3, 2.0, 0.5);
}
`,
      vertexBody: `
  vec3 n = normalize(position);

  // A tangent basis for this point. The reference vector is tilted off the axis
  // so cross() never degenerates at the poles.
  vec3 ref = abs(n.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t1 = normalize(cross(n, ref));
  vec3 t2 = cross(n, t1);

  float eps = 0.06;
  float f0 = field(n, uTime, uFreq);
  float f1 = field(normalize(n + t1 * eps), uTime, uFreq);
  float f2 = field(normalize(n + t2 * eps), uTime, uFreq);

  // Gradient in the tangent plane. Moving against it walks each dot downhill,
  // which is what makes valleys gain points and ridges lose them.
  vec2 grad = vec2(f1 - f0, f2 - f0) / eps;

  // BOUND the step by its direction, exactly as H does. An unbounded gradient
  // step moves points by wildly different distances depending on how steep the
  // field happens to be there, which averages back out into an even sphere — the
  // clumping cancels itself. A bounded step lets valleys actually accumulate.
  float gmag = length(grad);
  vec2 gdir = gmag > 1e-5 ? grad / gmag : vec2(0.0);
  float travel = uFieldStrength * (0.3 + 0.7 * clamp(gmag * 0.4, 0.0, 1.0));
  vec3 slide = -(t1 * gdir.x + t2 * gdir.y) * travel;

  vec3 moved = normalize(n + slide);
  pos = moved * (1.0 + uRelief * f0);

  // Where the gradient is steep the dots are converging, so shrink them: a dense
  // patch of small dots reads as detail, a dense patch of large ones as a blot.
  float crowding = clamp(gmag * 0.45, 0.0, 1.0);
  sizeMul = 1.0 - uContrast * 0.55 * crowding;
  alphaMul = 0.55 + 0.45 * crowding;
`,
    });

    return {
      object: built.points,
      allocated: COUNT,
      update: (t, p) => {
        applyCommon(built.set, t, p);
        built.set("uFieldStrength", p.fieldStrength ?? 0.45);
        built.set("uFreq", p.noiseFreq ?? 1.5);
        built.set("uContrast", p.contrast ?? 0.85);
        built.set("uRelief", p.relief ?? 0.09);
      },
      dispose: built.dispose,
    };
  },
};
