// commons-figure-sync — OpenStax's textbook figures, taken from the copies that are still CC BY.
//
// 🔴🔴 WHY THIS SOURCE EXISTS AT ALL. OpenStax relicensed to CC BY-NC-SA, which Nemesis cannot use
// because it charges money. But a Creative Commons grant CANNOT BE REVOKED: copies distributed
// while the books were CC BY keep that grant for ever. Wikimedia Commons holds ~1,319 of those
// figures, and Commons DELETES non-free files, so a file's survival there is itself evidence of the
// grant. Every row also carries its own machine-readable per-file licence, which is stronger
// evidence than any statement openstax.org makes today.
//
// 🔴 NEVER FETCH THESE FROM openstax.org. That site serves the NonCommercial editions.
//
// 🔴 WIKIMEDIA IS THE OPPOSITE OF PRESSBOOKS ON USER AGENTS, and getting it backwards costs the
// whole source. Pressbooks blocks a self-identifying agent and answers a browser string; Wikimedia
// REQUIRES a descriptive agent naming the tool and a contact. They also rate-limit hard: measured
// 429s at speed, so every request is spaced.
//
// Auth: service role only. Writes the same shelf as `textbook-shelf-sync`.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const UA = "NemesisFigureShelf/1.0 (openly licensed textbook figures; contact axelgalvez1121@gmail.com)";
const PAUSE_MS = 1_200;
const TIME_BUDGET_MS = 55_000;
const FETCH_TIMEOUT_MS = 25_000;
const EMBED_TIMEOUT_MS = 30_000;
const EMBED_BATCH = 128;
const API = "https://commons.wikimedia.org/w/api.php";

const CATEGORIES = [
  "Category:Graphics_by_OpenStax",
  "Category:CNX_Biology_Textbook",
  "Category:Anatomy_from_CNX_Biology_Textbook",
  "Category:Cell_types_from_CNX_Biology_Textbook",
  "Category:Chemistry_from_CNX_Biology_Textbook",
  "Category:Diseases_and_disorders_from_CNX_Biology_Textbook",
  "Category:Genetics_from_CNX_Biology_Textbook",
  "Category:Health_from_CNX_Biology_Textbook",
  "Category:Histology_from_CNX_Biology_Textbook",
  "Category:Medicine_from_CNX_Biology_Textbook",
  "Category:Physiology_from_CNX_Biology_Textbook",
];

const REST_HEADERS = {
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  "apikey": SERVICE_KEY,
};

const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

/**
 * Commons' own licence id mapped onto the CC url the shelf stores.
 *
 * 🔴 AN ALLOW LIST WITH NO WILDCARD. `startsWith("cc-by")` would admit `cc-by-nc-4.0`, the exact
 * licence this whole source exists to avoid.
 */
function licenceUrl(commonsLicence: string): string | null {
  const map: Record<string, string> = {
    "cc-by-3.0": "https://creativecommons.org/licenses/by/3.0/",
    "cc-by-4.0": "https://creativecommons.org/licenses/by/4.0/",
    "cc-by-sa-3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
    "cc-by-sa-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
    "cc-zero": "https://creativecommons.org/publicdomain/zero/1.0/",
    "cc0": "https://creativecommons.org/publicdomain/zero/1.0/",
  };
  return map[commonsLicence.trim().toLowerCase()] ?? null;
}

