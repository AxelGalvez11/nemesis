// The phone's canvas + folder store — `public.learning_canvases` and `public.folders`.
//
// 🔴 WHY THIS FILE HAD TO BE WRITTEN AT ALL. Until now the phone's `api/` layer touched twenty
// tables and neither of these was among them: `grep -rn "learning_canvases" src` and
// `grep -rn '"folders"' src` both returned nothing. Every row in `learning_canvases` today was
// written by the web app. Nothing was blocked, though, and no backend work was needed — both
// tables are plain Postgres in the SAME Supabase project this client already signs into, both
// are owner-only on all four verbs (`using ((select auth.uid()) = user_id)`), and both
// `revoke all … from anon, authenticated` then `grant select, insert, update, delete … to
// authenticated`. The phone's signed-in JWT satisfies exactly the policies the browser's does.
// So: no RPC, no edge function, no view. One module, written directly against two tables.
//
// It mirrors two web modules query for query, and the mirroring is the point — two readers of
// one table that were written independently drift apart in silence, each looking correct alone:
//   `apps/web/lib/library/canvas-index.ts`  → searchCanvases (paged, searched, sorted, counted)
//   `apps/web/lib/learn/canvas-store.ts`    → the Library half: folders, rename, pin, file, delete
//
// 🔴 THE `localStorage` HALF OF `canvas-store.ts` IS DELIBERATELY NOT PORTED. That module keeps a
// browser-local mirror of every canvas and `deleteCanvas` touches `window.localStorage`
// unconditionally. The phone has no such mirror; porting it would mean either a crash or a shim
// pretending to a cache that does not exist. Every function below is cloud-only, and says so by
// returning a failure the caller can state rather than a silence the caller must guess at.
//
// 🔴 FILING IS NOT EVIDENCE. Nothing in this module may change what Nemesis asks next. It imports
// the supabase client and nothing from the learning or evidence path — moving a canvas into a
// folder is a fact about the student's shelf, not about the student. The web Library's own file
// header opens with the same sentence.
//
// 🔴 EVERY *FILTERED* WRITE CARRIES `.eq("user_id", uid)` BESIDE `.eq("id", …)`, which the web's
// version does not. RLS already scopes the row, so this is belt and braces — and it is the house
// pattern here: `api/cloudLibrary.ts` does it on every update and delete it issues. A policy that
// is changed by somebody else in six months should fail closed in two places, not one.
//
// 🔴 THE UPSERT IS THE ONE EXCEPTION, AND IT IS NOT AN OVERSIGHT. `saveCanvasTurn` cannot carry an
// `.eq()`: PostgREST does not apply filters to an upsert, so adding one would read as a guard while
// doing nothing. It carries `user_id` in the ROW instead, which is what the INSERT policy's
// `with check (auth.uid() = user_id)` actually tests — so the write still fails closed, just at the
// column rather than at a filter.
//
// 🔴 NO REALTIME SUBSCRIPTION, ON PURPOSE, AND NOT AS AN OVERSIGHT. `learning_canvases` is written
// on every canvas autosave from the web app. A paged, counted query re-run on each of those would
// thrash the list under a student who is reading it. Focus and pull-to-refresh are the refresh
// story until there is a reason for more.

import * as FileSystem from "expo-file-system/legacy";

// 🔴 ONE OF TWO IMPORTS THIS MODULE TAKES FROM OUTSIDE `api/` (this note read "THE ONLY IMPORT"
// until 2026-08-21; `remapCitationMarkers` below is the second, and its own comment says why).
// Neither is an exception to the layering — it is the house pattern: `api/cloudStudy.ts` and
// `api/documents.ts` already reach for the same generator. Hermes ships no `crypto.randomUUID`, the
// app bundles no `uuid` package and no `expo-crypto`, and `learning_canvases.id` is a `uuid`
// column — a non-uuid literal fails the insert outright. `generateUuidV4` is `Math.random`-based
// and documented as such where it lives; that is acceptable here for exactly the reason it is
// acceptable for `chat_threads.id` — these are row identifiers under owner-only RLS, not secrets —
// and a crypto polyfill would be a native module.
import { generateUuidV4 } from "@/lib/chat-threads";
// 🔴 THE SECOND OUTSIDE IMPORT, AND IT IS SHARED WITH THE WEB ON PURPOSE (owner 2026-08-21). The
// `[n]` marker grammar has exactly one definition in this repo — the phone and the web each kept
// their own copy of it until 2026-08-21 and drifted into the same two bugs — so the writer below
// renumbers markers THROUGH that module rather than matching `\[(\d{1,2})\]` a fourth time. It is a
// pure string transform with no React and no phone-only dependency, which is why `api/` may take
// it where it may not take anything from `components/`: see `linkUrl` for that rule.
import { remapCitationMarkers } from "@nemesis/shared/workspace/chat-citations";
import { supabase } from "./supabase";

const CANVASES = "learning_canvases";
const FOLDERS = "folders";

/** One page of the library. Mirrors the web's PAGE_SIZE exactly — the number is a product
 *  decision about how much of a library one request represents, not a transport detail, so the
 *  two apps must not each pick their own. */
export const PAGE_SIZE = 60;

/** The three orderings, one per thing worth ordering by. Same keys as the web's `CanvasSort`. */
export type CanvasSort = "recent" | "name" | "created";

/** A canvas as the Library needs to know it. Column-for-column the web's `CanvasSummary`, with
 *  one difference: `state` is selected and carried but NEVER rendered — see `CanvasRow.state`. */
export interface CanvasRow {
  id: string;
  title: string;
  /**
   * 🔴 SELECTED AND NEVER SHOWN, exactly as on the web. It is here so the shape matches the
   * table and a later reader does not have to widen the query to find out what is in it; it is
   * not here to be put on a row. A canvas's `state` is written by an autosave, and painting it
   * beside a title would be telling the student how far along their own thinking is.
   */
  state: string;
  updatedAt: string;
  createdAt: string;
  pinnedAt: string | null;
  folderId: string | null;
}

export interface CanvasFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt?: string;
}

export interface CanvasPage {
  rows: CanvasRow[];
  /** Exact number of canvases matching the query, before paging — the surface must be able to
   *  say "60 of 340" rather than quietly omitting 280. */
  total: number;
  page: number;
  /** True when `total` exceeds everything fetched so far. */
  more: boolean;
}

export interface CanvasQuery {
  /** Free text matched against the title, IN THE DATABASE. Empty means everything. */
  search?: string;
  /** `undefined` = every folder · `null` = Unfiled · a string = that folder. */
  folderId?: string | null | undefined;
  sort?: CanvasSort;
  page?: number;
}

interface CanvasRowShape {
  id: string;
  title: string | null;
  state: string | null;
  updated_at: string;
  created_at: string;
  pinned_at: string | null;
  folder_id: string | null;
}

const EMPTY_PAGE: CanvasPage = { more: false, page: 0, rows: [], total: 0 };

/** Postgres `like` treats these as wildcards; a student typing them means the characters.
 *  Duplicated from `components/library/canvas-rows.ts` rather than imported, so this module has
 *  no dependency outside `api/` — the same posture every other store here keeps. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toRow(row: CanvasRowShape): CanvasRow {
  return {
    createdAt: row.created_at,
    folderId: row.folder_id,
    id: row.id,
    pinnedAt: row.pinned_at,
    state: row.state ?? "",
    title: row.title ?? "",
    updatedAt: row.updated_at,
  };
}

/**
 * ONE page of the student's whole library — searched, scoped and sorted by the database.
 *
 * 🔴 THIS IS NOT `fetchAllRows` AND MUST NEVER BECOME IT. `api/supabase-paging.ts` exists to pull
 * an entire table in 1,000-row pages, which is right for the notes tree and wrong here: the web's
 * `canvas-index.ts` was written precisely to stop the library filtering a truncated page and
 * telling a student, confidently, that their canvas does not exist. Fetching everything to filter
 * it on the phone reintroduces the exact lie the module removed, one device further out.
 */
