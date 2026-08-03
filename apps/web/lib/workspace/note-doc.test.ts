import assert from "node:assert/strict";
import { test } from "node:test";

import { docToMarkdown, markdownToDoc, roundTrip } from "./note-doc";
import { normalizeNoteMarkdown } from "./note-markdown";

// ── 🔴 THE REAL GATE ─────────────────────────────────────────────────────────
//
// note-markdown.test.ts proves remark holds a note steady. This proves the
// EDITOR does — markdown → editable document → markdown. That is the trip a
// note actually takes when a student opens it, and it is where content gets
// eaten: a construct the document model has no node for simply vanishes, and
// the save looks perfectly successful.
//
// The bar is deliberately the normalised form, not the raw source. The editor
// can only emit normalised markdown, so "unchanged" means "same as remark
// would have written it", and hasEdits() compares against that same baseline.

const holds = (label: string, markdown: string) => {
  test(`survives the editor: ${label}`, () => {
    assert.equal(roundTrip(markdown), normalizeNoteMarkdown(markdown));
  });
};

holds("a heading and a paragraph", "# Immunology\n\nThe **complement system** is a cascade.\n");
holds("bold and italic together", "This is **bold** and *italic* and ***both***.\n");
holds("a bullet list", "- First point\n- Second point\n");
holds("a nested list", "- Parent\n  - Child\n  - Child two\n- Sibling\n");
holds("an ordered list", "1. Step one\n2. Step two\n");
holds("a fenced code block with a language", "```ts\nconst x = 1;\n```\n");
holds("a code fence with no language", "```\nplain\n```\n");
holds("inline code", "Call `useState` here.\n");
holds("a blockquote", "> Remember this for the exam.\n");
holds("a horizontal rule", "Before.\n\n***\n\nAfter.\n");
holds("strikethrough", "This is ~~wrong~~ right.\n");
holds("a link", "See [the notes](https://example.edu/notes).\n");
holds("a heading at every level", "# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n");

// The four that would silently disappear with the stock ProseMirror parser.

test("a GFM table keeps every cell", () => {
  const table = "| Pathway | Trigger |\n| --- | --- |\n| Classical | Antibody |\n| Lectin | Mannose |\n";
  const out = roundTrip(table);
  for (const cell of ["Pathway", "Trigger", "Classical", "Antibody", "Lectin", "Mannose"]) {
    assert.ok(out.includes(cell), `the editor lost the cell ${cell}`);
  }
  assert.equal(out, normalizeNoteMarkdown(table));
});

test("a task list keeps its boxes, and a plain list does NOT grow any", () => {
  assert.equal(roundTrip("- [ ] Read chapter 4\n- [x] Finish problem set\n"), "- [ ] Read chapter 4\n- [x] Finish problem set\n");
  // The three-state trap: `checked: null` is an ordinary bullet. If it were a
  // boolean, every plain list in the library would come back as "- [ ]".
  assert.equal(roundTrip("- Plain bullet\n"), "- Plain bullet\n");
});

test("inline maths survives as maths, not as prose", () => {
  assert.equal(roundTrip("The energy is $E = mc^2$ exactly.\n"), "The energy is $E = mc^2$ exactly.\n");
});

test("block maths survives", () => {
  const block = "$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\n";
  assert.equal(roundTrip(block), normalizeNoteMarkdown(block));
});

// ── Doing it twice must not drift further ────────────────────────────────────

test("a second save changes nothing a first save did not", () => {
  const notes = [
    "# Title\n\n- a\n- b\n",
    "| A | B |\n| --- | --- |\n| 1 | 2 |\n",
    "- [x] done\n- [ ] not\n",
    "Text with $x^2$ and **bold**.\n",
    "> quote\n>\n> second para\n",
  ];
  for (const note of notes) {
    const once = roundTrip(note);
    assert.equal(roundTrip(once), once, `${JSON.stringify(note)} kept drifting`);
  }
});

// ── The document model itself ────────────────────────────────────────────────

test("an empty note still gives the student somewhere to type", () => {
  const doc = markdownToDoc("");
  assert.equal(doc.childCount, 1);
  assert.equal(doc.firstChild?.type.name, "paragraph");
});

test("an empty list item does not break the document", () => {
  // `list_item` requires `block+`; without a placeholder paragraph the whole
  // document fails to build and the note will not open at all.
  const doc = markdownToDoc("- \n");
  assert.ok(doc.childCount >= 1);
  assert.equal(docToMarkdown(doc).includes("-"), true);
});

test("a code block cannot carry bold, because markdown could not write it back", () => {
  const doc = markdownToDoc("```\nconst x = 1;\n```\n");
  const code = doc.firstChild!;
  assert.equal(code.type.name, "code_block");
  assert.equal(code.type.spec.marks, "");
});

test("headings keep their level through the document", () => {
  const doc = markdownToDoc("### Third level\n");
  assert.equal(doc.firstChild?.type.name, "heading");
  assert.equal(doc.firstChild?.attrs.level, 3);
});

test("a link keeps its address", () => {
  const doc = markdownToDoc("[notes](https://example.edu/x)\n");
  const text = doc.firstChild!.firstChild!;
  const link = text.marks.find((mark) => mark.type.name === "link");
  assert.equal(link?.attrs.href, "https://example.edu/x");
});
