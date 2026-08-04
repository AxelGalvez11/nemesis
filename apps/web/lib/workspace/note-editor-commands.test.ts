import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection, type Command, type Transaction } from "prosemirror-state";

import { docToMarkdown, markdownToDoc } from "./note-doc";
import {
  currentBlockKind,
  insertEquation,
  insertImage,
  insertNoteLink,
  insertTable,
  isInChecklist,
  isInList,
  isMarkActive,
  NOTE_MENU,
  noteMenuCommand,
  setBlockKind,
  toggleBold,
  toggleChecklist,
  toggleCodeBlock,
  toggleList,
  toggleQuote,
} from "./note-editor-commands";
import { noteSchema } from "./note-schema";

/** An editor state over `markdown` with the selection at [from, to] — found by
 *  locating `needle` in the document's text when given, else the doc start. */
function stateFor(markdown: string, needle?: string): EditorState {
  const doc = markdownToDoc(markdown);
  let selection: TextSelection | undefined;
  if (needle) {
    let found: { from: number; to: number } | null = null;
    doc.descendants((node, pos) => {
      if (found || !node.isText || !node.text) return;
      const at = node.text.indexOf(needle);
      if (at >= 0) found = { from: pos + at, to: pos + at + needle.length };
    });
    if (!found) throw new Error(`needle not in doc: ${needle}`);
    selection = TextSelection.create(doc, (found as { from: number }).from, (found as { to: number }).to);
  }
  return EditorState.create({ doc, schema: noteSchema, selection });
}

/** Run a command and return the note as it would be SAVED. */
function apply(state: EditorState, command: Command): string {
  let next = state;
  const ran = command(state, (tr: Transaction) => {
    next = state.apply(tr);
  });
  assert.ok(ran, "command reported it could not run");
  return docToMarkdown(next.doc);
}

test("headings set and read back", () => {
  const state = stateFor("Immunology basics\n", "Immunology");
  assert.equal(currentBlockKind(state), "paragraph");
  assert.equal(apply(state, setBlockKind("h2")), "## Immunology basics\n");
  assert.equal(currentBlockKind(stateFor("## Immunology basics\n", "Immunology")), "h2");
});

test("bold toggles on a selection and reports active", () => {
  const state = stateFor("The complement system\n", "complement");
  assert.equal(isMarkActive(state, noteSchema.marks.strong!), false);
  assert.equal(apply(state, toggleBold), "The **complement** system\n");
  const bolded = stateFor("The **complement** system\n", "complement");
  assert.equal(isMarkActive(bolded, noteSchema.marks.strong!), true);
});

test("bullet list wraps, same flavor lifts back out", () => {
  const state = stateFor("First point\n", "First");
  assert.equal(apply(state, toggleList(false)), "- First point\n");
  const inList = stateFor("- First point\n", "First");
  assert.equal(isInList(inList, false), true);
  assert.equal(apply(inList, toggleList(false)), "First point\n");
});

test("numbered on a bulleted list SWITCHES it instead of nesting", () => {
  const state = stateFor("- Step one\n- Step two\n", "Step one");
  assert.equal(apply(state, toggleList(true)), "1. Step one\n2. Step two\n");
});

test("checklist toggles boxes on and off, and wraps bare text", () => {
  const bare = stateFor("Read chapter 4\n", "Read");
  assert.equal(apply(bare, toggleChecklist), "- [ ] Read chapter 4\n");
  const listed = stateFor("- Read chapter 4\n", "Read");
  assert.equal(apply(listed, toggleChecklist), "- [ ] Read chapter 4\n");
  const checked = stateFor("- [x] Read chapter 4\n", "Read");
  assert.equal(isInChecklist(checked), true);
  assert.equal(apply(checked, toggleChecklist), "- Read chapter 4\n");
});

test("quote wraps and lifts", () => {
  const state = stateFor("Remember this.\n", "Remember");
  assert.equal(apply(state, toggleQuote), "> Remember this.\n");
  assert.equal(apply(stateFor("> Remember this.\n", "Remember"), toggleQuote), "Remember this.\n");
});

test("code block toggles and comes back as prose", () => {
  const state = stateFor("const x = 1;\n", "const");
  assert.equal(apply(state, toggleCodeBlock), "```\nconst x = 1;\n```\n");
  assert.equal(apply(stateFor("```\nconst x = 1;\n```\n", "const"), toggleCodeBlock), "const x = 1;\n");
});

test("a note link replaces the selection with a live wiki link", () => {
  const state = stateFor("See the torts outline here.\n", "here");
  assert.equal(apply(state, insertNoteLink("Torts outline")), "See the torts outline [[Torts outline]].\n");
  assert.equal(insertNoteLink("   ")(state), false);
});

test("an image lands at the caret and serialises as markdown", () => {
  const state = stateFor("The pathway:\n", "pathway:");
  const out = apply(EditorState.create({ doc: state.doc, selection: TextSelection.create(state.doc, state.doc.content.size - 1) }), insertImage("https://example.edu/cascade.png", "cascade"));
  assert.ok(out.includes("![cascade](https://example.edu/cascade.png)"), out);
});

test("a table inserts as a 2x2 grid after the current block", () => {
  const out = apply(stateFor("Notes on beams\n", "beams"), insertTable);
  assert.ok(out.includes("Notes on beams"), out);
  const rows = out.split("\n").filter((line) => line.startsWith("|"));
  assert.equal(rows.length, 3, `expected header + divider + one body row, got:\n${out}`);
});

test("a table replaces an empty line instead of leaving it behind", () => {
  const out = apply(stateFor(""), insertTable);
  assert.equal(out.split("\n").filter((line) => line.startsWith("|")).length, 3);
  assert.ok(!/^\s*$/m.test(out.trim()), out);
});

test("an equation inserts as display maths", () => {
  const out = apply(stateFor("Stress varies:\n", "varies"), insertEquation("\\sigma = My/I"));
  assert.ok(out.includes("$$\n\\sigma = My/I\n$$"), out);
});

test("every menu id resolves to a runnable command", () => {
  for (const item of NOTE_MENU) {
    const command = noteMenuCommand(item.id, item.input ? "placeholder" : undefined);
    assert.ok(command, `menu id ${item.id} has no command`);
  }
  assert.equal(noteMenuCommand("divider"), null);
});
