/**
 * Phase 2: OpenFDA drug label provider.
 *
 * API: https://api.fda.gov/drug/label.json
 * License: fda_public (US federal government work, public domain).
 * Auth: anonymous = 240 req/min + 1000 req/day. With api_key (free) =
 * 240 req/min + 120,000 req/day.
 *
 * We focus on `drug.label` endpoint which returns Structured Product
 * Labeling (SPL) sections. NDA/ANDA-approved labels are the source of
 * truth for: indications, dosing, contraindications, warnings, adverse
 * reactions, drug interactions, mechanism of action, pharmacokinetics.
 *
 * Rate limit: ~5 req/sec safe under anonymous quota.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../normalized-source.ts";

const OPENFDA_BASE = "https://api.fda.gov/drug/label.json";
const REQUEST_DELAY_MS = 250;

export interface OpenFdaFetchOpts {
  /** RxNorm RxCUI to filter on, or generic name search query. */
  query?: string;
  /** Max records to fetch (default 25, hard cap 100). */
  limit?: number;
  /** Offset for pagination. */
  skip?: number;
}

interface OpenFdaLabel {
  set_id?: string;
  effective_time?: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    rxcui?: string[];
    nui?: string[];
    application_number?: string[];
    manufacturer_name?: string[];
    product_ndc?: string[];
    pharm_class_epc?: string[];
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

export async function fetchOpenFdaLabels(
  opts: OpenFdaFetchOpts = {},
): Promise<NormalizedSource[]> {
  const limit = Math.min(opts.limit ?? 25, 100);
  const apiKey = Deno.env.get("OPENFDA_API_KEY");

  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.skip) params.set("skip", String(opts.skip));
  if (opts.query) params.set("search", opts.query);
  if (apiKey) params.set("api_key", apiKey);

  const url = `${OPENFDA_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "AscendBot/1.0 (+https://ascend.app)" },
  });

  if (!res.ok) {
    if (res.status === 404) return []; // no matches
    throw new Error(
      `OpenFDA ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }

  const data = await res.json();
  const labels: OpenFdaLabel[] = data?.results ?? [];

  await sleep(REQUEST_DELAY_MS);

  const sources: NormalizedSource[] = [];
  for (const label of labels) {
    const normalized = await normalizeLabel(label);
    if (normalized) sources.push(normalized);
  }
  return sources;
}

async function normalizeLabel(
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
      nda: label.openfda?.application_number?.[0] ?? null,
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
  // OpenFDA returns YYYYMMDD; convert to ISO.
  if (yyyymmdd.length !== 8) return new Date().toISOString();
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
