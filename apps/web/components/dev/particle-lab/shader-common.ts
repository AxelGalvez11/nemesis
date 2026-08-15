import * as THREE from "three";

import type { Params, ParamSpec } from "./types";

/**
 * The parts every candidate shares: the point-sprite tail of the vertex shader,
 * the fragment shader, and the seven knobs that mean the same thing everywhere.
 *
 * Candidates differ ONLY in how they compute an object-space position. Keeping
 * the emit/blend/fade half identical is what makes "B has better shape but D has
 * better point structure" an honest comparison rather than a comparison of two
 * different renderers.
 */

/** Knobs whose meaning does not change between candidates. Each spreads these in. */
export const COMMON_PARAMS: readonly ParamSpec[] = [
  { key: "speed", label: "Animation speed", min: 0, max: 3, step: 0.01, def: 1 },
  { key: "pointSize", label: "Point size", min: 0.3, max: 6, step: 0.05, def: 1.7, hint: "CSS pixels at the object's centre plane" },
  { key: "density", label: "Point density", min: 0.05, max: 1, step: 0.01, def: 1, hint: "Culled in-shader, so the buffer stays allocated" },
  { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01, def: 0.9 },
  { key: "objScale", label: "Object scale", min: 0.4, max: 1.8, step: 0.01, def: 1 },
  { key: "camDist", label: "Camera distance", min: 2.4, max: 10, step: 0.05, def: 5 },
  { key: "rotation", label: "Rotation", min: 0, max: 0.6, step: 0.005, def: 0.045, hint: "Radians/sec. Above ~0.2 it reads as a turntable." },
];

const COMMON_DECL = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uOpacity;
uniform float uDensity;
uniform float uCamDist;
uniform float uPixelRatio;
uniform float uObjScale;
attribute float aCull;
varying float vAlpha;
`;

/**
 * Emits the point.
 *
 * Point size is expressed in CSS pixels AT THE OBJECT CENTRE and is deliberately
 * independent of canvas size: at 48px the object shrinks but the dots do not, so
 * the loader preview shows the real failure mode (dots merging into a blob)
 * rather than a failure mode invented by the harness.
 */
const EMIT = /* glsl */ `
  vec4 mv = modelViewMatrix * vec4(pos * uObjScale, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(0.001, -mv.z);
  gl_PointSize = uSize * uPixelRatio * (uCamDist / dist) * sizeMul;

  // Nearer points sit forward by being more opaque. This is the only depth cue —
  // no fog, no glow, no size-only trick that dissolves at small scales.
  float depth01 = clamp((dist - (uCamDist - 1.7)) / 3.4, 0.0, 1.0);
  vAlpha = mix(1.0, 0.16, depth01) * alphaMul * uOpacity;

  if (aCull > uDensity) {
    gl_PointSize = 0.0;
    vAlpha = 0.0;
  }
`;

/**
 * Round dot, soft by one pixel so it does not alias into a square, and no more.
 * `discard` on near-zero alpha keeps the culled points off the blend path.
 */
const FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uInk;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = (1.0 - smoothstep(0.36, 0.5, d)) * vAlpha;
  if (a < 0.008) discard;
  gl_FragColor = vec4(uInk, a);
}
`;

export type PointsSpec = {
  readonly count: number;
  /** Extra vertex attributes. `aCull` is added for you. */
  readonly attributes: Record<string, { array: Float32Array; itemSize: number }>;
  /** Extra uniforms on top of the common set. */
  readonly uniforms: Record<string, THREE.IUniform>;
  /** GLSL pasted above `main` — noise helpers, constants, the candidate's own functions. */
  readonly includes?: string;
  /**
   * GLSL that must assign three locals, already declared for it:
   *   `pos`      final object-space position
   *   `sizeMul`  per-point size multiplier (1.0 = the global point size)
   *   `alphaMul` per-point alpha multiplier (1.0 = fully visible)
   */
  readonly vertexBody: string;
};

/**
 * Sets a numeric uniform by name, and THROWS if the shader has no such uniform.
 *
 * Throwing is the point. The obvious alternative — skip silently when the key is
 * missing — turns a typo into a knob that moves and does nothing, which is
 * exactly the kind of failure this lab exists to avoid: the owner would be
 * judging a candidate whose "deformation" slider was never connected.
 */
export type UniformSetter = (key: string, value: number) => void;

export type BuiltPoints = {
  readonly points: THREE.Points;
  readonly set: UniformSetter;
  readonly dispose: () => void;
};

/** Same contract as `UniformSetter`, for the harness's non-numeric uniforms. */
export function uniformOf(material: THREE.ShaderMaterial, key: string): THREE.IUniform {
  const u = material.uniforms[key];
  if (!u) throw new Error(`particle-lab: shader is missing uniform "${key}"`);
  return u;
}

/**
 * Pushes the seven shared knobs into the shared uniforms. Every candidate calls
 * this first and then sets only its own — so a change to how, say, density culls
 * lands in all eight at once instead of in seven of them.
 *
 * `t` is the shared lab clock; multiplying it by `speed` here (rather than
 * advancing a per-candidate accumulator) is what lets two views started minutes
 * apart still show the same frame.
 */
export function applyCommon(set: UniformSetter, t: number, p: Params): void {
  set("uTime", t * (p.speed ?? 1));
  set("uSize", p.pointSize ?? 1.7);
  set("uOpacity", p.opacity ?? 0.9);
  set("uDensity", p.density ?? 1);
  set("uObjScale", p.objScale ?? 1);
  set("uCamDist", p.camDist ?? 5);
}

/**
 * Wires geometry + ShaderMaterial. This is the whole of what a particle
 * framework would have given us, and it is 30 lines — which is the finding that
 * kept `three.quarks` / `Three-VFX` / `@react-three/drei` out of the tree.
 */
export function createPoints(spec: PointsSpec): BuiltPoints {
  const geometry = new THREE.BufferGeometry();

  for (const [name, attr] of Object.entries(spec.attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(attr.array, attr.itemSize));
  }

  // The object never leaves a unit-ish radius, so a hand-set sphere is both
  // correct and cheaper than computing one over every attribute set.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2.2);

  // Be explicit about how many points to draw. Left to itself three.js infers the
  // count from `position`, which is wrong for candidates that rebuild their
  // positions in the shader and only carry `position` to satisfy that inference.
  geometry.setDrawRange(0, spec.count);

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uSize: { value: 1.7 },
    uOpacity: { value: 0.9 },
    uDensity: { value: 1 },
    uCamDist: { value: 5 },
    uPixelRatio: { value: 1 },
    uObjScale: { value: 1 },
    uInk: { value: new THREE.Color(0x11161d) },
    ...spec.uniforms,
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `${COMMON_DECL}\n${spec.includes ?? ""}\nvoid main() {\n  vec3 pos;\n  float sizeMul = 1.0;\n  float alphaMul = 1.0;\n${spec.vertexBody}\n${EMIT}\n}`,
    fragmentShader: FRAGMENT,
    transparent: true,
    // No depth write and no depth test: the dots are translucent, so occlusion
    // would punch holes in the surface. Depth reads as opacity instead (see EMIT).
    depthWrite: false,
    depthTest: false,
    // NormalBlending, never Additive — additive is what makes a point cloud glow,
    // and glow is explicitly out of the Nemesis visual language.
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    set: (key, value) => {
      const target = uniforms[key];
      if (!target) throw new Error(`particle-lab: no uniform "${key}"`);
      target.value = value;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
