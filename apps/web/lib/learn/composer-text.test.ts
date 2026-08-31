import assert from "node:assert/strict";
import test from "node:test";

import { continueList, pastedFileName, pastedTextFile, PASTE_TO_FILE_CHARS } from "./composer-text";

// ── writing a list in the box, and pasting a document into it ────────────────
//
// Owner, 2026-08-31: the composer should carry *"the markdown style formats to
// it so that users can in a format, like, numbered or bullet lists"*, and should
// turn *"really long prompts that are pasted into text files or markdown files
// so that it doesn't take up the whole composer."*
//
// Pure, so these are value tests rather than source assertions.

/** Where a caret sits after typing `text`, for the common end-of-text case. */
const atEnd = (text: string) => text.length;

test("🔴 a bullet continues itself, keeping its marker and its indent", () => {
  const text = "  - first";
  const next = continueList(text, atEnd(text), atEnd(text));
  assert.ok(next);
  assert.equal(next.text, "  - first\n  - ");
  assert.equal(next.caret, next.text.length);
  // Every markdown bullet, not just the hyphen — the learner's own editor picks.
  for (const marker of ["-", "*", "+"]) {
    const line = `${marker} one`;
    assert.equal(continueList(line, atEnd(line), atEnd(line))?.text, `${marker} one\n${marker} `);
  }
});

test("🔴🔴 an ordered list counts on from the line above, never from one", () => {
  // Calibration: renumber from a counter and this reddens on the `3.` case —
  // which is a learner continuing a list that started in their notes.
  const third = "3. carbamazepine";
  assert.equal(continueList(third, atEnd(third), atEnd(third))?.text, "3. carbamazepine\n4. ");
  const paren = "1) first";
  assert.equal(continueList(paren, atEnd(paren), atEnd(paren))?.text, "1) first\n2) ");
  // The delimiter the learner chose is the delimiter that continues.
  const nine = "9. nine";
  assert.equal(continueList(nine, atEnd(nine), atEnd(nine))?.text, "9. nine\n10. ");
});

test("🔴 an empty item ENDS the list rather than laying another marker", () => {
  // The second press of the newline key is how every editor says "done".
  const text = "- first\n- ";
  const next = continueList(text, atEnd(text), atEnd(text));
  assert.ok(next);
  assert.equal(next.text, "- first\n");
  assert.equal(next.caret, "- first\n".length, "the caret should sit on the now-empty line");
});

test("a task box continues unticked, because a done task is not a template", () => {
  const done = "- [x] read chapter 4";
  assert.equal(continueList(done, atEnd(done), atEnd(done))?.text, "- [x] read chapter 4\n- [ ] ");
});

test("🔴 prose is left alone, and so is a selection", () => {
  const prose = "what is consideration";
  assert.equal(continueList(prose, atEnd(prose), atEnd(prose)), null);
  // A hyphen with no space after it is a word, not a bullet.
  assert.equal(continueList("re-entry", 8, 8), null);
  // Replacing a highlighted range with a newline is an edit, not a list gesture.
  const list = "- first";
  assert.equal(continueList(list, 2, 7), null);
});

test("continuing mid-line splits it and carries the marker down", () => {
  // Caret after "first", before " and second".
  const text = "- first and second";
  const next = continueList(text, 7, 7);
  assert.ok(next);
  assert.equal(next.text, "- first\n-  and second");
  assert.equal(next.caret, "- first\n- ".length);
});

test("🔴 a paste is filed only once it is a document, and it goes through the file door", () => {
  // Calibration: drop the threshold to a paragraph and quoting a passage into a
  // question would file it away where the learner cannot see what they asked about.
  const paragraph = "x".repeat(PASTE_TO_FILE_CHARS - 1);
  assert.equal(pastedTextFile(paragraph), null);
  const document = "y".repeat(PASTE_TO_FILE_CHARS);
  const file = pastedTextFile(document);
  assert.ok(file);
  // Markdown, so it lands in the same lane `attachUrl`'s synthetic file uses.
  assert.equal(file.type, "text/markdown");
  assert.equal(file.size, PASTE_TO_FILE_CHARS);
  assert.ok(file.name.endsWith(".md"));
});

test("🔴 the attachment is named from the text's own first line, because it becomes a source", () => {
  assert.equal(pastedFileName("# Pharmacokinetics — Lecture 4\n\nbody"), "Pharmacokinetics — Lecture 4.md");
  // Leading blank lines are not the title.
  assert.equal(pastedFileName("\n\n  Contracts outline\nmore"), "Contracts outline.md");
  // Characters a file name may not carry never reach it.
  assert.equal(pastedFileName("Unit 3/4: dosing?\nrest"), "Unit 3 4 dosing.md");
  // Nothing usable still yields a file rather than a refusal.
  assert.equal(pastedFileName("   \n\t\n"), "Pasted text.md");
  // 🔴 Field-agnostic: a law title and an engineering one survive identically.
  assert.equal(pastedFileName("Carlill v Carbolic Smoke Ball Co"), "Carlill v Carbolic Smoke Ball Co.md");
  // Long first lines are cut to a name, not carried whole.
  assert.ok(pastedFileName(`${"word ".repeat(40)}\nbody`).length <= 64);
});
