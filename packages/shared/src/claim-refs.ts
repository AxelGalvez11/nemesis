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
  const nums = [...new Set(citationIds.map(tagDigits).filter(Boolean))].sort(
    (a, b) => Number(a) - Number(b),
  );
  return nums.length ? ` [${nums.join(",")}]` : "";
}

/**
 * Numbered reference lines ("<tag-digit>. <formatted reference> — <url>") in chunk_tag digit
 * order. Lines are numbered by the tag digit itself (NOT array position), so a marker like
 * " [1,3]" always points at reference lines that literally start with "1." and "3." — even when
 * the surviving tag set is non-contiguous (e.g. {1,3,7}, the ordinary case once buildCitations
 * keeps only the cited subset — see supabase/functions/ask/research/orchestrate.ts's
 * buildCitations, which does not renumber). PURE.
 */
export function referenceLines(citations: Citation[], style: CitationStyle): string[] {
  return [...citations]
    .sort((a, b) => Number(tagDigits(a.chunk_tag)) - Number(tagDigits(b.chunk_tag)))
    .map((c) => `${tagDigits(c.chunk_tag)}. ${formatReference(c, style)}${c.url ? ` — ${c.url}` : ""}`);
}
