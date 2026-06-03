/**
 * Phase 7: NCBI Bookshelf full-book ingest.
 *
 * NCBI hosts entire textbooks (LiverTox, LactMed, public-access
 * pharmacology textbooks) on Bookshelf. Each book has a stable book_id
 * (e.g. NBK547852) and a TOC accessible via E-utilities or HTML scraping.
 *
 * License varies per book: many federal-authored books are public_domain,
 * some are CC BY. Caller specifies the license — license gate enforces
 * commercial-friendly at upsert time.
 *
 * For LiverTox + LactMed specifically: license is public_domain (NIH
 * NLM-authored).
 *
 * Approach: pull the book's TOC via the Bookshelf NCBI page (which has
 * structured chapter list), then fetch each chapter's text via the
 * stable URL pattern `https://www.ncbi.nlm.nih.gov/books/{book_id}/`.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";
import type { CoreSourceLicense, CoreSourceProvider } from "../license.ts";

const REQUEST_DELAY_MS = 200;
const DEFAULT_MAX_CHAPTERS = 80; // Edge fn ~150s wall time → ~80 chapters at 200ms+fetch

export interface NcbiBookFetchOpts {
  /** Provider enum (livertox, lactmed, ncbi_bookshelf). */
  readonly provider: CoreSourceProvider;
  readonly license: CoreSourceLicense;
  /** Top-level book ID (e.g. NBK547852 for LiverTox). */
  readonly book_id: string;
  /** Pre-discovered chapter ids. If omitted, discovers from book root. */
  readonly chapters?: ReadonlyArray<{ id: string; title: string }>;
  /** Display title for the book. */
  readonly book_title: string;
  /** Max chapters per call (default 80, edge fn timeout safety). */
  readonly max_chapters?: number;
  /** Chapter offset for pagination across multiple calls. */
  readonly chapter_offset?: number;
}

export async function fetchNcbiBook(
  opts: NcbiBookFetchOpts,
): Promise<NormalizedSource[]> {
  let chapters = opts.chapters;
  if (!chapters || !chapters.length) {
    chapters = await discoverChapters(opts.book_id);
  }
  if (!chapters.length) return [];

  // Slice chapters to honor pagination + timeout cap
  const offset = Math.max(0, opts.chapter_offset ?? 0);
  const max = Math.max(1, opts.max_chapters ?? DEFAULT_MAX_CHAPTERS);
  chapters = chapters.slice(offset, offset + max);

  const sources: NormalizedSource[] = [];
  for (const ch of chapters) {
    try {
      const url = `https://www.ncbi.nlm.nih.gov/books/${ch.id}/`;
      const res = await fetch(url, {
        headers: { "User-Agent": "AscendBot/1.0 (+https://ascend.app)" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const text = htmlToText(html);
      if (text.length < 500) continue;
      sources.push({
        provider: opts.provider,
        provider_id: ch.id,
        title: `${opts.book_title}: ${ch.title}`,
        subtitle: opts.book_title,
        source_url: url,
        license: opts.license,
        content_text: text,
        content_hash: await sha256Hex(text),
        metadata: {
          book_id: opts.book_id,
          chapter_id: ch.id,
          book_title: opts.book_title,
        },
      });
    } catch (e) {
      console.warn(
        `NCBI Bookshelf chapter ${ch.id} failed: ${(e as Error).message}`,
      );
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return sources;
}

/**
 * Discover all drug-chapter NBK ids in an NCBI Bookshelf book via the
 * NCBI E-utilities API. The book root HTML loads its TOC client-side so
 * scraping returns no chapters — E-utilities is the structured path.
 *
 * Pipeline:
 *   1. esearch ?db=books&term=<book_id>[bookname]+AND+chapter[Page Type] → numeric ids
 *   2. esummary on those ids in batches of 200
 *   3. extract NBK\d+ from each result's `rid` field, dedupe
 *   4. return [{id, title}] for fetch loop
 */
async function discoverChapters(
  book_id: string,
): Promise<Array<{ id: string; title: string }>> {
  const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
  const ESUMMARY =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
  const apiKey = Deno.env.get("NCBI_API_KEY") ?? "";
  const headers = { "User-Agent": "AscendBot/1.0 (axel@ascend.app)" };

  // 1. esearch — paginate by retstart/retmax
  const PAGE = 200;
  const numericIds: string[] = [];
  let retstart = 0;
  for (let i = 0; i < 5; i++) {
    // Build URL manually (URLSearchParams encodes space as + which NCBI sometimes
    // misparses inside `[Page Type]` field qualifiers). Use %20 instead.
    const term = encodeURIComponent(
      `${book_id}[bookname] AND chapter[Page Type]`,
    );
    let url = `${ESEARCH}?db=books&term=${term}&retmax=${PAGE}&retstart=${retstart}&retmode=json`;
    if (apiKey) url += `&api_key=${apiKey}`;
    console.log(`[ncbi] esearch iter=${i} url=${url}`);
    const res = await fetch(url, { headers });
    console.log(`[ncbi] esearch iter=${i} status=${res.status}`);
    if (!res.ok) {
      console.warn(
        `[ncbi] esearch failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
      break;
    }
    const data = await res.json();
    const ids: string[] = data?.esearchresult?.idlist ?? [];
    const total = Number(data?.esearchresult?.count ?? 0);
    console.log(
      `[ncbi] esearch iter=${i} got ${ids.length} ids, total=${total}`,
    );
    if (!ids.length) break;
    numericIds.push(...ids);
    retstart += ids.length;
    if (retstart >= total) break;
  }

  console.log(`[ncbi] esearch total numericIds=${numericIds.length}`);
  if (!numericIds.length) return [];

  // 2. esummary in batches → 3. extract NBK ids + titles
  const seen = new Set<string>();
  const out: Array<{ id: string; title: string }> = [];
  for (let i = 0; i < numericIds.length; i += 200) {
    const batch = numericIds.slice(i, i + 200);
    const params = new URLSearchParams({
      db: "books",
      id: batch.join(","),
      retmode: "json",
    });
    if (apiKey) params.set("api_key", apiKey);
    const res = await fetch(`${ESUMMARY}?${params.toString()}`, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    const result = data?.result ?? {};
    for (const key of Object.keys(result)) {
      if (key === "uids") continue;
      const v = result[key] as { rid?: string; title?: string };
      const rid = v.rid ?? "";
      const m = rid.match(/^(NBK\d+)/);
      if (!m) continue;
      const nbk = m[1];
      if (nbk === book_id || seen.has(nbk)) continue;
      seen.add(nbk);
      out.push({ id: nbk, title: (v.title ?? nbk).trim() });
    }
  }

  return out;
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

/**
 * NCBI Bookshelf catalog of books we want to ingest as full-book bulk.
 * Verify license per-book before adding. All entries below are NIH-
 * authored (public_domain).
 */
export const NCBI_BOOK_CATALOG: ReadonlyArray<{
  readonly book_id: string;
  readonly book_title: string;
  readonly license: CoreSourceLicense;
  readonly provider: CoreSourceProvider;
}> = [
  {
    book_id: "NBK547852",
    book_title:
      "LiverTox: Clinical and Research Information on Drug-Induced Liver Injury",
    license: "public_domain",
    provider: "livertox",
  },
  {
    book_id: "NBK501922",
    book_title: "Drugs and Lactation Database (LactMed)",
    license: "public_domain",
    provider: "lactmed",
  },
];
