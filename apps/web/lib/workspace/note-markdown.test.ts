import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasEdits,
  isEditableNote,
  normalizeNoteMarkdown,
  wouldReformat,
} from "./note-markdown";

// ── 🔴 THE GATE ──────────────────────────────────────────────────────────────
//
// Owner's rule for the editor: opening a note and saving it must not reword
// what the student did not touch. These tests are that rule, written down.
//
// The dangerous failure is not a changed bullet character — it is a note that
// comes back with its TABLE GONE. Every construct below is one the app's own
// renderer supports (remark-gfm + remark-math), so any of them can be sitting
// in a real note right now.

const survives = (label: string, markdown: string) => {
  test(`content survives: ${label}`, () => {
    assert.equal(normalizeNoteMarkdown(markdown), markdown);
  });
};

survives("a heading and a paragraph", "# Immunology\n\nThe **complement system** is a cascade.\n");
survives("a hyphen bullet list", "- First point\n- Second point\n");
survives("a nested list", "- Parent\n  - Child\n  - Child two\n- Sibling\n");
survives("an ordered list", "1. Step one\n2. Step two\n");
survives("a task list", "- [ ] Read chapter 4\n- [x] Finish problem set\n");
survives("a fenced code block", "Use `useState` here.\n\n```ts\nconst x = 1;\n```\n");
survives("inline maths", "The energy is $E = mc^2$ exactly.\n");
survives("block maths", "$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\n");
survives("strikethrough", "This is ~~wrong~~ right.\n");
survives("a link", "See [the notes](https://example.edu/notes) and *emphasis*.\n");
survives("a blockquote", "> Remember this for the exam.\n");
survives("a footnote", "A claim.[^1]\n\n[^1]: The source.\n");
survives("a reference link", "See [the notes][ref].\n\n[ref]: https://example.edu\n");
survives("raw HTML", '<div class="callout">Careful</div>\n');

test("a table keeps every cell, which is the one that would really hurt", () => {
  const table = "| Pathway | Trigger |\n| --- | --- |\n| Classical | Antibody |\n| Lectin | Mannose |\n";
  const out = normalizeNoteMarkdown(table);
  // The pipes get re-padded — cosmetic, and idempotent. The DATA must be whole.
  for (const cell of ["Pathway", "Trigger", "Classical", "Antibody", "Lectin", "Mannose"]) {
    assert.ok(out.includes(cell), `lost the cell ${cell}`);
  }
  assert.equal(out.split("\n").filter((line) => line.startsWith("|")).length, 4, "still four table rows");
});

// ── The normalisation that IS expected, and why it is safe ───────────────────

test("the shapes that do reformat settle on the first pass and never move again", () => {
  // A serializer must pick one bullet character and one emphasis character, so
  // these cannot all be preserved. What can be guaranteed is that they stop
  // changing — a note does not drift a little further on every save.
  const drifters = [
    "* Alpha\n* Beta\n",
    "This is _emphasised_ text.\n",
    "Line one  \nLine two\n",
    "Title\n=====\n\nBody.\n",
    "| A | B |\n| --- | --- |\n| 1 | 2 |\n",
  ];
  for (const source of drifters) {
    const once = normalizeNoteMarkdown(source);
    const twice = normalizeNoteMarkdown(once);
    assert.equal(twice, once, `${JSON.stringify(source)} kept drifting on a second save`);
  }
});

test("a note that would reformat can be spotted before the student types", () => {
  assert.equal(wouldReformat("* Alpha\n"), true);
  assert.equal(wouldReformat("- Alpha\n"), false);
});

// ── 🔴 THE REAL GUARD: never write a note nobody edited ──────────────────────
//
// The serializer cannot be made lossless, so the owner's rule is kept a
// different way — by not saving at all unless something actually changed.

test("opening a note and closing it is NOT an edit, even when it would reformat", () => {
  // The trap: the source uses "*" bullets, so the editor emits "-" bullets. A
  // naive `edited !== original` would call that an edit and rewrite the note
  // the moment the student clicked into it — silently reformatting a whole
  // library one note at a time.
  const original = "* Alpha\n* Beta\n";
  const straightBackOut = normalizeNoteMarkdown(original);
  assert.notEqual(straightBackOut, original, "precondition: this note does reformat");
  assert.equal(hasEdits(original, straightBackOut), false, "but it must not count as an edit");
});

test("a real change is still an edit", () => {
  assert.equal(hasEdits("- Alpha\n", "- Alpha\n- Beta\n"), true);
});

test("an already-tidy note is unchanged and unedited", () => {
  const tidy = "# Title\n\nBody text.\n";
  assert.equal(normalizeNoteMarkdown(tidy), tidy);
  assert.equal(hasEdits(tidy, tidy), false);
});

// ── What the editor refuses to open ──────────────────────────────────────────

test("notes the editing model cannot represent stay read-only", () => {
  assert.equal(isEditableNote('<div class="callout">Careful</div>\n'), false);
  assert.equal(isEditableNote("A claim.[^1]\n\n[^1]: The source.\n"), false);
  assert.equal(isEditableNote("---\ntitle: Notes\n---\n\nBody.\n"), false);
});

test("an ordinary note is editable", () => {
  assert.equal(isEditableNote("# Title\n\n- a\n- b\n\n$E = mc^2$\n"), true);
  assert.equal(isEditableNote("| A | B |\n| --- | --- |\n| 1 | 2 |\n"), true);
});
