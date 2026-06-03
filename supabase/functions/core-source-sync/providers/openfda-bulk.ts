/**
 * Phase 7: OpenFDA bulk drug-label ingest.
 *
 * OpenFDA publishes quarterly bulk archives at
 *   https://api.fda.gov/download.json
 *
 * The "drug" → "label" partition contains all approved SPL drug labels
 * (~80,000 labels) split across multiple zip files. This is far more
 * efficient than per-query API calls for full-corpus build.
 *
 * Strategy:
 * 1. Fetch download.json manifest
 * 2. Pick the drug.label partition's part files
 * 3. For each part: fetch zip → unzip → JSON parse → normalize each label
 *
 * Stub for now: actual zip download + parse needs additional dependencies
 * (Deno's std lib has zip support but parsing 80K labels is heavy work
 * better suited to a one-time script). Caller can pre-download and pass
 * the parsed labels in `pre_parsed_labels`.
 *
 * For production deploy: a separate Node script under scripts/ handles
 * the zip download + parse, then calls this provider with parsed batches.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

const MANIFEST_URL = "https://api.fda.gov/download.json";

export interface OpenFdaBulkFetchOpts {
  /** Pre-parsed labels (from external bulk-download script). */
  readonly pre_parsed_labels?: ReadonlyArray<OpenFdaLabel>;
  /** Or, fetch the manifest + return URL list (caller does download). */
  readonly manifest_only?: boolean;
}

export interface OpenFdaBulkPartitionList {
  readonly partition: "drug.label";
  readonly export_date: string;
  readonly part_files: ReadonlyArray<{
    readonly url: string;
    readonly size_bytes: number;
    readonly records: number;
  }>;
}

export interface OpenFdaLabel {
  set_id?: string;
  effective_time?: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    rxcui?: string[];
    pharm_class_epc?: string[];
    application_number?: string[];
    manufacturer_name?: string[];
    product_ndc?: string[];
  };
  indications_and_usage?: string[];
  contraindications?: string[];
  warnings?: string[];
  warnings_and_cautions?: string[];
  dosage_and_administration?: string[];
  adverse_reactions?: string[];
  drug_interactions?: string[];
  clinical_pharmacology?: string[];
  mechanism_of_action?: string[];
  pharmacokinetics?: string[];
  use_in_specific_populations?: string[];
  pregnancy?: string[];
  pediatric_use?: string[];
  geriatric_use?: string[];
  description?: string[];
  boxed_warning?: string[];
}

/**
 * Returns the bulk partition manifest. Caller (typically a Node script
 * under scripts/) downloads each part file, unzips, parses, and
 * processes labels in batches.
 */
export async function fetchOpenFdaBulkManifest(): Promise<OpenFdaBulkPartitionList | null> {
  const res = await fetch(MANIFEST_URL, {
    headers: { "User-Agent": "AscendBot/1.0" },
  });
  if (!res.ok) {
    throw new Error(`OpenFDA bulk manifest ${res.status}`);
  }
  const data = await res.json();
  // Manifest schema: { results: { drug: { label: { export_date, partitions: [...] } } } }
  const labelPartition = data?.results?.drug?.label;
  if (!labelPartition?.partitions) return null;

  return {
    partition: "drug.label",
    export_date: labelPartition.export_date ?? "",
    part_files: labelPartition.partitions.map(
      (p: { file: string; size_mb: string; records: number }) => ({
        url: p.file,
        size_bytes: Number(p.size_mb) * 1024 * 1024,
        records: p.records,
      }),
    ),
  };
}

/**
 * Normalize a parsed OpenFDA label record into our NormalizedSource shape.
 * Same logic as openfda.ts per-query path, exported separately so the
 * bulk script can reuse it.
 */
export async function normalizeBulkLabel(
  label: OpenFdaLabel,
): Promise<NormalizedSource | null> {
  if (!label.set_id) return null;

  const brand = label.openfda?.brand_name?.[0];
  const generic = label.openfda?.generic_name?.[0];
  const title = brand
    ? `${brand}${generic ? ` (${generic})` : ""}`
    : (generic ?? `FDA Label ${label.set_id}`);

  const sections: Array<[string, string | undefined]> = [
    ["BOXED WARNING", flatten(label.boxed_warning)],
    ["INDICATIONS AND USAGE", flatten(label.indications_and_usage)],
    ["DOSAGE AND ADMINISTRATION", flatten(label.dosage_and_administration)],
    ["CONTRAINDICATIONS", flatten(label.contraindications)],
    [
      "WARNINGS AND PRECAUTIONS",
      flatten(label.warnings_and_cautions ?? label.warnings),
    ],
    ["ADVERSE REACTIONS", flatten(label.adverse_reactions)],
    ["DRUG INTERACTIONS", flatten(label.drug_interactions)],
    ["MECHANISM OF ACTION", flatten(label.mechanism_of_action)],
    ["CLINICAL PHARMACOLOGY", flatten(label.clinical_pharmacology)],
    ["PHARMACOKINETICS", flatten(label.pharmacokinetics)],
    ["USE IN SPECIFIC POPULATIONS", flatten(label.use_in_specific_populations)],
    ["PREGNANCY", flatten(label.pregnancy)],
    ["PEDIATRIC USE", flatten(label.pediatric_use)],
    ["GERIATRIC USE", flatten(label.geriatric_use)],
    ["DESCRIPTION", flatten(label.description)],
  ];

  const content_text = sections
    .filter(([, body]) => body && body.trim())
    .map(([heading, body]) => `${heading}\n\n${body}`)
    .join("\n\n");

  if (!content_text.trim()) return null;

  return {
    provider: "openfda",
    provider_id: label.set_id,
    title,
    subtitle: generic && brand ? generic : undefined,
    source_url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${label.set_id}`,
    license: "fda_public",
    content_text,
    content_hash: await sha256Hex(content_text),
    metadata: {
      brand_names: label.openfda?.brand_name ?? [],
      generic_names: label.openfda?.generic_name ?? [],
      rxcui: label.openfda?.rxcui ?? [],
      pharm_class: label.openfda?.pharm_class_epc ?? [],
      manufacturer: label.openfda?.manufacturer_name?.[0] ?? null,
      ndc: label.openfda?.product_ndc ?? [],
    },
    effective_at: label.effective_time
      ? formatFdaDate(label.effective_time)
      : undefined,
  };
}

function flatten(arr: string[] | undefined): string | undefined {
  if (!arr || !arr.length) return undefined;
  return arr.join("\n\n").replace(/\s+/g, " ").trim();
}

function formatFdaDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return new Date().toISOString();
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString();
}
