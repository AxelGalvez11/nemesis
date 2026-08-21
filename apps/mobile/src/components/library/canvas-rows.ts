// The parts of a canvas row that are pure arithmetic on a string — dates, escaping, scope,
// and what a folder may legally contain.
//
// Mirrors the small helpers inside `apps/web/components/workspace/library/canvas-manager.tsx`
// and `apps/web/lib/library/canvas-index.ts`. They are split out here for the reason every
// `lib/*.ts` in this app is split out: nothing below imports react-native or supabase, so the
// rules the list obeys can be read — and tested under `deno test`, the repo's convention for
// `lib/` — without standing an app up around them.
//
// 🔴 THIS FILE'S HOME IS `src/lib/canvas-rows.ts`. It lives under `components/library/` only
// because the pass that wrote it owns `components/library/**` and `api/**` and may not write into
// `src/lib/`. `canvas-rows.test.ts` sits beside it and covers it, including the two guards the
// web's own test pins — see `resolveScope` and `NO_SOURCE_COUNT` below. Move the PAIR together
// and keep both names; a helper that arrives in `lib/` without its test looks untested.
//
// 🔴 NOTHING HERE READS `state`. `learning_canvases.state` is selected by the query (the web
// selects it too) and is rendered by neither app. A row that showed it would be claiming to know
// how far along a student's thinking is from a column written by an autosave.

/** `undefined` = every canvas · `null` = Unfiled · a string = that folder id. */
export type Scope = string | null | undefined;

/** What the list is actually asking the database for, once search has had its say. */
export interface ResolvedScope {
  /** True when a folder filter applies at all. */
  filtered: boolean;
  /** Only meaningful when `filtered`: null means `folder_id is null`, a string means that id. */
  folderId: string | null;
}

/**
 * Turn a three-valued scope into the two questions a query can answer.
 *
 * 🔴 `null` IS NOT "NO FILTER" AND THIS IS THE LINE THAT SAYS SO. `undefined` applies no folder
 * filter, so a canvas that lives in a folder appears BOTH under All canvases and inside that
 * folder. `null` is Unfiled, which is `folder_id is null` in SQL and must be written as
 * `.is("folder_id", null)` — `.eq(column, null)` matches NOTHING in Postgres, so Unfiled would
 * render empty and read as a student with no loose canvases. The web's `canvas-index.ts` carries
 * the same warning; conflating the two absences is the single easiest way to port this wrong.
 */
export function resolveScope(scope: Scope): ResolvedScope {
  if (scope === undefined) return { filtered: false, folderId: null };
  return { filtered: true, folderId: scope };
}

/**
 * 🔴 A SEARCH IGNORES THE FOLDER YOU ARE STANDING IN, ON PURPOSE. The failure this surface
 * exists to fix is "I can see my canvas in my account and the box says nothing matched".
 * Scoping the search to the current folder rebuilds that failure with a nicer cause.
 */
export function effectiveScope(scope: Scope, search: string): Scope {
  return search.trim().length > 0 ? undefined : scope;
}

/** Postgres `like` treats these as wildcards; a student typing them means the characters. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** The literal shown when `title` is the column default, which is `''` and not null. Kept as a
 *  named constant because it is copy, and copy on this surface is field-agnostic by rule
 *  (CLAUDE.md): a canvas is a canvas whatever it is about. */
export const UNTITLED_CANVAS = "Untitled canvas";

/** The name a row shows. */
export function canvasName(title: string | null | undefined): string {
  const trimmed = (title ?? "").trim();
  return trimmed || UNTITLED_CANVAS;
}

/**
 * Relative, and deliberately coarse — "3 days ago" is what the student is actually asking, and a
 * timestamp to the minute invites them to read precision into a shelf.
 *
 * `now` is a parameter so this is a pure function of its inputs rather than of the clock, which
 * is the only thing standing between "the test passes" and "the test passes today".
 */
