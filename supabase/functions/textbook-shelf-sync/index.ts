// textbook-shelf-sync — fills `public.textbook_figures` from openly licensed textbooks.
//
// 🔴🔴 PROGRESS LIVES IN THE ROWS, NOT THE CURSOR. The platform kills this function at 150s, so a
// cursor written at the end is a cursor that is often never written. `alreadyStored()` skips what is
// on the shelf before anything is embedded, which makes a book resumable mid-way and every run's
// work durable regardless of how it ends.
//
// WHY A FUNCTION AND NOT A SCRIPT. The harvest runs fine on a laptop; the WRITE cannot. Captions
// must be embedded through the same voyage-3-large path the search side uses, and that key lives
// only in this project's function secrets.
//
// THE LICENCE IS CHECKED TWICE HERE AND ONCE MORE IN THE DATABASE: the catalogue's word, the book's
// own metadata endpoint, then a CHECK constraint admitting four licence families. Nemesis charges
// money, so NonCommercial and NoDerivatives can never be stored.
//
// Auth: service role only. `run_textbook_shelf_sync()` claims a lock before firing this; the
// `writeCursor` at the end releases it.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** A self-identifying agent gets 403 from every Pressbooks host; a browser string gets 200 for the
 *  same url. Politeness lives in `PAUSE_MS`, which is what actually protects their servers. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const PAUSE_MS = 200;
const TIME_BUDGET_MS = 55_000;
const EMBED_BATCH = 128;

/**
 * 🔴 EVERY NETWORK CALL IS BOUNDED, AND WITHOUT THIS THE LOOP BUDGET IS DECORATIVE. Runs kept dying
 * at the 150s transport timeout even with the budget checked inside the embed loop, because a
 * budget can only be tested BETWEEN awaits. One fetch for the chapters of a 3,000-figure book
 * returns megabytes and can hang for minutes, and `getJson` then retried it.
 */
const FETCH_TIMEOUT_MS = 25_000;
const EMBED_TIMEOUT_MS = 30_000;

const REUSABLE_CATALOGUE = new Set([
  "Attribution",
  "Attribution-ShareAlike",
  "No Rights Reserved",
]);
const REUSABLE_URL =
  /creativecommons\.org\/(licenses\/(by|by-sa)\/\d\.\d|publicdomain\/(zero|mark))/;

const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

const REST_HEADERS = {
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  "apikey": SERVICE_KEY,
};

interface Figure {
  image_url: string;
  caption: string;
  alt: string;
  book_title: string;
  book_url: string;
  authors: string[];
  licence: string;
  attribution: string;
  chapter_title: string;
  chapter_index: number;
}

/**
 * Caption vectors, Voyage only, no fallback.
 *
 * 🔴 THE MISSING FALLBACK IS THE FEATURE. These vectors are compared against a query embedded
 * elsewhere; a Cohere 1024-vector and a Voyage 1024-vector are the same length and not the same
 * space, so a silent fallback would store rows that never match anything and fail as "the shelf has
 * nothing about this" rather than as an error. A gap is recoverable; a poisoned index is not.
 */
async function embedCaptions(texts: string[]): Promise<number[][]> {
  const key = Deno.env.get("VOYAGE_API_KEY");
  if (!key) throw new Error("VOYAGE_API_KEY unset; refusing to store vectors from another space");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    body: JSON.stringify({
      input: texts,
      input_type: "document",
      model: "voyage-3-large",
      output_dimension: 1024,
      truncation: true,
    }),
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { data: { index: number; embedding: number[] }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function getJson<T>(url: string, deadline?: number): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // A second attempt past the deadline just spends another 25 seconds we do not have.
    if (attempt > 0 && deadline !== undefined && Date.now() > deadline) return null;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      await pause();
      if (res.ok) return (await res.json()) as T;
    } catch {
      await pause();
    }
  }
  return null;
}

