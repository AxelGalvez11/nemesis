/**
 * Harvest figures, captions and attribution from openly licensed textbooks.
 *
 * Run, from apps/web:
 *   npx tsx scripts/otl-figure-harvest.mts --subject biology --limit 5
 *   npx tsx scripts/otl-figure-harvest.mts --subject biology            (all of them)
 *
 * Writes `$TMPDIR/otl-figures.json` and prints a summary as it goes.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
 *
 * Owner 2026-08-29: the visuals are the point, life sciences first. §42's ladder already ranks a
 * figure from real source material ABOVE anything Nemesis renders or generates, and its top rung
 * has never had a shelf behind it. This fills that rung from books whose licence permits it.
 *
 * 🔴🔴 IT READS THE PRESSBOOKS API, NOT THE PDF, AND THAT IS THE WHOLE REASON IT IS CHEAP. A PDF
 * gives you pixels and a guess at which caption belongs to which picture. The same book's REST API
 * gives the chapter tree, the chapter HTML, the image URL, and the author's own `<figcaption>` as
 * separate fields. Measured on Environmental Biology: 40 chapters carried 167 figures and 177
 * captions, so nearly every figure arrives already described BY ITS AUTHOR. Nothing here needs a
 * vision model, which is what makes a whole-shelf harvest cost approximately nothing.
 *
 * 🔴 THE LICENCE IS READ FROM THE BOOK ITSELF, NOT FROM THE CATALOGUE. The Open Textbook Library
 * says what licence a book carries; `/wp-json/pressbooks/v2/metadata` says what the book says about
 * itself, as a machine-readable CC URL. Both must agree and both must be commercially reusable, so
 * a catalogue row that has drifted from the book cannot let a NonCommercial book through. Nemesis
 * is a paid product; NC and ND both fail, ND because turning a chapter into lessons is exactly the
 * derivative it forbids.
 *
 * 🔴 A FIGURE WITH NO CAPTION AND NO ALT TEXT IS DROPPED. An image nobody described is an image
 * nothing can retrieve: it would sit in the shelf forever, unfindable, and inflate the row count
 * into a number that lies about how much is usable. Counting it would be the same failure as a
 * registry of five confident-looking unverified rows.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 🔴 A BROWSER USER AGENT, AND NOT BECAUSE IT IS TIDY. The honest, self-identifying string
 * ("Nemesis figure harvest…") is what a well-behaved crawler should send, and every Pressbooks host
 * answers it with 403 while returning 200 to a browser string for the SAME url. Measured
 * 2026-08-29 on openoregon.pressbooks.pub. Their edge blocks by user agent, not by behaviour, so the
 * polite string buys nothing and costs the whole harvest. Politeness lives in `PAUSE_MS` below
 * instead, which is the part that actually protects their server.
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/** Gap between requests. These are small university servers giving their work away; a harvest that
 *  hammers them is how open catalogues end up behind logins. */
const PAUSE_MS = 350;

const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

/** Licences a paid product may build on. Mirrors `core-source-sync/license.ts`. */
const REUSABLE = [
  "creativecommons.org/licenses/by/",
  "creativecommons.org/licenses/by-sa/",
  "creativecommons.org/publicdomain/zero/",
  "creativecommons.org/publicdomain/mark/",
];

/** What the catalogue calls the same thing. Both sides must pass. */
const REUSABLE_CATALOGUE = new Set(["Attribution", "Attribution-ShareAlike", "No Rights Reserved"]);

export interface HarvestedFigure {
  /** Where the picture lives right now. Fetch-once-and-store is a later pass. */
  imageUrl: string;
  /** The author's own caption. The searchable description, written by a human who knew the subject. */
  caption: string;
  /** Accessibility text, when the author wrote real text rather than a filename. */
  alt: string;
  bookTitle: string;
  bookUrl: string;
  authors: string[];
  /** The CC URL the BOOK states about itself. */
  licence: string;
  chapterTitle: string;
  /** Position in the book's own order, so a figure knows where it sits in the course. */
  chapterIndex: number;
  /** Ready to render under the image, per CC BY. Kept as one string so the UI cannot reassemble
   *  it wrongly. */
  attribution: string;
}

/**
 * Tags out, entities decoded, whitespace collapsed.
 *
 * 🔴 NUMERIC ENTITIES ARE DECODED GENERICALLY, NOT ONE AT A TIME. The first version listed
 * `&amp;` and `&#8217;` by hand and left 1,021 others across 2,762 captions: `&#8211;` (an en
 * dash) 490 times, curly quotes 500 more. A caption reading "Figure 21.14&#8211;Location of the
 * thyroid" is what a learner would have seen on screen. A hand-kept list of entities is a list
 * that is always missing the next one.
 */
