import assert from "node:assert/strict";
import test from "node:test";

import { findFolderNote, folderNoteTitle, isFolderNote, parentFolderOf } from "./library-folder-note";

function note(path: string, title = ""): { id: string; path: string; title: string; content: string; updatedAt: string; createdAt: string } {
  return { content: "", createdAt: "", id: path, path, title, updatedAt: "" };
}

test("folderNoteTitle is the folder's own last segment", () => {
  assert.equal(folderNoteTitle("Contract law/Unit 3"), "Unit 3");
  assert.equal(folderNoteTitle("Biology"), "Biology");
  assert.equal(folderNoteTitle(" Biology / Cells "), "Cells");
});

test("parentFolderOf strips the leaf", () => {
  assert.equal(parentFolderOf("Contract law/Unit 3/Offer.md"), "Contract law/Unit 3");
  assert.equal(parentFolderOf("Offer.md"), "");
});

test("a note named like its parent folder is that folder's page", () => {
  assert.equal(isFolderNote(note("Contract law/Contract law.md")), true);
  assert.equal(isFolderNote(note("Contract law/CONTRACT LAW.md")), true);
  assert.equal(isFolderNote(note("Contract law/Unit 3/unit 3.md")), true);
  // The title column counts too — a renamed file whose title still matches.
  assert.equal(isFolderNote(note("Biology/anything.md", "Biology")), true);
});

test("ordinary notes and top-level notes are not folder pages", () => {
  assert.equal(isFolderNote(note("Contract law/Offer.md")), false);
  assert.equal(isFolderNote(note("Home.md")), false);
  assert.equal(isFolderNote(note("Biology.md", "Biology")), false);
});

test("findFolderNote resolves case-insensitively and extension-blind", () => {
  const notes = [note("Contract law/Offer.md"), note("Contract law/Unit 3/UNIT 3.md"), note("Home.md")];
  assert.equal(findFolderNote(notes, "Contract law/Unit 3")?.path, "Contract law/Unit 3/UNIT 3.md");
  assert.equal(findFolderNote(notes, "contract law/unit 3")?.path, "Contract law/Unit 3/UNIT 3.md");
  assert.equal(findFolderNote(notes, "Contract law"), null);
});

test("findFolderNote matches by row title when the filename differs", () => {
  const notes = [note("Biology/intro-page.md", "Biology")];
  assert.equal(findFolderNote(notes, "Biology")?.path, "Biology/intro-page.md");
  // A note in the WRONG folder never matches, even with the right name.
  assert.equal(findFolderNote(notes, "Chemistry"), null);
});
