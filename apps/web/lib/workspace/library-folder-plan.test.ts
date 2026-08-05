// Two of the twelve checks the owner accepted Phase 1 on, made permanent.
//
// Both had NEVER run before 2026-08-05: acceptance test 6 ("Clean up my
// Library") died on the leaked-tool-markup bug before it reached a mutation, so
// folder rename went to production unexercised. The re-acceptance ran it for
// real — `rename_library_folder {path:"test", new_name:"Scratch"}` kept its
// folder page and moved four rows — and these tests are what stop it silently
// regressing between production passes.

import assert from "node:assert/strict";
import test from "node:test";

import {
  isFolderPageOf,
  isInLibrarySubtree,
  planFolderRelocation,
  type LibraryFolderRow,
} from "./library-folder-plan";

const row = (path: string, title: string, kind = "note"): LibraryFolderRow => ({
  id: `id:${path}`,
  kind,
  path,
  title,
});

/** The production shape at the moment of the accepted rename: a folder page
 *  named after its folder, a nested subfolder with its own notes, and an
 *  unrelated note at the top level that happens to share the folder's name. */
const TREE: LibraryFolderRow[] = [
  row("test/test.md", "test"),
  row("test/Lectures", "Lectures", "folder"),
  row("test/Lectures/Week 1.md", "Week 1"),
  row("test/Loose note.md", "Loose note"),
  row("test.md", "test"),
  row("testing/Other.md", "Other"),
];

const subtree = TREE.filter((entry) => isInLibrarySubtree(entry.path, "test"));

// ── Check 11: renaming a folder keeps its folder page ───────────────────────

test("🔴 a rename keeps the folder page and carries its title to the new name", () => {
  const plan = planFolderRelocation(subtree, "test", "Scratch", "renamed");
  const page = plan.find((patch) => patch.id === "id:test/test.md");
  // The page stays a row — renaming must never delete and recreate it, or the
  // note's own history and any links into it go with it.
  assert.equal(page?.path, "Scratch/test.md");
  // And the title follows. A folder page is recognized BY NAME: leaving it as
  // "test" under a folder called "Scratch" orphans it, and the app grows a
  // second, empty folder page the next time the folder is opened. That is the
  // two-pages-one-folder corruption this rule exists to prevent.
  assert.equal(page?.title, "Scratch");
});

test("everything nested underneath moves with the folder", () => {
  const plan = planFolderRelocation(subtree, "test", "Scratch", "renamed");
  const paths = plan.map((patch) => patch.path).sort();
  assert.deepEqual(paths, [
    "Scratch/Lectures",
    "Scratch/Lectures/Week 1.md",
    "Scratch/Loose note.md",
    "Scratch/test.md",
  ]);
});

test("a nested folder row is renamed to its own new leaf, not the parent's", () => {
  const plan = planFolderRelocation(subtree, "test", "Scratch", "renamed");
  const nested = plan.find((patch) => patch.id === "id:test/Lectures");
  assert.equal(nested?.path, "Scratch/Lectures");
  assert.equal(nested?.title, "Lectures");
});

test("an ordinary note inside the folder keeps its own title", () => {
  const plan = planFolderRelocation(subtree, "test", "Scratch", "renamed");
  const loose = plan.find((patch) => patch.id === "id:test/Loose note.md");
  assert.equal(loose?.path, "Scratch/Loose note.md");
  assert.equal(loose?.title, undefined, "a rename must not retitle notes that are not the folder page");
});

test("a MOVE leaves every title alone — the folder still has the same name", () => {
  const plan = planFolderRelocation(subtree, "test", "Courses/test", "moved");
  const page = plan.find((patch) => patch.id === "id:test/test.md");
  assert.equal(page?.path, "Courses/test/test.md");
  assert.equal(page?.title, undefined);
});

test("a folder page identified by its title rather than its filename still follows", () => {
  const byTitle = [row("Pharmacology/overview.md", "Pharmacology")];
  const plan = planFolderRelocation(byTitle, "Pharmacology", "Pharm", "renamed");
  assert.equal(plan[0]?.title, "Pharm");
});

// ── Check 12: an unrelated note that shares the name is not touched ─────────

test("🔴 renaming the folder `test` does not touch a top-level note called `test.md`", () => {
  assert.equal(isInLibrarySubtree("test.md", "test"), false);
  const plan = planFolderRelocation(TREE, "test", "Scratch", "renamed");
  assert.equal(
    plan.some((patch) => patch.id === "id:test.md"),
    false,
    "the root note shares a name with the folder and nothing else",
  );
});

test("a folder whose name is a prefix of another folder is not swept in", () => {
  assert.equal(isInLibrarySubtree("testing/Other.md", "test"), false);
  const plan = planFolderRelocation(TREE, "test", "Scratch", "renamed");
  assert.equal(plan.some((patch) => patch.path.startsWith("Scratch/Other")), false);
});

test("the folder row itself and its descendants are in the subtree", () => {
  assert.equal(isInLibrarySubtree("test", "test"), true);
  assert.equal(isInLibrarySubtree("test/Lectures/Week 1.md", "test"), true);
});

// ── The page rule, on its own ───────────────────────────────────────────────

test("only a note sitting DIRECTLY in the folder can be its page", () => {
  assert.equal(isFolderPageOf(row("test/Lectures/test.md", "test"), "test", "test"), false);
});

test("a row that is itself a folder is never a folder page", () => {
  assert.equal(isFolderPageOf(row("test/test", "test", "folder"), "test", "test"), false);
});