const stripTags = (h: string): string =>
  h.replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCodePoint(Number(c)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The CNX exporter wrote a metadata dump where a caption belongs. It reads like prose and is not. */
const BOILERPLATE = /^Name:\s|ID:\s[0-9a-f-]{8}|Version [\d.]+ from the Textbook/i;

/** Non-Latin script, or a `Kurdish:`-style language prefix. A description in another language is
 *  noise in a shelf whose vectors are English, and Commons returns whatever it last had. */
const NON_ENGLISH = /[Ѐ-ӿ؀-ۿ一-鿿֐-׿]|^\s*\w+\s*[ː:：]/;

/**
 * Does this read like something a person wrote, or like a file name?
 *
 * 🔴🔴 THE WORD COUNT ALONE IS NOT ENOUGH, AND SHIPPING IT COST 219 ROWS THAT HAD TO BE DELETED.
 * "OSC Microbio 03 03 FlagellaAr" has five words and two are long, so a length-and-count test waved
 * it through. Embedded, it is noise: it can never match what a learner asks, and it can mis-match
 * what they do. Two shapes give a code away: two or more separate number groups, and a shouty
 * prefix followed by a word and a number.
 *
 * 🔴 A CAMEL-CASE RULE WAS TRIED AND REMOVED, AND REMOVING IT MATTERED MORE THAN ADDING IT DID.
 * Rejecting any lowercase-then-uppercase token killed "FlagellaAr" and "InUseTest" — and also
 * "mRNA", "tRNA" and "pH", which is most of molecular biology, the subject this shelf exists for.
 * The number rule alone catches every junk sample measured, so the camel rule bought nothing and
 * cost the vocabulary.
 */
export function readsAsProse(text: string): boolean {
  const t = text.trim();
  if (t.length < 15) return false;
  const words = t.split(/\s+/).filter((w) => w.length > 2 && !/^\d+$/.test(w));
  if (words.length < 3) return false;
  if ((t.match(/\b\d+\b/g) ?? []).length >= 2) return false;
  if (/^[A-Z]{2,5}\s+\w+\s+\d/.test(t)) return false;
  return true;
}

/**
 * A caption, or empty when the file has no usable one.
 *
 * 🔴 A REAL DESCRIPTION BYPASSES `readsAsProse` ENTIRELY, and that ordering is the point: the codes
 * come from FILE NAMES, so only the filename fallback needs defending against them. Names look like
 * `1116 Muscle of the Female Perineum.png` and `2206 … Thymus ku.jpg`: a leading figure code, and
 * sometimes a trailing two-letter language marker.
 */
export function captionFor(descriptionHtml: string | undefined, title: string): string {
  const desc = stripTags(descriptionHtml ?? "");
  if (desc && desc.length >= 25 && !BOILERPLATE.test(desc) && !NON_ENGLISH.test(desc)) return desc;

  let name = title.replace(/^File:/, "").replace(/\.(jpe?g|png|svg|gif|webp)$/i, "");
  name = name.replace(/[_-]+/g, " ");
  name = name.replace(/^\s*\d+[a-z]*\b/i, " ");
  name = name.replace(/\b\d{3,}[a-z]*\b/gi, " ");
  name = name.replace(/\s+[a-z]{2}$/i, "");
  name = name.replace(/\s+/g, " ").trim();
  return readsAsProse(name) && !NON_ENGLISH.test(name) ? name : "";
}

interface Row {
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

async function api(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      await pause();
      if (res.ok) return await res.json();
      if (res.status === 429) await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    } catch {
      await pause();
    }
  }
  return null;
}

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

