// Deno unit tests (repo convention) for the canvas-row pure helpers, plus the two GUARDS the
// web's own `canvas-manager.test.ts` pins.
// Run: deno test --allow-read --no-check apps/mobile/src/components/library/canvas-rows.test.ts
//
// 🔴 THIS FILE'S HOME IS `src/lib/canvas-rows.test.ts`, BESIDE `src/lib/canvas-rows.ts`. Both live
// under `components/library/` only because the pass that wrote them owned `components/library/**`
// and `api/**` and could not write into `src/lib/`. Move the pair together, keep both names.
//
// 🔴 WHY THE GUARDS ARE HERE AT ALL. The web pins two facts with a test rather than a comment
// because both are invisible when broken: an Unfiled scope written with `.eq` renders an empty
// list that is indistinguishable from a student who has no loose canvases, and a source count
// renders "0" on a canvas that plainly has material. Neither throws, neither logs, and both look
// exactly like the truth. A comment cannot fail; this can.
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canCreateFolderIn,
  canReparentFolder,
  canvasName,
  createdOn,
  crumbTrail,
  effectiveScope,
  escapeLike,
  foldersAtLevel,
  lastOpened,
  NOT_APPLICABLE,
  NO_SOURCE_COUNT,
  resolveScope,
  UNTITLED_CANVAS,
  type FolderNode,
} from "./canvas-rows.ts";

const read = (path: string) => Deno.readTextFileSync(new URL(path, import.meta.url));