export async function searchCanvases(uid: string | null, query: CanvasQuery = {}): Promise<CanvasPage> {
  const page = Math.max(0, query.page ?? 0);
  const empty: CanvasPage = { ...EMPTY_PAGE, page };
  if (!uid) return empty;

  const search = (query.search ?? "").trim();

  let builder = supabase
    .from(CANVASES)
    .select("id,title,state,updated_at,created_at,pinned_at,folder_id", { count: "exact" })
    .eq("user_id", uid)
    .eq("deleted", false);

  // 🔴 SCOPING IS THREE-VALUED AND `null` IS NOT "NO FILTER". `undefined` means every folder;
  // `null` means Unfiled, which is `folder_id is null`. An `.eq(column, null)` matches NOTHING in
  // Postgres, so Unfiled would render empty and look like a student with no loose canvases —
  // which is indistinguishable from the truth and therefore the worst kind of bug this surface
  // can have.
  if (query.folderId !== undefined) {
    builder = query.folderId === null ? builder.is("folder_id", null) : builder.eq("folder_id", query.folderId);
  }

  // 🔴 IN THE QUERY. This is the line the whole module exists for.
  if (search) builder = builder.ilike("title", `%${escapeLike(search)}%`);

  const sort = query.sort ?? "recent";
  if (sort === "name") {
    builder = builder.order("title", { ascending: true });
  } else if (sort === "created") {
    // Newest first, like every other date order here. 🔴 NO `pinned_at` LEAD. Pinning means "keep
    // this within reach", a claim about now; leading a list ordered by when things were MADE with
    // the pinned ones would state a false chronology.
    builder = builder.order("created_at", { ascending: false });
  } else {
    builder = builder
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
  }

  // 🔴 THE ORDER MUST END IN A UNIQUE COLUMN. Titles collide, `updated_at` collides across rows
  // written in one transaction, and an order that is not total makes rows appear twice on one
  // page and never on the next. This repo has been bitten by exactly that shape before — see
  // `api/cloudLibrary.ts`'s paged fetch, which ends in `id` for the same reason.
  builder = builder.order("id", { ascending: true });

  const from = page * PAGE_SIZE;
  const { count, data, error } = await builder.range(from, from + PAGE_SIZE - 1);
  if (error || !data) throw new Error(error?.message ?? "Couldn't reach your canvases.");

  const rows = (data as CanvasRowShape[]).map(toRow);
  const total = count ?? rows.length;
  return { more: from + rows.length < total, page, rows, total };
}

/** Every folder the student has, ordered by name — the whole tree is at most two levels deep and
 *  a student's folder count is small, so this is one round trip and no paging. */
export async function listFolders(uid: string | null): Promise<CanvasFolder[]> {
  if (!uid) return [];
  const { data, error } = await supabase
    .from(FOLDERS)
    .select("id,name,parent_id,created_at")
    .eq("user_id", uid)
    .order("name");
  if (error || !data) throw new Error(error?.message ?? "Couldn't reach your folders.");
  return (data as { id: string; name: string; parent_id: string | null; created_at: string }[]).map((row) => ({
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
  }));
}

/** `check (char_length(title) <= 300)` on `learning_canvases`, enforced here so an over-long name
 *  is trimmed before the student sees it appear rather than rejected after. */
const TITLE_MAX = 300;
/** `check (char_length(name) between 1 and 120)` on `folders`. */
const FOLDER_NAME_MAX = 120;

/**
 * Create a folder, optionally inside another one.
 *
 * 🔴 IT THROWS RATHER THAN RETURNING NULL, WHICH IS THE ONE PLACE THIS DEPARTS FROM THE WEB.
 * `canvas-store.ts` returns null and logs; `canvas-manager.tsx` then reloads and shows nothing —
 * so creating a folder inside a level-2 folder trips `folders_depth_guard`, and the student
 * presses a drawn, enabled button that silently does nothing. The caller here disables the
 * control when the depth cap forbids it AND states this message if the database refuses anyway.
 */
export async function createFolder(uid: string, name: string, parentId: string | null): Promise<CanvasFolder> {
  const next = name.trim().slice(0, FOLDER_NAME_MAX);
  if (!next) throw new Error("A folder needs a name.");
  const { data, error } = await supabase
    .from(FOLDERS)
    .insert({ name: next, user_id: uid, ...(parentId ? { parent_id: parentId } : {}) })
    .select("id,name,parent_id,created_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "That folder wasn't created.");
  const row = data as { id: string; name: string; parent_id: string | null; created_at: string };
  return { createdAt: row.created_at, id: row.id, name: row.name, parentId: row.parent_id };
}

/** Rename a canvas. Returns the name that was actually STORED, so the caller renders the trimmed
 *  value instead of the raw input it optimistically painted. */
export async function renameCanvas(uid: string, id: string, title: string): Promise<string> {
  const next = title.trim().slice(0, TITLE_MAX);
  // An empty name is a cancelled rename, not a request for an untitled canvas — the list would
  // then carry a nameless row the student cannot tell from any other.
  if (!next) throw new Error("A canvas needs a name.");
  const { error } = await supabase.from(CANVASES).update({ title: next }).eq("id", id).eq("user_id", uid);
  if (error) throw new Error(error.message);
  return next;
}

export async function renameFolder(uid: string, id: string, name: string): Promise<string> {
  const next = name.trim().slice(0, FOLDER_NAME_MAX);
  if (!next) throw new Error("A folder needs a name.");
  const { error } = await supabase.from(FOLDERS).update({ name: next }).eq("id", id).eq("user_id", uid);
  if (error) throw new Error(error.message);
  return next;
}

/** Pin or unpin. 🔴 PINNING STAMPS A TIME, NOT A FLAG, so the pinned block keeps a stable order of
 *  its own instead of re-shuffling every time an unrelated canvas is touched. */
export async function setCanvasPinned(uid: string, id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase
    .from(CANVASES)
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) throw new Error(error.message);
}

/** File a canvas into a folder, or `null` to take it out of every folder (Unfiled). */
export async function setCanvasFolder(uid: string, id: string, folderId: string | null): Promise<void> {
  const { error } = await supabase
    .from(CANVASES)
    .update({ folder_id: folderId })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) throw new Error(error.message);
}

/** Re-parent a folder. `null` puts it back at the top level. The DEPTH rule is the caller's
 *  (`canReparentFolder`), because the folder tree is known there; `folders_depth_guard` is the
 *  backstop and its message arrives here as the thrown error. */
export async function setFolderParent(uid: string, id: string, parentId: string | null): Promise<void> {
  if (id === parentId) return;
  const { error } = await supabase
    .from(FOLDERS)
    .update({ parent_id: parentId })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) throw new Error(error.message);
}

/**
 * Delete a canvas. SOFT — the row is flagged, never removed.
 *
 * 🔴 AND WHAT THE STUDENT HAS ALREADY WORKED THROUGH SURVIVES BY SCHEMA, NOT BY THIS FUNCTION
 * REMEMBERING: `learner_evidence.canvas_id` is `on delete set null`. That is what the confirming
 * copy on the surface is entitled to promise.
 *
 * 🔴 THE WEB'S `localStorage` LINES ARE NOT PORTED. `canvas-store.ts` removes a browser-local
 * copy first and does so unconditionally, before the `userId` guard. There is no phone-local copy
 * to remove, and inventing one to keep the shapes identical would be a cache with no writer.
 */
