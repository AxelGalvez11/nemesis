// Pure mapping: a picked catalog entity (a `search_entities` result) → the fields a topic-watch needs.
// The Monitor entity picker uses this so a chosen drug/supplement/peptide/biologic resolves to a precise,
// scoped watch instead of loose free text. Drug-like entities populate `mentions` (the openFDA label
// name-scope); a class/company leaves it empty — openFDA simply contributes nothing and evidence still
// flows from PubMed/ClinicalTrials.gov on `query_terms`.

import { watchTitleFromQuestion, type EntityType, type SearchResult } from "@pharmabro/shared";

/** Catalog types that name a real drug substance → safe to use as an openFDA label name-scope. */
const DRUG_LIKE: ReadonlySet<EntityType> = new Set<EntityType>(["drug", "supplement", "peptide", "biologic"]);

export interface WatchFieldsFromEntity {
  title: string;
  topic: string;
  query_terms: string;
  mentions: string[];
}

/** Map a picked entity to a topic-watch's fields. The canonical name drives title/topic/query; the brand
 *  alias is folded into `mentions` (deduped, trimmed) for drug-like entities so the openFDA label watch is
 *  scoped to the right product. */
export function watchFieldsFromEntity(r: SearchResult): WatchFieldsFromEntity {
  const name = r.name.trim();
  const brand = (r.subtitle ?? "").trim();
  const mentions = DRUG_LIKE.has(r.type) ? [...new Set([name, brand].filter(Boolean))] : [];
  return {
    title: watchTitleFromQuestion(name),
    topic: name,
    query_terms: name,
    mentions,
  };
}