/**
 * Strip comments before a guard looks at source.
 *
 * 🔴 THIS IS THE ONE PLACE THE PHONE'S GUARD DIFFERS FROM THE WEB'S, AND IT IS NOT A WEAKENING.
 * The web asserts `!/sources\.length|sourceCount|canvas_sources/.test(code)` against raw text,
 * which also forbids WRITING DOWN the rule — and the phone's files explain at length why a source
 * count is forbidden, naming `canvas_sources` to do it. Banning the prose that teaches the rule
 * would push the reasoning out of the file to satisfy the test, which is the opposite of what the
 * test is for. So the ban applies to code, and the explanation stays.
 *
 * Coarse on purpose: over-stripping can only make this assertion pass, never fail, so the failure
 * mode of a crude stripper is a guard that is too lenient about a string it has already found no
 * trace of — not a false alarm on a clean file.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

// --- guard 1: Unfiled is `folder_id IS NULL` ------------------------------------------------

Deno.test("guard: Unfiled scopes with .is(\"folder_id\", null), never .eq", () => {
  const code = read("../../api/canvases.ts");
  assert(
    code.includes('.is("folder_id", null)'),
    "searchCanvases must scope Unfiled with .is(\"folder_id\", null)",
  );
  // `.eq(column, null)` matches NOTHING in Postgres. Written that way, Unfiled renders empty and
  // reads as a student with no loose canvases — true-looking, and wrong.
  assertFalse(
    /\.eq\(\s*["']folder_id["']\s*,\s*null\s*\)/.test(code),
    "Unfiled must never be expressed as .eq(\"folder_id\", null)",
  );
});

Deno.test("resolveScope: undefined, null and a string are three different questions", () => {
  // No folder filter at all — a filed canvas appears here AND inside its folder.
  assertEquals(resolveScope(undefined), { filtered: false, folderId: null });
  // Unfiled.
  assertEquals(resolveScope(null), { filtered: true, folderId: null });
  assertEquals(resolveScope("f1"), { filtered: true, folderId: "f1" });
});

// --- guard 2: nothing on a row is derived from a canvas's contents ---------------------------

Deno.test("guard: no source count, preview or canvas_sources read in executable code", () => {
  const forbidden = /sources\.length|sourceCount|canvas_sources/;
  for (const path of ["./CanvasManagerBody.tsx", "../../api/canvases.ts"]) {
    assertFalse(
      forbidden.test(stripComments(read(path))),
      `${path} must not derive anything on a row from a canvas's contents`,
    );
  }
});

Deno.test("guard: the reminder constant is still in place", () => {
  // `canvas_sources` is empty in production while canvases carry their sources inside `document`,
  // so a count would render 0 on a canvas that plainly has material attached.
  assert(NO_SOURCE_COUNT.includes("canvas_sources"));
  // The rule is written down where the row helpers are, so the next reader meets it before they
  // reach for a count rather than after a reviewer catches one.
  assert(read("./canvas-rows.ts").includes("NO_SOURCE_COUNT"));
});

// --- names --------------------------------------------------------------------------------

Deno.test("canvasName: the column default is '' and falls back to the literal", () => {
  assertEquals(canvasName(""), UNTITLED_CANVAS);
  assertEquals(canvasName("   "), UNTITLED_CANVAS);
  assertEquals(canvasName(null), UNTITLED_CANVAS);
  assertEquals(canvasName(undefined), UNTITLED_CANVAS);
  assertEquals(canvasName("Week 3"), "Week 3");
  // Field-agnostic by rule (CLAUDE.md) — a canvas is a canvas whatever it is about.
  assertEquals(UNTITLED_CANVAS, "Untitled canvas");
});

Deno.test("escapeLike: a typed % or _ means the character, not a wildcard", () => {
  assertEquals(escapeLike("100%"), "100\\%");
  assertEquals(escapeLike("a_b"), "a\\_b");
  assertEquals(escapeLike("back\\slash"), "back\\\\slash");
  assertEquals(escapeLike("plain"), "plain");
});

// --- dates --------------------------------------------------------------------------------

const NOW = new Date("2026-08-20T12:00:00.000Z");
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

Deno.test("lastOpened: relative and deliberately coarse", () => {
  assertEquals(lastOpened(daysBefore(0), NOW), "Today");
  assertEquals(lastOpened(daysBefore(1), NOW), "Yesterday");
  assertEquals(lastOpened(daysBefore(3), NOW), "3 days ago");
  assertEquals(lastOpened(daysBefore(6), NOW), "6 days ago");
  // 7..13 days is one week; the singular is not a rounding accident.
  assertEquals(lastOpened(daysBefore(7), NOW), "1 week ago");
  assertEquals(lastOpened(daysBefore(13), NOW), "1 week ago");
  assertEquals(lastOpened(daysBefore(14), NOW), "2 weeks ago");
  assertEquals(lastOpened(daysBefore(29), NOW), "4 weeks ago");
  // Past 30 days the relative reading stops meaning anything and a date is honest.
  assert(!lastOpened(daysBefore(400), NOW).includes("ago"));
});

Deno.test("lastOpened: a missing or unparseable timestamp says nothing rather than guessing", () => {
  assertEquals(lastOpened(null, NOW), "");
  assertEquals(lastOpened(undefined, NOW), "");
  assertEquals(lastOpened("not a date", NOW), "");
});

Deno.test("createdOn: absolute, short, and only carries a year once it is not this one", () => {
  const thisYear = createdOn("2026-08-14T09:00:00.000Z", NOW);
  assert(!thisYear.includes("2026"), `expected no year in "${thisYear}"`);
  const lastYear = createdOn("2025-08-14T09:00:00.000Z", NOW);
  assert(lastYear.includes("2025"), `expected a year in "${lastYear}"`);
});

Deno.test("createdOn: an absent date is the em dash, not a blank", () => {
  // A folder shows this under Last opened too: nothing records opening a folder, and
  // `folders.updated_at` means "renamed or moved" — a different question in the same shape.
  assertEquals(createdOn(null, NOW), NOT_APPLICABLE);
  assertEquals(createdOn("nonsense", NOW), NOT_APPLICABLE);
  assertEquals(NOT_APPLICABLE, "—");
});

// --- search ignores the folder you are standing in -------------------------------------------

Deno.test("effectiveScope: searching drops the folder filter", () => {
  // The failure this fixes is "I can see my canvas in my account and the box says nothing matched".
  assertEquals(effectiveScope("folder-1", "kreb"), undefined);
  assertEquals(effectiveScope(null, "kreb"), undefined);
  // Whitespace is not a search.
  assertEquals(effectiveScope("folder-1", "   "), "folder-1");
  assertEquals(effectiveScope("folder-1", ""), "folder-1");
  assertEquals(effectiveScope(null, ""), null);
});

// --- the two-level folder cap ----------------------------------------------------------------

const TREE: FolderNode[] = [
  { id: "top", name: "Top", parentId: null },
  { id: "other", name: "Other", parentId: null },
  { id: "childless", name: "Childless", parentId: null },
  { id: "kid", name: "Kid", parentId: "top" },
];

Deno.test("foldersAtLevel: one level at a time, and none while searching or in Unfiled", () => {
  assertEquals(foldersAtLevel(undefined, TREE, false).map((f) => f.id), ["top", "other", "childless"]);
  assertEquals(foldersAtLevel("top", TREE, false).map((f) => f.id), ["kid"]);
  // A search is over canvases; folders that match nothing would read as noise.
  assertEquals(foldersAtLevel(undefined, TREE, true), []);
  // Unfiled is a canvas scope, not a place with folders in it.
  assertEquals(foldersAtLevel(null, TREE, false), []);
});

Deno.test("crumbTrail: at most three segments, because the database caps depth at two", () => {
  assertEquals(crumbTrail(undefined, TREE), []);
  assertEquals(crumbTrail(null, TREE), []);
  assertEquals(crumbTrail("top", TREE).map((f) => f.id), ["top"]);
  // Excludes the "All canvases" head the surface draws itself, so two here is three on screen.
  assertEquals(crumbTrail("kid", TREE).map((f) => f.id), ["top", "kid"]);
  assertEquals(crumbTrail("ghost", TREE), []);
});

Deno.test("canReparentFolder: rejects the moves folders_depth_guard would refuse", () => {
  // A folder cannot contain itself.
  assertFalse(canReparentFolder("top", "top", TREE));
  // Back to the top level is always legal.
  assert(canReparentFolder("kid", null, TREE));
  // A childless top-level folder may become a child.
  assert(canReparentFolder("childless", "top", TREE));
  // ...but one that has children of its own may not: they would land at depth three.
  assertFalse(canReparentFolder("top", "other", TREE));
  // Nothing may be dropped into a folder that is already nested.
  assertFalse(canReparentFolder("childless", "kid", TREE));
  assertFalse(canReparentFolder("childless", "ghost", TREE));
});

Deno.test("canCreateFolderIn: New folder is refused inside a level-2 folder", () => {
  // 🔴 The web fails SILENTLY here — its store returns null with a console.warn and the manager
  // reloads and shows nothing, so the student presses a drawn, enabled button that does nothing.
  // The phone disables the control instead, which is only possible because this is knowable.
  assert(canCreateFolderIn(null, TREE));
  assert(canCreateFolderIn("top", TREE));
  assertFalse(canCreateFolderIn("kid", TREE));
  assertFalse(canCreateFolderIn("ghost", TREE));
});
