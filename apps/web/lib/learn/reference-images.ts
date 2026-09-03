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

import { matchableConcepts, readableCaption } from "./figure-caption";
import { textbookFigures, type FigureHit } from "./textbook-figures";
import type { CandidateAsset } from "./visual-provenance";

/** What a caller wants a picture of. Plain text — the concept, not a query language. */
export interface ReferenceQuery {
  readonly concept: string;
  /** How many candidates to bring back per provider. Small: this is a choice, not a gallery. */
  readonly limit?: number;
}

/**
 * Where a licensed picture can come from.
 *
 * 🔴 `textbook-shelf` IS A THIRD KIND, not a second live provider. Curated rows are checked by a
 * person; a live repository is believed about a licence on every request. The shelf is neither: its
 * licence was verified twice at harvest (the catalogue AND the book's own metadata endpoint) and a
 * database constraint refuses any row outside four licence families. See `textbook-figures.ts`.
 */
export type ReferenceProviderId = "curated" | "textbook-shelf" | "wikimedia-commons";

/**
 * The only hosts a reference asset may be served from.
 *
 * 🔴 AN ALLOW LIST FOR THE SAME REASON THE LICENCE TABLE IS ONE. A `figure` visual ends life as an
 * `<img src>` in a learner's page, and the resolve pass strips anything a model wrote — but stored
 * blocks are re-validated long after that pass ran, and defence in depth there means a URL naming a
 * host nobody chose refuses rather than renders. Curated rows point at the Commons file store too,
 * so one entry covers both providers; `openi.nlm.nih.gov` is deliberately absent — evaluated
 * 2026-08-23 and rejected, because its API hides per-image licences and answers only browsers.
 *
 * 🔴 THE PUBLISHER HOSTS ARE THE SHELF'S OWN BOOK HOSTS, AND ONLY THOSE. A CC BY book may embed
 * an image its author used under permission or local fair dealing — measured in the shelf:
 * Khan Academy and CK-12 CDN images (both CC BY-NC upstream) and smarthistory.org (CC BY-NC-SA)
 * ride inside CC BY books, and the book's grant does not transfer to them. Pixels are trusted
 * only where book and image are one CC-licensed publication: the host that publishes the book.
 * Wikimedia's file store stays because non-free licences are banned there by site policy.
 * Generated from `select distinct split_part(book_url,'/',3) from textbook_figures` on
 * 2026-08-30; the SQL mirror of this rule is the `figure_serving_host_gate` migration on
 * `match_textbook_figures`, and the two must move together.
 */
