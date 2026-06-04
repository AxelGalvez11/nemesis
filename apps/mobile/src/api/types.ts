// App-local read-row view types for the TABLE-returning §8 read RPCs
// (get_drug_label / get_drug_trials / get_drug_pubmed). These mirror the column
// lists in migration 0110 exactly. They live HERE, not in @pharmabro/shared,
// because (a) the frozen §8 contract never named them and we don't reopen it, and
// (b) packages/shared already exports an evidence-engine `TrialRow`/`PubMedRow`
// with a different purpose — adding read-row shapes there would clash.
//
// Every row carries the joined citation (source_id + citation_url + license): the
// Phase-2 acceptance is "renders label/trials/PubMed, all cited", so the source_id
// is what makes each item open the Source Viewer.

/** One get_drug_label row. extracted_sections is a FLAT map of section-key -> prose
 * (verified against the real openFDA payload: string values, keys a superset of the
 * doc-20 LabelSectionKey set — e.g. also description/mechanism_of_action). */
export interface LabelDoc {
  label_id: string;
  source: string | null;
  set_id: string | null;
  published_date: string | null;
  label_url: string | null;
  extracted_sections: Record<string, string>;
  source_id: string | null;
  provider: string | null;
  citation_url: string | null;
  license: string | null;
  retrieved_at: string | null;
}

/** One get_drug_trials row (CT.gov study). The jsonb columns (conditions /
 * interventions / primary_outcomes) are rendered loosely; we only hard-depend on
 * the scalars + source_id for the citation. */
export interface DrugTrial {
  trial_id: string;
  nct_id: string | null;
  brief_title: string | null;
  phase: string | null;
  status: string | null;
  sponsor: string | null;
  conditions: unknown;
  interventions: unknown;
  primary_outcomes: unknown;
  enrollment: number | null;
  source_id: string | null;
  citation_url: string | null;
  license: string | null;
  retrieved_at: string | null;
}

/** One get_drug_pubmed row. */
export interface DrugPubmed {
  article_id: string;
  pmid: string | null;
  title: string | null;
  journal: string | null;
  publication_date: string | null;
  authors: unknown;
  publication_types: unknown;
  mesh_terms: unknown;
  abstract: string | null;
  source_id: string | null;
  citation_url: string | null;
  license: string | null;
  retrieved_at: string | null;
}
