// Deno unit tests (repo convention) for the library path arithmetic behind
// rename / move / delete. These rules are copied from the web store on purpose,
// so the tests pin the copy: a drift here shows up on the other client as a
// duplicate-looking note.
// Run from the REPO ROOT: deno test --no-check --allow-env apps/mobile/src/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allFolderPaths,
  folderLeaf,
  folderOf,
  isAtOrUnder,
  movedFolderPath,
  normalizeLibraryFolder,
  notePathFor,
  remapUnder,
  renamedFolderPath,
  safeLibraryTitle,
  uniqueNotePath,
} from "./library-paths.ts";

Deno.test("normalizeLibraryFolder strips illegal characters and empty segments", () => {
  assertEquals(normalizeLibraryFolder("PHCY 1205/Unit 1"), "PHCY 1205/Unit 1");
  assertEquals(normalizeLibraryFolder("a//b/"), "a/b");
  assertEquals(normalizeLibraryFolder("  spaced  /  out "), "spaced/out");
  assertEquals(normalizeLibraryFolder('bad<>:"|?*chars'), "badchars");
  assertEquals(normalizeLibraryFolder("back\\slash"), "back/slash");
  assertEquals(normalizeLibraryFolder("///"), "");
});

Deno.test("safeLibraryTitle replaces path characters and never returns empty", () => {
  assertEquals(safeLibraryTitle("Beta blockers"), "Beta blockers");
  assertEquals(safeLibraryTitle("a/b:c"), "a-b-c");
  assertEquals(safeLibraryTitle("  lots   of   space  "), "lots of space");
  assertEquals(safeLibraryTitle("   "), "Untitled note");
  assertEquals(safeLibraryTitle("x".repeat(200)).length, 120);
});

Deno.test("notePathFor builds Folder/Title.md, root when unfoldered", () => {
  assertEquals(notePathFor("Kinetics", "PHCY 1205"), "PHCY 1205/Kinetics.md");
  assertEquals(notePathFor("Kinetics"), "Kinetics.md");
  assertEquals(notePathFor("Kinetics", "  "), "Kinetics.md");
});

Deno.test("folderOf and folderLeaf split a path", () => {
  assertEquals(folderOf("a/b/c.md"), "a/b");
  assertEquals(folderOf("c.md"), "");
  assertEquals(folderLeaf("a/b/c"), "c");
  assertEquals(folderLeaf("c"), "c");
});

Deno.test("uniqueNotePath steps a suffix past collisions, case-insensitively", () => {
  const taken = [{ id: "1", path: "F/Kinetics.md" }, { id: "2", path: "f/kinetics 2.md" }];
  assertEquals(uniqueNotePath("Kinetics", "F", taken), "F/Kinetics 3.md");
  // Free folder — first candidate wins.
  assertEquals(uniqueNotePath("Kinetics", "G", taken), "G/Kinetics.md");
});

Deno.test("uniqueNotePath lets a row keep its own path when renaming", () => {
  const taken = [{ id: "1", path: "F/Kinetics.md" }];
  assertEquals(uniqueNotePath("Kinetics", "F", taken, "1"), "F/Kinetics.md");
});

Deno.test("isAtOrUnder matches the folder itself and its descendants only", () => {
  assertEquals(isAtOrUnder("a", "a"), true);
  assertEquals(isAtOrUnder("a/b/c.md", "a"), true);
  // A sibling whose name merely STARTS with the folder name is not inside it.
  assertEquals(isAtOrUnder("ab/c.md", "a"), false);
  assertEquals(isAtOrUnder("b/a.md", "a"), false);
});

Deno.test("remapUnder rewrites the prefix and leaves the rest of the subtree shape", () => {
  assertEquals(remapUnder("Old", "Old", "New"), "New");
  assertEquals(remapUnder("Old/Unit 1/x.md", "Old", "New"), "New/Unit 1/x.md");
  assertEquals(remapUnder("Older/x.md", "Old", "New"), "Older/x.md");
});

Deno.test("movedFolderPath reparents the leaf; empty target means the root", () => {
  assertEquals(movedFolderPath("A/B", "C"), "C/B");
  assertEquals(movedFolderPath("A/B", ""), "B");
});

Deno.test("renamedFolderPath keeps the parent and swaps the leaf", () => {
  assertEquals(renamedFolderPath("A/B", "Cardio"), "A/Cardio");
  assertEquals(renamedFolderPath("B", "Cardio"), "Cardio");
  // A name that normalizes to nothing is rejected, not silently applied.
  assertEquals(renamedFolderPath("A/B", "  /  "), "");
  // A slash typed into a rename field can't smuggle in a reparent.
  assertEquals(renamedFolderPath("A/B", "X/Y"), "A/Y");
});

Deno.test("allFolderPaths derives every ancestor from note paths", () => {
  assertEquals(
    allFolderPaths(["PHCY/Unit 1/a.md", "PHCY/b.md", "root.md"]),
    ["PHCY", "PHCY/Unit 1"],
  );
});

Deno.test("allFolderPaths folds in explicit folder rows and dedupes", () => {
  assertEquals(allFolderPaths(["A/x.md"], ["A", "B/C"]), ["A", "B/C"]);
});
