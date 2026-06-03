/**
 * Phase 7: OpenStax full-book bulk ingest.
 *
 * OpenStax exposes book contents through a CMS archive endpoint:
 *   https://openstax.org/apps/archive/<archive_version>/contents/<book_uuid>.json
 *
 * This returns the book's entire table of contents + every chapter +
 * every section as structured JSON. One request = entire textbook,
 * far better than scraping 30+ individual URLs.
 *
 * License: cc_by (CC BY 4.0). Attribution required, surfaced in
 * card footer via card-citation-footer when citations include OpenStax.
 *
 * Bookmap (OpenStax book uuids — verify before each release):
 *   anatomy-and-physiology-2e         → d50f6e32-0fda-46ef-a362-9bd36ca7c97d
 *   microbiology                      → e42bd376-624b-4c0f-972f-e0c57998e765
 *   biology-2e                        → 8d50a0af-948b-4204-a71d-4826cba765b8
 *   chemistry-2e                      → 7fccc9cf-9b71-44f6-800b-f9457fd64335
 *
 * Each book is a different download. Caller specifies the slug.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

const BASE = "https://openstax.org/apps/archive";
const REQUEST_DELAY_MS = 150;
const DEFAULT_MAX_PAGES = 60; // Edge fn timeout cap

export interface OpenStaxBookFetchOpts {
  /** OpenStax book slug + uuid + per-book version commit hash. */
  readonly book: {
    readonly slug: string;
    readonly uuid: string;
    /** Per-book version commit hash from openstax.org/rex/release.json. */
    readonly version: string;
    readonly title: string;
    /** Optional discipline tag for downstream routing. */
    readonly topic?: string;
  };
  /**
   * Archive version (changes per release). When omitted, fetched dynamically
   * from openstax.org/rex/release.json so we always use the current archive.
   */
  readonly archive_version?: string;
  /** Max pages per call (default 60, edge fn timeout safety). */
  readonly max_pages?: number;
  /** Page offset for pagination across multiple calls. */
  readonly page_offset?: number;
}

interface OpenStaxBookManifest {
  readonly id: string;
  readonly title: string;
  readonly tree?: OpenStaxNode;
}

interface OpenStaxNode {
  readonly id: string;
  readonly slug?: string;
  readonly title?: string;
  readonly contents?: ReadonlyArray<OpenStaxNode>;
}

interface OpenStaxPage {
  readonly content?: string;
  readonly title?: string;
}

/** Cached current archive version, refreshed lazily once per cold start. */
let CURRENT_ARCHIVE: string | null = null;

async function getCurrentArchiveVersion(): Promise<string> {
  if (CURRENT_ARCHIVE) return CURRENT_ARCHIVE;
  try {
    const res = await fetch("https://openstax.org/rex/release.json");
    if (!res.ok) throw new Error(`release.json ${res.status}`);
    const data = await res.json();
    const archiveUrl: string = data?.archiveUrl ?? "";
    const m = archiveUrl.match(/\/apps\/archive\/([\d.]+)/);
    if (m) {
      CURRENT_ARCHIVE = m[1];
      return CURRENT_ARCHIVE;
    }
  } catch (e) {
    console.warn(`OpenStax release.json failed: ${(e as Error).message}`);
  }
  // Fallback to a known-good recent version
  CURRENT_ARCHIVE = "20260407.195030";
  return CURRENT_ARCHIVE;
}

/**
 * Strip the @<hash> version suffix that OpenStax's manifest tree embeds
 * in node ids (e.g. "abc123-...@f1d8d4e" → "abc123-...").
 */
function bareId(id: string): string {
  return id.split("@")[0];
}

/**
 * Pull every leaf page in the OpenStax book and emit one NormalizedSource
 * per page. Each page is a chapter section with stable ID.
 *
 * URL pattern (current as of 2026-04):
 *   manifest:  /apps/archive/<version>/contents/<book_uuid>@<book_version>.json
 *   page:      /apps/archive/<version>/contents/<book_uuid>@<book_version>:<page_uuid>.json
 */
