// Compare shapes (§8 GET /compare?left&right — edge `compare`). The structured
// side-by-side the Compare screen renders: doc-11 sections (mechanism, approved
// uses, evidence strength, trial status, safety, cost/access) + the union of both
// entities' cited sources. Composed from the existing reads (get_drug + label +
// trials); the edge function does the pairing so the client renders, not computes.

import type { EvidenceTier } from "./evidence.ts";
import type { SourceRef } from "./search.ts";

/** The two entities being compared (header). */
export interface CompareSide {
  id: string;
  name: string;
  approved_status: string;
}

/** A left/right pairing for one comparison section. */
export interface ComparePair<T> {
  left: T;
  right: T;
}

export interface EvidenceSummary {
  score: EvidenceTier;
  rationale: string;
}

export interface TrialStatusSummary {
  count: number;
  latest_status: string | null;
}

export interface SafetyHighlights {
  boxed_warning: string | null;
  key_warnings: string | null;
}

export interface CostAccess {
  approved_status: string;
  price_points: number; // count of NADAC price rows we hold (a coarse availability proxy)
}

export interface Comparison {
  left: CompareSide;
  right: CompareSide;
  sections: {
    mechanism: ComparePair<string | null>;
    approved_uses: ComparePair<string | null>;
    evidence_strength: ComparePair<EvidenceSummary | null>;
    trial_status: ComparePair<TrialStatusSummary>;
    safety: ComparePair<SafetyHighlights>;
    cost_access: ComparePair<CostAccess>;
  };
  sources: SourceRef[];
}
