/**
 * openFDA enforcement reports: recalls, market withdrawals, and safety alerts.
 *
 * This provider is intentionally mapped to the existing "fda_safety" provider family
 * so we can add recall context without a schema/provider enum migration.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../normalized-source.ts";

const ENFORCEMENT = "https://api.fda.gov/drug/enforcement.json";

export interface EnforcementFetchOpts {
  query: string;
  limit?: number;
}

export interface OpenFdaEnforcementRow {
  recall_number?: string;
  product_description?: string;
  reason_for_recall?: string;
  status?: string;
  classification?: string;
  report_date?: string;
  recalling_firm?: string;
  distribution_pattern?: string;
  product_quantity?: string;
}

export function sanitizeEnforcementQuery(raw: string): string {
  return raw.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

export async function fetchOpenFdaEnforcement(opts: EnforcementFetchOpts): Promise<NormalizedSource[]> {
  const query = sanitizeEnforcementQuery(opts.query);
  if (!query) return [];

  const limit = Math.min(opts.limit ?? 5, 25);
  const apiKey = Deno.env.get("OPENFDA_API_KEY");
  const phrase = JSON.stringify(query);
  const params = new URLSearchParams({
    search: `product_description:${phrase} OR reason_for_recall:${phrase}`,
    limit: String(limit),
  });
  if (apiKey) params.set("api_key", apiKey);

  const res = await fetch(`${ENFORCEMENT}?${params.toString()}`, {
    headers: { "User-Agent": "PharmaOrbBot/1.0" },
  });
  if (!res.ok) return [];

  const body = await res.json();
  const rows: OpenFdaEnforcementRow[] = body?.results ?? [];
  const normalized = await Promise.all(rows.map((row) => normalizeEnforcementResult(row, query)));
  return normalized.filter((source): source is NormalizedSource => source !== null);
}

export async function normalizeEnforcementResult(
  row: OpenFdaEnforcementRow,
  query: string,
): Promise<NormalizedSource | null> {
  const recallNumber = clean(row.recall_number);
  const product = clean(row.product_description);
  const reason = clean(row.reason_for_recall);
  if (!recallNumber || !product || !reason) return null;

  const status = clean(row.status);
  const classification = clean(row.classification);
  const reportDate = clean(row.report_date);
  const recallingFirm = clean(row.recalling_firm);
  const distribution = clean(row.distribution_pattern);
  const quantity = clean(row.product_quantity);
  const effectiveAt = reportDate ? formatFdaDate(reportDate) : undefined;

  const lines = [
    `FDA enforcement report for ${product}.`,
    `Reason for recall: ${reason}.`,
    status ? `Status: ${status}.` : null,
    classification ? `Classification: ${classification}.` : null,
    reportDate ? `Report date: ${reportDate}.` : null,
    recallingFirm ? `Recalling firm: ${recallingFirm}.` : null,
    distribution ? `Distribution pattern: ${distribution}.` : null,
    quantity ? `Product quantity: ${quantity}.` : null,
  ].filter(Boolean).join("\n");

  return {
    provider: "fda_safety",
    provider_id: `openfda-enforcement:${recallNumber}`,
    title: `FDA enforcement recall: ${product}`,
    subtitle: classification ? `FDA Enforcement Report - ${classification}` : "FDA Enforcement Report",
    source_url: "https://www.accessdata.fda.gov/scripts/ires/index.cfm",
    license: "fda_public",
    content_text: lines,
    content_hash: await sha256Hex(lines),
    metadata: {
      source: "openfda_enforcement",
      query,
      recall_number: recallNumber,
      status: status ?? null,
      classification: classification ?? null,
      report_date: reportDate ?? null,
      recalling_firm: recallingFirm ?? null,
    },
    effective_at: effectiveAt,
  };
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function formatFdaDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return new Date().toISOString();
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString();
}
