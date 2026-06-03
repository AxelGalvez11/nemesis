/**
 * Phase 7: generic curated-pages provider.
 *
 * Many guideline-publishing bodies (AHRQ, USPSTF, NIH NHLBI, VA/DoD,
 * FDA Drug Safety Communications, CDC MMWR, OpenStax) don't expose
 * structured APIs. We curate URL whitelists per provider and fetch
 * + extract text via the same pattern.
 *
 * Used by 7+ providers as a thin ingest helper. Each caller supplies:
 * - provider enum value
 * - default license (passed through to NormalizedSource)
 * - list of {url, title, topic?} entries
 *
 * License gate is enforced upstream (assertCommercialFriendly) before
 * persistence — caller is responsible for passing the correct license.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";
import type { CoreSourceLicense, CoreSourceProvider } from "../license.ts";

const REQUEST_DELAY_MS = 400;

export interface CuratedPagesFetchOpts {
  readonly provider: CoreSourceProvider;
  readonly license: CoreSourceLicense;
  readonly pages: ReadonlyArray<{
    readonly url: string;
    readonly title: string;
    readonly topic?: string;
    /** Provider-stable id. If omitted, derived from URL hash. */
    readonly provider_id?: string;
  }>;
}

export async function fetchCuratedPages(
  opts: CuratedPagesFetchOpts,
): Promise<NormalizedSource[]> {
  const sources: NormalizedSource[] = [];
  for (const page of opts.pages) {
    try {
      const res = await fetch(page.url, {
        headers: {
          "User-Agent": "AscendBot/1.0 (+https://ascend.app)",
        },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const text = htmlToText(html);
      if (text.length < 200) continue;
      sources.push({
        provider: opts.provider,
        provider_id: page.provider_id ?? hashUrl(page.url, opts.provider),
        title: page.title,
        source_url: page.url,
        license: opts.license,
        content_text: text,
        content_hash: await sha256Hex(text),
        metadata: { topic: page.topic ?? null },
      });
    } catch (e) {
      console.warn(
        `[${opts.provider}] fetch failed for ${page.url}: ${(e as Error).message}`,
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

function hashUrl(url: string, provider: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  }
  return `${provider}-${Math.abs(h).toString(36)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
