import assert from "node:assert/strict";
import test from "node:test";

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";

import { toggleInlineFormat, type ToggleFormat } from "./library-inline-format";

function stateWith(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
    selection: EditorSelection.single(anchor, head),
  });
}

function apply(doc: string, anchor: number, head: number, format: ToggleFormat): { doc: string; from: number; to: number } {
  const state = stateWith(doc, anchor, head);
  const result = toggleInlineFormat(state, format);
  const tr = state.update({
    changes: result.changes,
    selection: { anchor: result.selection.anchor, head: result.selection.head ?? result.selection.anchor },
  });
  return { doc: tr.state.doc.toString(), from: tr.state.selection.main.from, to: tr.state.selection.main.to };
}

test("bold wraps a selection, and a second click unwraps it", () => {
  const once = apply("take this drug daily", 5, 9, "bold");
  assert.equal(once.doc, "take **this** drug daily");
  assert.equal(once.doc.slice(once.from, once.to), "this");
  const twice = apply(once.doc, once.from, once.to, "bold");
  assert.equal(twice.doc, "take this drug daily");
});

test("a bare cursor inside a word bolds the word; again removes it", () => {
  const once = apply("warfarin dosing", 3, 3, "bold");
  assert.equal(once.doc, "**warfarin** dosing");
  const twice = apply(once.doc, 5, 5, "bold");
  assert.equal(twice.doc, "warfarin dosing");
});

test("bold never stacks: cursor anywhere in **word** toggles it off", () => {
  assert.equal(apply("a **word** b", 4, 4, "bold").doc, "a word b");
  assert.equal(apply("a **word** b", 2, 10, "bold").doc, "a word b");
});

test("italic and bold stay distinct: italic inside bold nests, bold inside both unwraps only bold", () => {
  const italicized = apply("**word**", 4, 4, "italic");
  assert.equal(italicized.doc, "***word***");
  const unbolded = apply("***word***", 5, 5, "bold");
  assert.equal(unbolded.doc, "*word*");
});

test("inline code toggles both directions", () => {
  const once = apply("run npm install now", 4, 15, "code");
  assert.equal(once.doc, "run `npm install` now");
  const twice = apply(once.doc, once.from, once.to, "code");
  assert.equal(twice.doc, "run npm install now");
});

test("highlight toggles via line scan", () => {
  const once = apply("the key fact here", 4, 12, "highlight");
  assert.equal(once.doc, "the ==key fact== here");
  const twice = apply(once.doc, 8, 8, "highlight");
  assert.equal(twice.doc, "the key fact here");
});

test("underline toggles its html tags", () => {
  const once = apply("mind the gap", 5, 8, "underline");
  assert.equal(once.doc, "mind <u>the</u> gap");
  const twice = apply(once.doc, 9, 9, "underline");
  assert.equal(twice.doc, "mind the gap");
});

test("selecting the delimiters themselves also unwraps", () => {
  assert.equal(apply("==hot== take", 0, 7, "highlight").doc, "hot take");
});

test("empty ground inserts a selected placeholder that a second click unwraps", () => {
  const once = apply("", 0, 0, "bold");
  assert.equal(once.doc, "**bold text**");
  assert.equal(once.doc.slice(once.from, once.to), "bold text");
  const twice = apply(once.doc, once.from, once.to, "bold");
  assert.equal(twice.doc, "bold text");
});