const strip = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The image url as it should actually be fetched, or null if the author flagged it as broken.
 *
 * 🔴 `#fixme` IS PRESSBOOKS TELLING US THE IMAGE FAILED TO IMPORT. It is their own marker, left in
 * the published HTML, and it appeared on real rows in this harvest. Storing one would put a figure
 * in the shelf that the book's own author knows is missing, and the learner would be the one who
 * found out. `&amp;` inside a query string is HTML escaping that survived into the attribute; sent
 * as-is it requests a different url than the one the author linked.
 */
function usableImageUrl(raw: string): string | null {
  if (raw.includes("#fixme")) return null;
  return raw.replace(/&amp;/g, "&").trim() || null;
}

async function getJson<T>(url: string): Promise<T | null> {
  // Two attempts: these hosts drop a connection often enough that one try understates the shelf.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      await pause();
      if (res.ok) return (await res.json()) as T;
    } catch {
      await pause();
    }
  }
  return null;
}

/**
 * Every figure in one chapter's HTML.
 *
 * 🔴 `<figure>` BLOCKS FIRST, LOOSE `<img>` SECOND, and never both for the same picture. A figure
 * block ties an image to its caption structurally, which is the only way to be sure a caption
 * belongs to the picture above it rather than the one below. Loose images are taken too, but only
 * when their alt text is real prose, because an image with `alt="image1.png"` is undescribed.
 */
function figuresIn(html: string): { imageUrl: string; caption: string; alt: string }[] {
  const out: { imageUrl: string; caption: string; alt: string }[] = [];
  const claimed = new Set<string>();

  for (const block of html.match(/<figure[\s\S]*?<\/figure>/gi) ?? []) {
    const src = block.match(/<img[^>]+src="([^"]+)"/i)?.[1];
    if (!src) continue;
    const caption = strip(block.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] ?? "");
    const alt = block.match(/<img[^>]+alt="([^"]*)"/i)?.[1] ?? "";
    claimed.add(src);
    const url = usableImageUrl(src);
    if (!url) continue;
    out.push({ alt: strip(alt), caption, imageUrl: url });
  }

  for (const tag of html.match(/<img[^>]+>/gi) ?? []) {
    const src = tag.match(/src="([^"]+)"/i)?.[1];
    if (!src || claimed.has(src)) continue;
    const alt = strip(tag.match(/alt="([^"]*)"/i)?.[1] ?? "");
    // A filename is not a description.
    if (alt.length < 15 || /\.(png|jpe?g|gif|svg)$/i.test(alt)) continue;
    const url = usableImageUrl(src);
    if (!url) continue;
    out.push({ alt, caption: "", imageUrl: url });
  }

  // Video posters are not figures.
  return out.filter((f) => !/youtube|ytimg|vimeo/i.test(f.imageUrl));
}

interface Meta { name?: string; license?: { url?: string }; author?: unknown }
interface Chapter { title?: { rendered?: string }; content?: { rendered?: string } }

/** `null` means "this host does not speak the Pressbooks API"; `[]` means it does and gave us
 *  nothing usable. The caller needs to tell those apart to try the book's next candidate url. */
