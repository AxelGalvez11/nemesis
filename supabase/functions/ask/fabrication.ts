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

/** Normalize for substring matching: lowercase, collapse whitespace. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Did the user ask about a specific drug whose NAME appears nowhere in the retained evidence?
 * That is the fabricated-drug signature (the evidence is all real class-siblings). Returns true
 * = REFUSE. Returns false when either no specific drug was named (general question — nothing to
 * verify) or at least one asked mention is actually present in the evidence.
 *
 * @param mentions  classify's entity_mentions — the drug names the user literally typed.
 * @param chunks    the retained evidence (library + live), post-rerank.
 */
export function isFabricatedDrugQuery(mentions: string[], chunks: RetrievedChunk[]): boolean {
  const tokens = [...new Set(mentions.map(norm))].filter((t) => t.length >= MIN_TOKEN_LEN);
  if (tokens.length === 0) return false; // no specific drug asked → guard does not apply
  if (chunks.length === 0) return true; // asked about a drug, retrieved nothing → refuse

  const haystacks = chunks.map((c) => norm(`${c.title ?? ""} ${c.chunk_text ?? ""}`));
  const anyMentionPresent = tokens.some((t) => haystacks.some((h) => h.includes(t)));
  return !anyMentionPresent; // none of the asked drugs is named anywhere → fabricated → refuse
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