export async function fetchOpenStaxBook(
  opts: OpenStaxBookFetchOpts,
): Promise<NormalizedSource[]> {
  const archive = opts.archive_version ?? (await getCurrentArchiveVersion());
  const bookRef = `${opts.book.uuid}@${opts.book.version}`;
  const manifestUrl = `${BASE}/${archive}/contents/${bookRef}.json`;

  const manifestRes = await fetch(manifestUrl, {
    headers: { "User-Agent": "AscendBot/1.0" },
  });
  if (!manifestRes.ok) {
    throw new Error(
      `OpenStax manifest ${manifestRes.status}: ${(await manifestRes.text()).slice(0, 200)}`,
    );
  }
  const manifest = (await manifestRes.json()) as OpenStaxBookManifest;
  const tree = manifest.tree;
  if (!tree) {
    throw new Error("OpenStax manifest missing tree");
  }

  const allPages = collectLeafPages(tree);
  const offset = Math.max(0, opts.page_offset ?? 0);
  const max = Math.max(1, opts.max_pages ?? DEFAULT_MAX_PAGES);
  const pages = allPages.slice(offset, offset + max);
  await sleep(REQUEST_DELAY_MS);

  const sources: NormalizedSource[] = [];
  for (const node of pages) {
    if (!node.id) continue;
    const pageId = bareId(node.id);
    try {
      const pageUrl = `${BASE}/${archive}/contents/${bookRef}:${pageId}.json`;
      const pageRes = await fetch(pageUrl, {
        headers: { "User-Agent": "AscendBot/1.0" },
      });
      if (!pageRes.ok) continue;
      const page = (await pageRes.json()) as OpenStaxPage;
      const content = htmlToText(page.content ?? "");
      if (content.length < 200) continue;

      const title = (node.title ?? page.title ?? "Untitled section")
        .replace(/<[^>]+>/g, "")
        .trim();
      sources.push({
        provider: "openstax",
        provider_id: `${opts.book.slug}/${pageId}`,
        title: `${opts.book.title}: ${title}`,
        subtitle: opts.book.title,
        source_url: `https://openstax.org/books/${opts.book.slug}/pages/${node.slug ?? pageId}`,
        license: "cc_by",
        content_text: content,
        content_hash: await sha256Hex(content),
        metadata: {
          book_slug: opts.book.slug,
          book_uuid: opts.book.uuid,
          book_version: opts.book.version,
          page_id: pageId,
          page_slug: node.slug ?? null,
          topic: opts.book.topic ?? null,
        },
      });
    } catch (e) {
      console.warn(`OpenStax page ${node.id} failed: ${(e as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return sources;
}

function collectLeafPages(node: OpenStaxNode): OpenStaxNode[] {
  if (!node.contents || !node.contents.length) {
    return node.id ? [node] : [];
  }
  const out: OpenStaxNode[] = [];
  for (const child of node.contents) {
    out.push(...collectLeafPages(child));
  }
  return out;
}

function htmlToText(html: string): string {
  let txt = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
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
 * Known OpenStax book catalog. Verify uuid before each release in case
 * OpenStax republishes — uuids are stable per edition.
 */
/**
 * OpenStax book catalog. UUIDs + version commit hashes verified against
 * https://openstax.org/rex/release.json on 2026-05-02. If a book stops
 * resolving, re-pull release.json and update the version field.
 */
export const OPENSTAX_BOOK_CATALOG: ReadonlyArray<
  OpenStaxBookFetchOpts["book"]
> = [
  {
    slug: "anatomy-and-physiology-2e",
    uuid: "4fd99458-6fdf-49bc-8688-a6dc17a1268d",
    version: "d7c885c",
    title: "Anatomy and Physiology 2e",
    topic: "anatomy",
  },
  {
    slug: "microbiology",
    uuid: "e42bd376-624b-4c0f-972f-e0c57998e765",
    version: "f1d8d4e",
    title: "Microbiology",
    topic: "infectious-disease",
  },
  {
    slug: "biology-2e",
    uuid: "8d50a0af-948b-4204-a71d-4826cba765b8",
    version: "963ac0e",
    title: "Biology 2e",
    topic: "biology",
  },
  {
    slug: "chemistry-2e",
    uuid: "7fccc9cf-9b71-44f6-800b-f9457fd64335",
    version: "8759182",
    title: "Chemistry 2e",
    topic: "chemistry",
  },
];
