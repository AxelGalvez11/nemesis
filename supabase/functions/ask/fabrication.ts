// Fabrication guard (answer-layer entity check) + live→chunk adapters for the live-evidence path.
//
// WHY THIS EXISTS — the dense retrieval floor (cosine ≥ 0.5) does NOT refuse class-plausible
// fabricated drugs: "florizagliflozin" embeds mostly to its real SGLT2 neighbors and pulls REAL
// dapagliflozin/empagliflozin evidence above the floor (measured — see eval/live-fabrication-probe.ts).
// Adding live sources makes this worse: a live gather on the fake question returns real class-sibling
// papers that a cross-encoder reranker scores HIGH (0.69 measured) because they ARE relevant to the
// class. So neither a cosine floor nor a rerank-SCORE floor can refuse a fabricated drug.
//
// THE GUARD is categorical, not a magnitude: keep the answer ONLY if the drug the user literally
// asked about appears, by name, in the retained evidence. A real-but-new drug (e.g. retatrutide,
// sparse in our entity table) clears — its PubMed/CT records literally contain "retatrutide". A
// fabricated drug never clears — the surviving records name its real neighbors, never the fake token.
//
// We check the user's LITERAL mention, not the resolved canonical name: resolveEntities takes the top
// fuzzy match, so a fake can mis-resolve to a real neighbor; trusting the canonical name would let the
// fake back in. The literal mention is the only token the fake cannot borrow.

import type { LiveCandidate } from "./live-sources.ts";
import type { RetrievedChunk } from "./citation.ts";

const MIN_TOKEN_LEN = 3; // ignore ultra-short mentions ("k", "d3") that would match noise

// SCOPE: this guard is only invoked when LIVE_SOURCES=on (see index.ts). The dense-only path keeps its
// pre-existing behavior. DEPENDENCY: it checks classify's entity_mentions, which the classify prompt
// requires be extracted VERBATIM ("every drug/supplement/peptide/compound name … verbatim as written").
// If the classifier ever drops/normalizes a novel fake token, the guard can't see it — keep that prompt
// honest. The guard should be run over the FULL retrieved candidate pool, not a top-N slice, so a real
// drug named only in a lower-ranked chunk is not falsely refused (index.ts passes the pre-slice union).

/** Normalize for matching: lowercase, collapse whitespace. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Word-boundary-aware presence. The token must appear NOT flanked by alphanumerics, so a fabricated
 * name that is a substring of a real sibling does NOT count as present: "maglutide" ⊄ "semaglutide",
 * and "bpc-158" ⊄ "bpc-157" (the hyphen + digit boundary differ). This is what makes the check
 * categorical rather than a loose contains().
 */
function namedIn(haystack: string, token: string): boolean {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`).test(haystack);
}

/**
 * Should we refuse because a drug the user LITERALLY named is unsupported by the retrieved evidence?
 * That is the fabricated-drug signature: the evidence is all real class-siblings, the fake token
 * appears nowhere. Returns true = REFUSE.
 *
 * EVERY named drug must be present (word-boundary) in the evidence. If ANY is absent we refuse — a fake
 * co-mentioned with a real drug ("metformin and florizagliflozin") must NOT clear just because metformin
 * has support, or the generator would make unsupported claims about the fake. Conservative by design:
 * err toward refuse + related-sources over a confident answer about a drug we have no evidence names.
 *
 * @param mentions  classify's entity_mentions — the drug names the user typed, verbatim.
 * @param chunks    the retrieved candidate pool (library + live), pre-slice.
 */
export function isFabricatedDrugQuery(mentions: string[], chunks: RetrievedChunk[]): boolean {
  const tokens = [...new Set(mentions.map(norm))].filter((t) => t.length >= MIN_TOKEN_LEN);
  if (tokens.length === 0) return false; // no specific drug asked → guard does not apply
  if (chunks.length === 0) return true; // asked about a drug, retrieved nothing → refuse

  const haystacks = chunks.map((c) => norm(`${c.title ?? ""} ${c.chunk_text ?? ""}`));
  const someAbsent = tokens.some((t) => !haystacks.some((h) => namedIn(h, t)));
  return someAbsent; // any named drug missing from ALL evidence → refuse
}

/**
 * Adapt a live candidate to the RetrievedChunk shape so it ranks + cites alongside library chunks.
 * Live results have no DB row, so source_id/chunk_id are SYNTHETIC ("live:<provider>:<id>") — safe
 * because generated_answers.source_ids is jsonb (no UUID type / FK) and enforceCitations keys on the
 * retrieval-local tag, not source_id. similarity is 0 (no dense score); the reranker sets the order.
 */
export function liveToChunk(c: LiveCandidate, tag: string): RetrievedChunk {
  const syntheticId = `live:${c.provider}:${c.provider_id}`;
  return {
    tag,
    chunk_id: syntheticId,
    chunk_text: c.text,
    source_id: syntheticId,
    provider: c.provider,
    title: c.title,
    section: null,
    url: c.url,
    license: c.source.license,
    published_date: c.source.effective_at ? c.source.effective_at.slice(0, 10) : null,
    retrieved_at: new Date().toISOString(),
    similarity: 0,
  };
}

/** True when an id is a synthetic live id (not a real core_sources UUID). */
export function isLiveSourceId(id: string): boolean {
  return id.startsWith("live:");
}
