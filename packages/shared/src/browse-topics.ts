// Curated "browse popular topics" catalog for Monitoring — the tappable starting points that
// complement the autocomplete (which handles the long tail / a specific search). Tapping a topic
// creates a watch; this module is the PURE data + the watch-field builder, kept in shared so it is
// unit-tested and reusable (web now, mobile later).
//
// This is HAND-CURATED static data, not an LLM guess: it only chooses WHAT to watch (search terms +,
// for a drug, its real brand/generic names for the openFDA label name-scope). The watch itself then
// runs the real evidence engine, so nothing here asserts a clinical claim. Mirrors the field shape of
// watchFieldsFromEntity (apps/web/lib/entity.ts) so both entry points build identical watches.

import { watchTitleFromQuestion } from "./watch-events.ts";

export type BrowseCategory = "drug" | "condition" | "class";

export interface BrowseTopic {
  /** Display chip text + the watch title/topic, e.g. "Ozempic" or "Type 2 diabetes". */
  label: string;
  category: BrowseCategory;
  /** The evidence search term(s) — for a drug, usually the generic name. */
  query_terms: string;
  /** Drug ONLY: brand + generic names for the openFDA label name-scope. Omitted for conditions/classes
   *  (a MeSH-style term has no single-drug label to scope to), matching watchFieldsFromEntity. */
  mentions?: string[];
}

/** The watch fields a tapped browse topic produces — identical shape to watchFieldsFromEntity. */
export interface BrowseWatchFields {
  title: string;
  topic: string;
  query_terms: string;
  mentions: string[];
}

export const BROWSE_CATEGORY_LABELS: Record<BrowseCategory, string> = {
  drug: "Popular drugs",
  condition: "Conditions",
  class: "Drug classes",
};

/** A drug entry — its label is also a brand name, so it is folded into mentions automatically. */
function drug(label: string, generic: string, alsoBrands: string[] = []): BrowseTopic {
  return { label, category: "drug", query_terms: generic, mentions: [label, ...alsoBrands, generic] };
}

export const BROWSE_TOPICS: BrowseTopic[] = [
  // Popular drugs (label = best-known brand; query_terms = generic; mentions = brand(s)+generic).
  drug("Ozempic", "semaglutide", ["Wegovy", "Rybelsus"]),
  drug("Mounjaro", "tirzepatide", ["Zepbound"]),
  drug("Metformin", "metformin", ["Glucophage"]),
  drug("Jardiance", "empagliflozin", []),
  drug("Eliquis", "apixaban", []),
  drug("Lisinopril", "lisinopril", ["Zestril", "Prinivil"]),
  drug("Atorvastatin", "atorvastatin", ["Lipitor"]),
  drug("Omeprazole", "omeprazole", ["Prilosec"]),
  drug("Sertraline", "sertraline", ["Zoloft"]),
  drug("Prednisone", "prednisone", []),

  // Conditions (MeSH-style term; no openFDA name-scope).
  { label: "Type 2 diabetes", category: "condition", query_terms: "type 2 diabetes" },
  { label: "Hypertension", category: "condition", query_terms: "hypertension" },
  { label: "Obesity", category: "condition", query_terms: "obesity" },
  { label: "Atrial fibrillation", category: "condition", query_terms: "atrial fibrillation" },
  { label: "Depression", category: "condition", query_terms: "major depressive disorder" },
  { label: "High cholesterol", category: "condition", query_terms: "hyperlipidemia" },
  { label: "Chronic kidney disease", category: "condition", query_terms: "chronic kidney disease" },

  // Drug classes (class term; no single-drug scope).
  { label: "GLP-1 receptor agonists", category: "class", query_terms: "GLP-1 receptor agonists" },
  { label: "SGLT2 inhibitors", category: "class", query_terms: "SGLT2 inhibitors" },
  { label: "Statins", category: "class", query_terms: "statins" },
  { label: "Direct oral anticoagulants", category: "class", query_terms: "direct oral anticoagulants" },
  { label: "SSRIs", category: "class", query_terms: "selective serotonin reuptake inhibitors" },
  { label: "Proton pump inhibitors", category: "class", query_terms: "proton pump inhibitors" },
];

/** Build the watch fields for a tapped browse topic. Pure. Drugs get deduped (case-insensitive)
 *  brand+generic mentions including the label; conditions/classes get none. */
export function watchFieldsFromBrowseTopic(t: BrowseTopic): BrowseWatchFields {
  const label = t.label.trim();
  const mentions = t.category === "drug"
    ? dedupeCaseInsensitive([label, ...(t.mentions ?? [])])
    : [];
  return {
    title: watchTitleFromQuestion(label),
    topic: label,
    query_terms: t.query_terms.trim() || label,
    mentions,
  };
}

/** Trim, drop blanks, and remove case-insensitive duplicates while keeping FIRST-seen casing/order. */
function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export interface BrowseGroup {
  category: BrowseCategory;
  label: string;
  topics: BrowseTopic[];
}

/** Group topics by category in a stable drug→condition→class order; empty categories are dropped. */
export function groupBrowseTopics(topics: readonly BrowseTopic[] = BROWSE_TOPICS): BrowseGroup[] {
  const order: BrowseCategory[] = ["drug", "condition", "class"];
  return order
    .map((category) => ({
      category,
      label: BROWSE_CATEGORY_LABELS[category],
      topics: topics.filter((t) => t.category === category),
    }))
    .filter((g) => g.topics.length > 0);
}
