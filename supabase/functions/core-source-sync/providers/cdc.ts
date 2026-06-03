/**
 * Phase 2: CDC content provider (stub).
 *
 * License: public_domain (US federal government work).
 * Auth: none required.
 *
 * Phase 2 scope: stub. CDC has no single API for clinical guidelines;
 * each source needs a per-page parser. Worked targets:
 * - ACIP immunization schedule (cdc.gov/vaccines/schedules/)
 * - HIV PrEP guidelines (cdc.gov/hiv/clinicians/prevention/prep.html)
 * - Antibiotic stewardship (cdc.gov/antibiotic-use/)
 *
 * For now, accepts a list of {url, title} and fetches via source-fetch
 * pattern. Full HTML→sectioned-text extraction deferred to Phase 6.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

export interface CdcFetchOpts {
  /** Curated list of CDC URLs to ingest. */
  pages: ReadonlyArray<{ url: string; title: string; topic?: string }>;
}

export async function fetchCdcPages(
  opts: CdcFetchOpts,
): Promise<NormalizedSource[]> {
  const sources: NormalizedSource[] = [];

  for (const page of opts.pages) {
    try {
      const res = await fetch(page.url, {
        headers: { "User-Agent": "AscendBot/1.0 (+https://ascend.app)" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const text = htmlToText(html);
      if (text.length < 200) continue;

      sources.push({
        provider: "cdc",
        provider_id: hashUrl(page.url),
        title: page.title,
        source_url: page.url,
        license: "public_domain",
        content_text: text,
        content_hash: await sha256Hex(text),
        metadata: {
          topic: page.topic ?? null,
        },
      });
    } catch (e) {
      console.warn(`CDC fetch failed for ${page.url}: ${(e as Error).message}`);
    }
  }
  return sources;
}

function htmlToText(html: string): string {
  let txt = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  txt = txt.replace(
    /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_, _lvl, inner) =>
      "\n\n" +
      inner
        .replace(/<[^>]+>/g, "")
        .trim()
        .toUpperCase() +
      "\n\n",
  );
  txt = txt.replace(/<\/?(p|li|br)[^>]*>/gi, "\n");
  txt = txt.replace(/<[^>]+>/g, " ");
  txt = txt
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
  return txt
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hashUrl(url: string): string {
  // Simple non-crypto hash for provider_id stability.
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  }
  return `cdc-${Math.abs(h).toString(36)}`;
}