export async function deleteCanvas(uid: string, id: string): Promise<void> {
  const { error } = await supabase.from(CANVASES).update({ deleted: true }).eq("id", id).eq("user_id", uid);
  if (error) throw new Error(error.message);
}

/**
 * Delete a folder. **Never the canvases inside it.**
 *
 * 🔴 THE CANVASES RETURN TO UNFILED BY SCHEMA — `learning_canvases.folder_id … on delete set
 * null` — not because this function moves them. Nulling the column here as well would work today
 * and would hide the guarantee if the constraint were ever changed.
 *
 * 🔴 `folders.parent_id` IS `on delete cascade`, SO SUBFOLDERS GO WITH IT. Their canvases also
 * return to Unfiled, because each child's own `set null` fires. No canvas is lost at any depth —
 * but the student has to be TOLD the subfolders are going, and no constraint will ever enforce
 * that. The caller owns the confirmation copy.
 */
export async function deleteFolder(uid: string, id: string): Promise<void> {
  const { error } = await supabase.from(FOLDERS).delete().eq("id", id).eq("user_id", uid);
  if (error) throw new Error(error.message);
}

// --- the one cached slice ------------------------------------------------------------------
//
// 🔴 PAGE 0 OF THE DEFAULT SCOPE AND SORT, PLUS THE FOLDER LIST. NOTHING ELSE, AND THIS IS AN
// HONESTY DECISION RATHER THAN A BUDGET ONE. The classic notes tree cached the WHOLE library and
// rendered it instantly, offline included, because "every non-deleted row" is a complete answer
// that can be stored. A paged, searched, sorted query has no equivalent: a cache of page 2 of a
// name-sorted search is a cache of a question nobody will ask twice, and serving it later would
// mean showing rows that no longer match the query the student is looking at.
//
// So exactly one slice is cached — the one the surface opens on — and every other scope, sort,
// page and search goes to the network with the skeleton up and says plainly when it cannot get
// there. An empty list that looks like an empty account is the failure being avoided.

interface DiskCache {
  v: 1;
  folders: CanvasFolder[];
  rows: CanvasRow[];
  total: number;
}

const EMPTY_CACHE: DiskCache = { folders: [], rows: [], total: 0, v: 1 };

/** Keyed by uid, so a stale cache from a previous account can never leak into a new one on the
 *  same device — the same rule `api/cloudLibrary.ts` follows. */
const cachePathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}canvas-library-cache-v1-${uid}.json`;

export interface CachedCanvasLibrary {
  folders: CanvasFolder[];
  rows: CanvasRow[];
  total: number;
  /** False when there was nothing cached — the caller must NOT render this as an empty library. */
  hit: boolean;
}

/** Cache-only read. Never throws, never touches the network. */
export async function loadCachedCanvases(uid: string | null): Promise<CachedCanvasLibrary> {
  if (!uid) return { ...EMPTY_CACHE, hit: false };
  try {
    const path = cachePathFor(uid);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return { ...EMPTY_CACHE, hit: false };
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as Partial<DiskCache> | null;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.rows) || !Array.isArray(parsed.folders)) {
      return { ...EMPTY_CACHE, hit: false };
    }
    return {
      folders: parsed.folders,
      hit: true,
      rows: parsed.rows,
      total: typeof parsed.total === "number" ? parsed.total : parsed.rows.length,
    };
  } catch {
    return { ...EMPTY_CACHE, hit: false };
  }
}

/** Replace the cached slice. Best effort: the worst case is that the next open re-fetches. */
export async function cacheCanvases(
  uid: string,
  slice: { folders: CanvasFolder[]; rows: CanvasRow[]; total: number },
): Promise<void> {
  try {
    const cache: DiskCache = { folders: slice.folders, rows: slice.rows, total: slice.total, v: 1 };
    await FileSystem.writeAsStringAsync(cachePathFor(uid), JSON.stringify(cache));
  } catch {
    // best-effort by design — see loadCachedCanvases
  }
}

// --- reading ONE canvas back ------------------------------------------------------------------
//
// 🔴 ADDED 2026-08-20 (owner: "users should be able to use the library to access older canvases").
// Until now nothing in this module selected `document` — the Library could rename, pin, file and
// delete a canvas but could not open one, and `components/library/CanvasManagerBody.tsx` held that
// as a deliberate hole rather than shipping a tap that navigated nowhere. This is the reader that
// closes it, and it is in THIS file rather than beside the surface that renders it for the reason
// the module header already gives: two independently written readers of one table drift apart in
// silence, each looking correct on its own.
//
// 🔴 `document` IS `jsonb` AND MAY BE ANYTHING. `apps/web/lib/learn/canvas-store.ts`'s
// `canvasFromRow` / `normaliseCanvas` exist because real production rows predate half the fields
// they define — rows with no `responses`, rows carrying legacy stage names, rows whose `events`
// were silently dropped on every cloud read for a while. Casting the jsonb straight to a type
// crashes or silently loses data on the owner's own canvases. Every read below is guarded, and a
// row this function cannot make sense of comes back as a canvas with no blocks rather than as an
// exception thrown into a render.
//
// 🔴 IT NOW WRITES, AND THE OLD PROHIBITION HERE WAS LEFT STANDING FOR ONE COMMIT TOO LONG. This
// paragraph used to read "IT SELECTS, IT NEVER WRITES. In particular it must never grow into a
// partial upsert" — and then `saveCanvasTurn` grew into exactly that, four hundred lines below a
// comment forbidding it. The rule it was protecting is still real and still binding, so it is
// restated as a rule about HOW to write rather than a ban on writing:
//
//   `canvas-store.ts` records a measured proof (2026-08-13, with a positive control) that NAMING
//   `territory` in a partial write NULLS it, and that unlisted columns survive. 22 of the 52 live
//   rows carry a territory, and nulling one costs a model call per open with no visible symptom.
//   `updated_at` is likewise owned by a database trigger — a phone sending it would reorder the
//   student's library from a wrong device clock. So the writer names EIGHT columns and no others,
//   and `deleted`, `pinned_at` and `folder_id` are left off for the same reason: a re-upsert must
//   not undo the student's own filing.

/** One block of a stored canvas's document. `type` is `CanvasBlockType` on the web; it is carried
 *  as a plain string here because the phone renders three of the seven differently and treats the
 *  rest as prose — narrowing it would mean vendoring a union that only the web can keep honest. */
export interface StoredCanvasBlock {
  id: string;
  type: string;
  content: string;
}

/** A canvas as the phone's reading surface needs it. Deliberately a SUBSET of the web's
 *  `LearningCanvas`: `document` also holds concepts, recall results, the learner's own responses,
 *  corrective attempts, outputs and telemetry, and none of those have a phone surface yet. Reading
 *  a field in order to not render it is how a "loading" state ends up waiting on data nobody
 *  shows. */
/**
 * One source a stored canvas holds — the web's `CanvasSource`, narrowed to the two facts the
 * phone can actually act on.
 *
 * 🔴 `url` IS `null` FOR AN UPLOADED FILE AND THAT IS A FACT, NOT A GAP. `canvas-model.ts` states
 * it on the field itself: `sourceUrl` is absent for every source that is not a pasted link, and
 * absent must be read as "not a link", never as "the URL was lost". A pill is only ever built for
 * a source that has one — see `CanvasDocument`, which drops the rest into silence rather than
 * drawing a control that goes nowhere.
 *
 * 🔴 AN ENTRY WITH NO TITLE *AND* NO URL IS A HELD POSITION, NOT A SOURCE (owner 2026-08-21). It
 * draws nothing anywhere — no pill, no chip — and exists so that the entries after it keep their
 * numbers, because a stored `[n]` marker in a block indexes this list by position. `sourcesFrom`
 * explains what used to happen when those entries were skipped instead.
 *
 * The excerpt text, coverage note, durability, parse quality and library id are all deliberately
 * NOT read: the phone has no surface for a document preview, and reading a field in order to not
 * render it is how a "loading" state ends up waiting on data nobody shows.
 */
export interface StoredCanvasSource {
  id: string;
  title: string;
  url: string | null;
}

export interface StoredCanvas {
  id: string;
  title: string;
  level: string | null;
  blocks: StoredCanvasBlock[];
  /** 🔴 READ SINCE THE PHONE STARTED WRITING THEM. Before the writer below existed this was
   *  omitted, which was right at the time: nothing on the phone put anything in `document.sources`
   *  and nothing rendered them, so a reopened canvas showing no provenance was showing the truth.
   *  A phone-written turn now stores the pages its answer cited, and a canvas that carries
   *  provenance and hides it on reopen is a worse claim than one that never had any. */
  sources: StoredCanvasSource[];
  createdAt: string;
  updatedAt: string;
}

/** Anything that is not an array becomes an empty one — see the section header. */
function blocksFrom(document: unknown): StoredCanvasBlock[] {
  if (typeof document !== "object" || document === null) return [];
  const raw = (document as { blocks?: unknown }).blocks;
  if (!Array.isArray(raw)) return [];
  const blocks: StoredCanvasBlock[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const block = entry as { id?: unknown; type?: unknown; content?: unknown };
    const content = typeof block.content === "string" ? block.content : "";
    // A block with no text is not a gap to be drawn as an empty paragraph; it is nothing.
    if (!content.trim()) continue;
    blocks.push({
      content,
      id: typeof block.id === "string" && block.id ? block.id : `b${blocks.length}`,
      type: typeof block.type === "string" ? block.type : "paragraph",
    });
  }
  return blocks;
}

/**
 * The sources of a stored document, guarded the same way `blocksFrom` is — see the section header.
 *
 * 🔴 ONE ENTRY IN, ONE ENTRY OUT, AT THE SAME POSITION — AND IT USED TO SKIP (owner 2026-08-21).
 * This read `if (!title && !url) continue`, on the reasonable-sounding ground that a source with
 * neither a name nor an address is nothing to show. It IS nothing to show, and skipping it was
 * still wrong, because this list is not only a list: a `[n]` marker stored in a block is an INDEX
 * INTO IT, resolved by position in `CanvasDocument` and then in `MessageBody`. Dropping entry two
 * of four moves sources three and four up one, so every marker above the gap silently names the
 * wrong publication — the same confident-wrong-chip failure the save path was fixed for on the same
 * day, arriving from the read side instead. The unusable entry now comes back as an empty slot
 * (`title: ""`, `url: null`) and holds its place.
 *
 * 🔴 AN EMPTY SLOT DRAWS NOTHING, WHICH IS WHY KEEPING IT IS SAFE RATHER THAN MERELY CORRECT.
 * `sourcePills` refuses any source it cannot resolve to an http(s) address, so no pill is built for
 * one; `MessageBody`'s citation branch refuses a chip over an empty url and leaves the bare number
 * in the prose. So the slot is invisible on both halves of the surface and visible only to the
 * arithmetic that needs it. `CanvasDocument` is the only reader of `StoredCanvas.sources` there is.
 *   TRIED AND REJECTED: keeping the skip here and compensating at save time by numbering markers
 *   against the post-skip list. That makes the phone's stored numbering depend on the phone's own
 *   reader, so the SAME document would resolve differently in a build whose skip rule differs — and
 *   the web, which reads `canvas.sources` straight out of the jsonb, would be wrong immediately.
 */
function sourcesFrom(document: unknown): StoredCanvasSource[] {
  if (typeof document !== "object" || document === null) return [];
  const raw = (document as { sources?: unknown }).sources;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    // A non-object entry is not a source, but it is still a position: the web numbers its own
    // citation marks off `canvas.sources` positions too (`citationIndices`, canvas-document.tsx).
    const source = (typeof entry === "object" && entry !== null ? entry : {}) as {
      id?: unknown;
      title?: unknown;
      sourceUrl?: unknown;
    };
    const title = typeof source.title === "string" ? source.title.trim() : "";
    const url = typeof source.sourceUrl === "string" ? source.sourceUrl.trim() : "";
    return {
      id: typeof source.id === "string" && source.id ? source.id : `s${index + 1}`,
      title,
      url: url || null,
    };
  });
}

/**
 * One canvas, by id, with its document.
 *
 * Returns `null` when the row does not exist, belongs to somebody else, or has been deleted — all
 * three are the same thing to the surface: there is nothing here to open, and it should say so
 * rather than sit on a spinner. Throws only on a transport failure, which is a different sentence.
 *
 * 🔴 `.eq("user_id", uid)` SITS BESIDE `.eq("id", …)`. RLS already scopes the row; this is the
 * belt-and-braces posture every write in this module keeps, for the reason the module header
 * gives — a policy changed by somebody else in six months should fail closed in two places.
 */
export async function loadCanvas(uid: string | null, id: string): Promise<StoredCanvas | null> {
  if (!uid || !id) return null;
  const { data, error } = await supabase
    .from(CANVASES)
    .select("id,title,level,document,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", uid)
    .eq("deleted", false)
    .maybeSingle();
  if (error) throw new Error(error.message || "Couldn't reach that canvas.");
  if (!data) return null;
  const row = data as {
    id: string;
    title: string | null;
    level: string | null;
    document: unknown;
    created_at: string;
    updated_at: string;
  };
  return {
    blocks: blocksFrom(row.document),
    createdAt: row.created_at,
    id: row.id,
    level: row.level,
    sources: sourcesFrom(row.document),
    title: row.title ?? "",
    updatedAt: row.updated_at,
  };
}

// --- WRITING ONE CANVAS BACK --------------------------------------------------------------
//
// 🔴 ADDED 2026-08-20 (owner: "fix the canvas read only issue" · "i need user to be able to reopen
// canvases"). Those are one request. Until this section existed the phone could OPEN a canvas and
// never WROTE one, so there was nothing of the phone's own to reopen — the file header above and
// `app/(tabs)/learn.tsx`'s "still deliberately absent" note both said so in as many words. This
// closes it, and it is the FIRST time anything other than the browser has written this table.
//
// 🔴🔴 IT MIRRORS `canvasToRow` (apps/web/lib/learn/canvas-store.ts) COLUMN FOR COLUMN AND SENDS
// EXACTLY EIGHT: id · user_id · title · state · level · active_ms · created_at · document. Not
// seven, not nine. The columns that are ABSENT are the load-bearing part of the design, so each
// one is named here rather than left to be noticed:
//
//   * `territory` — 🔴 NEVER. It is `jsonb`, it is populated on a large share of production rows,
//     and it is the one column the in-memory canvas never carries. Naming it in a partial upsert
//     writes `undefined` over a territory built minutes earlier; unlisted columns survive. That
//     was measured on the web on 2026-08-13 with a positive control. The only symptom of getting
//     it wrong is that topic canvases quietly start costing a model call per open again — no
//     error, no warning, nothing on any screen. Do not add it.
//   * `updated_at` — owned by the trigger `learning_canvases_touch`. A phone clock that is four
//     minutes fast would reorder the student's whole library.
//   * `deleted`, `pinned_at`, `folder_id` — unlisted, so a student's filing and pinning survive
//     every write from here. See `readRowForWrite`, which refuses outright to write into a row
//     that has been deleted rather than resurrecting it by accident or hiding the answer in it.
//
// 🔴🔴 IT IS A READ-MODIFY-WRITE, AND THAT IS NOT CAUTION — IT IS THE ONLY CORRECT SHAPE. Five of
// the eight columns describe the canvas AS A WHOLE, not this turn:
//
//     title      a rename the student made in either Library
//     level      a level the learner expressed, which this app has no way to know
//     active_ms  time already accumulated on the web (one production row is at ~51.9 million)
//     created_at the canvas's real birthday, which must not move on every save
//     document   twelve keys besides `blocks` — concepts, recall, the learner's own free
//                responses, corrective attempts, outputs, telemetry
//
// Sending a fresh value for any of those from a phone that has never seen them DESTROYS them. So
// the row is read first and every field the phone is not deliberately changing is carried across
// byte for byte — including document keys this build has never heard of, which is why the
// envelope is built by spreading the stored document rather than from a literal.
//
// 🔴 AND THE STORED BLOCKS ARE CARRIED FROM THE RAW JSONB, NOT FROM `blocksFrom`. That reader
// narrows a block to `{id, type, content}` on purpose, because that is all this phone renders.
// Round-tripping a web-written canvas through it would silently delete every block's
// `sourceRefs`, `conceptIds`, `terms`, `note`, `collapsed`, `known`, `readAt`, `previousContent`
// and `visual` — the learner's own annotations among them. The append below never touches an
// existing block object.
//
// 🔴🔴 AND THE ONE THING THAT IS *NOT* CARRIED THROUGH BYTE FOR BYTE IS THE CITATION NUMBER IN A
// NEW BLOCK'S OWN TEXT (owner 2026-08-21). The rest of this section is about preserving what is
// already stored; this is the opposite duty, and it applies only to the text this turn is adding.
// A `[2]` written by the model counts the results THAT TURN was given — `formatWebSearchContext`
// numbers `usableWebResults` from 1 every time — and it is being filed into a source list that
// spans every turn the canvas has ever had. Stored unchanged, a reopened canvas resolved it by
// position and named a different publication: a citation chip that is confidently wrong, which is
// worse than no chip at all. `mergeTurnSources` and `renumberTurnMarkers` rewrite those numbers at
// save time so that a stored `[n]` means `document.sources[n-1]` and needs no memory of which turn
// wrote it — which is the only contract a reader months later, or the web app, can rely on.

/**
 * The seven types the web's `CanvasBlockType` union allows, vendored here FOR WRITING ONLY.
 *
 * 🔴 THE ASYMMETRY WITH `StoredCanvasBlock.type` (a plain `string`) IS DELIBERATE. Reading has to
 * be permissive: a stored block carries whatever the web wrote, including a type a future build
 * introduces, and narrowing the reader would mean vendoring a union only the web can keep honest.
 * Writing is the opposite problem — a type string the web's renderer does not know drops into its
 * `default:` arm and is drawn as a paragraph forever, with nothing anywhere saying so — so the
 * phone must be incapable of inventing one. Quoted from `apps/web/lib/learn/canvas-model.ts`.
 */
export const CANVAS_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "concept",
  "example",
  "callout",
  "citation",
  "question",
] as const;
export type CanvasWriteBlockType = (typeof CANVAS_BLOCK_TYPES)[number];

/** A block the phone wants to add. The id is minted by the writer, never by the caller — see
 *  `mintBlockId` for why it has to be unique within the canvas and distinct from the web's. */
export interface CanvasBlockDraft {
  type: CanvasWriteBlockType;
  content: string;
}

/** A page the answer cited. Structurally `ChatSource` minus its description, so `sendChat`'s own
 *  results pass straight through without a mapping step that could drop the URL. */
export interface CanvasSourceDraft {
  title: string;
  url: string;
}

export interface CanvasTurn {
  blocks: readonly CanvasBlockDraft[];
  sources: readonly CanvasSourceDraft[];
  /**
   * The name to give a canvas that does not have one yet — on the phone, the student's own first
   * question.
   *
   * 🔴 IT IS A FALLBACK, NOT A NAME, AND THE ASYMMETRY IS THE POINT. A canvas that already has a
   * title keeps it, exactly as the web's `mergeSourceIntoCanvas` does ("the first source names the
   * canvas; later ones never rename it, and neither ever overwrites a title the learner typed"),
   * so a rename made in either Library survives the next phone turn.
   *
   * 🔴 AND IT IS NEVER THE STRING "Untitled canvas". Nothing writes that into this column: it is a
   * render-time fallback in the web Library for rows whose `title` is `''`, the column's own
   * default. Storing it would turn a display fallback into data, and the Library could no longer
   * tell "never named" from "named that".
   */
  fallbackTitle: string;
}

/**
 * What a save actually did. THREE outcomes, not two, and the third is the reason this returns a
 * value instead of throwing like every other write in this module.
 *
 * 🔴 THE HONESTY RULE THIS FOLLOWS IS `CanvasManagerBody`'s `fileAndVerify`: write, then RE-READ,
 * then say plainly which of the three happened. "The request did not go through" and "the request
 * went through and we cannot confirm it landed" are different sentences to a student — only one of
 * them is worth retrying, and only one of them means the answer on screen is the only copy.
 */
export type CanvasSaveOutcome =
  /** Written and read back. `canvas` is the row as it now stands, ready to render. */
  | { status: "saved"; canvas: StoredCanvas }
  /** Nothing was written. The answer on screen is the only copy and the caller must keep it up. */
  | { status: "failed"; message: string }
  /** Possibly written, could not be confirmed. Same duty on the caller, different sentence. */
  | { status: "unverified"; message: string };

/** A brand-new canvas id. 🔴 A REAL UUID v4 — `learning_canvases.id` is a `uuid` column, so the
 *  web's local-mirror fallback format (`c_<base36>_<rand>`) would be rejected by Postgres
 *  outright. That format is only ever valid for the browser's localStorage half, which this
 *  module deliberately does not port. */
export function mintCanvasId(): string {
  return generateUuidV4();
}

/** `1t3k9f` — enough entropy for one canvas, which is all a block id has to be unique within.
 *  🔴 THE `pb_` PREFIX IS PHONE-DISTINCT ON PURPOSE. The web mints `b_<counter36>_<rand6>` from a
 *  per-session counter, and its `replace_block` / `annotate_block` ops look blocks up by id; two
 *  independent generators sharing a format is a collision waiting for the one canvas both apps
 *  wrote to. */
function mintBlockId(taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = `pb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
  return `pb_${generateUuidV4()}`;
}

