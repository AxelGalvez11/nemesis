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
export function formatReference(c: Citation, style: CitationStyle): string {
  const t = c.source_type.toLowerCase();
  const title = (c.title ?? "").trim().replace(/\.+$/, "");
  const accessed = c.retrieved_at ? `Accessed ${c.retrieved_at.slice(0, 10)}.` : "";

  // openFDA / DailyMed → package insert.
  if (t.includes("openfda") || t.includes("dailymed")) {
    return joinSentences([`${title} [package insert]`, c.url ?? "", accessed]);
  }
  // ClinicalTrials.gov → registry entry with NCT id.
  if (t.includes("clinicaltrials")) {
    const nct = (c.source_id.match(/(NCT\d+)/i)?.[1] ?? "").toUpperCase();
    return joinSentences([title, nct ? `ClinicalTrials.gov: ${nct}` : "ClinicalTrials.gov", c.url ?? ""]);
  }
  // FAERS → database-query note (not a journal cite).
  if (t.includes("faers")) {
    return joinSentences(["FDA Adverse Event Reporting System (FAERS) database query", c.url ?? "", accessed]);
  }

  // Journal article (PubMed / Europe PMC). The numeric skeleton is shared:
  //   Authors. Title. Journal. Year;Vol(Issue):Pages.
  // The styles diverge ONLY on author truncation (the real plain-text difference, since we don't
  // italicize): Vancouver/ICMJE lists the first 6 then "et al." when >6 authors; AMA lists the first 3.
  const authors = formatAuthors(c.authors ?? [], style);
  const journal = c.journal ?? "";
  const year = c.year ?? (c.published_date ? c.published_date.slice(0, 4) : "");
  let volIss = c.volume ?? "";
  if (c.volume && c.issue) volIss = `${c.volume}(${c.issue})`;
  const tail = [year, volIss && `;${volIss}`, c.pages && `:${c.pages}`].filter(Boolean).join("");
  return joinSentences([authors, title, journal, tail]);
}

/** Author list with style-specific truncation. ≤6 authors → list all; >6 → Vancouver keeps the
 *  first 6 + "et al", AMA keeps the first 3 + "et al". The trailing period comes from joinSentences. */
function formatAuthors(authors: string[], style: CitationStyle): string {
  if (authors.length === 0) return "";
  if (authors.length <= 6) return authors.join(", ");
  const keep = style === "ama" ? 3 : 6;
  return `${authors.slice(0, keep).join(", ")}, et al`;
}

/** Join non-empty parts as "A. B. C." with a single trailing period; collapses doubled periods. */
function joinSentences(parts: string[]): string {
  const body = parts.map((p) => p.trim()).filter(Boolean).join(". ");
  return (body.endsWith(".") ? body : `${body}.`).replace(/\.{2,}/g, ".");
}

/** Build the full numbered reference list (numeric tag order), in the given style. PURE. */
export function buildReferenceList(citations: Citation[], style: CitationStyle): FormattedReference[] {
  return [...citations]
    .sort((a, b) => Number(a.chunk_tag.replace(/\D/g, "")) - Number(b.chunk_tag.replace(/\D/g, "")))
    .map((c, i) => ({ n: i + 1, tag: c.chunk_tag.replace(/\D/g, ""), text: formatReference(c, style) }));
}
