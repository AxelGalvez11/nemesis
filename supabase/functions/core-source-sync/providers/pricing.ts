/**
 * CMS pricing provider (NADAC) — coarse dataset-level provenance only.
 *
 * NADAC = National Average Drug Acquisition Cost, CMS's survey of what
 * pharmacies pay to acquire drugs (per NDC, per unit), published weekly.
 * License: public_domain (US Government work). Source: data.medicaid.gov.
 *
 * IMPORTANT framing (enforced in metadata + content): NADAC is the average
 * ACQUISITION cost pharmacies pay — NOT a patient's out-of-pocket / cash price.
 * No GoodRx / scraped / ToS-restricted price feeds are ever used.
 *
 * Why this is provenance-only: the weekly NADAC file is a ~666k-row per-NDC
 * TIME SERIES. One core_sources row per NDC would churn supersession and spam
 * the updates feed every week. So Layer A holds a SINGLE coarse dataset-level
 * provenance/license/freshness row (this provider); the actual per-NDC price
 * series lands in a dedicated Layer-B projection table (Phase 2 domain schema),
 * keyed by NDC/RxCUI and refreshed on schedule. content_hash includes the
 * as-of date so the one row supersedes weekly.
 *
 * The companion scripts/pricing-ingest.ts resolves the current dataset URL via
 * the data.medicaid.gov DKAN API and POSTs one descriptor via opts.pre_parsed.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

const PRICING_DISCLAIMER =
  "NADAC is the average price pharmacies pay to acquire a drug (CMS survey), " +
  "NOT your out-of-pocket or cash price. For education only.";

export interface PricingDataset {
  readonly source: "cms_nadac";
  readonly title: string; // "NADAC (National Average Drug Acquisition Cost) 2026"
  readonly source_url: string; // human dataset page
  readonly download_url: string; // current CSV distribution
  readonly as_of_date?: string; // latest weekly "As of Date" or dataset modified
  readonly modified?: string; // DKAN dataset modified timestamp
  readonly row_count?: number; // NDC-week rows in the file (if counted)
  readonly file_bytes?: number; // CSV size (if known)
}

export interface PricingFetchOpts {
  /** Pre-resolved dataset descriptor(s) from the companion ingest script. */
  readonly pre_parsed?: ReadonlyArray<PricingDataset>;
}

export async function fetchPricing(
  opts: PricingFetchOpts = {},
): Promise<NormalizedSource[]> {
  if (!opts.pre_parsed?.length) return [];
  const out: NormalizedSource[] = [];
  for (const ds of opts.pre_parsed) {
    const normalized = await normalizePricing(ds);
    if (normalized) out.push(normalized);
  }
  return out;
}

export async function normalizePricing(
  ds: PricingDataset,
): Promise<NormalizedSource | null> {
  if (ds.source !== "cms_nadac" || !ds.download_url) return null;

  // Stable provider_id → one evolving row; content_hash carries the as-of date
  // so a new weekly release supersedes the previous descriptor.
  const freshness = ds.as_of_date ?? ds.modified ?? "";
  const content_text = [
    `CMS NADAC — National Average Drug Acquisition Cost`,
    `Dataset: ${ds.title}`,
    `As of: ${freshness || "unknown"}`,
    `Source: ${ds.source_url}`,
    `Download: ${ds.download_url}`,
    ds.row_count != null ? `NDC-week rows: ${ds.row_count}` : "",
    `Basis: ${PRICING_DISCLAIMER}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    provider: "cms_nadac",
    provider_id: "cms-nadac-weekly",
    title: "CMS NADAC (National Average Drug Acquisition Cost)",
    subtitle: freshness ? `as of ${freshness}` : undefined,
    source_url: ds.source_url,
    license: "public_domain",
    content_text,
    content_hash: await sha256Hex(content_text),
    metadata: {
      dataset_title: ds.title,
      download_url: ds.download_url,
      as_of_date: ds.as_of_date ?? null,
      modified: ds.modified ?? null,
      row_count: ds.row_count ?? null,
      file_bytes: ds.file_bytes ?? null,
      pricing_basis: "average_acquisition_cost",
      disclaimer: PRICING_DISCLAIMER,
      // Phase 2: per-NDC NADAC Per Unit + generic-equivalent price land in a
      // dedicated drug_prices projection table keyed by NDC/RxCUI.
      projection: "deferred_to_phase2_drug_prices",
    },
  };
}