export function lastOpened(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((now.getTime() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * 🔴 THE EM DASH A FOLDER SHOWS UNDER "Last opened", WHICH IS NOT A BLANK AND NOT A GUESS.
 * Nothing records opening a folder, and `folders.updated_at` means "renamed or moved" — putting
 * that date here would answer a different question in the same shape as the real answer. The
 * dash says the column does not apply; an empty cell just looks unfinished.
 */
export const NOT_APPLICABLE = "—";

/**
 * A creation date, absolute and short — "14 Aug", or "14 Aug 2025" once the year stops being
 * this one.
 *
 * 🔴 ABSOLUTE WHERE "Last opened" IS RELATIVE, ON PURPOSE (carried from the web verbatim). Two
 * relative readings side by side are two of the same sentence and the eye stops separating them.
 * The questions differ too: last opened is "how long since I touched this", created is "which
 * term was this from".
 */
export function createdOn(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return NOT_APPLICABLE;
  const when = new Date(iso);
  if (!Number.isFinite(when.getTime())) return NOT_APPLICABLE;
  const sameYear = when.getFullYear() === now.getFullYear();
  return when.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** A folder as this surface needs to know it. Mirrors the web's `Folder`. */
export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  createdAt?: string;
}

/**
 * May `folderId` be moved so that its parent becomes `parentId` (`null` = top level)?
 *
 * 🔴 THIS IS A DEPTH RULE, NOT AN ANCESTRY WALK, AND THE WEB'S COMMENT ON THIS IS OVERSTATED.
 * `canvas-manager.tsx`'s `wouldCycle` says "THE DATABASE WILL HAPPILY DO THIS" and walks up the
 * tree collecting a `seen` set against infinite loops. It will not: `folders_depth_guard`
 * (migration `20260810T01_canvas_folders_and_assets.sql`) is a BEFORE INSERT OR UPDATE trigger
 * that raises 'a folder cannot contain itself' and 'folders nest two levels deep at most'. A tree
 * that cannot be deeper than two cannot contain a cycle, so a recursive ancestry walk is guarding
 * a state that the database refuses to enter.
 *
 * What CAN happen, and what this actually rejects, is a legal-looking move the trigger will
 * refuse: dropping a top-level folder that already has children into another folder (its children
 * would land at depth three), or dropping anything into a folder that is itself nested. Rejecting
 * it here means the student sees why, instead of watching a drag do nothing.
 */
export function canReparentFolder(
  folderId: string,
  parentId: string | null,
  folders: readonly FolderNode[],
): boolean {
  if (folderId === parentId) return false;
  if (parentId === null) return true;
  const parent = folders.find((entry) => entry.id === parentId);
  if (!parent) return false;
  // The destination is already a child, so anything inside it would be a grandchild.
  if (parent.parentId !== null) return false;
  // The mover has children of its own, which would become grandchildren.
  return !folders.some((entry) => entry.parentId === folderId);
}

/**
 * May a new folder be created inside `parentId`?
 *
 * 🔴 THE WEB FAILS SILENTLY HERE AND THE PORT MUST NOT. `createFolder` inside a level-2 folder
 * trips `folders_depth_guard`; the web store returns null with a `console.warn`, and the manager
 * reloads and shows nothing at all — a button that is drawn, pressed, accepted, and does nothing.
 * The phone disables the control instead, and says why.
 */
export function canCreateFolderIn(parentId: string | null, folders: readonly FolderNode[]): boolean {
  if (parentId === null) return true;
  const parent = folders.find((entry) => entry.id === parentId);
  return Boolean(parent) && parent?.parentId === null;
}

/**
 * The breadcrumb, at most three segments because the database caps the depth at two.
 * Returns the path from the root down to `scope`, root first, EXCLUDING the "All canvases" head
 * the surface draws itself.
 */
export function crumbTrail(scope: Scope, folders: readonly FolderNode[]): FolderNode[] {
  if (typeof scope !== "string") return [];
  const here = folders.find((entry) => entry.id === scope);
  if (!here) return [];
  const parent = here.parentId ? folders.find((entry) => entry.id === here.parentId) : undefined;
  return parent ? [parent, here] : [here];
}

/** The folder rows shown at a level: top-level folders under All canvases, children inside one,
 *  and NONE while searching or in Unfiled — a search is over canvases, and mixing in folders that
 *  match nothing makes the results read as noise. */
export function foldersAtLevel(
  scope: Scope,
  folders: readonly FolderNode[],
  searching: boolean,
): FolderNode[] {
  if (searching || scope === null) return [];
  if (scope === undefined) return folders.filter((entry) => entry.parentId === null);
  return folders.filter((entry) => entry.parentId === scope);
}

/**
 * 🔴 A ROW SHOWS NOTHING DERIVED FROM A CANVAS'S CONTENTS, AND THIS CONSTANT IS THE REMINDER.
 * `canvas_sources` exists as a table and is EMPTY in production — canvases carry their sources
 * inside `document` — so a source count would render "0" on a canvas that plainly has material
 * attached: a confident false claim about the student's own work. The web pins this with a guard
 * test (`assert.ok(!/sources\.length|sourceCount|canvas_sources/.test(code))`) and so does the
 * phone: `canvas-rows.test.ts` runs the same regex over `CanvasManagerBody.tsx` and
 * `api/canvases.ts` with COMMENTS STRIPPED, so the rule may still be written down in the files it
 * governs — including here. This constant is the reminder that survives at the call site.
 */
export const NO_SOURCE_COUNT = "canvas_sources is empty in production; never count it on a row";
