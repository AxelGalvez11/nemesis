// Citation presentation helpers for the "evidence base" table — the at-a-glance body-of-evidence
// summary a review opens with. PURE, derived ONLY from Citation metadata the report already
// carries, so the table the screen draws and the table the Word/PowerPoint exports draw are
// byte-identical and neither touches the safety scan or the single citation namespace.
import type { Citation } from "./answer.ts";

/** One evidence-base table row, sorted by numeric citation tag. */
export interface EvidenceRow {
  tag: string;
  type: string;
  title: string;
  year: string;
}

// Provider source_type -> readable evidence-class label. Unknown providers degrade to a
// de-underscored version of the raw type rather than guessing a class.
const SOURCE_TYPE_LABEL: Record<string, string> = {
  openfda: "Drug label",
  dailymed: "Drug label",
  clinicaltrials: "Clinical trial",
  trial: "Clinical trial",
  pubmed: "Study",
  pubmed_oa: "Study",
  europepmc: "Study",
  faers: "Adverse-event report",
  rxnorm: "Drug reference",
};

/** Readable evidence-class label for a provider source_type. PURE. */
export function sourceTypeLabel(t: string): string {
  return SOURCE_TYPE_LABEL[t] ?? t.replace(/_/g, " ");
}

/** Best-known publication year for a citation: explicit year, else the published_date year, else "—". PURE. */
export function citationYear(c: Citation): string {
  if (typeof c.year === "string" && /^\d{4}/.test(c.year)) return c.year.slice(0, 4);
  const m = /^(\d{4})/.exec(c.published_date ?? "");
  return m?.[1] ?? "—";
}

/** Build the evidence-base table rows in numeric tag order. PURE. */
export function evidenceRows(citations: Citation[]): EvidenceRow[] {
  return [...citations]
    .sort((a, b) => Number(a.chunk_tag.replace(/\D/g, "")) - Number(b.chunk_tag.replace(/\D/g, "")))
    .map((c) => ({
      tag: c.chunk_tag.replace(/\D/g, ""),
      type: sourceTypeLabel(c.source_type),
      title: (c.title ?? "").trim() || "—",
      year: citationYear(c),
    }));
}