/** The next free `s<n>`, which is the web's own source-id format. Web computes it as
 *  `s${sources.length + 1}` and its own comment flags that as unsafe once a source is removed;
 *  scanning for a free one costs nothing and cannot collide. */
function nextSourceId(taken: ReadonlySet<string>): string {
  let n = taken.size + 1;
  while (taken.has(`s${n}`)) n += 1;
  return `s${n}`;
}

/** A URL worth storing as a source's `sourceUrl`, or null.
 *
 *  🔴 http(s) ONLY, and duplicated from `components/canvas/canvas-sources.ts`'s `hostOf` rather
 *  than imported — `api/` does not depend on `components/`, which is the layering every other
 *  store here keeps (see `escapeLike` at the top of this file for the same call). The check is not
 *  cosmetic: `sourceUrl` becomes an `<a href>` on the web's source pill, and a `javascript:` or
 *  `data:` href that reached it would not be a source, it would be an instruction. */
function linkUrl(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname ? trimmed : null;
  } catch {
    return null;
  }
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Where one of THIS TURN's `[n]` markers lands in the stored canvas: a 1-based index into
 * `document.sources`, or `"drop"` for a cited page that could not be stored at all.
 */
export type StoredMarkerHome = number | "drop";

export interface MergedTurnSources {
  /** The canvas's whole source list after this turn — prior entries first, untouched. */
  sources: unknown[];
  /** One entry per `turn.sources` entry, IN THE SAME ORDER, because that order is the numbering
   *  the model was given. `homes[0]` is where the turn's `[1]` belongs once stored. */
  homes: readonly StoredMarkerHome[];
}

