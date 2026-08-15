import type * as THREE from "three";

/**
 * One tunable knob on a candidate. Candidates deliberately do NOT share a knob
 * set — a ripple strength is meaningless on a volumetric cloud, and forcing a
 * common schema would have meant either dead controls or eight identical spheres.
 */
export type ParamSpec = {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly def: number;
  /** Shown under the slider when the knob needs a sentence to be judgeable. */
  readonly hint?: string;
};

export type Params = Readonly<Record<string, number>>;

/** A built, live candidate: a scene object plus the two calls the harness makes. */
export type CandidateInstance = {
  readonly object: THREE.Object3D;
  /** `t` is the SHARED lab clock in seconds, so two views started apart still agree. */
  readonly update: (t: number, params: Params) => void;
  readonly dispose: () => void;
  /** Points allocated in the buffer. The visible count is this x the density knob. */
  readonly allocated: number;
};

export type Candidate = {
  /** "A".."H" — the letter the owner will use to name a winner. */
  readonly id: string;
  readonly name: string;
  /** One line on what the viewer is looking at. */
  readonly blurb: string;
  /** The technique, named honestly. Rendered on every card. */
  readonly technique: string;
  /** Where the technique came from, incl. licence when third-party code is involved. */
  readonly provenance: string;
  /** What we would be maintaining if this one won. No hiding architectural cost. */
  readonly cost: string;
  /** True for the candidates built to chase the owner's reference image. */
  readonly reference: boolean;
  /** snoise evaluations per point per frame — the real perf axis (draw calls are all 1). */
  readonly noisePerPoint: number;
  readonly params: readonly ParamSpec[];
  readonly build: () => CandidateInstance;
};

export function defaults(candidate: Candidate): Params {
  const out: Record<string, number> = {};
  for (const p of candidate.params) out[p.key] = p.def;
  return out;
}
