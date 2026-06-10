// Numbered medical reference formatter (Vancouver + AMA). Phase 1 ships a graceful numbered
// fallback; Phase 4 replaces the body of formatReference with style-exact punctuation. The
// SIGNATURE is final so callers (export routes, ReportView) never change again.
// Import the source modules directly (NOT the ./index barrel) to avoid a barrel import cycle.
import type { Citation } from "./answer.ts";
import type { CitationStyle } from "./research.ts";

export interface FormattedReference {
  n: number;
  tag: string;
  text: string;
}

/** Format one citation as a reference string in the given style. PURE. */
export function formatReference(c: Citation, _style: CitationStyle): string {
  // Phase-1 fallback: title + provider + date. Phase 4 specializes per source_type + style.
  const bits = [c.title ?? c.source_id, providerLabel(c.source_type)];
  if (c.published_date) bits.push(c.published_date);
  if (c.url) bits.push(c.url);
  return bits.filter(Boolean).join(". ") + ".";
}

/** Build the full numbered reference list (numeric tag order), in the given style. PURE. */
export function buildReferenceList(citations: Citation[], style: CitationStyle): FormattedReference[] {
  return [...citations]
    .sort((a, b) => Number(a.chunk_tag.replace(/\D/g, "")) - Number(b.chunk_tag.replace(/\D/g, "")))
    .map((c, i) => ({ n: i + 1, tag: c.chunk_tag.replace(/\D/g, ""), text: formatReference(c, style) }));
}

function providerLabel(t: string): string {
  const x = t.toLowerCase();
  if (x.includes("openfda") || x.includes("dailymed")) return "[package insert]";
  if (x.includes("clinicaltrials")) return "ClinicalTrials.gov";
  if (x.includes("faers")) return "FDA FAERS (adverse-event database query)";
  if (x.includes("pubmed") || x.includes("europepmc")) return "PubMed";
  return t;
}