export const REFERENCE_ASSET_HOSTS: readonly string[] = [
  "adelaideuniversity.pressbooks.pub",
  "boisestate.pressbooks.pub",
  "canberra.pressbooks.pub",
  // 🔴 NOT `commons.wikimedia.org` — that is the wiki PAGE host, which some shelf books carry as
  // their book_url; pixels live on `upload.wikimedia.org` and only the file store serves.
  "courses.lumenlearning.com",
  "cwi.pressbooks.pub",
  "ecampusontario.pressbooks.pub",
  "fhsu.pressbooks.pub",
  "iastate.pressbooks.pub",
  "kpu.pressbooks.pub",
  "lmu.pressbooks.pub",
  "louis.pressbooks.pub",
  "milnepublishing.geneseo.edu",
  "minnstate.pressbooks.pub",
  "nic.pressbooks.pub",
  "oercollective.caul.edu.au",
  "ohiostate.pressbooks.pub",
  "open.lib.umn.edu",
  "open.library.okstate.edu",
  "open.ocolearnok.org",
  "open.oregonstate.education",
  "openbooks.library.umass.edu",
  "openoregon.pressbooks.pub",
  "openpress.sussex.ac.uk",
  "opentext.uoregon.edu",
  "opentextbc.ca",
  "opentextbooks.library.arizona.edu",
  "pdx.pressbooks.pub",
  "press.rebus.community",
  "pressbooks.bccampus.ca",
  "pressbooks.lib.jmu.edu",
  "pressbooks.lib.vt.edu",
  "pressbooks.oer.hawaii.edu",
  "pressbooks.openedmb.ca",
  "pressbooks.openeducationalberta.ca",
  "pressbooks.palni.org",
  "pressbooks.uiowa.edu",
  "pressbooks.uwf.edu",
  "psu.pb.unizin.org",
  "restoryingeducation.pressbooks.sunycreate.cloud",
  "rotel.pressbooks.pub",
  "rwu.pressbooks.pub",
  "sheffield.pressbooks.pub",
  "theatreappreciation.pressbooks.sunycreate.cloud",
  "uark.pressbooks.pub",
  "uen.pressbooks.pub",
  "umsystem.pressbooks.pub",
  "una.pressbooks.pub",
  "upload.wikimedia.org",
  "usq.pressbooks.pub",
  "uta.pressbooks.pub",
  "uw.pressbooks.pub",
  "viva.pressbooks.pub",
  "wisc.pb.unizin.org",
  "wisconsin.pressbooks.pub",
  "wsu.pressbooks.pub",
  "wtcs.pressbooks.pub",
  "www.saskoer.ca",
];

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
  /** The textbook shelf's search. Server callers pass `searchShelf` from `figure-shelf-server.ts`;
   *  absent means the shelf is not consulted, which is what a browser or an offline test wants. */
  readonly shelfSearch?: (concept: string, limit: number) => Promise<FigureHit[]>;
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
    // The API appends analytics parameters to rendition URLs; the file serves without them.
    const thumb = (info as { thumburl?: unknown }).thumburl;
    const original = (info as { url?: unknown }).url;
    const chosen = typeof thumb === "string" && thumb ? thumb : original;
    const assetPath = typeof chosen === "string" ? chosen.split("?")[0] : chosen;
    const pageUrl = (info as { descriptionurl?: unknown }).descriptionurl;
    if (!licence || typeof assetPath !== "string") continue;
    const author = plainText(meta.Artist?.value);
    // 🔴 THE LIVE PROVIDER IS FILTERED TOO, AND THAT IS NOT BELT-AND-BRACES. The shelf's book
    // blurbs came from this very field: the same bulk-uploaded files are reachable through a live
    // Commons search, so a caption refused from the frozen copy would otherwise walk straight back
    // in through the fresh one.
    const caption = readableCaption(plainText(meta.ImageDescription?.value));
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
  // 🔴 A CURATED ROW SHADOWS THE LIVE PROVIDER, SO A WEAK MATCH IS WORSE THAN NONE. Measured on
  // the shelf: "balance sheet" matched a bathtub *balance* seat, and "bacteriophage structure"
  // matched a DNA *structure* diagram — one shared word each, and being curated they outranked
  // everything the live search would have found. So a row competes only when it matches at least
  // TWO of the asked words, or most of the asked characters (a single-word query can still match
  // its word; a specific word can still carry a phrase it dominates). A request this filter drops
  // is not lost — it falls through to the live provider, which is exactly where a concept the
  // shelf does not hold belongs.
  // 🔴🔴 GLUE WORDS ARE DROPPED BEFORE ANYTHING IS COUNTED, AND THAT IS THE THIRD TIME THIS SHELF
  // HAS ANSWERED A QUESTION IT HAS NO ANSWER TO. Reproduced 2026-09-03 from the owner's own canvas:
  // asking for **"shell-and-tube heat exchanger"** returned an OpenStax NEURAL TUBE diagram, drawn
  // under an answer about pressure vessels. "tube bundle" returned the heart's bundle branches.
  //
  // The two-word floor above was supposed to prevent exactly this, and `and` walked through it.
  // `tokens` keeps any word over two letters, so the query split to
  // ["shell","and","tube","heat","exchanger"] and any row whose concepts held both `and` and `tube`
  // scored two matches. Measured on the real shelf: **`and` appears in 9.9% of its 5,829 rows** and
  // `the` in 17.9%, so the floor was being cleared by a conjunction.
  //
  // 🔴 THE CUT IS MEASURED FROM THE CORPUS, NOT FROM A WORD LIST (CLAUDE.md). A stop-word list is
  // English-only and would still have missed the words that actually did the damage — this shelf's
  // own boilerplate: `img` 10.9%, `medical` 10.3%, `illustration` 7.5%, `blausen` 6.8%, `depicting`
  // 5.7%, `anatomy` 4.5%, `openstax` 3.8%, `textbook` 3.0%. Those sit in the concepts of hundreds of
  // rows apiece, which is what lets any query brushing one of them match an arbitrary picture. Rank
  // by how many rows a word appears in and every one of them falls out, in any language and any
  // field: on a shelf of contract diagrams it would be `clause` and `court` that got cut.
  //
  // 🔴 THE THRESHOLD SITS IN A MEASURED GAP, NOT AT A ROUND NUMBER I LIKED. Every word between 1.5%
  // and 4.5% of the shelf is boilerplate — `physiology`, `openstax`, `version`, `2016`, `published`,
  // `micrograph`, `cdc`, `lores`. The most common genuine SUBJECT word is `cell` at 1.4%, and
  // `tube` — the word at the heart of the defect — is 0.2%. So there is a real gap here, and 2%
  // sits inside it with `cell` below and every piece of boilerplate above.
  const glue = glueWords(registry);
  const useful = wanted.filter((word) => !glue.has(word));
  // 🔴 A QUERY MADE ENTIRELY OF GLUE MATCHES NOTHING, rather than matching whatever sorts first.
  // `figure-subject.ts` makes the same argument about descriptions: when nothing in the request
  // identifies a subject, the honest answer is no picture, and the ladder falls through to the live
  // provider — which is where a concept this shelf does not hold belongs.
  if (useful.length === 0) return [];
  const wantedMass = useful.reduce((sum, word) => sum + word.length, 0);
  return registry
    .map((entry) => {
      // 🔴🔴 A ROW IS MATCHED ON ITS REAL CONCEPTS ONLY — see `figure-caption.ts`. 1,235 shelf rows
      // carry a book's blurb where a description belongs, and because the harvester turns the
      // description into a concept, every row from one upload shares that string verbatim. Scoring
      // against it makes a thousand rows tie on any query wide enough to brush the blurb, and the
      // winner is then whichever the sort left on top — an arbitrary textbook figure, presented as
      // the answer, and SHADOWING the live provider that would have found the right diagram.
      const have = new Set(matchableConcepts(entry.concepts).flatMap(tokens));
      const matched = useful.filter((word) => have.has(word));
      return { entry, matched: matched.length, score: matched.reduce((sum, word) => sum + word.length, 0) };
    })
    .filter((row) => row.matched >= 2 || row.score >= wantedMass * 0.6)
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(query.limit ?? 4, 1), 10))
    .map(({ entry }) => {
      // 🔴 AND A BOOK RECORD IS NEVER SHOWN AS THOUGH IT DESCRIBED THE PICTURE. Measured in
      // production: asking for glycolysis returned the right diagram captioned "Name: Microbiology
      // ID: e42bd376-…@4.4 Language: English Summary:". Omitted rather than blanked, because
      // `caption` is optional and downstream tests it for presence, not for emptiness.
      const caption = readableCaption(entry.caption);
      return {
        assetPath: entry.assetPath,
        ...(entry.author ? { author: entry.author } : {}),
        ...(caption ? { caption } : {}),
        licence: {
          attribution: entry.attribution,
          licence: entry.licence,
          source: entry.source,
          ...(entry.url ? { url: entry.url } : {}),
        },
        provenance: "reference_image" as const,
        providerId: "curated" as const,
        // The tags are what this row CLAIMS to be about, and a book blurb is not such a claim.
        tags: matchableConcepts(entry.concepts),
        ...(entry.url ? { url: entry.url } : {}),
      };
    });
}

