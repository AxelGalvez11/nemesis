/**
 * Phase 2: DailyMed (NLM SPL) provider.
 *
 * API: https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json
 * License: nlm_public (NIH/NLM works are public domain).
 * Auth: none required. Rate limit: 5 req/sec recommended.
 *
 * DailyMed mirrors FDA SPL submissions and is the canonical source for
 * U.S. drug labeling. We use this in addition to OpenFDA because:
 * - DailyMed has wider coverage (some legacy labels missing from OpenFDA)
 * - DailyMed exposes structured XML SPL sections via /v2/spls/{setid}.xml
 * - Cross-validates: when both agree, signal is high-confidence.
 *
 * For Phase 2 we ingest the SPL section JSON. Full XML parse deferred.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

const DAILYMED_LIST =
  "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json";
const DAILYMED_DETAIL =
  "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls";
const REQUEST_DELAY_MS = 250;

export interface DailyMedFetchOpts {
  /** Drug name search (matches title). */
  drug_name?: string;
  /** RxCUI filter. */
  rxcui?: string;
  /** Page size (default 25, max 100). */
  pagesize?: number;
  /** Page (1-indexed). */
  page?: number;
}

interface DailyMedListEntry {
  setid: string;
  spl_version: number;
  title: string;
  published_date: string;
}

interface DailyMedDetail {
  setid: string;
  title: string;
  effective_time?: string;
  packaging?: Array<{ ndc?: string }>;
  products?: Array<{
    name?: string;
    generic_medicine?: { name?: string };
    active_ingredients?: Array<{
      name?: string;
      strength?: string;
    }>;
  }>;
  // Full SPL body text (we'll grab from a separate /spls/{setid}.txt endpoint)
}

export async function fetchDailyMedSPLs(
  opts: DailyMedFetchOpts = {},
): Promise<NormalizedSource[]> {
  const params = new URLSearchParams({
    pagesize: String(Math.min(opts.pagesize ?? 25, 100)),
    page: String(opts.page ?? 1),
  });
  if (opts.drug_name) params.set("drug_name", opts.drug_name);
  if (opts.rxcui) params.set("rxcui", opts.rxcui);

  const listUrl = `${DAILYMED_LIST}?${params.toString()}`;
  const listRes = await fetch(listUrl, {
    headers: { "User-Agent": "AscendBot/1.0" },
  });
  if (!listRes.ok) {
    throw new Error(
      `DailyMed list ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`,
    );
  }
  const list = await listRes.json();
  const entries: DailyMedListEntry[] = list?.data ?? [];

  await sleep(REQUEST_DELAY_MS);

  const sources: NormalizedSource[] = [];
  for (const entry of entries) {
    try {
      const normalized = await fetchAndNormalize(entry);
      if (normalized) sources.push(normalized);
    } catch (e) {
      console.warn(
        `DailyMed setid=${entry.setid} failed: ${(e as Error).message}`,
      );
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return sources;
}

async function fetchAndNormalize(
  entry: DailyMedListEntry,
): Promise<NormalizedSource | null> {
  // The DailyMed JSON detail endpoint returns an empty body for many setids
  // (HTTP 200 with no payload). Skip JSON detail entirely — XML endpoint is
  // the canonical SPL source and includes both metadata and section body.
  const xmlRes = await fetch(`${DAILYMED_DETAIL}/${entry.setid}.xml`, {
    headers: { "User-Agent": "AscendBot/1.0" },
  });
  if (!xmlRes.ok) return null;
  const xml = await xmlRes.text();
  const content_text = stripSplXml(xml);
  if (!content_text.trim()) return null;

  return {
    provider: "dailymed",
    provider_id: entry.setid,
    title: entry.title || `DailyMed SPL ${entry.setid}`,
    source_url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${entry.setid}`,
    license: "nlm_public",
    content_text,
    content_hash: await sha256Hex(content_text),
    metadata: {
      spl_version: entry.spl_version,
      published_date: entry.published_date,
    },
  };
}

/**
 * Crude SPL XML → text. Strips tags but preserves <title> as section
 * heading lines (uppercased) so the chunker can detect sections.
 */
function stripSplXml(xml: string): string {
  let txt = xml;
  // Promote <title>...</title> to its own uppercase line.
  txt = txt.replace(
    /<title[^>]*>([\s\S]*?)<\/title>/gi,
    (_, inner) =>
      "\n\n" +
      inner
        .replace(/<[^>]+>/g, "")
        .trim()
        .toUpperCase() +
      "\n\n",
  );
  // Convert paragraphs/lists to plain newlines.
  txt = txt.replace(/<\/?(p|li|item|br)[^>]*>/gi, "\n");
  // Strip remaining tags.
  txt = txt.replace(/<[^>]+>/g, " ");
  // Decode common entities.
  txt = txt
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#160;/g, " ")
    .replace(/&nbsp;/g, " ");
  // Collapse whitespace.
  return txt
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
