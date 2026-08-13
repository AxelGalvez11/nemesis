// Finding a canvas, when there are more of them than fit on one page.
//
// 🔴 WHY THIS IS NOT `listCanvases`. That function is the front door's list: pinned first, most
// recent next, `.limit(200)`, no paging, no search. On the home surface that is fine — nobody
// scrolls a landing page to row 400. In a LIBRARY it is a defect, because the whole job of the
// surface is finding things. A learner past 200 canvases would type into a search box that
// filters a truncated page and be told, confidently, that their canvas does not exist.
//
// So search, folder scoping and sort all run IN THE QUERY. The list this returns is a page of
// the learner's whole library, not a filter over the first 200 rows of it.
//
// 🔴 AND IT REPORTS ITS OWN TRUNCATION. `total` is an exact count from the same round trip, so
// the surface can say "200 of 340" instead of quietly omitting 140 canvases. Raising the limit
// without this just moves the same lie further out.
//
// 🔴 LANE NOTE: this lives in `lib/library/` rather than `lib/learn/`, which is Runtime's. The
// only additions authorised in `canvas-store.ts` were `renameCanvas`, `renameFolder` and
// `deleteFolder`, so the paged query belongs here. `CanvasSummary` is imported rather than
// redefined — a second local row type is how two readers of one table drift apart in silence.

import { supabase } from "@/lib/supabase";
import type { CanvasSummary } from "@/lib/learn/canvas-store";

const TABLE = "learning_canvases";

/** How many rows one page of the library holds. */
export const PAGE_SIZE = 60;

/** 🔴 TWO OPTIONS, NOT A SORT MATRIX. §L asks for "sort where useful" and bans a full desktop
 *  file explorer; a clickable header per column is that explorer's first component. */
export type CanvasSort = "recent" | "name";

export interface CanvasQuery {
  /** Free text matched against the title, in the database. Empty means "everything". */
  search?: string;
  /** `undefined` = every folder. `null` = Unfiled only. A string = that folder. */
  folderId?: string | null | undefined;
  sort?: CanvasSort;
  page?: number;
}

export interface CanvasPage {
  rows: CanvasSummary[];
  /** Exact number of canvases matching the query, before paging. */
  total: number;
  page: number;
  /** True when `total` exceeds what has been shown so far — the surface must say so. */
  more: boolean;
}

/** The narrow slice of the Supabase builder this module uses.
 *
 *  🔴 IT EXISTS SO THE QUERY ITSELF CAN BE TESTED. Without a seam here the only way to check
 *  that search runs server-side is to read the source and believe it, and a client-side filter
 *  reads almost identically at the call site. The test substitutes a fake that enforces the same
 *  paging the database does, so an implementation that fetched a page and filtered it in memory
 *  fails instead of passing. */
export interface CanvasTable {
  select(columns: string, options?: { count?: "exact" }): CanvasTable;
  eq(column: string, value: unknown): CanvasTable;
  is(column: string, value: null): CanvasTable;
  ilike(column: string, pattern: string): CanvasTable;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): CanvasTable;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; count: number | null; error: unknown }>;
}

interface CanvasRowShape {
  id: string;
  title: string;
  state: string;
  updated_at: string;
  pinned_at: string | null;
  folder_id: string | null;
}

/** Postgres `like` treats these as wildcards; a learner typing them means the characters. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function searchCanvases(
  userId: string | null,
  query: CanvasQuery = {},
  table: () => CanvasTable = () => supabase.from(TABLE) as unknown as CanvasTable,
): Promise<CanvasPage> {
  const page = Math.max(0, query.page ?? 0);
  const empty: CanvasPage = { more: false, page, rows: [], total: 0 };
  if (!userId) return empty;

  const search = (query.search ?? "").trim();

  let builder = table().select("id,title,state,updated_at,pinned_at,folder_id", { count: "exact" });
  builder = builder.eq("deleted", false);

  // 🔴 SCOPING IS THREE-VALUED AND `null` IS NOT "NO FILTER". `undefined` means every folder;
  // `null` means Unfiled, which is `folder_id is null` — an `.eq(column, null)` would silently
  // match nothing, so Unfiled would render empty and look like a learner with no loose canvases.
  if (query.folderId !== undefined) {
    builder = query.folderId === null ? builder.is("folder_id", null) : builder.eq("folder_id", query.folderId);
  }

  // 🔴 IN THE QUERY. This is the line the whole module exists for.
  if (search) builder = builder.ilike("title", `%${escapeLike(search)}%`);

  if ((query.sort ?? "recent") === "name") {
    builder = builder.order("title", { ascending: true });
  } else {
    builder = builder
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
  }

  // 🔴 THE ORDER MUST END IN A UNIQUE COLUMN. Titles collide, `updated_at` collides on rows
  // written in the same transaction, and a non-deterministic order across page boundaries makes
  // rows appear twice on one page and never on the next. This repo has been bitten by exactly
  // that shape before.
  builder = builder.order("id", { ascending: true });

  const from = page * PAGE_SIZE;
  const { data, count, error } = await builder.range(from, from + PAGE_SIZE - 1);
  if (error || !data) return empty;

  const rows = (data as CanvasRowShape[]).map(
    (row): CanvasSummary => ({
      folderId: row.folder_id,
      id: row.id,
      pinnedAt: row.pinned_at,
      state: row.state as CanvasSummary["state"],
      title: row.title,
      updatedAt: row.updated_at,
    }),
  );

  const total = count ?? rows.length;
  return { more: from + rows.length < total, page, rows, total };
}