/**
 * Every candidate any provider offers: curated, then the textbook shelf, then live Commons.
 *
 * 🔴 THE ORDER IS THE PREFERENCE, AND `chooseAsset` KEEPS IT. All three providers return
 * `reference_image`, so the ladder cannot separate them — it ranks by provenance and these share
 * one. Curated rows go first because a licence a human checked once beats everything; the shelf
 * goes second because its match is semantic and its licence was checked three ways at harvest,
 * where a live answer is a token overlap and a wiki template parsed on every request.
 */
export async function findReferenceImages(
  query: ReferenceQuery,
  deps: ReferenceDeps,
): Promise<ReferenceCandidate[]> {
  const curated = searchCurated(query, deps.registry ?? []);
  // Independent repositories; neither waits for the other.
  const [shelf, live] = await Promise.all([
    deps.shelfSearch
      ? textbookFigures(query.concept, query.limit ?? 4, { search: deps.shelfSearch })
      : Promise.resolve([]),
    searchCommons(query, deps),
  ]);
  return [...curated, ...shelf, ...live];
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

/**
 * How much of a shelf a word may cover before it stops identifying anything.
 *
 * See `searchCurated` for the measurement this sits in the middle of: the most common real subject
 * word on the production shelf is `cell` at 1.4%, and everything from 1.5% to 4.5% is boilerplate.
 */
const GLUE_SHARE = 0.02;

/**
 * The smallest shelf whose word frequencies mean anything.
 *
 * 🔴 BELOW THIS THE RULE STANDS DOWN, AND WITHOUT THAT IT WOULD INVERT. In a registry of four rows
 * every word appears in at least 25% of them, so EVERY word reads as glue and the shelf matches
 * nothing at all — which is what a fixture-sized registry is, and what every test that builds one
 * would have hit. `vocabulary-lookup.ts` makes the same move for the same reason (`MIN_SENTENCES`):
 * a frequency rule needs a corpus, and a rule applied to a sample too small to support it is worse
 * than no rule.
 */
const MIN_SHELF_FOR_FREQUENCY = 200;

/**
 * The words in a registry that are rare enough to identify a picture.
 *
 * Cached per registry object: the production shelf is 5,829 rows and this walks all of them, while
 * `searchCurated` is called once per figure request. A `WeakMap` keyed on the array means the
 * generated shelf is measured once per process and a test's own fixture is measured separately.
 */
const glueByRegistry = new WeakMap<readonly CuratedEntry[], ReadonlySet<string>>();

/**
 * 🔴 IT RETURNS THE GLUE, NOT THE INFORMATIVE WORDS, AND THE DIRECTION MATTERS. A word the shelf
 * has never seen — `exchanger` appears in ZERO of the 5,829 rows — is absent from the table
 * entirely. Listing the informative words would make that set an allow list of KNOWN words, and the
 * one word that identifies the owner's subject would be dropped as unknown, leaving the query to be
 * decided by its glue. Naming the glue instead means "not glue" is the default, which is the
 * correct default for a word nobody has measured.
 */
function glueWords(registry: readonly CuratedEntry[]): ReadonlySet<string> {
  const cached = glueByRegistry.get(registry);
  if (cached) return cached;
  const glue = new Set<string>();
  if (registry.length >= MIN_SHELF_FOR_FREQUENCY) {
    const counts = new Map<string, number>();
    for (const entry of registry) {
      // Per ROW, not per occurrence: a word repeated ten times in one caption still describes one
      // picture, and counting occurrences would let a single verbose row define the corpus.
      for (const word of new Set(matchableConcepts(entry.concepts).flatMap(tokens))) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
    const ceiling = registry.length * GLUE_SHARE;
    for (const [word, count] of counts) if (count > ceiling) glue.add(word);
  }
  glueByRegistry.set(registry, glue);
  return glue;
}

// The score above sums MATCHED CHARACTERS, not matched words, and the difference was measured:
// counting words scores "bacteriophage structure" the same against a bacteriophage row and a
// DNA-structure row — a tie that arrival order then decides, wrongly. A word's length is a cheap,
// dependency-free proxy for its specificity: thirteen letters of "bacteriophage" outweigh nine of
// "structure", and generic glue words stop deciding matches they never should have.
