// Pure mapping: a picked universal suggestion (drug catalog hit OR a MeSH-resolved entity) → the fields
// a topic-watch needs. The Monitor picker uses this so a chosen drug/condition/device/procedure resolves
// to a precise, scoped watch instead of loose free text. Only an in-house CATALOG DRUG populates
// `mentions` (the openFDA label name-scope); everything else leaves it empty — openFDA simply contributes
// nothing and evidence still flows from PubMed/ClinicalTrials.gov on `query_terms`.

import { watchTitleFromQuestion, type EntitySuggestion } from "@pharmabro/shared";

/** A picked suggestion that names a real drug in OUR catalog → a `get_drug` fetch (the full brand list)
 *  and an openFDA name-scope make sense. A MeSH-sourced entity — even a MeSH drug — gets no name-scope
 *  here: the catalog covers the drug case, and condition/device synonyms must never leak into the
 *  openFDA drug-name scope (that would silently mis-scope the label watch). */
export function isCatalogDrug(e: EntitySuggestion): boolean {
  return e.source === "catalog" && e.kind === "drug";
}

export interface WatchFieldsFromEntity {
  title: string;
  topic: string;
  query_terms: string;
  mentions: string[];
}

/** Map a picked suggestion to a topic-watch's fields. The canonical name drives title/topic/query_terms
 *  (NOT expanded with synonyms — blind retrieval-broadening is held until it can be measured). For a
 *  catalog drug, EVERY brand is folded into `mentions` (deduped, trimmed) so the openFDA label watch is
 *  scoped to ALL of the product's brands.
 *
 *  Pass the full `brand_names` (from a `get_drug` fetch on pick) when available: the catalog search returns
 *  only ONE alias in the subtitle, so a subtitle-only scope would silently miss sibling brands — e.g.
 *  semaglutide → Ozempic but not Wegovy/Rybelsus, so a Wegovy label change wouldn't match. The subtitle is
 *  the fallback when no full list is supplied (split on comma so a joined alias still maps to separate
 *  mentions). */
export function watchFieldsFromEntity(e: EntitySuggestion, brandNames?: readonly string[]): WatchFieldsFromEntity {
  const name = e.name.trim();
  // Array.isArray (not just a truthy check) guards the spread: fetchDrug casts its RPC row with
  // `as unknown as DrugOverview`, so TS trusts brand_names is string[] even if schema drift made it a
  // bare string at runtime — spreading a string would scatter its characters into mentions. A non-array
  // (or empty) brand list falls back to the single subtitle alias, which is always safe.
  const brands = isCatalogDrug(e)
    ? (Array.isArray(brandNames) && brandNames.length > 0 ? brandNames : (e.subtitle ?? "").split(","))
    : [];
  const mentions = isCatalogDrug(e)
    ? [...new Set([name, ...brands].map((s) => s.trim()).filter(Boolean))]
    : [];
  return {
    title: watchTitleFromQuestion(name),
    topic: name,
    query_terms: name,
    mentions,
  };
}
