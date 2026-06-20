// Pure mapping: a picked catalog entity (a `search_entities` result) → the fields a topic-watch needs.
// The Monitor entity picker uses this so a chosen drug/supplement/peptide/biologic resolves to a precise,
// scoped watch instead of loose free text. Drug-like entities populate `mentions` (the openFDA label
// name-scope); a class/company leaves it empty — openFDA simply contributes nothing and evidence still
// flows from PubMed/ClinicalTrials.gov on `query_terms`.

import { watchTitleFromQuestion, type EntityType, type SearchResult } from "@pharmabro/shared";

/** Catalog types that name a real drug substance → safe to use as an openFDA label name-scope. */
const DRUG_LIKE: ReadonlySet<EntityType> = new Set<EntityType>(["drug", "supplement", "peptide", "biologic"]);

/** Whether a picked entity names a real substance — so a brand name-scope (and the `get_drug` fetch that
 *  supplies the full brand list) make sense. A class/company is not drug-like. */
export function isDrugLikeEntity(type: EntityType): boolean {
  return DRUG_LIKE.has(type);
}

export interface WatchFieldsFromEntity {
  title: string;
  topic: string;
  query_terms: string;
  mentions: string[];
}

/** Map a picked entity to a topic-watch's fields. The canonical name drives title/topic/query; EVERY brand
 *  is folded into `mentions` (deduped, trimmed) for drug-like entities so the openFDA label watch is scoped
 *  to ALL of the product's brands.
 *
 *  Pass the full `brand_names` (from a `get_drug` fetch on pick) when available: `search_entities` returns
 *  only ONE alias in the subtitle (its RPC LIMIT 1), so a subtitle-only scope would silently miss sibling
 *  brands — e.g. semaglutide → Ozempic but not Wegovy/Rybelsus, so a Wegovy label change wouldn't match.
 *  The subtitle is the fallback when no full list is supplied (split on comma so a joined alias still maps
 *  to separate mentions). A class/company leaves `mentions` empty — openFDA contributes nothing and evidence
 *  still flows from PubMed/ClinicalTrials.gov on `query_terms`. */
export function watchFieldsFromEntity(r: SearchResult, brandNames?: readonly string[]): WatchFieldsFromEntity {
  const name = r.name.trim();
  // Array.isArray (not just a truthy check) guards the spread: fetchDrug casts its RPC row with
  // `as unknown as DrugOverview`, so TS trusts brand_names is string[] even if schema drift made it a
  // bare string at runtime — spreading a string would scatter its characters into mentions. A non-array
  // (or empty) brand list falls back to the single subtitle alias, which is always safe.
  const brands = Array.isArray(brandNames) && brandNames.length > 0 ? brandNames : (r.subtitle ?? "").split(",");
  const mentions = isDrugLikeEntity(r.type)
    ? [...new Set([name, ...brands].map((s) => s.trim()).filter(Boolean))]
    : [];
  return {
    title: watchTitleFromQuestion(name),
    topic: name,
    query_terms: name,
    mentions,
  };
}
