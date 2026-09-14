// Getting the real text of one textbook section, from the two places our 186 courses come from.
//
// 🔴🔴 A LESSON IS NEVER WRITTEN WITHOUT ITS SOURCE. This file exists so that the writer upstream
// always has the actual chapter in front of it. A model handed nothing but "Chemical Bonds" and
// five learning objectives will produce something fluent and plausible for every section of every
// book, and there is no way to tell those apart from the ones that are right. If a section's text
// cannot be fetched, the correct outcome is NO LESSON, and every caller here treats a failed fetch
// that way rather than falling back to the title.
//
// Two sources, 36 books and 150 books:
//
//   OpenStax    the CMS names the book's uuid, `rex/release.json` names the archive host and the
//               version pinned for that book, and the archive serves the collection tree and then
//               one JSON document per page.
//   Pressbooks  every install exposes `/wp-json/pressbooks/v2/toc` and `/chapters/{id}`, free and
//               unauthenticated. 🔴 IT NEEDS A BROWSER USER-AGENT: their CloudFront answers a bare
//               curl with 403, which reads exactly like the book being private.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface SourcePage {
  readonly title: string;
  readonly html: string;
  /**
   * The document's own address, used to resolve relative image sources.
   *
   * 🔴 WITHOUT THIS THE FIGURES ARE ALL BROKEN AND NOTHING SAYS SO. OpenStax pages carry
   * `src="../resources/<hash>"`. Stored verbatim, every one of them 404s from our origin, and the
   * lesson still validates because a key that exists is not the same as a picture that loads.
   * Caught on the first three generated lessons.
   */
  readonly base: string;
}

/** A section's text and the pictures that came with it. */
export interface SourceText {
  readonly text: string;
  readonly figures: readonly SourceFigure[];
}

export interface SourceFigure {
  /** Stable key a lesson refers to, `f1`, `f2`. */
  readonly key: string;
  readonly url: string;
  readonly alt: string;
}

async function json<T>(url: string, tries = 3): Promise<T | null> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      // 404 is an answer, not a hiccup. Retrying it just costs time.
      if (res.status === 404) return null;
    } catch {
      // network flake; fall through to the wait below
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
}

/* ---------------------------------------------------------------- OpenStax */

interface RexRelease {
  readonly archiveUrl?: string;
  readonly books?: Record<string, { readonly defaultVersion?: string }>;
}

let cmsBySlug: Map<string, string> | null = null;

/** slug -> book uuid. One fetch for all 36 OpenStax books. */
async function openStaxCatalogue(): Promise<Map<string, string>> {
  if (cmsBySlug) return cmsBySlug;
  const data = await json<{ items?: { meta?: { slug?: string }; cnx_id?: string }[] }>(
    "https://openstax.org/apps/cms/api/v2/pages/?type=books.Book&fields=cnx_id&limit=250",
  );
  cmsBySlug = new Map();
  for (const item of data?.items ?? []) {
    // 🔴 THE UUID COMES FROM `cnx_id`, AND THE SLUG LIVES UNDER `meta`. Looking the book up by slug
    // in release.json instead is what 404'd the first figure harvest: release.json is keyed by
    // uuid and knows nothing about slugs.
    if (item.meta?.slug && item.cnx_id) cmsBySlug.set(item.meta.slug, item.cnx_id);
  }
  return cmsBySlug;
}

