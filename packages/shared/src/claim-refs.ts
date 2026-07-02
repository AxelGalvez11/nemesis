// Deliverable citation formatting shared by the PPT/DOCX/PDF exporters — every claim line
// in an exported artifact carries its [n] source markers (the "cited deck" differentiator:
// no mainstream deck generator ships citations — see docs/research/evidence-super-app-research.md §3).
//
// Numbering is tag-digit based (chunk_tag, e.g. "S3" -> 3), NOT array position: `citations` on a
// ResearchReport arrive "in reranked order" (see research.ts), not sorted by tag. referenceLines
// sorts by the same digit that claimRefMarker extracts (mirroring buildReferenceList/evidenceRows'
// existing convention) so a marker like " [1,3]" always points at reference lines "1." and "3.",
// never a mismatched reranked position.
import type { Citation } from "./answer.ts";
import { formatReference } from "./citation-format.ts";
import type { CitationStyle } from "./research.ts";

/** Digit-only tag normalizer (mirrors claim-meter.ts's normTag / citation-format.ts's chunk_tag use). */
const tagDigits = (t: string): string => t.replace(/\D/g, "");

/** " [1,3]" style marker for a claim's cited chunk_tags, or "" when there are none. PURE. */
export function claimRefMarker(citationIds: string[] | undefined): string {
  if (!citationIds?.length) return "";
  const nums = citationIds.map(tagDigits).filter(Boolean);
  return nums.length ? ` [${nums.join(",")}]` : "";
}

/**
 * Numbered reference lines ("1. <formatted reference> — <url>") in chunk_tag digit order — the
 * same order/numbering as claimRefMarker and buildReferenceList — with the source URL/DOI appended
 * when present. PURE.
 */
export function referenceLines(citations: Citation[], style: CitationStyle): string[] {
  return [...citations]
    .sort((a, b) => Number(tagDigits(a.chunk_tag)) - Number(tagDigits(b.chunk_tag)))
    .map((c, i) => `${i + 1}. ${formatReference(c, style)}${c.url ? ` — ${c.url}` : ""}`);
}
