// Live-monitoring change detection — PURE, deterministic, no DB/network deps.
//
// This is the correctness core of WS-D (standing-watch). The keystone design rule
// (advisor-confirmed): change is detected by DIFFING DATED SOURCE-API RESULTS against
// an accumulating per-watch known-source set — NEVER by diffing the engine's output.
// Re-running the engine retrieves a slightly different source set each time (retrieval
// jitter), so a cited-source diff would fire constant false "new evidence!" alerts and
// destroy trust in a paid product. A source is new, or it isn't; no guessing.
//
// The expensive grounded engine runs ONLY to summarize a confirmed change (elsewhere,
// through the one safety scan). This module just answers: given what the dated query
// returned this cycle and what we already knew, what is genuinely new, which of those
// warrant a loud alert, and what is the accumulated known-set now?
//
// Kept dependency-free (a leaf, like study-type.ts) so it is trivially unit-testable.

import { studyTypeLabel, type StudyTypeFields } from "./study-type.ts";

/**
 * The minimal per-source fields the detector needs. A live candidate / citation /
 * normalized source is adapted to this shape by the caller (the watch-check edge fn).
 * Extends StudyTypeFields so it passes straight into `studyTypeLabel` for the material
 * classifier — the same study-type metadata the providers already capture, never an LLM guess.
 */
export interface WatchSource extends StudyTypeFields {
  /** core_sources provider, e.g. "pubmed_oa" | "clinicaltrials" | "openfda" | "openalex". */
  provider: string;
  /** PMID | NCT | SPL-set-id | … — the provider-local id (PMID already bare-normalized upstream). */
  provider_id: string;
  title?: string;
  url?: string;
  /** YYYY-MM-DD when known; informational (the dated query, not this field, bounds the fetch). */
  published_date?: string | null;
}

/** Why a new source earned a loud alert. Per-source triggers; the recompute-based triggers
 *  (evidence-grade shift, meta significance crossing) are computed in a later increment over
 *  the accumulated set, not per-source. */
export type AlertReason = "new_high_tier_study" | "retraction";

export interface WatchAlertItem {
  readonly source: WatchSource;
  readonly reason: AlertReason;
}

export interface WatchDelta {
  /** True on the first-ever check: the watch is baselined silently (store keys, emit nothing). */
  readonly baseline: boolean;
  /** Sources not in the prior known-set (empty on baseline), in the order received. */
  readonly newSources: WatchSource[];
  /** The subset of newSources that move the conclusion — each with its reason. */
  readonly alerts: WatchAlertItem[];
  /** The full known-set after this cycle: prior keys ∪ every fetched key (accumulating). */
  readonly knownKeysAfter: string[];
}

/** The canonical dedupe key, matching the live-evidence union ("provider:provider_id",
 *  first-wins). Stable across cycles, so a source seen last week is recognized this week. */
export function sourceKey(s: { provider: string; provider_id: string }): string {
  return `${s.provider}:${s.provider_id}`;
}

/** Late-phase (3–4) trials and the synthesis/RCT tiers are conclusion-movers; earlier-phase
 *  trials, observational studies, reviews and plain articles are "what's new" feed material
 *  but not loud alerts. Reads off the deterministic `studyTypeLabel`. */
function isHighTierLabel(label: string): boolean {
  if (
    label === "Meta-analysis" ||
    label === "Systematic review" ||
    label === "Randomized controlled trial"
  ) {
    return true;
  }
  // "Clinical trial · Phase 3" / "Interventional trial · Phase 4" → high-tier; Phase 1/2 → not.
  return /· Phase [34]$/.test(label);
}

/**
 * Per-source alert classification. A retraction outranks the study-tier signal: a paper can be
 * both a retracted RCT and a retraction — the retraction is what matters to a watcher.
 * Returns null when the source is not a conclusion-mover (it still shows in the "what's new" feed).
 */
export function classifyAlertReason(s: WatchSource): AlertReason | null {
  const types = (s.publication_types ?? []).map((t) => t.toLowerCase());
  // PubMed "Retracted Publication" (the retracted article) | "Retraction of Publication" (the notice).
  if (types.some((t) => t.includes("retract"))) return "retraction";
  const label = studyTypeLabel(s);
  if (label && isHighTierLabel(label)) return "new_high_tier_study";
  return null;
}

/**
 * Compute the change delta for one watch cycle.
 *
 * @param fetched   what the dated source-API query returned this cycle (already provider-normalized).
 * @param knownKeys the watch's accumulated known-source keys (provider:provider_id) from prior cycles.
 * @param firstRun  true on the very first check — baseline SILENTLY (store keys, emit nothing).
 *                  Explicit, NOT inferred from an empty known-set: a topic can legitimately return
 *                  0 sources on run 1 and its first real hit on run 2 must still surface.
 */
export function detectWatchDelta(args: {
  fetched: readonly WatchSource[];
  knownKeys: readonly string[];
  firstRun: boolean;
}): WatchDelta {
  const known = new Set(args.knownKeys);

  // Dedupe the cycle's fetch by key, first-wins (defensive — the live union already dedupes).
  const seenThisCycle = new Set<string>();
  const fetchedUnique: WatchSource[] = [];
  for (const s of args.fetched) {
    const key = sourceKey(s);
    if (seenThisCycle.has(key)) continue;
    seenThisCycle.add(key);
    fetchedUnique.push(s);
  }

  // Accumulate: prior history ∪ this cycle's keys. The dated query returns only recent items,
  // so the prior known-set must be preserved, not replaced.
  const knownKeysAfter = [...new Set([...args.knownKeys, ...seenThisCycle])];

  // Cold start: remember everything, surface/alert nothing.
  if (args.firstRun) {
    return { baseline: true, newSources: [], alerts: [], knownKeysAfter };
  }

  const newSources = fetchedUnique.filter((s) => !known.has(sourceKey(s)));
  const alerts: WatchAlertItem[] = [];
  for (const source of newSources) {
    const reason = classifyAlertReason(source);
    if (reason) alerts.push({ source, reason });
  }

  return { baseline: false, newSources, alerts, knownKeysAfter };
}
