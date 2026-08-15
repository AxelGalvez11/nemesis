import { cullKeys, ringSphere } from "../geometry";
import { CURL_3D, FBM_3D, SIMPLEX_3D } from "../noise-glsl";
import { applyCommon, COMMON_PARAMS, createPoints } from "../shader-common";
import type { Candidate } from "../types";

/**
 * H — Curl Filaments. The strongest thing the research turned up, and the third
 * candidate aimed at the reference image.
 *
 * A and D both IMPOSE their rows — A by building latitude rings, D by slicing an
 * elevation into levels. H does not impose rows at all. It starts from a ring
 * lattice and then drags every point along a CURL-NOISE flow field: the curl of
 * a vector field is divergence-free, which means the flow can never compress
 * points into a clump or blow them apart. Points can only be carried along it.
 *
 * The consequence is that the rows survive as rows while being swept into
 * curving filaments — banding that comes out of the motion rather than out of
 * the geometry. That is the closest thing in the lab to "information
 * continuously reorganising itself", because the structure is genuinely being
 * transported rather than displaced and returned.
 *
 * Source of the idea: Bridson, Hourihan & Nordenstam, "Curl-Noise for Procedural
 * Fluid Flow" (SIGGRAPH 2007). Re-implemented from the description — see
 * `noise-glsl.ts`.
 *
 * COST, corrected by measurement. Per POINT this is by far the most expensive
 * shader here — 15 noise evaluations per point per frame, against three for most
 * of the others. The obvious inference is that it is the slowest candidate, and
 * that inference was written into the comparison matrix before anything was
 * timed. It was wrong: because curl noise is expensive, the point count was set
 * low to match, and 11.5k expensive points cost LESS in total than D's 70k cheap
 * ones. Measured alone, this is among the fastest of the eight.
 */

const BANDS = 60;
const ALONG_DENSITY = 300;

export const curlFilaments: Candidate = {
  id: "H",
  name: "Curl Filaments",
  blurb: "Rows dragged into curving filaments by a divergence-free flow — the banding emerges from motion.",
  technique: "Ring lattice + curl-noise transport, tangentially biased to hold the shell",
  provenance: "Ours. Curl-noise per Bridson et al. (SIGGRAPH 2007), re-implemented; snoise is Ashima/stegu (MIT).",
  cost: "~45 lines GLSL + a 15-line curl helper. Highest per-point cost (15 snoise), but the lowest point count offsets it — measure before believing either number.",
  reference: true,
  noisePerPoint: 15,
  params: [
    ...COMMON_PARAMS,
    { key: "flowStrength", label: "Flow strength", min: 0, max: 0.9, step: 0.005, def: 0.42, hint: "Fraction of the radius the field carries each point" },
    { key: "noiseFreq", label: "Flow frequency", min: 0.2, max: 2.5, step: 0.01, def: 0.7, hint: "Low values give long filaments, high values give turbulence" },
    { key: "tangential", label: "Shell hold", min: 0, max: 1, step: 0.01, def: 0.92, hint: "1 keeps the flow on the surface; 0 lets it lift points off it" },
    { key: "relief", label: "Surface relief", min: 0, max: 0.4, step: 0.005, def: 0.12 },
  ],
  build: () => {
    const ring = ringSphere(BANDS, ALONG_DENSITY);
    const count = ring.count;

    const built = createPoints({
      count,
      attributes: {
        // The ring lattice IS the position here — the rows are in the buffer and
        // the flow field is what drags them into filaments.
        position: { array: ring.positions, itemSize: 3 },
        aCull: { array: cullKeys(count, 808), itemSize: 1 },
      },
      uniforms: {
        uFlowStrength: { value: 0.42 },
        uFreq: { value: 0.7 },
        uTangential: { value: 0.92 },
        uRelief: { value: 0.12 },
      },
      includes: `
${SIMPLEX_3D}
${FBM_3D}
${CURL_3D}
uniform float uFlowStrength;
uniform float uFreq;
uniform float uTangential;
uniform float uRelief;
`,
      vertexBody: `
  vec3 n = normalize(position);

  // The flow field, drifting slowly through its own domain so the filaments keep
  // rewriting themselves instead of settling into a fixed pattern.
  vec3 q = n * uFreq + vec3(0.0, uTime * 0.06, 0.0);
  vec3 raw = curl3(q, 0.12);

  // BOUND the transport. curl3 finite-differences over eps and divides by 2*eps,
  // so its raw magnitude runs to several units — larger than the object's own
  // radius. Feeding that straight in scattered every point into open space and
  // destroyed the silhouette. Take the DIRECTION from the field and let its
  // magnitude only modulate the step, so "flow strength" means a real fraction
  // of the radius and the shell survives at every setting.
  float mag = length(raw);
  vec3 dir = mag > 1e-5 ? raw / mag : vec3(0.0);
  float step = 0.35 + 0.65 * clamp(mag * 0.3, 0.0, 1.0);
  vec3 flow = dir * step;

  // Remove as much of the radial component as the shell-hold knob asks for. At
  // 1.0 the transport is purely across the surface and the object keeps a clean
  // silhouette; lower values let filaments lift off into the space around it.
  flow -= n * dot(flow, n) * uTangential;

  vec3 moved = normalize(n + flow * uFlowStrength);

  float h = fbm3(n * 1.1 + vec3(0.0, uTime * 0.04, 0.0), 3, 2.0, 0.5);
  pos = moved * (1.0 + uRelief * h);

  // Points travelling fastest are drawn slightly heavier, so the filaments read
  // as streams with direction rather than as an evenly-lit tangle.
  float speed = clamp(step, 0.0, 1.0);
  sizeMul = 0.85 + 0.5 * speed;
  alphaMul = 0.6 + 0.4 * speed;
`,
    });

    return {
      object: built.points,
      allocated: count,
      update: (t, p) => {
        applyCommon(built.set, t, p);
        built.set("uFlowStrength", p.flowStrength ?? 0.42);
        built.set("uFreq", p.noiseFreq ?? 0.7);
        built.set("uTangential", p.tangential ?? 0.92);
        built.set("uRelief", p.relief ?? 0.12);
      },
      dispose: built.dispose,
    };
  },
};