function walkTree(node: unknown, out: { id: string; title: string }[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as { id?: string; title?: string; contents?: unknown[] };
  if (Array.isArray(n.contents)) {
    for (const child of n.contents) walkTree(child, out);
    return;
  }
  if (n.id) out.push({ id: n.id.split("@")[0] ?? n.id, title: stripTags(n.title ?? "") });
}

export async function openStaxPages(slug: string): Promise<SourcePage[] | null> {
  const uid = (await openStaxCatalogue()).get(slug);
  if (!uid) return null;
  const release = await json<RexRelease>("https://openstax.org/rex/release.json");
  const archive = release?.archiveUrl;
  const version = release?.books?.[uid]?.defaultVersion;
  if (!archive || !version) return null;
  const host = archive.startsWith("http") ? archive : `https://openstax.org${archive}`;
  const book = await json<{ tree?: unknown }>(`${host}/contents/${uid}@${version}.json`);
  if (!book?.tree) return null;

  const leaves: { id: string; title: string }[] = [];
  walkTree(book.tree, leaves);

  const pages: SourcePage[] = [];
  for (const leaf of leaves) {
    const url = `${host}/contents/${uid}@${version}:${leaf.id}.json`;
    const doc = await json<{ content?: string; title?: string }>(url);
    if (doc?.content) pages.push({ base: url, html: doc.content, title: stripTags(doc.title ?? leaf.title) });
  }
  return pages;
}

/* ---------------------------------------------------------------- Pressbooks */

interface Toc {
  readonly parts?: { readonly chapters?: { readonly id?: number; readonly title?: string }[] }[];
}

export async function pressbooksPages(baseUrl: string): Promise<SourcePage[] | null> {
  const base = baseUrl.replace(/\/+$/, "");
  const toc = await json<Toc>(`${base}/wp-json/pressbooks/v2/toc`);
  if (!toc?.parts) return null;

  const chapters = toc.parts.flatMap((part) => part.chapters ?? []);
  const pages: SourcePage[] = [];
  for (const chapter of chapters) {
    if (!chapter.id) continue;
    const doc = await json<{ content?: { rendered?: string }; title?: { rendered?: string } }>(
      `${base}/wp-json/pressbooks/v2/chapters/${chapter.id}`,
    );
    const html = doc?.content?.rendered;
    if (html) pages.push({ base: `${base}/`, html, title: stripTags(doc?.title?.rendered ?? chapter.title ?? "") });
  }
  return pages;
}

/* ---------------------------------------------------------------- html to reading */

export function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&[lr]dquo;/g, '"')
    .replace(/&mdash;|&ndash;/g, ", ")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)));
}

/**
 * The section as something to read, plus the pictures it shipped with.
 *
 * 🔴 ONLY PICTURES THAT ARE REALLY PICTURES. Textbook HTML is full of 1px spacers, maths rendered
 * as tiny images, and decorative icons; a lesson that offers one of those as a figure looks broken.
 * Anything with no alt text is dropped, because alt text is also the only description the writer
 * upstream gets of what the picture actually shows.
 */
export function readable(html: string, base: string): SourceText {
  const figures: SourceFigure[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const alt = decode(/\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "").trim();
    if (!src || !alt || alt.length < 12) continue;
    if (seen.has(src)) continue;
    seen.add(src);
    let url: string;
    try {
      url = new URL(src.startsWith("//") ? `https:${src}` : src, base).href;
    } catch {
      continue;
    }
    figures.push({ alt, key: `f${figures.length + 1}`, url });
  }

  // 🔴 THE DEV STYLESHEET COMES DOWN WITH EVERY OPENSTAX PAGE, and stripping tags without removing
  // its CONTENTS puts two thousand characters of CSS keyframes and a permalink script at the top of
  // the source text, ahead of the first sentence of the chapter. Measured on 2.2 Chemical Bonds: 55
  // lines of it before the word "Chemical".
  const clean = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");

  // Blocks become line breaks so the writer can see where paragraphs and headings were.
  const spaced = clean
    .replace(/<\/(p|div|li|h[1-6]|tr|figcaption|section)>/gi, "\n")
    .replace(/<br\b[^>]*>/gi, "\n");
  const text = decode(spaced.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return { figures, text };
}

/** Loose enough to survive "1.1 Overview" vs "Overview", tight enough not to collide. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/^[\divxlcdm]+(\.\d+)*\s*[.:)-]?\s*/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 60);
}
