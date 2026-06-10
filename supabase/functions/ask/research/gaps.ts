// Deterministic literature-gap derivation (publishable-reports, plan §3). PURE, no LLM.
// Operates on the RUN's retrieved chunks — run-scoped (Tier-2) gaps, every statement carries
// its denominator ("in the sources we searched"), never "no evidence exists" (Altman-Bland).
// Classification mirrors evidence-scoring.ts extractSignals predicates.
import type { RetrievedChunk } from "../citation.ts";
import type { GapStatement, RetrievalCounts } from "../../../../packages/shared/src/research.ts";

const CAP_PER_SOURCE = 6; // matches both LIVE_PER_SOURCE_MAX and SUB_TOP_M in orchestrate.ts (both 6); disclosed as the per-source cap.

const isRct = (c: RetrievedChunk) => (c.publication_types ?? []).some((t) => /randomized controlled trial/i.test(t));
const isSynthesis = (c: RetrievedChunk) =>
  (c.publication_types ?? []).some((t) => /meta-analysis/i.test(t) || /systematic review/i.test(t));
const isInterventional = (c: RetrievedChunk) => (c.study_type ?? "").toUpperCase() === "INTERVENTIONAL";

/** NCT id from a clinicaltrials chunk's synthetic source_id ("live:clinicaltrials:NCT123"). */
function nctOf(c: RetrievedChunk): string | null {
  const m = c.source_id.match(/(NCT\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

// _subQuestions is reserved for a future per-sub-question coverage mode; unused in this run-scoped derivation.
export function deriveGaps(
  chunks: RetrievedChunk[],
  _subQuestions: string[],
): { gaps: GapStatement[]; counts: RetrievalCounts } {
  const retrieved_at = chunks.find((c) => c.retrieved_at)?.retrieved_at ?? null;
  const per_provider: Record<string, number> = {};
  for (const c of chunks) per_provider[c.provider] = (per_provider[c.provider] ?? 0) + 1;
  const providers_searched = Object.keys(per_provider);
  const counts: RetrievalCounts = {
    per_provider,
    total_retrieved: chunks.length,
    cap_per_source: CAP_PER_SOURCE,
    retrieved_at,
  };

  if (chunks.length === 0) {
    return {
      counts,
      gaps: [{
        dimension: "synthesis",
        type: "sparse",
        scope: "this_run",
        text: "No sources cleared the relevance threshold for this question in the databases we searched, so no evidence claims could be grounded.",
        denominator: { providers_searched, n_sources: 0, retrieved_at },
        corroborating_trials: [],
      }],
    };
  }

  // Ongoing/recruiting interventional trials → strengthening-only corroboration.
  const ongoingNct = [...new Set(chunks
    .filter((c) => c.provider === "clinicaltrials" && isInterventional(c) && /RECRUIT|NOT_YET|ACTIVE|ENROLL/i.test(c.trial_status ?? ""))
    .map(nctOf)
    .filter((x): x is string => !!x))];

  const denom = { providers_searched, n_sources: chunks.length, retrieved_at };
  const gaps: GapStatement[] = [];

  if (!chunks.some(isInterventional)) {
    gaps.push({
      dimension: "study_design",
      type: "no_human_trial",
      scope: "this_run",
      text: "No interventional (human) clinical trial was among the sources we searched for this question.",
      denominator: denom,
      corroborating_trials: ongoingNct,
    });
  }
  if (!chunks.some(isRct)) {
    gaps.push({
      dimension: "study_design",
      type: "no_rct",
      scope: "this_run",
      text: "No randomized controlled trial was among the sources we searched for this question.",
      denominator: denom,
      corroborating_trials: ongoingNct,
    });
  }
  if (!chunks.some(isSynthesis)) {
    gaps.push({
      dimension: "synthesis",
      type: "no_synthesis",
      scope: "this_run",
      text: "No systematic review or meta-analysis was among the sources we searched for this question, so these retrieved findings are not yet synthesized.",
      denominator: denom,
      corroborating_trials: ongoingNct,
    });
  }

  return { gaps, counts };
}
