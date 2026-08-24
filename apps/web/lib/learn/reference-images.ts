// Where a licensed teaching picture comes from (§42, rung three).
//
// 🔴 A NARROW RETRIEVAL INTERFACE, NOT AN INGESTION PIPELINE. The owner's constraint, in their own
// words: *"Do NOT bulk-ingest the internet."* So this asks a small number of repositories a
// specific question at teaching time and keeps what comes back only long enough to choose. There is
// no crawler, no mirror, and no embedding index — the failure mode of those is a corpus whose
// licences were correct on the day it was built.
//
// 🔴 THE LICENCE IS THE PRODUCT OF THIS MODULE, NOT THE URL. Anybody can find a picture. What
// `visual-provenance.ts` refuses to show is one whose per-file licence and credit were not kept, so
// a provider that cannot report those for a specific file has not found a usable candidate — it has
// found a picture. Every mapping below is deliberately conservative: an unrecognised licence string
// becomes NO licence rather than a guess, which makes the asset unusable rather than unattributed.
//
// 🔴 TWO PROVIDER KINDS, AND THEY FAIL DIFFERENTLY ON PURPOSE. A `curated` provider reads a small
// registry checked in beside the code — slow to grow, trivially auditable, and offline. A `live`
// provider queries a repository's API — wide coverage, and every answer has to be believed about a
// licence. Nemesis prefers the curated answer when both have one, because a licence a human
// recorded once beats a licence parsed out of a wiki template on every request.

import type { CandidateAsset } from "./visual-provenance";

/** What a caller wants a picture of. Plain text — the concept, not a query language. */
export interface ReferenceQuery {
  readonly concept: string;
  /** How many candidates to bring back per provider. Small: this is a choice, not a gallery. */
  readonly limit?: number;
}

export type ReferenceProviderId = "curated" | "wikimedia-commons";

/**
 * The only hosts a reference asset may be served from.
 *
 * 🔴 AN ALLOW LIST FOR THE SAME REASON THE LICENCE TABLE IS ONE. A `figure` visual ends life as an
 * `<img src>` in a learner's page, and the resolve pass strips anything a model wrote — but stored
 * blocks are re-validated long after that pass ran, and defence in depth there means a URL naming a
 * host nobody chose refuses rather than renders. Curated rows point at the Commons file store too,
 * so one entry covers both providers; `openi.nlm.nih.gov` is deliberately absent — evaluated
 * 2026-08-23 and rejected, because its API hides per-image licences and answers only browsers.
 */
export const REFERENCE_ASSET_HOSTS: readonly string[] = ["upload.wikimedia.org"];

/** Does this URL name a host the reference lane may serve pixels from? */
export function allowedAssetUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && REFERENCE_ASSET_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * One picture a provider is offering, with everything §42 requires to be allowed to show it.
 *
 * 🔴 IT EXTENDS `CandidateAsset` RATHER THAN CONVERTING TO ONE. The ladder's rules run on the same
 * object the provider produced, so there is no lossy hop where a licence could be dropped between
 * "what we found" and "what we may show".
 */
export interface ReferenceCandidate extends CandidateAsset {
  readonly author?: string;
  readonly caption?: string;
  /** Which provider offered it, so a bad row can be traced to a source. */
  readonly providerId: ReferenceProviderId;
  /** Free-text tags the provider carried. Used for reporting, never for licence decisions. */
  readonly tags: readonly string[];
  /** The original page, so a credit line can point somewhere a human can check. */
  readonly url?: string;
}

/**
 * A row in the checked-in registry.
 *
 * 🔴 EVERY FIELD THAT MAKES IT SHOWABLE IS REQUIRED HERE, WHICH IS THE WHOLE ADVANTAGE OF CURATION.
 * A live provider has to be interrogated about a licence and may answer badly; a curated row cannot
 * exist without one, because the type will not let it.
 */
export interface CuratedEntry {
  readonly assetPath: string;
  readonly attribution: string;
  readonly author?: string;
  readonly caption: string;
  readonly concepts: readonly string[];
  readonly licence: string;
  readonly source: string;
  readonly url?: string;
}

export interface ReferenceDeps {
  /** Injected, for the same reason `chem-resolver.ts` injects it: every rule here is testable offline. */
  readonly fetch?: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  /** The curated rows. Injected so a test states its own registry rather than depending on the shipped one. */
  readonly registry?: readonly CuratedEntry[];
}

