/**
 * Phase 7: NIH LiverTox provider.
 *
 * Source: https://www.ncbi.nlm.nih.gov/books/NBK547852/ (LiverTox book
 * on NCBI Bookshelf).
 * License: public_domain (NIH NLM).
 *
 * LiverTox covers drug-induced hepatotoxicity — every common drug has
 * a chapter with mechanism of injury, time-course, severity grading,
 * monitoring strategy. High-leverage for clinical pharmacy because
 * hepatotoxicity is a frequent gate for drug selection / discontinuation.
 *
 * No public API — fetched as Bookshelf chapter pages.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

const REQUEST_DELAY_MS = 400;

export interface LiverToxFetchOpts {
  /** List of drug-chapter URLs to ingest. */
  pages: ReadonlyArray<{
    drug_name: string;
    bookshelf_id: string; // e.g. "NBK547852" for the book root, or per-drug NBK
    url: string;
  }>;
}

export async function fetchLiverTox(
  opts: LiverToxFetchOpts,
): Promise<NormalizedSource[]> {
  const sources: NormalizedSource[] = [];
  for (const page of opts.pages) {
    try {
      const res = await fetch(page.url, {
        headers: { "User-Agent": "AscendBot/1.0" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const text = htmlToText(html);
      if (text.length < 500) continue;
      sources.push({
        provider: "livertox",
        provider_id: page.bookshelf_id,
        title: `LiverTox: ${page.drug_name}`,
        subtitle: page.drug_name,
        source_url: page.url,
        license: "public_domain",
        content_text: text,
        content_hash: await sha256Hex(text),
        metadata: {
          drug_name: page.drug_name,
          bookshelf_id: page.bookshelf_id,
        },
      });
    } catch (e) {
      console.warn(
        `LiverTox fetch failed for ${page.drug_name}: ${(e as Error).message}`,
      );
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return sources;
}

function htmlToText(html: string): string {
  let txt = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");
  txt = txt.replace(
    /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi,
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
