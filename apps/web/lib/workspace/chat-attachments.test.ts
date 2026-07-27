import assert from "node:assert/strict";
import test from "node:test";

import { fitAttachmentBlocks, groupChatAttachments, partitionImportables, MAX_ATTACHMENT_CHARS, MAX_TOTAL_CHARS } from "./chat-attachments";

function attachment(name: string, path = ""): File {
  return {
    lastModified: 1,
    name,
    type: "text/plain",
    webkitRelativePath: path,
  } as File;
}

test("folder selections render as one attachment group", () => {
  const files = [
    attachment("week-1.md", "Cardiology/week-1.md"),
    attachment("week-2.md", "Cardiology/notes/week-2.md"),
    attachment("outline.pdf"),
  ];

  const groups = groupChatAttachments(files);

  assert.deepEqual(groups.map(({ kind, label, files: children }) => ({ kind, label, count: children.length })), [
    { kind: "folder", label: "Cardiology", count: 2 },
    { kind: "file", label: "outline.pdf", count: 1 },
  ]);
});

test("a lecture deck that fits is sent whole, with nothing appended", () => {
  const deck = "Learning objective 1. ".repeat(400);

  const [block] = fitAttachmentBlocks([{ label: "lecture.pptx", type: "application/pptx", content: deck }]);

  assert.ok(block?.includes(deck.trim()), "the whole deck should reach the model");
  assert.ok(!block?.includes("Truncated"), "nothing was cut, so nothing should claim it was");
});

test("a deck too big to send says so instead of silently losing its back half", () => {
  const huge = `${"x".repeat(MAX_ATTACHMENT_CHARS)}THE-FINAL-SLIDE`;

  const [block] = fitAttachmentBlocks([{ label: "big.pptx", type: "application/pptx", content: huge }]);

  assert.ok(!block?.includes("THE-FINAL-SLIDE"), "the tail is genuinely over budget");
  // The whole point of the fix: the model is told, so it can tell the student.
  assert.ok(block?.includes("Truncated"), "truncation must be disclosed, not silent");
  assert.ok(block?.includes(huge.length.toLocaleString()), "disclose the true size so the gap is knowable");
});

test("attachments past the total budget are reported, never dropped in silence", () => {
  // It takes more than one file to exhaust the total: the per-file cap clips a
  // single huge deck long before the shared budget runs out. Two full-size
  // decks spend it, so the third is the one that never reaches the model.
  const full = "y".repeat(MAX_ATTACHMENT_CHARS);
  const blocks = fitAttachmentBlocks([
    { label: "first.pptx", type: "application/pptx", content: full },
    { label: "second.pptx", type: "application/pptx", content: full },
    { label: "third.pptx", type: "application/pptx", content: "the third deck" },
  ]);

  const joined = blocks.join("\n");
  assert.ok(joined.includes("third.pptx"), "the student must learn this file was not read");
  assert.ok(!joined.includes("the third deck"), "and its content genuinely did not fit");
  assert.ok(joined.includes("Not read"), "skipped files get their own labelled block");
});

test("different selected folders remain separate", () => {
  const groups = groupChatAttachments([
    attachment("a.md", "Cardiology/a.md"),
    attachment("b.md", "Neurology/b.md"),
  ]);

  assert.deepEqual(groups.map(({ key, label }) => ({ key, label })), [
    { key: "folder:Cardiology", label: "Cardiology" },
    { key: "folder:Neurology", label: "Neurology" },
  ]);
});

// An .apkg is a zip around a SQLite database, so the text extractor has nothing
// to say about it. Before this split, chat answered "no text extractor is
// available for this format" while the app carried a whole importer for it.
test("a deck goes to the importer while everything else still reaches the model", () => {
  const { decks, rest } = partitionImportables([
    attachment("AnKing-Step1.apkg"),
    attachment("lecture.pdf"),
    attachment("collection.colpkg"),
  ]);

  assert.deepEqual(decks.map((file) => file.name), ["AnKing-Step1.apkg", "collection.colpkg"]);
  assert.deepEqual(rest.map((file) => file.name), ["lecture.pdf"]);
});

test("an ordinary attachment selection is left entirely alone", () => {
  const { decks, rest } = partitionImportables([attachment("notes.md"), attachment("slides.pptx")]);
  assert.equal(decks.length, 0);
  assert.equal(rest.length, 2);
});