/**
 * How a repository's licence short name maps onto the identifiers §42 will reuse under.
 *
 * 🔴 AN ALLOW LIST WITH NO WILDCARD, AND THE WILDCARD IS THE TEMPTING BUG. `startsWith("CC BY")`
 * would look reasonable and would silently admit `CC BY-NC`, which forbids the commercial use
 * Nemesis is. Non-commercial and no-derivatives licences are ABSENT here on purpose, so they fall
 * through to "no licence recorded" and the asset becomes unusable rather than unattributed.
 *
 * 🔴 KEYS ARE COMPARED CASE-INSENSITIVELY AND WITH PUNCTUATION FLATTENED, because the same licence
 * appears as `CC BY-SA 4.0`, `CC-BY-SA-4.0` and `cc by sa 4.0` across files in one repository.
 */
const REPOSITORY_LICENCES: Readonly<Record<string, string>> = {
  "cc0": "CC0-1.0",
  "cc0 1.0": "CC0-1.0",
  "cc by 3.0": "CC-BY-3.0",
  "cc by 4.0": "CC-BY-4.0",
  "cc by sa 3.0": "CC-BY-SA-3.0",
  "cc by sa 4.0": "CC-BY-SA-4.0",
  "pd": "public-domain",
  "pd us": "public-domain",
  "pd usgov": "public-domain",
  "pd usgov hhs cdc": "public-domain",
  "pd usgov hhs nih": "public-domain",
  "public domain": "public-domain",
};

/**
 * Flatten a licence string so the three spellings of one licence hit one key.
 *
 * 🔴 THE VERSION DOT IS FLATTENED TOO, so `4.0` becomes `4 0`. That is why the table above is
 * indexed through this function rather than read directly — writing the keys in their readable
 * form and then looking up a flattened one is a mismatch that fails silently, admitting nothing and
 * looking exactly like "no file on this page was openly licensed".
 */
function licenceKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[-_./]+/g, " ").replace(/\s+/g, " ");
}

/** The table above, re-keyed through `licenceKey` so both sides of the comparison are flattened. */
const LICENCE_LOOKUP: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(REPOSITORY_LICENCES).map(([key, value]) => [licenceKey(key), value]),
);

/**
 * Map a repository's licence string onto an identifier, or null when it is not one we may reuse.
 *
 * Exported because it is the single most consequential line in this file and deserves its own tests.
 */
export function normaliseLicence(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return LICENCE_LOOKUP[licenceKey(raw)] ?? null;
}

/** A repository renders author fields as HTML. A credit line is text, and a link in it is a bug. */
export function plainText(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return text || undefined;
}

/** The Commons search URL. Exported so a test asserts the request rather than guessing it. */
export function commonsUrl(query: ReferenceQuery): string {
  const limit = Math.min(Math.max(query.limit ?? 4, 1), 10);
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrlimit: String(limit),
    // 🔴 NAMESPACE 6 IS FILES. Without it the generator returns wiki ARTICLES, which have no
    // licence, no author and no pixels — every one of them would be discarded downstream, and the
    // provider would look like it had simply found nothing.
    gsrnamespace: "6",
    gsrsearch: query.concept,
    iiprop: "url|extmetadata",
    // 🔴 A BOUNDED RENDITION, NOT THE ORIGINAL. `url` alone is the full-resolution file, and on
    // Commons that is routinely a 40MB TIFF or an 8000-pixel scan — handed to an `<img>`, the
    // learner's phone downloads a poster to show a paragraph-width figure. `iiurlwidth` makes the
    // API answer with `thumburl`, a server-rendered rendition at this width (and a PNG for SVG
    // sources, which is also the safer thing to embed). The original URL is still kept on the
    // candidate for the credit line to point at.
    iiurlwidth: "1024",
    origin: "*",
    prop: "imageinfo",
  });
  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
}

/**
 * Ask Wikimedia Commons for files matching a concept.
 *
 * Returns only candidates whose per-file licence maps onto something reusable. Everything else is
 * dropped here rather than passed on with an empty licence, because a candidate with no licence is
 * not a candidate — `chooseAsset` would refuse it, and the refusal would be reported as a
 * bookkeeping failure when it is really "this file is not openly licensed".
 */
