// Digest ranking — the doc-12 ordered key, as a PURE deterministic function.
//
// The weekly digest order is auditable, not model-decided (same discipline as the
// §9 evidence engine). doc-12 §"Digest ranking" specifies this VERBATIM order:
//
//   watchlist_match_specificity → source_importance → evidence_quality
//   → recency → safety_affecting → dedupe
//
// Each is a sort key applied in that priority; `dedupe` is the final collapse. The
// generator (scripts/generate-digest.ts) builds DigestCandidates by matching the
// user's watchlist to `updates` and joining evidence_scores for evidence_rank,
// then calls rankDigest(). Keeping ranking here (one place) is why the live
// get_watchlist_updates RPC stays simple recency — no ranking logic duplicated.

import type { UpdateType, WatchItemType } from "./watchlist.ts";

/** One matched update, enriched with the signals the doc-12 key needs. */
export interface DigestCandidate {
  id: string;
  item_type: WatchItemType;
  item_ref: string;
  update_type: UpdateType;
  title: string;
  summary: string | null;
  source_id: string | null;
  source_url: string | null;
  importance_score: number | null;
  detected_at: string; // ISO 8601 — lexicographic compare is chronological
  /** §9 tier rank for the matched entity (-1 unknown … 4 very_strong). */
  evidence_rank: number;
}

// More specific follow = higher rank. Following an exact trial is the most
// specific signal; a keyword is the broadest.
const SPECIFICITY: Record<WatchItemType, number> = {
  trial: 4,
  drug: 3,
  class: 2,
  company: 1,
  keyword: 0,
};

// Safety-affecting update types (doc-12 key 5). An FDA safety communication or a
// label change can alter how a drug is used; new research/results do not, on their
// own, change safety guidance.
const SAFETY_TYPES: ReadonlySet<UpdateType> = new Set<UpdateType>([
  "fda_safety",
  "label_update",
]);

export function matchSpecificity(t: WatchItemType): number {
  return SPECIFICITY[t] ?? 0;
}

export function isSafetyAffecting(t: UpdateType): boolean {
  return SAFETY_TYPES.has(t);
}

/**
 * Total, deterministic comparator implementing the doc-12 ordered key. Negative
 * ⇒ `a` sorts before `b`. Every key is "higher value first"; a stable id tiebreak
 * makes the order total so digests are byte-reproducible.
 */
export function compareDigestItems(a: DigestCandidate, b: DigestCandidate): number {
  // 1 — watchlist_match_specificity (desc)
  const spec = matchSpecificity(b.item_type) - matchSpecificity(a.item_type);
  if (spec !== 0) return spec;

  // 2 — source_importance (desc)
  const imp = (b.importance_score ?? 0) - (a.importance_score ?? 0);
  if (imp !== 0) return imp;

  // 3 — evidence_quality (desc)
  const ev = (b.evidence_rank ?? -1) - (a.evidence_rank ?? -1);
  if (ev !== 0) return ev;

  // 4 — recency (desc; ISO strings sort chronologically)
  if (a.detected_at !== b.detected_at) return a.detected_at < b.detected_at ? 1 : -1;

  // 5 — safety_affecting (desc) — doc-12 places this AFTER recency, verbatim
  const safety = (isSafetyAffecting(b.update_type) ? 1 : 0) -
    (isSafetyAffecting(a.update_type) ? 1 : 0);
  if (safety !== 0) return safety;

  // total-order tiebreak: stable, reproducible digests
  return a.id.localeCompare(b.id);
}

/** Dedupe key (key 6): one underlying source EVENT shown once. */
function eventKey(c: DigestCandidate): string {
  return `${c.update_type}|${c.source_id ?? c.id}`;
}

/**
 * Rank then dedupe a user's matched updates into the final digest list. Pure: the
 * input is not mutated. Dedupe keeps the highest-ranked occurrence of each source
 * event (collapse-after-sort), so a single article matched via multiple follows
 * appears once, attributed to its strongest match.
 */
export function rankDigest(items: ReadonlyArray<DigestCandidate>): DigestCandidate[] {
  const sorted = [...items].sort(compareDigestItems);
  const seen = new Set<string>();
  const out: DigestCandidate[] = [];
  for (const it of sorted) {
    const k = eventKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}
