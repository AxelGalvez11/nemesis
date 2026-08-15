import type { Candidate } from "../types";

import { contourMesh } from "./a-contour-mesh";
import { organicMembrane } from "./b-organic-membrane";
import { volumetricCloud } from "./c-volumetric-cloud";
import { topographicBlob } from "./d-topographic-blob";
import { rippleObject } from "./e-ripple-object";
import { morphingTopology } from "./f-morphing-topology";
import { adaptiveField } from "./g-adaptive-field";
import { curlFilaments } from "./h-curl-filaments";

/**
 * Order is the lab's reading order, A..H.
 *
 * Typed as a NON-EMPTY tuple so `CANDIDATES[0]` is a `Candidate` rather than
 * `Candidate | undefined` — which spares every caller a fallback for a list that
 * is a hard-coded literal three lines below.
 */
export const CANDIDATES: readonly [Candidate, ...Candidate[]] = [
  contourMesh,
  organicMembrane,
  volumetricCloud,
  topographicBlob,
  rippleObject,
  morphingTopology,
  adaptiveField,
  curlFilaments,
];

export function candidateById(id: string): Candidate | undefined {
  return CANDIDATES.find((c) => c.id === id);
}