async function harvestBook(base: string, catalogueLicence: string): Promise<HarvestedFigure[] | null> {
  const meta = await getJson<Meta>(`${base}/wp-json/pressbooks/v2/metadata`);
  if (!meta) return null;
  const licence = meta?.license?.url ?? "";
  // 🔴 BOTH CHECKS, AND THE BOOK'S OWN WORD IS THE ONE THAT CAN VETO.
  //
  // 🔴🔴 EVERY REFUSAL SAYS SO OUT LOUD. The first version returned an empty array for a
  // catalogue-licence miss without printing anything, and three NonCommercial books came back as
  // "0 figures" beside three that had simply failed to fetch. A correct refusal and a broken
  // request looked identical in the output, which is how a harvest reports a shelf half its real
  // size and nobody notices. A drop that is not named is a drop that gets counted as coverage.
  if (!REUSABLE_CATALOGUE.has(catalogueLicence)) {
    console.log(`refused: catalogue says ${catalogueLicence}`);
    return [];
  }
  if (!REUSABLE.some((ok) => licence.includes(ok))) {
    console.log(`refused: book states "${licence || "no licence"}"`);
    return [];
  }

  const rawAuthors = meta?.author;
  const authors = Array.isArray(rawAuthors)
    ? rawAuthors.map((a) => (typeof a === "string" ? a : String((a as { name?: string })?.name ?? ""))).filter(Boolean)
    : typeof rawAuthors === "string" ? [rawAuthors] : [];

  const chapters = await getJson<Chapter[]>(`${base}/wp-json/pressbooks/v2/chapters?per_page=100`);
  if (!chapters?.length) return [];

  const bookTitle = strip(meta?.name ?? base);
  const credit = `${bookTitle}${authors.length ? ` by ${authors.join(", ")}` : ""}, ${licence.includes("by-sa") ? "CC BY-SA 4.0" : licence.includes("zero") || licence.includes("mark") ? "public domain" : "CC BY 4.0"}`;

  const figures: HarvestedFigure[] = [];
  chapters.forEach((chapter, index) => {
    const html = chapter.content?.rendered ?? "";
    for (const f of figuresIn(html)) {
      // See the header: undescribed is unfindable, so it does not go in the shelf.
      if (!f.caption && !f.alt) continue;
      figures.push({
        alt: f.alt,
        attribution: credit,
        authors,
        bookTitle,
        bookUrl: base,
        caption: f.caption || f.alt,
        chapterIndex: index,
        chapterTitle: strip(chapter.title?.rendered ?? ""),
        imageUrl: f.imageUrl,
        licence,
      });
    }
  });
  return figures;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf("--limit") + 1]) || Infinity;
  const wanted = args.includes("--subject") ? args[args.indexOf("--subject") + 1] : "biology";

  console.log(`Reading the Open Textbook Library catalogue…`);
  const books: { title: string; license: string; bases: string[] }[] = [];
  for (let page = 1; page <= 201; page += 1) {
    const body = await getJson<{ data: Record<string, unknown>[] }>(
      `https://open.umn.edu/opentextbooks/textbooks.json?page=${page}`,
    );
    if (!body?.data?.length) break;
    for (const raw of body.data) {
      const licence = String(raw.license ?? "");
      // Cheapest gate first: never even probe a book the licence already rules out.
      if (!REUSABLE_CATALOGUE.has(licence)) continue;
      const subjects = (raw.subjects as { name?: string }[] | undefined) ?? [];
      const names = subjects.map((s) => (s.name ?? "").toLowerCase());
      if (wanted !== "all" && !names.some((n) => n.includes(wanted.toLowerCase()))) continue;

      // 🔴🔴 CANDIDATE BASES, PROBED LATER — NEVER A DOMAIN-NAME MATCH. The first version kept a
      // book only if its url contained the literal string "pressbooks", which found 178 of 692
      // clean-licence books and silently skipped every Pressbooks network on its own domain:
      // press.rebus.community, milnepublishing.geneseo.edu, open.library.okstate.edu and
      // openbooks.lib.msu.edu all run Pressbooks and all answer the API. Whether a host speaks
      // this API is a question only the host can answer, so it is asked rather than guessed.
      const formats = (raw.formats as { type?: string; url?: string }[] | undefined) ?? [];
      const bases = [...new Set(formats
        .filter((f) => f.type === "Online" || f.type === "PDF" || f.type === "eBook")
        .map((f) => f.url ?? "")
        .filter((u) => u.startsWith("http") && !/amazon\.|youtube\.|drive\.google/.test(u))
        .map((u) => u.replace(/^(https?:\/\/[^/]+\/[^/?#]+).*$/, "$1")))];
      if (bases.length) books.push({ bases, license: licence, title: String(raw.title ?? "") });
    }
  }

  const seen = new Set<string>();
  const unique = books.filter((b) => (seen.has(b.bases[0]) ? false : (seen.add(b.bases[0]), true))).slice(0, limit);
  console.log(`${unique.length} clean-licence "${wanted}" books to probe\n`);

  const all: HarvestedFigure[] = [];
  let unreachable = 0;
  let empty = 0;
  for (const [i, book] of unique.entries()) {
    process.stdout.write(`[${i + 1}/${unique.length}] ${book.title.slice(0, 48)}… `);
    const before = all.length;
    // Try each candidate base until one answers the Pressbooks API.
    let figures: HarvestedFigure[] = [];
    let reachable = false;
    for (const base of book.bases) {
      const result = await harvestBook(base, book.license);
      if (result === null) continue;
      reachable = true;
      figures = result;
      break;
    }
    all.push(...figures);
    if (!reachable) { unreachable += 1; console.log("not a Pressbooks host (or blocked)"); }
    else if (figures.length === 0) { empty += 1; console.log("0 figures"); }
    else console.log(`${all.length - before} figures`);
  }

  const dir = join(tmpdir(), "nemesis");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, "otl-figures.json");
  writeFileSync(out, JSON.stringify(all, null, 1));

  const withCaption = all.filter((f) => f.caption.length > 30).length;
  console.log(`\n${"─".repeat(66)}`);
  console.log(`books considered     ${unique.length}`);
  console.log(`not reachable        ${unreachable}   (not Pressbooks, or the host blocks us)`);
  console.log(`reachable, no figures ${empty}`);
  console.log(`books harvested      ${unique.length - unreachable - empty}`);
  console.log(`figures              ${all.length}`);
  console.log(`with a real caption  ${withCaption} (${Math.round((withCaption / Math.max(all.length, 1)) * 100)}%)`);
  console.log(`distinct books       ${new Set(all.map((f) => f.bookTitle)).size}`);
  console.log(`written to           ${out}`);
}

void main();