const strip = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCodePoint(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c: string) => String.fromCodePoint(parseInt(c, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** `#fixme` is Pressbooks' own marker for an image that failed to import. Storing one would put a
 *  figure on the shelf the book's own author knows is missing. */
function usableUrl(raw: string): string | null {
  if (raw.includes("#fixme")) return null;
  const clean = raw.replace(/&amp;/g, "&").trim();
  return clean.startsWith("http") ? clean : null;
}

function figuresIn(html: string): { url: string; caption: string; alt: string }[] {
  const out: { url: string; caption: string; alt: string }[] = [];
  const claimed = new Set<string>();
  for (const block of html.match(/<figure[\s\S]*?<\/figure>/gi) ?? []) {
    const src = block.match(/<img[^>]+src="([^"]+)"/i)?.[1];
    if (!src) continue;
    claimed.add(src);
    const url = usableUrl(src);
    if (!url) continue;
    out.push({
      alt: strip(block.match(/<img[^>]+alt="([^"]*)"/i)?.[1] ?? ""),
      caption: strip(block.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] ?? ""),
      url,
    });
  }
  for (const tag of html.match(/<img[^>]+>/gi) ?? []) {
    const src = tag.match(/src="([^"]+)"/i)?.[1];
    if (!src || claimed.has(src)) continue;
    const alt = strip(tag.match(/alt="([^"]*)"/i)?.[1] ?? "");
    if (alt.length < 15 || /\.(png|jpe?g|gif|svg)$/i.test(alt)) continue;
    const url = usableUrl(src);
    if (!url) continue;
    out.push({ alt, caption: "", url });
  }
  return out.filter((f) => !/youtube|ytimg|vimeo/i.test(f.url));
}

async function harvestBook(
  base: string,
  catalogueLicence: string,
  deadline: number,
): Promise<Figure[] | null> {
  const meta = await getJson<{ name?: string; license?: { url?: string }; author?: unknown }>(
    `${base}/wp-json/pressbooks/v2/metadata`,
    deadline,
  );
  if (!meta) return null; // not a Pressbooks host, or blocked
  const licence = meta.license?.url ?? "";
  if (!REUSABLE_CATALOGUE.has(catalogueLicence)) return [];
  if (!REUSABLE_URL.test(licence)) return [];

  const rawAuthor = meta.author;
  const authors = Array.isArray(rawAuthor)
    ? rawAuthor.map((a) => (typeof a === "string" ? a : String((a as { name?: string })?.name ?? ""))).filter(Boolean)
    : typeof rawAuthor === "string" ? [rawAuthor] : [];

  const chapters = await getJson<{ title?: { rendered?: string }; content?: { rendered?: string } }[]>(
    `${base}/wp-json/pressbooks/v2/chapters?per_page=100`,
    deadline,
  );
  if (!chapters?.length) return [];

  const title = strip(meta.name ?? base);
  const short = licence.includes("by-sa")
    ? "CC BY-SA 4.0"
    : licence.includes("zero") || licence.includes("mark")
      ? "public domain"
      : "CC BY 4.0";
  const credit = `${title}${authors.length ? ` by ${authors.join(", ")}` : ""}, ${short}`;

  const figures: Figure[] = [];
  chapters.forEach((chapter, index) => {
    for (const f of figuresIn(chapter.content?.rendered ?? "")) {
      if (!f.caption && !f.alt) continue; // undescribed is unfindable
      figures.push({
        alt: f.alt.slice(0, 500),
        attribution: credit.slice(0, 600),
        authors: authors.slice(0, 6),
        book_title: title.slice(0, 300),
        book_url: base,
        caption: (f.caption || f.alt).slice(0, 4000),
        chapter_index: index,
        chapter_title: strip(chapter.title?.rendered ?? "").slice(0, 300),
        image_url: f.url,
        licence,
      });
    }
  });
  return figures;
}

/**
 * 🔴 IT REPORTS THE RAW ROW COUNT SEPARATELY FROM THE FILTERED BOOKS. The first version returned
 * only the filtered list, so the caller read an empty array as "the catalogue is exhausted" and
 * stopped. Page 2 holds ten books and every one is NonCommercial, so the loader declared itself
 * DONE after two books with zero figures, writing `done: true` as if it had succeeded.
 */
