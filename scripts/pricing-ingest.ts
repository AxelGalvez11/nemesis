#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * CMS NADAC pricing — coarse provenance ingest.
 *
 * Resolves the CURRENT NADAC dataset CSV URL from the data.medicaid.gov DKAN
 * API (the weekly file URL rotates by date), then POSTs ONE dataset-level
 * provenance descriptor to core-source-sync with skip_embed:true. We do NOT
 * download the ~666k-row CSV here — per-NDC prices are a Phase-2 projection
 * table; Layer A only needs the source/license/freshness row.
 *
 * Public-domain CMS data only. NADAC = average ACQUISITION cost, not the
 * patient's out-of-pocket price (disclaimer carried in the provider).
 *
 * Usage:
 *   SERVICE_KEY=... deno run -A scripts/pricing-ingest.ts \
 *     [--url=http://127.0.0.1:54321] [--year=2026] [--dry-run]
 */

import type { PricingDataset } from "../supabase/functions/core-source-sync/providers/pricing.ts";

const UA = "Mozilla/5.0 (PharmaBro corpus ingest)";
function arg(n: string): string | undefined {
  return Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
}
const SB_URL = arg("url") ?? Deno.env.get("SB_URL") ?? "http://127.0.0.1:54321";
const SERVICE_KEY = Deno.env.get("SERVICE_KEY") ?? arg("service-key");
const YEAR = arg("year") ?? "2026";
const DRY_RUN = Deno.args.includes("--dry-run");

/** Parse "...-MM-DD-YYYY.csv" → "YYYY-MM-DD". */
function asOfFromUrl(url: string): string | undefined {
  const m = url.match(/-(\d{2})-(\d{2})-(\d{4})\.csv$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

async function resolveDataset(): Promise<PricingDataset> {
  const api =
    `https://data.medicaid.gov/api/1/search/?fulltext=${encodeURIComponent(
      `NADAC National Average Drug Acquisition Cost ${YEAR}`,
    )}&page-size=10`;
  const res = await fetch(api, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`DKAN search ${res.status}`);
  const data = await res.json();
  const items = Object.values(data.results ?? {}) as Array<Record<string, unknown>>;

  // Prefer the exact current-year full dataset (title contains the year, not
  // "Comparison" / "First Time").
  const item = items.find((it) => {
    const t = String(it.title ?? "");
    return new RegExp(`National Average Drug Acquisition Cost\\)?\\s*${YEAR}$`).test(t) ||
      (t.includes(`Acquisition Cost) ${YEAR}`));
  }) ?? items.find((it) => String(it.title ?? "").includes(YEAR));
  if (!item) throw new Error(`No NADAC ${YEAR} dataset found`);

  const dist = (item.distribution as Array<Record<string, unknown>> | undefined)?.[0];
  const download_url = String(
    (dist?.data as Record<string, unknown>)?.downloadURL ?? dist?.downloadURL ?? "",
  );
  if (!download_url) throw new Error("No distribution downloadURL");
  const identifier = String(item.identifier ?? "");

  return {
    source: "cms_nadac",
    title: String(item.title ?? `NADAC ${YEAR}`),
    source_url: identifier
      ? `https://data.medicaid.gov/dataset/${identifier}`
      : "https://data.medicaid.gov/",
    download_url,
    as_of_date: asOfFromUrl(download_url),
    modified: item.modified ? String(item.modified) : undefined,
  };
}

const ds = await resolveDataset();
console.error("Resolved NADAC dataset:");
console.error(JSON.stringify(ds, null, 2));

if (DRY_RUN) Deno.exit(0);
if (!SERVICE_KEY) {
  console.error("SERVICE_KEY required to POST (or use --dry-run)");
  Deno.exit(2);
}

const res = await fetch(`${SB_URL}/functions/v1/core-source-sync`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
  },
  body: JSON.stringify({
    provider: "cms_nadac",
    opts: { pre_parsed: [ds] },
    skip_embed: true,
  }),
});
const body = await res.json().catch(() => ({}));
console.log("ingest result:", JSON.stringify(body));
if (!res.ok || body.error) Deno.exit(1);
