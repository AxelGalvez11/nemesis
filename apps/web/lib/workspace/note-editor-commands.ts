// What the note toolbar can DO (owner 2026-08-04: "keep it minimal … Looks
// like developer docs, edits like Google Docs"). Exactly the owner's list —
// heading, bold/italic, bullets/numbers, checklist, link to another note,
// image, table, code block, equation, quote — and nothing else. A "/" menu
// over the same catalogue was deliberately DEFERRED (owner: "Don't do the
// slash commands this round").
//
// 🔴 NO DOM. Every command here works on EditorState alone, so the whole
// catalogue is testable in node against real markdown round-trips, and the
// toolbar UI (note-toolbar.tsx) is only ever glue.

import { lift, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { liftListItem, wrapInList } from "prosemirror-schema-list";
import type { MarkType, Node as PmNode, NodeType } from "prosemirror-model";
import { TextSelection, type Command, type EditorState } from "prosemirror-state";

import { noteSchema } from "./note-schema";

const N = noteSchema.nodes;

// ── Selection questions the toolbar asks ─────────────────────────────────────

export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { $from, empty, from, to } = state.selection;
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
}

function ancestorOf(state: EditorState, type: NodeType): { node: PmNode; pos: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === type) return { node: $from.node(depth), pos: $from.before(depth) };
  }
  return null;
}

/** The nearest containing list, whichever flavor. */
function nearestList(state: EditorState): { node: PmNode; pos: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === N.bullet_list || node.type === N.ordered_list) return { node, pos: $from.before(depth) };
  }
  return null;
}

/** What the heading picker should read for the current block. */
export type NoteBlockKind = "paragraph" | "h1" | "h2" | "h3" | "other";

export function currentBlockKind(state: EditorState): NoteBlockKind {
  const parent = state.selection.$from.parent;
  if (parent.type === N.paragraph) return "paragraph";
  if (parent.type === N.heading) {
    const level = parent.attrs.level as number;
    return level === 1 ? "h1" : level === 2 ? "h2" : level === 3 ? "h3" : "other";
  }
  return "other";
}

export function isInList(state: EditorState, ordered: boolean): boolean {
  const list = nearestList(state);
  return list !== null && list.node.type === (ordered ? N.ordered_list : N.bullet_list);
}

/** Is the caret inside a checklist item (checked true or false, not null)? */
export function isInChecklist(state: EditorState): boolean {
  const item = ancestorOf(state, N.list_item!);
  return item !== null && item.node.attrs.checked !== null;
}

export function isInQuote(state: EditorState): boolean {
  return ancestorOf(state, N.blockquote!) !== null;
}

export function isInCodeBlock(state: EditorState): boolean {
  return state.selection.$from.parent.type === N.code_block;
}

// ── Commands ─────────────────────────────────────────────────────────────────

export function setBlockKind(kind: "paragraph" | "h1" | "h2" | "h3"): Command {
  if (kind === "paragraph") return setBlockType(N.paragraph!);
  return setBlockType(N.heading!, { level: Number(kind.slice(1)) });
}

export const toggleBold: Command = toggleMark(noteSchema.marks.strong!);
export const toggleItalic: Command = toggleMark(noteSchema.marks.em!);

/**
 * Bullet/numbered toggle: outside any list it wraps, inside the SAME flavor
 * it lifts back out, and inside the OTHER flavor it switches the list in
 * place — pressing "numbered" on a bulleted list must not nest a second list.
 */
export function toggleList(ordered: boolean): Command {
  const target = ordered ? N.ordered_list! : N.bullet_list!;
  return (state, dispatch) => {
    const list = nearestList(state);
    if (!list) return wrapInList(target)(state, dispatch);
    if (list.node.type === target) return liftListItem(N.list_item!)(state, dispatch);
    if (dispatch) dispatch(state.tr.setNodeMarkup(list.pos, target, ordered ? { start: 1 } : null));
    return true;
  };
}

/**
 * Checklist: on list items it toggles the checkbox's existence (null ↔
 * false) across every item the selection touches; outside a list it wraps
 * first and checks the new items in the same transaction.
 */
export const toggleChecklist: Command = (state, dispatch) => {
  const { from, to } = state.selection;
  const items: { node: PmNode; pos: number }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === N.list_item) items.push({ node, pos });
  });
  if (items.length > 0) {
    const target = items[0]!.node.attrs.checked === null ? false : null;
    if (dispatch) {
      const tr = state.tr;
      for (const item of items) tr.setNodeMarkup(item.pos, undefined, { checked: target });
      dispatch(tr);
    }
    return true;
  }
  return wrapInList(N.bullet_list!)(state, (tr) => {
    tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
      if (node.type === N.list_item) tr.setNodeMarkup(pos, undefined, { checked: false });
    });
    dispatch?.(tr);
  });
};

export const toggleQuote: Command = (state, dispatch) =>
  (ancestorOf(state, N.blockquote!) ? lift(state, dispatch) : wrapIn(N.blockquote!)(state, dispatch));

export const toggleCodeBlock: Command = (state, dispatch) =>
  setBlockType(isInCodeBlock(state) ? N.paragraph! : N.code_block!)(state, dispatch);

