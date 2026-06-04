// Pure assembly for GET /compare — kept out of index.ts so it is unit-testable
// (the IO wrapper fetches the reads, this pairs them). No I/O, no Deno globals.

import type {
  Comparison,
  CompareSide,
} from "../../../packages/shared/src/compare.ts";
import type { EvidenceTier } from "../../../packages/shared/src/evidence.ts";
import type { SourceRef } from "../../../packages/shared/src/search.ts";

/** One side's already-extracted fields (index.ts maps the raw RPC payloads to this). */
export interface CompareSideInput {
  id: string;
  name: string;
  approved_status: string;
  mechanism_summary: string | null;
  evidence: { score: EvidenceTier; rationale: string } | null;
  indications: string | null;
  boxed_warning: string | null;
  key_warnings: string | null;
  trial_count: number;
  latest_trial_status: string | null;
  price_points: number;
  sources: SourceRef[];
}

function header(s: CompareSideInput): CompareSide {
  return { id: s.id, name: s.name, approved_status: s.approved_status };
}

/** Union both sides' sources, de-duplicated by source_id (stable: left first). */
function unionSources(l: SourceRef[], r: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const s of [...l, ...r]) {
    if (seen.has(s.source_id)) continue;
    seen.add(s.source_id);
    out.push(s);
  }
  return out;
}

export function buildComparison(l: CompareSideInput, r: CompareSideInput): Comparison {
  return {
    left: header(l),
    right: header(r),
    sections: {
      mechanism: { left: l.mechanism_summary, right: r.mechanism_summary },
      approved_uses: { left: l.indications, right: r.indications },
      evidence_strength: { left: l.evidence, right: r.evidence },
      trial_status: {
        left: { count: l.trial_count, latest_status: l.latest_trial_status },
        right: { count: r.trial_count, latest_status: r.latest_trial_status },
      },
      safety: {
        left: { boxed_warning: l.boxed_warning, key_warnings: l.key_warnings },
        right: { boxed_warning: r.boxed_warning, key_warnings: r.key_warnings },
      },
      cost_access: {
        left: { approved_status: l.approved_status, price_points: l.price_points },
        right: { approved_status: r.approved_status, price_points: r.price_points },
      },
    },
    sources: unionSources(l.sources, r.sources),
  };
}
