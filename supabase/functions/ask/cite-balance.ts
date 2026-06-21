// Citation-slice balancing (§7). PURE, deterministic.
//
// The reranker (rerank.ts) scores every chunk on one relevance scale, blind to provider. FDA drug-
// label sections are long and dense with the drug name, so they tend to out-score short PubMed
// abstracts — and a naive top-N then fills the cited set with label text, burying the primary
// research a reader expects. This caps how many label-family chunks may occupy the cited slice so
// research (PubMed / Europe PMC / OpenAlex / trials) gets the top slots — WITHOUT ever showing fewer
// citations than a plain slice would: if research is genuinely sparse, held-over labels backfill.
//
// SAFETY: this only selects the slice shown to the generator + citation layer (aug.top). The
// fabrication guard runs on the FULL reranked pool (aug.pool), which this never touches, so no
// refusal floor moves. The result is a strict subset of an already-reranked, already-retrieved set.

import type { RetrievedChunk } from "./citation.ts";

// The regulatory drug-LABEL family — authoritative for dosing/contraindications but verbose enough to
// dominate the cross-encoder. FAERS (adverse-event reports) is intentionally excluded: it is sparse
// and a distinct signal, not label prose, so it competes normally.
const LABEL_PROVIDERS = new Set(["openfda", "dailymed", "fda_safety"]);

// At most this many label-family chunks in the cited slice, leaving the rest for research / trials /
// consumer sources. Tuned to keep a drug answer's authoritative dosing + safety citations while
// guaranteeing primary research is visible. Exceeded only by backfill when nothing else remains.
export const LABEL_SLICE_CAP = 4;

/**
 * Choose up to `limit` chunks from an already-reranked list, holding the label family to `labelCap`
 * so primary research is not crowded out of the cited slice. Rerank order is preserved within the
 * kept set. Held-over labels backfill any leftover slots, so the slice is never shorter than a plain
 * `slice(0, limit)` would be. PURE — returns a new array; the input is untouched.
 */
export function balanceCitedSlice(
  ordered: RetrievedChunk[],
  limit: number,
  labelCap: number = LABEL_SLICE_CAP,
): RetrievedChunk[] {
  const picked: RetrievedChunk[] = [];
  const heldLabels: RetrievedChunk[] = [];
  let labelCount = 0;

  for (const c of ordered) {
    if (picked.length >= limit) break;
    if (LABEL_PROVIDERS.has(c.provider) && labelCount >= labelCap) {
      heldLabels.push(c); // a label past the cap — defer it; research fills these slots first
      continue;
    }
    picked.push(c);
    if (LABEL_PROVIDERS.has(c.provider)) labelCount++;
  }

  // Backfill leftover slots with the deferred labels (rerank order preserved) so a query whose best
  // evidence really is mostly labels still fills the slice rather than showing fewer citations.
  for (const c of heldLabels) {
    if (picked.length >= limit) break;
    picked.push(c);
  }

  return picked;
}