/**
 * Merge one turn's cited pages into the canvas's cumulative source list, and say where each of the
 * turn's citation numbers ends up.
 *
 * 🔴🔴 THE `homes` HALF IS THE BUG FIX, AND IT IS WHY THIS IS A FUNCTION RATHER THAN A LOOP INSIDE
 * `saveCanvasTurn` (owner 2026-08-21). A `[2]` in an answer is a POSITIONAL INDEX INTO THE RESULTS
 * THAT TURN WAS GIVEN — `formatWebSearchContext` numbers `usableWebResults` from 1 on every single
 * turn — while this list is CUMULATIVE. Three separate shifts came out of that, all of them
 * rendering a chip that confidently names the wrong publication when the canvas is reopened:
 *   1. TURN BOUNDARIES. On a two-turn canvas, turn two's `[1]` sat beside turn one's first source,
 *      so it resolved to a page the sentence had never seen. This is the one the owner reproduced.
 *   2. THE TWO SKIPS BELOW. A page whose URL is not http(s) is not stored, and a page already in
 *      the canvas is not stored twice. `usableWebResults` (lib/chat-thread.ts), the list the MODEL
 *      counted over, applies NEITHER rule — it keeps anything with a url plus a title or a
 *      description, in the order the search returned it. So even WITHIN one turn the two lists
 *      disagreed by construction, and every skip shifted every later marker by one.
 *   3. THE READ SIDE. `sourcesFrom` used to skip a stored entry with neither title nor address,
 *      shifting again on the way back out. That skip is gone; see its own comment.
 * The answer to all three is the same: the marker's number is rewritten AT SAVE TIME into the
 * position it actually occupies here, so a stored `[n]` means `document.sources[n-1]` and nothing
 * else — no memory of which turn wrote it, which is the only thing a reader months later, or the
 * web app, can possibly rely on.
 *   TRIED AND REJECTED: storing each turn's sources in the block instead, so numbering could stay
 *   turn-local. `CanvasBlock` has no field for it — the web's own provenance channel is
 *   `sourceRefs`, which points at excerpts these sources do not have — so it would mean inventing a
 *   key the web's `canvasFromRow` drops on the next save.
 *   TRIED AND REJECTED: matching by URL at read time rather than renumbering. The stored block
 *   keeps only the number; the URL it stood for is exactly what is not written down.
 *
 * A DUPLICATE IS NOT A DROP. A page cited in turn one and again in turn two is stored once, and the
 * second turn's marker is pointed at the entry that is already there — the same page, correctly
 * named, which is the whole intent of the citation.
 *
 * `"drop"` is reserved for the page with NO storable address (`linkUrl` refuses anything that is
 * not http(s), because `sourceUrl` becomes an `<a href>` on the web's source pill). There is no
 * position for that marker to point at, so `renumberTurnMarkers` deletes the marker rather than
 * leaving a number that would land on some other publication. It costs the sentence its mark; it
 * cannot cost the reader a false attribution.
 */
export function mergeTurnSources(
  priorSources: readonly unknown[],
  turnSources: readonly CanvasSourceDraft[],
): MergedTurnSources {
  const takenSourceIds = new Set<string>();
  // Keyed by URL, valued by 1-BASED POSITION, so a repeat citation can be pointed at the entry that
  // already holds that page. The first position wins if a canvas somehow holds the same URL twice.
  const positionByUrl = new Map<string, number>();
  priorSources.forEach((source, index) => {
    const shape = record(source);
    if (typeof shape.id === "string" && shape.id) takenSourceIds.add(shape.id);
    if (typeof shape.sourceUrl !== "string") return;
    const key = shape.sourceUrl.trim().replace(/\/+$/, "");
    if (key && !positionByUrl.has(key)) positionByUrl.set(key, index + 1);
  });

  const sources = [...priorSources];
  const homes: StoredMarkerHome[] = [];
  for (const source of turnSources) {
    const url = linkUrl(source.url);
    if (!url) {
      homes.push("drop");
      continue;
    }
    const key = url.replace(/\/+$/, "");
    const already = positionByUrl.get(key);
    if (already !== undefined) {
      homes.push(already);
      continue;
    }
    const id = nextSourceId(takenSourceIds);
    takenSourceIds.add(id);
    // The exact shape the web's own `canvas-store` test uses for a pasted link:
    // `{ id, title, kind: "text", excerpts: [], sourceUrl }`.
    sources.push({
      // 🔴 `ephemeral`, STATED RATHER THAN OMITTED. A page the model cited was read and not filed;
      // it can teach this canvas perfectly well and must not pretend to support cross-session
      // identity, search or future provenance. `canvas-model.ts` is explicit that an ABSENT
      // durability means UNKNOWN, never durable — so saying which it is, is strictly better.
      durability: "ephemeral",
      // 🔴 EMPTY, HONESTLY. The phone never extracted this page; it has a title and an address and
      // no text. Inventing an excerpt from the answer's own words would attribute Nemesis's
      // sentences to the publisher.
      excerpts: [],
      id,
      kind: "text",
      sourceUrl: url,
      // `?? ""` rather than a bare `.trim()`: `ChatSource.title` is typed `string`, but these
      // arrive from a live search result over the wire, and a crash inside the save would lose the
      // answer that the save exists to keep.
      title: (source.title ?? "").trim() || url,
    });
    positionByUrl.set(key, sources.length);
    homes.push(sources.length);
  }
  return { homes, sources };
}

/**
 * One block's text, with this turn's citation numbers rewritten into canvas-wide stored ones.
 *
 * 🔴 A MARKER PAST THE END OF `homes` IS LEFT EXACTLY AS THE MODEL WROTE IT. `[7]` on a turn that
 * was handed three results never pointed at anything — the model invented it — and at render time
 * `citationsToMarkdown` rewrites only markers inside `1..sources.length`, so an out-of-range one is
 * drawn as plain digits rather than as a chip. Renumbering it is impossible (there is no source to
 * renumber it to, which is the whole problem with it) and deleting it
 * would be editing the model's prose on a guess. It stays, and it stays wrong in exactly the way it
 * was already wrong, which is the smallest thing this pass can do to it.
 *   🔴 AND THE RESIDUAL IS WRITTEN DOWN RATHER THAN GLOSSED: a canvas that later accumulates seven
 *   sources will draw that invented `[7]` as a chip naming source seven. That is not new behaviour
 *   and this pass does not make it more likely; it is stated so the next reader does not discover
 *   it as a surprise. Fixing it means deciding that an out-of-range marker is noise and deleting
 *   it, which is an owner call about the model's text, not a mechanical one.
 *
 * 🔴 THE MARKER GRAMMAR COMES FROM `@nemesis/shared/workspace/chat-citations` AND IS NOT RESTATED
 * HERE. That module owns the two-digit shape, the "not already a markdown link" guard, the
 * code-fence split, and the two guards that keep `[the trial][1]` and a `[1]: https://…` definition
 * line from being treated as citations. A fourth hand-written copy of that regex is precisely what
 * that module was created to end.
 */