export async function searchCommons(query: ReferenceQuery, deps: ReferenceDeps): Promise<ReferenceCandidate[]> {
  if (!deps.fetch) return [];
  let payload: unknown;
  try {
    const response = await deps.fetch(commonsUrl(query));
    if (!response.ok) return [];
    payload = await response.json();
  } catch {
    return [];
  }
  const found: ReferenceCandidate[] = [];
  for (const page of commonsPages(payload)) {
    const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    if (!info || typeof info !== "object") continue;
    const meta = (info as { extmetadata?: Record<string, { value?: unknown }> }).extmetadata ?? {};
    const licence = normaliseLicence(plainText(meta.LicenseShortName?.value));
    // The bounded rendition when the API produced one, the original otherwise — see `commonsUrl`.
    const thumb = (info as { thumburl?: unknown }).thumburl;
    const original = (info as { url?: unknown }).url;
    const assetPath = typeof thumb === "string" && thumb ? thumb : original;
    const pageUrl = (info as { descriptionurl?: unknown }).descriptionurl;
    if (!licence || typeof assetPath !== "string") continue;
    const author = plainText(meta.Artist?.value);
    const caption = plainText(meta.ImageDescription?.value);
    found.push({
      assetPath,
      ...(author ? { author } : {}),
      ...(caption ? { caption } : {}),
      licence: {
        // 🔴 THE CREDIT FALLS BACK TO THE FILE'S OWN TITLE, NEVER TO THE REPOSITORY. "Wikimedia
        // Commons" as an author is exactly the repository-level claim §42 refuses. The title at
        // least names the thing being credited, and `chooseAsset` still refuses a BY licence whose
        // credit came out empty.
        attribution: author ?? plainText(page.title) ?? "",
        licence,
        source: "Wikimedia Commons",
        ...(typeof pageUrl === "string" ? { url: pageUrl } : {}),
      },
      provenance: "reference_image",
      providerId: "wikimedia-commons",
      tags: [query.concept],
      ...(typeof pageUrl === "string" ? { url: pageUrl } : {}),
    });
  }
  return found;
}

/** Rows from the checked-in registry whose concepts match, scored by nothing cleverer than overlap. */
export function searchCurated(query: ReferenceQuery, registry: readonly CuratedEntry[]): ReferenceCandidate[] {
  const wanted = tokens(query.concept);
  if (wanted.length === 0) return [];
  return registry
    .map((entry) => ({ entry, score: overlap(wanted, entry.concepts.flatMap(tokens)) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(query.limit ?? 4, 1), 10))
    .map(({ entry }) => ({
      assetPath: entry.assetPath,
      ...(entry.author ? { author: entry.author } : {}),
      caption: entry.caption,
      licence: {
        attribution: entry.attribution,
        licence: entry.licence,
        source: entry.source,
        ...(entry.url ? { url: entry.url } : {}),
      },
      provenance: "reference_image" as const,
      providerId: "curated" as const,
      tags: entry.concepts,
      ...(entry.url ? { url: entry.url } : {}),
    }));
}

/**
 * Every candidate any provider offers, curated first.
 *
 * 🔴 THE ORDER IS THE PREFERENCE, AND `chooseAsset` KEEPS IT. Both kinds of provider return
 * `reference_image`, so the ladder cannot separate them — it ranks by provenance and these share
 * one. Curated rows are listed first so a licence a human checked once wins over a licence parsed
 * out of a wiki template on every request.
 */
export async function findReferenceImages(
  query: ReferenceQuery,
  deps: ReferenceDeps,
): Promise<ReferenceCandidate[]> {
  const curated = searchCurated(query, deps.registry ?? []);
  const live = await searchCommons(query, deps);
  return [...curated, ...live];
}

function commonsPages(payload: unknown): Array<{ imageinfo?: unknown; title?: unknown }> {
  if (typeof payload !== "object" || payload === null) return [];
  const query = (payload as { query?: unknown }).query;
  if (typeof query !== "object" || query === null) return [];
  const pages = (query as { pages?: unknown }).pages;
  return Array.isArray(pages) ? (pages as Array<{ imageinfo?: unknown; title?: unknown }>) : [];
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
}

function overlap(a: readonly string[], b: readonly string[]): number {
  // 🔴 MATCHED CHARACTERS, NOT MATCHED WORDS, AND THE DIFFERENCE WAS MEASURED. Counting words
  // scores "bacteriophage structure" the same against a bacteriophage row (matched on
  // "bacteriophage") and a DNA-structure row (matched on "structure") — a tie the arrival order
  // then decides, wrongly. A word's length is a cheap, dependency-free proxy for its specificity:
  // the thirteen letters of "bacteriophage" now outweigh the nine of "structure", and generic
  // glue words stop deciding matches they never should have.
  const set = new Set(b);
  return a.filter((word) => set.has(word)).reduce((score, word) => score + word.length, 0);
}
