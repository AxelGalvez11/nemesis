/**
 * openFDA FAERS (FDA Adverse Event Reporting System) provider. Real-world safety signals:
 * the most-reported adverse reactions for a drug, aggregated from spontaneous reports.
 *
 * API: https://api.fda.gov/drug/event.json (no auth; OPENFDA_API_KEY raises limits).
 * Returns ONE summary NormalizedSource (top reactions), not raw case reports — a citable,
 * rankable safety snapshot. Mapped to provider "openfda" (FDA data = public_domain).
 *
 * NOTE: needs a clean DRUG term (generic/brand name), not a full sentence — in /ask, feed the
 * resolved drug entity (resolve.ts). A non-matching term yields [] (fault-tolerant by design).
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

const EVENT = "https://api.fda.gov/drug/event.json";

export interface FaersFetchOpts {
  /** Drug name (generic or brand). */
  query: string;
  /** Number of top reactions to summarize. */
  retmax?: number;
}

export async function fetchFaersReactions(opts: FaersFetchOpts): Promise<NormalizedSource[]> {
  const drug = opts.query.trim();
  if (!drug) return [];
  const limit = Math.min(opts.retmax ?? 15, 50);
  const apiKey = Deno.env.get("OPENFDA_API_KEY");

  // OR across name fields (a drug matches generic OR brand OR the free-text product name).
  const params = new URLSearchParams({
    search: `patient.drug.openfda.generic_name:"${drug}" OR patient.drug.openfda.brand_name:"${drug}" OR patient.drug.medicinalproduct:"${drug}"`,
    count: "patient.reaction.reactionmeddrapt.exact",
    limit: String(limit),
  });
  if (apiKey) params.set("api_key", apiKey);

  const res = await fetch(`${EVENT}?${params.toString()}`, {
    headers: { "User-Agent": "PharmaOrbBot/1.0" },
  });
  if (!res.ok) return []; // 404 = no reports for this drug term
  const body = await res.json();
  const rows: Array<{ term?: string; count?: number }> = body?.results ?? [];
  if (!rows.length) return [];

  const lines = rows
    .filter((r) => r.term && typeof r.count === "number")
    .map((r, i) => `${i + 1}. ${r.term} — ${r.count} reports`);
  if (!lines.length) return [];

  const content_text =
    `FDA Adverse Event Reporting System (FAERS) — most frequently reported adverse events for "${drug}":\n\n` +
    lines.join("\n") +
    `\n\n(Spontaneous reports; counts reflect reporting frequency, not incidence, prevalence, or proven causation.)`;

  return [{
    provider: "openfda",
    provider_id: `faers:${drug.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: `FAERS adverse-event summary: ${drug}`,
    subtitle: "FDA Adverse Event Reporting System",
    source_url: "https://www.fda.gov/drugs/questions-and-answers-fdas-adverse-event-reporting-system-faers",
    license: "public_domain",
    content_text,
    content_hash: await sha256Hex(content_text),
    metadata: { source: "faers", drug },
  }];
}