function renumberTurnMarkers(content: string, homes: readonly StoredMarkerHome[]): string {
  if (homes.length === 0) return content;
  return remapCitationMarkers(content, (marker) => homes[marker - 1] ?? "keep");
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * A streamed answer, cut into canvas blocks.
 *
 * 🔴 `paragraph` IS THE TYPE, AND CHOOSING IT IS A DECISION RATHER THAN A DEFAULT. The union's
 * other members each make a claim: `concept` is a bordered statement of ONE idea the lesson
 * teaches, `example` and `callout` are demoted secondary asides, `citation` is 12px grey, and
 * `question` is the one thing on a canvas addressed TO the learner. A reply to something the
 * student asked is none of those — it is body prose, which is `paragraph`, and it is the type of
 * every block that exists in this table today.
 *
 * 🔴 SPLIT ON BLANK LINES, ONE BLOCK PER PARAGRAPH, RATHER THAN ONE BLOCK FOR THE WHOLE ANSWER.
 * The phone renders a block's content through `MessageBody` (markdown) and would not care; the WEB
 * renders it as the text of a single `<p>`, so a four-paragraph answer stored whole arrives there
 * as one unbroken wall. The web's own renderer is what makes this a correctness question rather
 * than a taste one.
 *
 * 🔴 A LONE MARKDOWN HEADING LINE BECOMES A `heading` BLOCK. That is a translation of something the
 * model actually wrote, not structure invented from prose: left as a paragraph it would render on
 * the web as the literal characters "## Mechanism". Nothing else is reinterpreted — the remaining
 * markdown (bold, lists, tables) still renders on the phone and still arrives on the web as its
 * own source text, which is a real limitation and is stated rather than papered over.
 *
 * 🔴 FENCED CODE IS NOT SPLIT. A ``` block contains blank lines; cutting inside one would break
 * the fence and turn working code into three broken fragments.
 */
export function blocksForAnswer(answer: string): CanvasBlockDraft[] {
  const text = answer.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let fenced = false;
  const flush = () => {
    const joined = current.join("\n").trim();
    if (joined) chunks.push(joined);
    current = [];
  };
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      current.push(line);
      continue;
    }
    if (!fenced && !line.trim()) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  return chunks.map((chunk) => {
    const heading = !chunk.includes("\n") ? /^#{1,6}[ \t]+(.+?)\s*#*$/.exec(chunk) : null;
    const headingText = heading?.[1]?.trim();
    return headingText
      ? { content: headingText, type: "heading" as const }
      : { content: chunk, type: "paragraph" as const };
  });
}

/** `check (char_length(title) <= 300)`, and one run of whitespace per space so a question typed
 *  across three lines does not become a three-line row in the Library. */
function titleFor(asked: string): string {
  return asked.trim().replace(/\s+/g, " ").slice(0, TITLE_MAX);
}

/** `learning_canvases.state` values in which the web PAINTS the document — `READING_STATES` in
 *  `apps/web/lib/learn/canvas-hosting.ts`. */
const READING_STATES = new Set(["orient", "learn", "targeted_relearn"]);
/** …and the two in which it paints the pre-content invitation instead, blocks or no blocks. */
const PRE_CONTENT_STATES = new Set(["empty", "sources_attached"]);

/**
 * What `state` a canvas should be in once the phone has written a block into it.
 *
 * 🔴🔴 THIS IS THE HIGHEST-RISK FIELD IN THE WHOLE WRITE AND ITS FAILURE MODE IS SILENT. A row
 * left at `empty` or `sources_attached` stores its blocks perfectly, reads back perfectly through
 * the web's `canvasFromRow`, and PAINTS NOTHING — `composeSurface` hands back the pre-content
 * invitation, `canvas-presence` reports "invitation", and the phone (which ignores `state`
 * entirely) still renders the same row correctly. There is no error and no warning anywhere; the
 * bug is only visible by opening the canvas on a laptop. Hence `learn`.
 *
 * 🔴 BUT AN EXISTING STATE IS NEVER OVERWRITTEN, AND THAT IS THE DELIBERATE HALF. A canvas sitting
 * at `recall`, `test`, `diagnose` or `retest` is mid-way through a teaching loop the phone has no
 * part in; dragging it back to `learn` because a question was asked from a phone would discard the
 * stage the learner is actually in. The block is stored either way and paints as soon as the
 * canvas returns to a reading state. A block that appears one stage later is a much smaller and
 * far more reversible harm than a rewound loop, so:
 *
 *     no row yet  → "learn"          (a new canvas, and it has content the moment it is written)
 *     pre-content → "learn"          (mandatory: otherwise the block is stored and never drawn)
 *     reading     → unchanged        (already paints — `orient` and `targeted_relearn` included)
 *     anything else → unchanged      (an evidence stage or `complete`; not ours to rewind)
 */
function stateAfterWrite(current: string | null): string {
  if (!current) return "learn";
  if (READING_STATES.has(current)) return current;
  if (PRE_CONTENT_STATES.has(current)) return "learn";
  return current;
}

interface RowForWrite {
  title: string;
  state: string | null;
  level: string | null;
  document: unknown;
  active_ms: number | null;
  created_at: string;
  deleted: boolean;
}

/**
 * The row as it stands, or `null` when there is no row with this id yet (a canvas the phone is
 * about to mint).
 *
 * 🔴 IT DOES **NOT** FILTER `deleted = false`, unlike every read above it. It has to be able to
 * tell "no such row" from "a row the student deleted", because the two need opposite handling:
 * the first is an insert, and the second must be REFUSED. `deleted` is not in the write set, so
 * upserting into a tombstone would leave `deleted = true` and the answer would sit in a row that
 * neither Library will ever list — saved, confirmed, and invisible. That is precisely the class of
 * quiet lie this module exists to avoid.
 */
async function readRowForWrite(uid: string, id: string): Promise<RowForWrite | null> {
  const { data, error } = await supabase
    .from(CANVASES)
    .select("title,state,level,document,active_ms,created_at,deleted")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new Error(error.message || "Couldn't reach that canvas.");
  if (!data) return null;
  const row = data as Partial<RowForWrite>;
  return {
    active_ms: typeof row.active_ms === "number" ? row.active_ms : 0,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    deleted: row.deleted === true,
    document: row.document,
    level: typeof row.level === "string" ? row.level : null,
    state: typeof row.state === "string" ? row.state : null,
    title: typeof row.title === "string" ? row.title : "",
  };
}

/** `active_ms` is `int4` with `check (active_ms >= 0)`. One production row already sits at ~51.9
 *  million, so the ceiling is not theoretical arithmetic — a counter past 2,147,483,647 (~24.8
 *  days) fails on the COLUMN TYPE rather than on the check, which is a different and much less
 *  legible error. Clamped rather than sent raw. */
const ACTIVE_MS_MAX = 2_147_483_647;

/**
 * Append one turn to a canvas — creating the row if it is not there yet — and CONFIRM it landed.
 *
 * `canvasId` is either the id of a canvas the student opened (from `/learn?c=<id>`) or one freshly
 * minted by `mintCanvasId()`. Both take the same path: the row is read, whatever is there is
 * carried across, and the upsert's `onConflict: "id"` decides insert or update. The id must be a
 * real uuid in both cases.
 *
 * 🔴 IT NEVER THROWS. Every other write in this module throws, and that is right for a rename or a
 * pin: those are the student's whole intent, so failing the action IS the report. This one runs
 * behind an answer the student is already reading, so the only thing that matters is that the
 * screen can tell them the truth without losing the text. Three outcomes, one sentence each.
 */
export async function saveCanvasTurn(
  uid: string | null,
  canvasId: string,
  turn: CanvasTurn,
): Promise<CanvasSaveOutcome> {
  if (!uid) return { message: "Sign in to save this canvas.", status: "failed" };
  if (!canvasId) return { message: "That answer has no canvas to save into.", status: "failed" };

  const drafts = turn.blocks
    .map((block) => ({ content: block.content.trim(), type: block.type }))
    .filter((block) => block.content.length > 0);
  if (drafts.length === 0) return { message: "There was nothing to save.", status: "failed" };

  let existing: RowForWrite | null;
  try {
    existing = await readRowForWrite(uid, canvasId);
  } catch (cause) {
    return {
      message: cause instanceof Error ? cause.message : "That answer wasn't saved — the canvas couldn't be reached.",
      status: "failed",
    };
  }

  if (existing?.deleted) {
    // See `readRowForWrite`. Resurrecting the row here would be an `update({ deleted: false })`
    // the student never asked for, on a canvas they deliberately threw away.
    return {
      message: "That canvas was deleted, so this answer wasn't saved into it.",
      status: "failed",
    };
  }

  // 🔴 THE STORED DOCUMENT, SPREAD RATHER THAN REBUILT. `canvasToRow` writes thirteen keys by hand
  // and its comment explains why the list is not a spread — on the web, every field of the canvas
  // needs a line there or it is silently not persisted. Here the constraint runs the other way:
  // this build knows thirteen keys and the row may hold more (a `studyDeckId`, or whatever a
  // future web release adds), so the stored object is spread FIRST and the keys the phone is
  // responsible for are set over it. Anything this build has never heard of survives untouched.
  const stored = record(existing?.document);
  const priorBlocks = list(stored.blocks);
  const priorSources = list(stored.sources);

  const takenBlockIds = new Set<string>();
  for (const block of priorBlocks) {
    const id = record(block).id;
    if (typeof id === "string" && id) takenBlockIds.add(id);
  }

  // 🔴🔴 THE SOURCES ARE MERGED BEFORE THE BLOCKS ARE BUILT, AND THE ORDER IS LOAD-BEARING (owner
  // 2026-08-21). The blocks cannot be written until it is known where each of this turn's citation
  // numbers lands in the canvas-wide list — that is what `homes` carries, and rewriting the markers
  // is the only thing that makes a stored `[n]` mean anything on its own. See `mergeTurnSources`
  // for the three ways the two numberings used to disagree.
  const { homes, sources: nextSources } = mergeTurnSources(priorSources, turn.sources);

  // 🔴 NO `sourceRefs` ON A PHONE-WRITTEN BLOCK. The web's `resolveSourceRef` matches a ref's
  // `sourceId` against `canvas.sources[].id`, and the pages this turn cited are stored as sources
  // with NO excerpts — there is no passage for a ref to point at, so every ref would resolve to
  // nothing and the surface would show dangling provenance. The renumbered `[n]` markers in the
  // text, and the pills built from `document.sources`, carry the citation instead — a claim both
  // apps can actually support. Every other optional field on `CanvasBlock` is OMITTED rather than
  // sent as null: absent means unknown there.
  const appended: { content: string; id: string; type: CanvasWriteBlockType }[] = [];
  for (const draft of drafts) {
    const content = renumberTurnMarkers(draft.content, homes).trim();
    // 🔴 A PARAGRAPH THAT WAS NOTHING BUT A DROPPED MARKER IS NOT A PARAGRAPH ANY MORE, AND IT MUST
    // NOT BE WRITTEN. `blocksFrom` refuses an empty block on the way back in, so storing one would
    // make the read-back check below ("did every block I appended come back?") fail and report a
    // save that actually landed as a failure — the one sentence this function exists to get right.
    if (!content) continue;
    const id = mintBlockId(takenBlockIds);
    takenBlockIds.add(id);
    appended.push({ content, id, type: draft.type });
  }
  if (appended.length === 0) return { message: "There was nothing to save.", status: "failed" };

  const document = {
    ...stored,
    sources: nextSources,
    blocks: [...priorBlocks, ...appended],
    concepts: list(stored.concepts),
    recall: list(stored.recall),
    recallResults: list(stored.recallResults),
    questions: list(stored.questions),
    answers: list(stored.answers),
    responses: list(stored.responses),
    correctiveAttempts: record(stored.correctiveAttempts),
    events: list(stored.events),
    outputs: list(stored.outputs),
    weakConceptIds: list(stored.weakConceptIds),
    correctedConceptIds: list(stored.correctedConceptIds),
  };

  const title = (existing?.title ?? "").trim() || titleFor(turn.fallbackTitle);
  if (!title) {
    // titleRule: a nameless canvas cannot be found again, and the Library's "Untitled canvas" is a
    // render-time fallback rather than something to store. Refusing to write the row is the honest
    // outcome — there would be nothing to reopen.
    return { message: "That answer wasn't saved — a canvas needs a name.", status: "failed" };
  }

  const { error } = await supabase.from(CANVASES).upsert(
    {
      // 🔴 EIGHT COLUMNS. Read the section header before adding a ninth.
      active_ms: Math.min(ACTIVE_MS_MAX, Math.max(0, Math.round(existing?.active_ms ?? 0))),
      created_at: existing?.created_at ?? new Date().toISOString(),
      document,
      id: canvasId,
      // Carried, never invented. `canvas-model.ts`: turning the absence of evidence into evidence
      // is the one thing a learner model must never do, and this is the field where it happened.
      level: existing?.level ?? null,
      state: stateAfterWrite(existing?.state ?? null),
      title: title.slice(0, TITLE_MAX),
      // 🔴 SENT EXPLICITLY EVEN THOUGH THE COLUMN DEFAULTS TO `auth.uid()`. The INSERT policy's
      // WITH CHECK is `auth.uid() = user_id`, and PostgREST does not apply `.eq()` filters to an
      // upsert body — so this module's usual belt-and-braces `.eq("user_id", uid)` has no
      // equivalent here. The belt is this line; the braces are RLS.
      user_id: uid,
    },
    { onConflict: "id" },
  );
  if (error) {
    return {
      message: error.message || "That answer wasn't saved to your canvas.",
      status: "failed",
    };
  }

  // --- and now READ IT BACK, which is the half that makes the sentence above honest -----------
  //
  // 🔴 THE SAME RULE `CanvasManagerBody.fileAndVerify` FOLLOWS, and for a stronger version of the
  // same reason: `pinned_at`, `folder_id` and `deleted` had never been written in production when
  // that was added, and `document.blocks` from a phone has never been written at all. A write this
  // new gets checked rather than trusted.
  let readBack: StoredCanvas | null;
  try {
    readBack = await loadCanvas(uid, canvasId);
  } catch {
    return {
      message: "That may not have been saved — your canvas couldn't be re-read just now.",
      status: "unverified",
    };
  }
  if (!readBack) {
    return {
      message: "That may not have been saved — your canvas couldn't be re-read just now.",
      status: "unverified",
    };
  }
  // Aliased to a `const` before the closure: TypeScript drops the narrowing above for a `let`
  // read inside a callback, and this must not become an optional chain that quietly passes.
  const saved = readBack;
  const landed = appended.every((block) => saved.blocks.some((entry) => entry.id === block.id));
  if (!landed) {
    return {
      message: "That answer wasn't saved to your canvas. Nothing is lost — it is still on screen.",
      status: "failed",
    };
  }
  return { canvas: saved, status: "saved" };
}
