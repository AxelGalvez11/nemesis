// course-scaffold-sync — a book's published chapter order, stored as a reusable course skeleton.
//
// 🔴🔴 IT WALKS THE BOOKS WE ALREADY HOLD FIGURES FOR, NOT THE CATALOGUE. `textbook_figures` already
// records every book that answered the Pressbooks API, so the list of books worth a scaffold is a
// `select distinct book_url` away. Re-walking 201 catalogue pages to rediscover the same set would
// take the whole time budget before the first useful request and would re-derive a list the
// database already holds.
//
// 🔴 A SCAFFOLD IS NOT A TERRITORY TREE. `canvas-focus.ts` forbids document layout from becoming
// knowledge structure: "document headings are location, not knowledge structure". A chapter list is
// layout. It answers "where am I in the book"; the Minimap's territories answer "what do I know".
// Keeping them separate is the whole reason this is its own table rather than a new shape of
// territory.
//
// No embedding, one request per book. Cheap enough that the whole shelf is covered in a few runs.
//
// Auth: service role only.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Pressbooks blocks a self-identifying agent and answers a browser string. See textbook-shelf-sync. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const PAUSE_MS = 250;
const TIME_BUDGET_MS = 55_000;
const FETCH_TIMEOUT_MS = 20_000;
const BOOKS_PER_RUN = 60;

const REUSABLE_URL =
  /creativecommons\.org\/(licenses\/(by|by-sa)\/\d\.\d|publicdomain\/(zero|mark))/;

const REST_HEADERS = {
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  "apikey": SERVICE_KEY,
};

const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

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

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    await pause();
    return res.ok ? (await res.json()) as T : null;
  } catch {
    await pause();
    return null;
  }
}

interface Part { part: string; index: number; chapters: { title: string; index: number }[] }

/**
 * The book's table of contents, flattened to parts and their chapters.
 *
 * 🔴 FRONT AND BACK MATTER ARE LEFT OUT ON PURPOSE. A scaffold is meant to be the spine of a
 * course; "Acknowledgements", "About the Authors" and "Appendix B" are pages, not steps in
 * learning, and putting them in a course map makes the map say the learner is 1 of 14 through
 * when they have not started.
 */
function partsFrom(toc: Record<string, unknown>): Part[] {
  const raw = (toc.parts as { title?: string; chapters?: { title?: string }[] }[] | undefined) ?? [];
  const parts: Part[] = [];
  raw.forEach((p, i) => {
    const chapters = (p.chapters ?? [])
      .map((c, n) => ({ index: n, title: strip(c.title ?? "") }))
      .filter((c) => c.title.length > 0);
    const title = strip(p.title ?? "");
    if (title && chapters.length) parts.push({ chapters, index: i, part: title });
  });
  return parts;
}

interface ShelfBook { book_url: string; book_title: string }

/**
 * Books on the figure shelf that have no scaffold yet, richest first.
 *
 * 🔴🔴 THE DISTINCT AND THE ANTI-JOIN RUN IN POSTGRES, AND DOING THEM HERE LOST 92% OF THE WORK.
 * The first version pulled `textbook_figures` rows over PostgREST with `limit=40000` and
 * de-duplicated in TypeScript. PostgREST enforces a SERVER-SIDE max-rows that a query parameter
 * cannot raise, so it returned the first 1,000 figure rows, which cover about thirteen books. The
 * sync reported `considered: 13, stored: 13` and then `considered: 0` — indistinguishable from a
 * job that had finished. Postgres already knows the distinct set; asking it has no cap.
 */
async function booksNeedingScaffold(limit: number): Promise<ShelfBook[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/books_needing_scaffold`, {
      body: JSON.stringify({ want: limit }),
      headers: REST_HEADERS,
      method: "POST",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("books_needing_scaffold failed", res.status, (await res.text()).slice(0, 200));
      return [];
    }
    return await res.json() as ShelfBook[];
  } catch {
    return [];
  }
}

async function upsert(rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const res = await fetch(`${SB_URL}/rest/v1/course_scaffolds?on_conflict=book_url`, {
    body: JSON.stringify(rows),
    headers: { ...REST_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
    method: "POST",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) console.error("scaffold upsert failed", res.status, (await res.text()).slice(0, 240));
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (!SERVICE_KEY || auth !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  const books = await booksNeedingScaffold(BOOKS_PER_RUN);

  let stored = 0;
  let noToc = 0;
  const batch: Record<string, unknown>[] = [];

  for (const book of books) {
    if (Date.now() >= deadline) break;

    const meta = await getJson<{ name?: string; license?: { url?: string }; author?: unknown }>(
      `${book.book_url}/wp-json/pressbooks/v2/metadata`,
    );
    const licence = meta?.license?.url ?? "";
    // The same two-sided licence check the figure sync makes. A scaffold is a derivative of the
    // book's structure and is held under the same grant.
    if (!REUSABLE_URL.test(licence)) { noToc += 1; continue; }

    const toc = await getJson<Record<string, unknown>>(`${book.book_url}/wp-json/pressbooks/v2/toc`);
    if (!toc) { noToc += 1; continue; }
    const parts = partsFrom(toc);
    if (!parts.length) { noToc += 1; continue; }

    const rawAuthor = meta?.author;
    // 🔴 AUTHORS GO THROUGH `strip` TOO. They arrive as HTML from a WordPress field, so a credit
    // line built straight from them renders "Ernstmeyer &amp; Christman" on screen. The title was
    // already stripped; missing the authors put the entity into the one string CC BY requires us to
    // display verbatim.
    const authors = (Array.isArray(rawAuthor)
      ? rawAuthor.map((a) => (typeof a === "string" ? a : String((a as { name?: string })?.name ?? "")))
      : typeof rawAuthor === "string" ? [rawAuthor] : [])
      .map((a) => strip(a))
      .filter(Boolean);
    const title = strip(meta?.name ?? book.book_title);
    const short = licence.includes("by-sa") ? "CC BY-SA 4.0"
      : licence.includes("zero") || licence.includes("mark") ? "public domain" : "CC BY 4.0";

    batch.push({
      attribution: `${title}${authors.length ? ` by ${authors.join(", ")}` : ""}, ${short}`.slice(0, 600),
      authors: authors.slice(0, 6),
      book_title: title.slice(0, 300),
      book_url: book.book_url,
      chapter_count: parts.reduce((n, p) => n + p.chapters.length, 0),
      licence,
      parts,
      synced_at: new Date().toISOString(),
    });
    stored += 1;

    if (batch.length >= 20) { await upsert(batch.splice(0)); }
  }
  await upsert(batch);

  return new Response(
    JSON.stringify({ considered: books.length, noToc, stored }),
    { headers: { "Content-Type": "application/json" } },
  );
});