async function cataloguePage(
  page: number,
  deadline: number,
): Promise<{ raw: number; books: { license: string; bases: string[] }[] } | null> {
  const body = await getJson<{ data: Record<string, unknown>[] }>(
    `https://open.umn.edu/opentextbooks/textbooks.json?page=${page}`,
    deadline,
  );
  if (!body) return null;
  const raw = body.data?.length ?? 0;
  if (!raw) return { books: [], raw: 0 };
  const out: { license: string; bases: string[] }[] = [];
  for (const entry of body.data) {
    const licence = String(entry.license ?? "");
    if (!REUSABLE_CATALOGUE.has(licence)) continue;
    const formats = (entry.formats as { type?: string; url?: string }[] | undefined) ?? [];
    const bases = [...new Set(formats
      .filter((f) => f.type === "Online" || f.type === "PDF" || f.type === "eBook")
      .map((f) => f.url ?? "")
      .filter((u) => u.startsWith("http") && !/amazon\.|youtube\.|drive\.google/.test(u))
      .map((u) => u.replace(/^(https?:\/\/[^/]+\/[^/?#]+).*$/, "$1")))];
    if (bases.length) out.push({ bases, license: licence });
  }
  return { books: out, raw };
}

async function insert(rows: (Figure & { embedding: number[] })[]): Promise<number> {
  if (!rows.length) return 0;
  const res = await fetch(`${SB_URL}/rest/v1/textbook_figures?on_conflict=image_url`, {
    body: JSON.stringify(rows.map((r) => ({ ...r, embedding: JSON.stringify(r.embedding) }))),
    headers: { ...REST_HEADERS, "Prefer": "resolution=ignore-duplicates,return=minimal" },
    method: "POST",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error("insert failed", res.status, (await res.text()).slice(0, 300));
    return 0;
  }
  // Rows SENT. PostgREST answers 201 for a batch it discarded entirely and never says how many
  // landed, so this is not "stored" — see `delta`.
  return rows.length;
}

/**
 * 🔴🔴 THIS IS WHAT MAKES PROGRESS DURABLE, AND WITHOUT IT THE LOADER LIVES FOREVER ON ONE PAGE.
 * Observed live: page 30 holds a book with thousands of figures. Each run re-harvested it,
 * re-embedded the captions it had already stored, spent its whole budget, and started again three
 * minutes later. Every insert returned 201 because `ignore-duplicates` reports success for a row it
 * discarded, so all the symptoms said "working" while the shelf count sat still and Voyage was
 * billed for the same captions over and over.
 */
async function alreadyStored(bookUrl: string): Promise<Set<string>> {
  try {
    // 🔴 AN EXPLICIT HIGH LIMIT. PostgREST caps a response at its own default (1,000 rows), and the
    // biggest book here has 3,034 figures. Without this, two thirds of it would look unstored on
    // every lap and be re-embedded for ever: the same loop wearing a different disguise.
    const res = await fetch(
      `${SB_URL}/rest/v1/textbook_figures?book_url=eq.${encodeURIComponent(bookUrl)}&select=image_url&limit=20000`,
      { headers: REST_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return new Set();
    const rows = await res.json() as { image_url?: string }[];
    return new Set(rows.map((r) => r.image_url ?? "").filter(Boolean));
  } catch {
    return new Set();  // worst case we re-embed, which is what happened before this existed
  }
}

/** How many figures are on the shelf right now. The authoritative number; nothing else is. */
async function figureCount(): Promise<number | null> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/textbook_figures?select=id&limit=1`, {
      headers: { ...REST_HEADERS, "Prefer": "count=exact" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const total = Number((res.headers.get("content-range") ?? "").split("/")[1]);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

/** What the count was when this lap of the catalogue began. */
async function lapStartFigures(): Promise<number | null> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/textbook_shelf_state?id=eq.true&select=lap_start_figures`,
      { headers: REST_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const rows = await res.json() as { lap_start_figures?: number }[];
    const value = rows[0]?.lap_start_figures;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

/**
 * 🔴 THE ONLY HONEST "HOW MANY DID WE ADD". `insert()` returns rows SENT, because PostgREST answers
 * 201 for a batch it discarded under `ignore-duplicates` and never says how many landed. Reporting
 * that as `stored` is how a run that added nothing reported "stored: 600" while the shelf count sat
 * still, and it hid the wedge for twenty minutes. The count before and after is the truth.
 */
async function delta(before: number | null): Promise<number> {
  if (before === null) return 0;
  const after = await figureCount();
  return after === null ? 0 : Math.max(after - before, 0);
}

async function readCursor(): Promise<{ cursor: number; done: boolean }> {
  const res = await fetch(
    `${SB_URL}/rest/v1/textbook_shelf_state?id=eq.true&select=cursor,done`,
    { headers: REST_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!res.ok) return { cursor: 1, done: false };
  const rows = await res.json() as { cursor?: number; done?: boolean }[];
  return { cursor: Number(rows[0]?.cursor ?? 1), done: Boolean(rows[0]?.done) };
}

async function writeCursor(patch: Record<string, unknown>): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/textbook_shelf_state?id=eq.true`, {
    body: JSON.stringify({ ...patch, last_run_at: new Date().toISOString() }),
    headers: { ...REST_HEADERS, "Prefer": "return=minimal" },
    method: "PATCH",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (!SERVICE_KEY || auth !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { cursor?: number; force?: boolean };
  const state = await readCursor();
  if (state.done && !body.force) {
    await writeCursor({ running_since: null });
    return new Response(JSON.stringify({ added: 0, done: true, note: "shelf already loaded" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  // An explicit cursor in the body overrides the stored one, for a targeted re-run.
  const page0 = Math.max(Number(body.cursor) || state.cursor || 1, 1);
  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  const countBefore = await figureCount();

  let page = page0;
  let sent = 0;
  let wrapped = false;
  let nextLapStart = 0;
  let booksSeen = 0;
  let booksWithFigures = 0;
  let done = false;

  while (page <= 201 && Date.now() < deadline) {
    const result = await cataloguePage(page, deadline);
    if (result === null) break;  // transient catalogue failure: resume from this page

    if (result.raw === 0) {
      // 🔴 A LAP, NOT AN ENDING. Reaching the last page means every page was VISITED, not that every
      // figure was stored: a run that ran out of time inside a big book left some behind. Wrapping
      // to page 1 lets the next lap finish them, and `alreadyStored` makes that lap cheap.
      //
      // 🔴 DONE IS MEASURED AGAINST THE REAL ROW COUNT, never a counter this function keeps. A
      // counter drifts the moment a run is killed mid-flight, and that is the normal case here.
      const total = await figureCount();
      const lapStart = await lapStartFigures();
      wrapped = true;
      done = total !== null && lapStart !== null && total === lapStart;
      nextLapStart = total ?? 0;
      page = 1;
      break;
    }

    // 🔴 THE CURSOR ADVANCES EVEN WHEN TIME RAN OUT, and that reversal is deliberate. An earlier
    // version HELD it so the next run would resume the unfinished page; what that actually did was
    // pin the loader to a page it could never finish inside one run, forever. `alreadyStored` makes
    // a book resumable at the row level, so moving on is safe.
    let outOfTime = false;

    for (const book of result.books) {
      if (Date.now() >= deadline) { outOfTime = true; break; }
      booksSeen += 1;

      let figures: Figure[] = [];
      for (const base of book.bases) {
        const found = await harvestBook(base, book.license, deadline);
        if (found === null) continue;  // not a Pressbooks host; try the book's next url
        figures = found;
        break;
      }
      if (!figures.length) continue;
      booksWithFigures += 1;

      const seen = await alreadyStored(book.bases[0]);
      const unique = figures.filter((f) => (seen.has(f.image_url) ? false : (seen.add(f.image_url), true)));

      for (let i = 0; i < unique.length; i += EMBED_BATCH) {
        // The check that was missing. A 3,000-figure book is 24 trips through here.
        if (Date.now() >= deadline) { outOfTime = true; break; }
        const slice = unique.slice(i, i + EMBED_BATCH);
        let vectors: number[][] = [];
        try {
          vectors = await embedCaptions(slice.map((f) => f.caption));
        } catch (e) {
          // 🔴 SKIP THE REST OF THIS BOOK AND CARRY ON, never hold the page. Retrying a book that
          // will not embed, every three minutes for ever, is how one bad book stops the whole shelf
          // while every cron tick still records success.
          console.error(`embed failed for "${book.bases[0]}"`, (e as Error).message);
          break;
        }
        if (vectors.length !== slice.length) break;
        sent += await insert(slice.map((f, n) => ({ ...f, embedding: vectors[n] })));
      }
      if (outOfTime) break;
    }

    page += 1;
    if (outOfTime) break;
  }

  // What actually landed, not what was posted. See `delta`.
  const added = await delta(countBefore);

  // 🔴 `running_since: null` RELEASES THE LOCK. The claim is taken in `run_textbook_shelf_sync()`;
  // if this never clears it, the shelf stops loading and only the five-minute stale window lets
  // anything through, with no error reported anywhere.
  await writeCursor({
    cursor: page,
    done,
    last_books_seen: booksSeen,
    last_error: null,
    last_figures_stored: added,
    running_since: null,
    ...(wrapped ? { lap_start_figures: nextLapStart } : {}),
  });

  return new Response(
    // 🔴 `sent` AND `added` ARE REPORTED SEPARATELY ON PURPOSE. When they diverge, the run was doing
    // work the shelf already had, which is the one signal that says something is looping.
    JSON.stringify({ added, booksSeen, booksWithFigures, done, nextCursor: page, sent }),
    { headers: { "Content-Type": "application/json" } },
  );
});