async function insert(rows: (Row & { embedding: number[] })[]): Promise<void> {
  if (!rows.length) return;
  const res = await fetch(`${SB_URL}/rest/v1/textbook_figures?on_conflict=image_url`, {
    body: JSON.stringify(rows.map((r) => ({ ...r, embedding: JSON.stringify(r.embedding) }))),
    headers: { ...REST_HEADERS, "Prefer": "resolution=ignore-duplicates,return=minimal" },
    method: "POST",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) console.error("insert failed", res.status, (await res.text()).slice(0, 200));
}

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

/** Which image urls from this batch the shelf already has, so nothing is embedded twice. */
async function storedAlready(urls: string[]): Promise<Set<string>> {
  if (!urls.length) return new Set();
  try {
    const list = urls.map((u) => `"${u.replace(/"/g, '\\"')}"`).join(",");
    const res = await fetch(
      `${SB_URL}/rest/v1/textbook_figures?image_url=in.(${encodeURIComponent(list)})&select=image_url&limit=5000`,
      { headers: REST_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return new Set();
    const rows = await res.json() as { image_url?: string }[];
    return new Set(rows.map((r) => r.image_url ?? "").filter(Boolean));
  } catch {
    return new Set();
  }
}

interface State { cat: number; cont: string | null; done: boolean }

async function readState(): Promise<State> {
  const res = await fetch(
    `${SB_URL}/rest/v1/commons_shelf_state?id=eq.true&select=cat_index,continue_token,done`,
    { headers: REST_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!res.ok) return { cat: 0, cont: null, done: false };
  const rows = await res.json() as { cat_index?: number; continue_token?: string; done?: boolean }[];
  return {
    cat: Number(rows[0]?.cat_index ?? 0),
    cont: rows[0]?.continue_token ?? null,
    done: Boolean(rows[0]?.done),
  };
}

async function writeState(patch: Record<string, unknown>): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/commons_shelf_state?id=eq.true`, {
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

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const state = await readState();
  if (state.done && !body.force) {
    await writeState({ running_since: null });
    return new Response(JSON.stringify({ added: 0, done: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  const before = await figureCount();

  let cat = Math.min(Math.max(state.cat, 0), CATEGORIES.length - 1);
  let cont = state.cont;
  let seen = 0;
  let skipped = 0;
  let done = false;

  while (Date.now() < deadline) {
    const params: Record<string, string> = {
      action: "query",
      generator: "categorymembers",
      gcmlimit: "50",
      gcmtitle: CATEGORIES[cat],
      gcmtype: "file",
      iiextmetadatalanguage: "en",
      iiprop: "url|extmetadata",
      prop: "imageinfo",
    };
    if (cont) params.gcmcontinue = cont;

    const data = await api(params);
    if (!data) break;

    const pages = ((data.query as Record<string, unknown> | undefined)?.pages ?? {}) as Record<string, {
      title?: string;
      imageinfo?: { url?: string; extmetadata?: Record<string, { value?: string }> }[];
    }>;

    const candidates: Row[] = [];
    for (const page of Object.values(pages)) {
      seen += 1;
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      const url = info?.url ?? "";
      const licence = licenceUrl(String(meta.License?.value ?? ""));
      const caption = captionFor(meta.ImageDescription?.value, page.title ?? "");
      if (!url || !licence || !caption) { skipped += 1; continue; }

      const artist = stripTags(String(meta.Artist?.value ?? "")) || "OpenStax";
      const short = licence.includes("by-sa")
        ? "CC BY-SA"
        : licence.includes("zero") ? "public domain" : "CC BY";
      candidates.push({
        alt: "",
        attribution: `${artist}, via Wikimedia Commons, ${short}`.slice(0, 600),
        authors: [artist].slice(0, 6),
        // 🔴 NAMED AS THE COMMONS COLLECTION, NOT GUESSED FROM THE FILE. These come from several
        // OpenStax titles and the file does not reliably say which; inventing a book name would be
        // a citation the learner could check and find false.
        book_title: "OpenStax figures (Wikimedia Commons)",
        book_url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? "")}`,
        caption: caption.slice(0, 4000),
        chapter_index: 0,
        chapter_title: CATEGORIES[cat].replace("Category:", "").replace(/_/g, " "),
        image_url: url,
        licence,
      });
    }

    const have = await storedAlready(candidates.map((c) => c.image_url));
    const fresh = candidates.filter((c) => !have.has(c.image_url));

    for (let i = 0; i < fresh.length; i += EMBED_BATCH) {
      if (Date.now() >= deadline) break;
      const slice = fresh.slice(i, i + EMBED_BATCH);
      try {
        const vectors = await embedCaptions(slice.map((f) => f.caption));
        if (vectors.length !== slice.length) break;
        await insert(slice.map((f, n) => ({ ...f, embedding: vectors[n] })));
      } catch (e) {
        console.error("embed failed", (e as Error).message);
        break;
      }
    }

    const next = (data.continue as Record<string, string> | undefined)?.gcmcontinue ?? null;
    if (next) {
      cont = next;
    } else {
      cont = null;
      cat += 1;
      if (cat >= CATEGORIES.length) { cat = 0; done = true; break; }
    }
  }

  const after = await figureCount();
  const added = before !== null && after !== null ? Math.max(after - before, 0) : 0;

  await writeState({
    cat_index: cat,
    continue_token: cont,
    done,
    last_added: added,
    running_since: null,
  });

  return new Response(
    JSON.stringify({ added, category: CATEGORIES[cat], done, seen, skipped }),
    { headers: { "Content-Type": "application/json" } },
  );
});
