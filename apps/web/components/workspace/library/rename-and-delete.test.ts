// 🔴🔴 THE LIBRARY CAN RENAME AND DELETE. Owner, 2026-09-04: *"yes add rename and delete"*, after a
// comparison against ChatGPT's own shipping source found their item menu is Download, separator,
// Rename, Delete, and ours had neither of the last two.
//
// What these guards defend is not that the buttons exist. It is the three things that would be
// quietly wrong if someone reshaped this later: that a sentence promising permanence follows the
// SCHEMA, that the list is only changed once the database agrees, and that deleting a folder does
// not claim to destroy what is inside it, because ours does not.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isSoftDeleted } from "@/lib/workspace/library-filing";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const PAGE = read("./library-outputs.tsx");
const FILING = readFileSync(new URL("../../../lib/workspace/library-filing.ts", import.meta.url), "utf8");

test("🔴🔴 which shelves can be undone is read from the schema, not typed per caller", () => {
  // Checked against the live database 2026-09-04: study_decks has no `deleted` column and
  // study_cards cascades from it; readable_library_documents and assets both carry `deleted`.
  assert.equal(isSoftDeleted("deck"), false, "a deck delete is a hard delete and its cards cascade");
  assert.equal(isSoftDeleted("note"), true);
  assert.equal(isSoftDeleted("slides"), true);

  assert.match(
    PAGE,
    /const body = isSoftDeleted\(kind\) \? detail : `\$\{detail\} This can't be undone\.`;/,
    "the permanence sentence is hand-written per caller again, so it can drift from the table",
  );
  // And no caller may state it itself, which is how it would drift.
  const callers = PAGE.match(/removeRow\("(?:deck|note|slides)"[^)]*\)/g) ?? [];
  assert.equal(callers.length, 3, "a shelf lost its delete, or gained a second one");
  for (const caller of callers) {
    assert.ok(!/can't be undone/i.test(caller), `a caller writes its own permanence sentence: ${caller}`);
  }
});

test("🔴 deleting a folder does not claim to destroy what is inside it", () => {
  // Every child table is ON DELETE SET NULL against `folders` (assets, readable_library_documents,
  // study_decks, learning_canvases); only a child FOLDER cascades. The reference says "will be
  // permanently deleted with all files and subfolders", which is true of theirs and a lie about
  // ours. Verified against the live schema.
  assert.match(PAGE, /Anything filed in it moves back to your Library\. A folder inside it is deleted too\./);
  // 🔴 SCOPED TO THE COPY THE LEARNER READS, not the whole file: the comment above it quotes the
  // reference's own sentence in order to explain why ours differs, and a file-wide scan flagged
  // that explanation. A guard that punishes its own reasoning teaches people to delete the reasoning.
  const spoken = PAGE.slice(PAGE.indexOf("const removeFolderRow"), PAGE.indexOf("const removeFolderRow") + 1400);
  const said = spoken.slice(spoken.indexOf("body:"), spoken.indexOf("confirmLabel:"));
  assert.ok(!/permanently deleted with all files/.test(said), "the reference's copy was pasted in, and it is false here");
  // The rows really do come back to the root on screen, not just in the database.
  assert.match(PAGE, /setDecks\(\(was\) => was\.map\(\(row\) => \(row\.folderId === folder\.id \? \{ \.\.\.row, folderId: null \} : row\)\)\)/);
});

test("🔴 nothing on screen changes until the database agrees", () => {
  // A row that renames itself optimistically and then fails leaves the learner reading a name that
  // does not exist, findable only by reloading. Same rule `addFolder` already states.
  for (const [what, guard] of [
    ["rename", /if \(!\(await renameOutput\(kind, id, name\)\)\) return;/],
    ["delete", /if \(!\(await deleteOutput\(kind, id\)\)\) return;/],
    ["folder rename", /if \(!\(await renameFolder\(userId, folder\.id, name\)\)\) return;/],
    ["folder delete", /if \(!\(await deleteFolder\(userId, folder\.id\)\)\) return;/],
  ] as const) {
    assert.match(PAGE, guard, `${what} updates the list before the write is known to have landed`);
  }
});

test("🔴 a rename moves the name and never the address", () => {
  // A note's identity is its `path`, which every reader opens it by. Re-pathing would have to walk
  // the shared naming rules, race the unique constraint that counts soft-deleted rows, and break
  // links already held. The reference PATCHes the name alone too.
  const body = FILING.slice(FILING.indexOf("export async function renameOutput"));
  assert.ok(!/path/.test(body.slice(0, body.indexOf("export async function deleteOutput"))), "a rename touches the path");
  assert.match(FILING, /update\(\{ \[shelf\.nameColumn\]: trimmed \}\)/, "the rename stopped writing the shelf's own name column");
});

test("🔴 destructive is last, and a folder is not offered a folder", () => {
  // The reference puts Delete at the bottom, furthest from where the pointer rests.
  assert.ok(
    PAGE.indexOf("{onRename && <DropdownMenuItem") < PAGE.indexOf('data-testid="library-row-delete"'),
    "Delete is no longer last in the menu",
  );
  // Folders are one level deep by database trigger, so filing one into another is an offer the
  // write would refuse. The folder row passes no onFile at all.
  const folderMenu = PAGE.slice(PAGE.indexOf('deleteLabel="Delete folder"'), PAGE.indexOf('deleteLabel="Delete folder"') + 400);
  assert.ok(!/onFile=/.test(folderMenu), "a folder row offers Add to folder, which the database refuses");
  assert.match(PAGE, /<div className=\{ROW\}>\n\s+<button className=\{ROW_MAIN\}/, "the folder row is a button containing a button again");
});
