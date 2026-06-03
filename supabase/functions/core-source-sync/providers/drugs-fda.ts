/**
 * Phase A: Drugs@FDA review-document crawler.
 *
 * Drugs@FDA publishes FDA approval-package review documents (Clinical
 * Pharmacology Review, Medical Review, Pharmacology/Toxicology Review)
 * as PDFs at:
 *   https://www.accessdata.fda.gov/drugsatfda_docs/nda/{year}/{nda}{suffix}.pdf
 *
 * These review docs contain MOA, PK/PD, dose-finding rationale, special
 * populations, drug-interaction studies, and adverse-event mechanisms
 * — gold-standard grounding for pharmacy mechanism and monitoring cards.
 * License: FDA public domain (US Government work).
 *
 * Strategy mirrors openfda-bulk.ts: PDF parsing happens in a companion
 * Node script (scripts/drugs-fda-ingest.mjs), which POSTs back batches of
 * pre-parsed text. This provider normalizes those batches into rows.
 *
 * Both this provider and the Node script read the NDA index from
 * drugs-fda.manifest.json so the source of truth lives in one place.
 *
 * License gate: license="fda_public", commercial_use_allowed=true. Enforced
 * upstream in persist.ts.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";
import manifest from "./drugs-fda.manifest.json" with { type: "json" };

// =============================================================================
// Manifest types — must stay in sync with drugs-fda.manifest.json
// =============================================================================

export type DrugsFdaDocType =
  | "clinpharm"
  | "medical"
  | "pharmacology"
  | "label";

export interface DrugsFdaReviewDoc {
  readonly type: DrugsFdaDocType;
  readonly url: string;
}

export interface DrugsFdaNdaEntry {
  readonly nda: string;
  readonly drug_name: string;
  readonly generic_name: string;
  readonly year: number;
  readonly therapeutic_area: string;
  readonly docs: ReadonlyArray<DrugsFdaReviewDoc>;
}

interface ManifestFile {
  readonly entries: ReadonlyArray<DrugsFdaNdaEntry>;
}

export const DRUGS_FDA_NDA_INDEX: ReadonlyArray<DrugsFdaNdaEntry> = (
  manifest as unknown as ManifestFile
).entries;

// =============================================================================
// Request types
// =============================================================================

export interface DrugsFdaParsedDoc {
  readonly nda: string;
  readonly drug_name: string;
  readonly generic_name: string;
  readonly doc_type: DrugsFdaDocType;
  readonly source_url: string;
  readonly year: number;
  readonly therapeutic_area: string;
  readonly text: string;
}

export interface DrugsFdaFetchOpts {
  /** Pre-parsed PDF docs from companion ingest script. */
  readonly pre_parsed_docs?: ReadonlyArray<DrugsFdaParsedDoc>;
  /** Skip parsing — return manifest as zero-content placeholder. */
  readonly manifest_only?: boolean;
  /** Restrict to a specific therapeutic_area for incremental runs. */
  readonly therapeutic_area?: string;
}

// =============================================================================
// Manifest accessor
// =============================================================================

export function getDrugsFdaManifest(
  therapeutic_area?: string,
): ReadonlyArray<DrugsFdaNdaEntry> {
  if (!therapeutic_area) return DRUGS_FDA_NDA_INDEX;
  return DRUGS_FDA_NDA_INDEX.filter(
    (e) => e.therapeutic_area === therapeutic_area,
  );
}

// =============================================================================
// Provider entrypoint
// =============================================================================

/**
 * Edge-fn entrypoint. The function cannot parse PDFs inside the 60s
 * budget — the Node ingest script owns extraction and POSTs pre-parsed
 * text via opts.pre_parsed_docs.
 *
 * - opts.pre_parsed_docs   → normalize each into a NormalizedSource.
 * - otherwise              → no-op (returns []). Manifest is reachable
 *                            via getDrugsFdaManifest() for the script.
 */
export async function fetchDrugsFda(
  opts: DrugsFdaFetchOpts,
): Promise<NormalizedSource[]> {
  if (!opts.pre_parsed_docs || opts.pre_parsed_docs.length === 0) return [];
  const out: NormalizedSource[] = [];
  for (const doc of opts.pre_parsed_docs) {
    const normalized = await normalizeDrugsFdaDoc(doc);
    if (normalized) out.push(normalized);
  }
  return out;
}

export async function normalizeDrugsFdaDoc(
  doc: DrugsFdaParsedDoc,
): Promise<NormalizedSource | null> {
  const text = cleanPdfText(doc.text);
  if (text.length < 800) return null; // skip tiny extractions (likely OCR fail)

  const title = `${doc.drug_name} (${doc.generic_name}) — ${docTypeLabel(doc.doc_type)}`;
  return {
    provider: "drugs_fda",
    provider_id: `${doc.nda}-${doc.doc_type}`,
    title,
    subtitle: `NDA ${doc.nda} · ${doc.year}`,
    source_url: doc.source_url,
    license: "fda_public",
    content_text: text,
    content_hash: await sha256Hex(text),
    metadata: {
      nda: doc.nda,
      doc_type: doc.doc_type,
      generic_name: doc.generic_name,
      therapeutic_area: doc.therapeutic_area,
      approval_year: doc.year,
    },
    effective_at: new Date(Date.UTC(doc.year, 0, 1)).toISOString(),
  };
}

// =============================================================================
// Internal helpers
// =============================================================================

function docTypeLabel(t: DrugsFdaDocType): string {
  switch (t) {
    case "clinpharm":
      return "Clinical Pharmacology Review";
    case "medical":
      return "Medical Review";
    case "pharmacology":
      return "Pharmacology Review";
    case "label":
      return "Approved Label";
  }
}

/**
 * Strip PDF artifacts: page-number headers/footers, hyphenated line-breaks,
 * runs of whitespace from column reflow. Conservative — keep section
 * structure intact for the clinical-text chunker downstream.
 */
function cleanPdfText(raw: string): string {
  return raw
    .replace(/\f/g, "\n\n") // form feeds → paragraph break
    .replace(/-\n([a-z])/g, "$1") // de-hyphenate broken words
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/^\s*Page \d+ of \d+\s*$/gim, "")
    .replace(/^\s*\d+\s*$/gm, "") // bare page numbers
    .trim();
}