/** Replace the selection with a live [[wiki link]] to another note. */
export function insertNoteLink(target: string): Command {
  return (state, dispatch) => {
    const trimmed = target.trim();
    if (!trimmed) return false;
    if (dispatch) dispatch(state.tr.replaceSelectionWith(N.wiki_link!.create({ label: null, target: trimmed }), false).scrollIntoView());
    return true;
  };
}

/** Insert a picture at the caret (URL-based; alt text is the caption). */
export function insertImage(src: string, alt = ""): Command {
  return (state, dispatch) => {
    const trimmed = src.trim();
    if (!trimmed) return false;
    if (dispatch) dispatch(state.tr.replaceSelectionWith(N.image!.create({ alt, src: trimmed, title: null }), false).scrollIntoView());
    return true;
  };
}

/** A block AFTER the current top-level block — or in place of an empty
 *  paragraph, so inserting on a blank line does what it looks like it will. */
function insertBlock(built: PmNode): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const emptyTopParagraph = $from.depth === 1 && $from.parent.type === N.paragraph && $from.parent.content.size === 0;
    if (dispatch) {
      const at = emptyTopParagraph ? $from.before(1) : $from.after(1);
      const tr = emptyTopParagraph ? state.tr.replaceWith($from.before(1), $from.after(1), built) : state.tr.insert($from.after(1), built);
      // Land the caret inside the new block when it can hold one (table's
      // first header cell); atoms (equations) just get selected-past.
      const caret = at + (built.isAtom ? built.nodeSize : 3);
      const selection = TextSelection.between(tr.doc.resolve(caret), tr.doc.resolve(caret));
      dispatch(tr.setSelection(selection).scrollIntoView());
    }
    return true;
  };
}

export const insertTable: Command = (state, dispatch) =>
  insertBlock(
    N.table!.create(null, [
      N.table_row!.create(null, [N.table_header!.create(), N.table_header!.create()]),
      N.table_row!.create(null, [N.table_cell!.create(), N.table_cell!.create()]),
    ]),
  )(state, dispatch);

export function insertEquation(latex: string): Command {
  return (state, dispatch) => {
    const trimmed = latex.trim();
    if (!trimmed) return false;
    return insertBlock(N.math_block!.create({ latex: trimmed }))(state, dispatch);
  };
}

// ── The toolbar's catalogue ──────────────────────────────────────────────────

/** Inputs a command needs from the student before it can run. */
export type NoteMenuInput = "note" | "image" | "equation" | null;

export interface NoteMenuItem {
  id: string;
  /** What the student reads in the menu. */
  label: string;
  /** One short line under the label. */
  hint: string;
  /** Codicon name for the toolbar/menu. */
  icon: string;
  /** Extra words that should find this item. */
  keywords: string[];
  input: NoteMenuInput;
}

/** Deliberately the OWNER'S LIST and nothing more — no giant block system. */
export const NOTE_MENU: NoteMenuItem[] = [
  { hint: "Big section title", icon: "symbol-text", id: "h1", input: null, keywords: ["title", "heading", "big"], label: "Heading 1" },
  { hint: "Medium section title", icon: "symbol-text", id: "h2", input: null, keywords: ["subtitle", "heading"], label: "Heading 2" },
  { hint: "Small section title", icon: "symbol-text", id: "h3", input: null, keywords: ["heading", "small"], label: "Heading 3" },
  { hint: "A simple bulleted list", icon: "list-unordered", id: "bullets", input: null, keywords: ["bullet", "point", "unordered"], label: "Bulleted list" },
  { hint: "A numbered list", icon: "list-ordered", id: "numbers", input: null, keywords: ["number", "ordered", "steps"], label: "Numbered list" },
  { hint: "Tick things off as you go", icon: "checklist", id: "checklist", input: null, keywords: ["todo", "task", "checkbox", "check"], label: "Checklist" },
  { hint: "Link to another note", icon: "link", id: "note-link", input: "note", keywords: ["link", "wiki", "note", "connect"], label: "Link to note" },
  { hint: "A picture, by web address", icon: "file-media", id: "image", input: "image", keywords: ["image", "picture", "photo", "diagram"], label: "Image" },
  { hint: "Rows and columns", icon: "table", id: "table", input: null, keywords: ["table", "grid", "rows", "columns"], label: "Table" },
  { hint: "Code, kept as you typed it", icon: "code", id: "code", input: null, keywords: ["code", "snippet", "monospace"], label: "Code block" },
  { hint: "Display maths (LaTeX)", icon: "symbol-operator", id: "equation", input: "equation", keywords: ["equation", "math", "latex", "formula"], label: "Equation" },
  { hint: "Set a passage apart", icon: "quote", id: "quote", input: null, keywords: ["quote", "callout", "blockquote"], label: "Quote" },
];

/** The command behind a menu id. Input-taking ids get their input here. */
export function noteMenuCommand(id: string, input?: string): Command | null {
  switch (id) {
    case "h1":
    case "h2":
    case "h3":
      return setBlockKind(id);
    case "bullets":
      return toggleList(false);
    case "numbers":
      return toggleList(true);
    case "checklist":
      return toggleChecklist;
    case "note-link":
      return insertNoteLink(input ?? "");
    case "image":
      return insertImage(input ?? "");
    case "table":
      return insertTable;
    case "code":
      return toggleCodeBlock;
    case "equation":
      return insertEquation(input ?? "");
    case "quote":
      return toggleQuote;
    default:
      return null;
  }
}
