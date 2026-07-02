// Real-World Signal — PURE, deterministic. A RESEARCHER-facing, LOWEST-tier signal: aggregate
// patient-reported outcomes for a condition into descriptive COUNTS per intervention so a researcher can
// spot under-studied interventions, seed hypotheses, and flag where patient interest outruns formal
// evidence (it feeds the discovery engine's gaps/hypotheses). It is a SIGNAL for hypothesis generation —
// NOT clinical evidence, NOT a consumer "what worked for you," and NEVER an effect estimate (the summary
// carries no such field by design; pooling belongs to the meta engine over real trials). Graded at the
// lowest (anecdotal) tier and walled off from the cited evidence; abstains below a minimum-reports floor so
// thin-signal anecdote never surfaces. The safety pass over reported stacks (plan Phase B) and the
// sourcing/extraction (owner-gated) are separate. No LLM, no network.
// See docs/superpowers/specs/2026-06-29-realworld-signal-tier-plan.md.

export type ReportedOutcome = "helped" | "no_effect" | "worse" | "mixed";
export type PatientSourceType = "faers" | "forum" | "social";

/** One patient-reported outcome datum, with the real source + verbatim quote the faithfulness layer checks. */
export interface PatientReport {
  condition: string;
  reported_intervention: string;
  reported_outcome: ReportedOutcome;
  source_type: PatientSourceType;
  source_url: string; // the real post / record — never fabricated
  verbatim_quote: string; // provenance; the sentence the report was read from
  reported_date: string | null;
}

/** Provenance for one reported datum, so every count audits back to a real source. */
export interface ReportProvenance {
  source_url: string;
  verbatim_quote: string;
  outcome: ReportedOutcome;
  source_type: PatientSourceType;
}

/** Descriptive tally for one intervention — COUNTS ONLY, deliberately no effect estimate. */
export interface InterventionTally {
  intervention: string; // display label (first-seen original casing)
  tried: number;
  helped: number;
  no_effect: number;
  worse: number;
  mixed: number;
  provenance: ReportProvenance[];
}

export const REAL_WORLD_SIGNAL_TIER = "patient_reported_anecdotal" as const;

export interface RealWorldSignalSummary {
  condition: string;
  /** The lowest evidence tier — carried so the grader can never raise the answer's grade from this signal. */
  tier: typeof REAL_WORLD_SIGNAL_TIER;
  /** Interventions meeting the floor, ordered by `tried` desc then label. Empty when nothing qualifies. */
  interventions: InterventionTally[];
  total_reports: number; // total reports seen (including below-floor ones not shown)
  shown: boolean; // false ⇒ surface nothing (below the abstention floor)
  /** Honest, researcher-facing one-liner: a hypothesis-generation signal, never "works / effective / proven". */
  note: string;
}

/** Abstain below this many reports for an intervention — no thin-signal anecdote reaches the researcher. */
export const MIN_REPORTS_PER_INTERVENTION = 3;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Aggregate patient-reported outcomes for a condition into a researcher's real-world SIGNAL — descriptive
 * per-intervention counts. PURE. NEVER computes an effect estimate; abstains on interventions below
 * MIN_REPORTS_PER_INTERVENTION.
 */
export function buildRealWorldSignal(
  condition: string,
  reports: readonly PatientReport[],
): RealWorldSignalSummary {
  const groups = new Map<string, InterventionTally>();
  for (const r of reports) {
    const key = norm(r.reported_intervention);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { intervention: r.reported_intervention.trim(), tried: 0, helped: 0, no_effect: 0, worse: 0, mixed: 0, provenance: [] };
      groups.set(key, g);
    }
    g.tried += 1;
    if (r.reported_outcome === "helped") g.helped += 1;
    else if (r.reported_outcome === "no_effect") g.no_effect += 1;
    else if (r.reported_outcome === "worse") g.worse += 1;
    else g.mixed += 1;
    g.provenance.push({ source_url: r.source_url, verbatim_quote: r.verbatim_quote, outcome: r.reported_outcome, source_type: r.source_type });
  }

  const interventions = [...groups.values()]
    .filter((g) => g.tried >= MIN_REPORTS_PER_INTERVENTION)
    .sort((a, b) => (b.tried - a.tried) || a.intervention.localeCompare(b.intervention));

  const total = reports.length;
  const shown = interventions.length > 0;
  const note = shown
    ? `${total} patient-reported outcome${total === 1 ? "" : "s"} for ${condition} — a lowest-tier real-world signal for hypothesis generation, not clinical evidence.`
    : "Not enough patient-reported outcomes to surface — a real-world signal isn't shown below a minimum count.";

  return { condition, tier: REAL_WORLD_SIGNAL_TIER, interventions, total_reports: total, shown, note };
}
