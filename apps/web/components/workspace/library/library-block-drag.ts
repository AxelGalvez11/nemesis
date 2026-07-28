// Notion-style block dragging for the Library editor (owner 2026-07-27:
// "more like notion ... features like draging components").
//
// The deliberate choice here is that this moves LINES OF MARKDOWN, nothing
// else. A real block editor keeps its own document model and serialises back to
// markdown on save, which is where wikilinks, YAML properties and anything
// Obsidian-specific quietly die. Reordering text ranges cannot lose a
// character it does not understand, because it never parses one.

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from "@codemirror/view";

/** Whether a block is one item of a list, which decides how much whitespace
 *  goes between it and its neighbour when the document is rebuilt. */
export type BlockKind = "block" | "list-item";

export interface DocBlock {
  /** Document offset of the block's first character. */
  from: number;
  /** Document offset just past its last character. */
  to: number;
  /** 0-based position among the document's blocks. */
  index: number;
  kind: BlockKind;
}

/**
 * The document's draggable blocks — a paragraph, heading, quote, code fence or
 * table each count as one, and a list contributes ONE BLOCK PER ITEM rather
 * than moving as a lump (owner 2026-07-28: "the dragability of note components
 * is not applicable to individual bullet points. it groups bullet points
 * together").
 *
 * A nested sub-list lives inside its parent ListItem's range, so dragging a
 * bullet takes its children with it and sub-bullets get no handle of their own.
 * That is deliberate: an independent sub-bullet dropped next to a heading would
 * have to be re-indented to stay valid markdown, and silently rewriting a
 * student's indentation is a worse bug than the one being fixed here.
 *
 * Frontmatter is deliberately excluded: YAML properties belong at the top of
 * the file, and letting someone drag a paragraph above them would produce a
 * note whose properties silently stop being properties.
 */
export function documentBlocks(state: EditorState): DocBlock[] {
  const blocks: DocBlock[] = [];
  const push = (from: number, to: number, kind: BlockKind) => {
    if (state.doc.sliceString(from, to).trim()) blocks.push({ from, index: blocks.length, kind, to });
  };
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Document") return true;
      if (node.node.parent?.name !== "Document") return false;
      // Frontmatter stays pinned to the top of the file.
      if (node.name === "FrontMatter") return false;
      if (node.name === "BulletList" || node.name === "OrderedList") {
        for (let item = node.node.firstChild; item; item = item.nextSibling) {
          if (item.name === "ListItem") push(item.from, item.to, "list-item");
        }
        return false;
      }
      push(node.from, node.to, "block");
      return false;
    },
  });
  return blocks;
}

/**
 * Move one block so it lands before the block currently at `toIndex`, or at the
 * end when `toIndex` is the block count.
 *
 * Returns the whole new document text, or null when the move is a no-op — the
 * caller must not dispatch a transaction that changes nothing, or every
 * harmless click would land in the undo history as an edit.
 */
export function reorderBlocks(doc: string, blocks: readonly DocBlock[], fromIndex: number, toIndex: number): string | null {
  const moving = blocks[fromIndex];
  if (!moving) return null;
  // Dropping a block just above or just below itself puts it back where it was.
  if (toIndex === fromIndex || toIndex === fromIndex + 1) return null;
  if (toIndex < 0 || toIndex > blocks.length) return null;

  const pieces = blocks.map((block) => ({ kind: block.kind, text: doc.slice(block.from, block.to) }));
  const [lifted] = pieces.splice(fromIndex, 1);
  if (lifted === undefined) return null;
  // After the splice every later index shifted down by one.
  pieces.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, lifted);

  const head = doc.slice(0, blocks[0]?.from ?? 0);
  const tail = doc.slice(blocks[blocks.length - 1]?.to ?? doc.length);
  // The gap is decided by the pair that ends up ADJACENT, not by where either
  // piece started — which is what makes a bullet dropped between two paragraphs
  // become its own one-item list, and a paragraph dropped mid-list split that
  // list in two, both without any special-casing.
  const body = pieces
    .map((piece, index) => (index === 0 ? piece.text : `${separatorBetween(pieces[index - 1]!, piece)}${piece.text}`))
    .join("");
  return `${head}${body}${tail}`;
}

/**
 * How much whitespace goes between two adjacent pieces.
 *
 * One blank line is what markdown needs to keep two paragraphs from merging
 * into one. Two list items are the opposite case: a blank line between them
 * makes the list "loose", and every item picks up its own paragraph spacing.
 */
function separatorBetween(before: { kind: BlockKind }, after: { kind: BlockKind }): string {
  return before.kind === "list-item" && after.kind === "list-item" ? "\n" : "\n\n";
}

/**
 * Which gap a pointer at `y` is hovering, as an index into the block list where
 * `blocks.length` means "after the last block".
 *
 * Measured against each block's midpoint so the drop target flips when the
 * pointer passes the middle, which is what makes the indicator feel like it
 * tracks the cursor rather than lagging a whole block behind it.
 */
export function dropIndexAt(y: number, midpoints: readonly number[]): number {
  let index = 0;
  for (const midpoint of midpoints) {
    if (y < midpoint) break;
    index += 1;
  }
  return index;
}

// ── the interaction ──────────────────────────────────────────────────────────
// One handle that follows whatever block the pointer is over, which is how
// Notion does it: no permanent gutter furniture, nothing visible until you
// reach for it.

const HANDLE_CLASS = "cm-block-handle";
const INDICATOR_CLASS = "cm-block-drop-indicator";

/** Vertical midpoint of each block, in viewport coordinates. */
function blockMidpoints(view: EditorView, blocks: readonly DocBlock[]): number[] {
  return blocks.map((block) => {
    const top = view.coordsAtPos(block.from)?.top ?? 0;
    const bottom = view.coordsAtPos(block.to)?.bottom ?? top;
    return (top + bottom) / 2;
  });
}

class BlockDragPlugin implements PluginValue {
  private handle: HTMLElement;
  private indicator: HTMLElement;
  private blocks: DocBlock[] = [];
  private hovered: DocBlock | null = null;
  private dragging: DocBlock | null = null;

  constructor(private view: EditorView) {
    this.handle = document.createElement("div");
    this.handle.className = HANDLE_CLASS;
    this.handle.setAttribute("aria-hidden", "true");
    this.handle.textContent = "⠿";
    this.handle.style.display = "none";
    this.indicator = document.createElement("div");
    this.indicator.className = INDICATOR_CLASS;
    this.indicator.style.display = "none";
    view.dom.append(this.handle, this.indicator);

    this.blocks = documentBlocks(view.state);
    view.dom.addEventListener("mousemove", this.onMove);
    view.dom.addEventListener("mouseleave", this.onLeave);
    this.handle.addEventListener("pointerdown", this.onDown);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) this.blocks = documentBlocks(update.state);
  }

  destroy() {
    this.view.dom.removeEventListener("mousemove", this.onMove);
    this.view.dom.removeEventListener("mouseleave", this.onLeave);
    this.handle.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onDragMove);
    window.removeEventListener("pointerup", this.onDragEnd);
    this.handle.remove();
    this.indicator.remove();
  }

  private blockAt(clientY: number): DocBlock | null {
    for (const block of this.blocks) {
      const top = this.view.coordsAtPos(block.from)?.top;
      const bottom = this.view.coordsAtPos(block.to)?.bottom;
      if (top !== undefined && bottom !== undefined && clientY >= top - 2 && clientY <= bottom + 2) return block;
    }
    return null;
  }

  private onMove = (event: MouseEvent) => {
    if (this.dragging) return;
    // Once the pointer is ON the handle, stop re-running the hit test. The
    // handle is aligned with its block's TOP edge, so the pointer resting on
    // its upper half reads as "no block here" and would hide the handle at the
    // exact moment it is being reached for.
    if (event.target instanceof Node && this.handle.contains(event.target)) return;
    const block = this.blockAt(event.clientY);
    this.hovered = block;
    if (!block) {
      this.handle.style.display = "none";
      return;
    }
    const coords = this.view.coordsAtPos(block.from);
    const host = this.view.dom.getBoundingClientRect();
    if (!coords) return;
    this.handle.style.display = "block";
    this.handle.style.top = `${coords.top - host.top}px`;
  };

  private onLeave = (event: MouseEvent) => {
    if (this.dragging) return;
    // Leaving the editor FOR the handle is not leaving. mouseleave does not fire
    // for descendants, but the handle overhangs the editor's left edge, so a
    // pointer travelling to it can still trip this on a sub-pixel boundary.
    const to = event.relatedTarget;
    if (to instanceof Node && this.handle.contains(to)) return;
    this.handle.style.display = "none";
  };

  private onDown = (event: PointerEvent) => {
    if (!this.hovered) return;
    event.preventDefault();
    this.dragging = this.hovered;
    this.view.dom.classList.add("cm-block-dragging");
    window.addEventListener("pointermove", this.onDragMove);
    window.addEventListener("pointerup", this.onDragEnd);
  };

  private onDragMove = (event: PointerEvent) => {
    if (!this.dragging) return;
    const target = dropIndexAt(event.clientY, blockMidpoints(this.view, this.blocks));
    const host = this.view.dom.getBoundingClientRect();
    const edge = target >= this.blocks.length
      ? this.view.coordsAtPos(this.blocks[this.blocks.length - 1]?.to ?? 0)?.bottom
      : this.view.coordsAtPos(this.blocks[target]?.from ?? 0)?.top;
    if (edge === undefined) return;
    this.indicator.style.display = "block";
    this.indicator.style.top = `${edge - host.top}px`;
  };

  private onDragEnd = (event: PointerEvent) => {
    const moving = this.dragging;
    this.dragging = null;
    this.indicator.style.display = "none";
    this.view.dom.classList.remove("cm-block-dragging");
    window.removeEventListener("pointermove", this.onDragMove);
    window.removeEventListener("pointerup", this.onDragEnd);
    if (!moving) return;

    const target = dropIndexAt(event.clientY, blockMidpoints(this.view, this.blocks));
    const next = reorderBlocks(this.view.state.doc.toString(), this.blocks, moving.index, target);
    // null means the block landed where it already was — dispatching then would
    // put a no-op edit in the undo history.
    if (next === null) return;
    this.view.dispatch({ changes: { from: 0, insert: next, to: this.view.state.doc.length } });
  };
}

export const blockDragTheme = EditorView.theme({
  [`.${HANDLE_CLASS}`]: {
    position: "absolute",
    left: "-1.15rem",
    // 1.15rem, not 1rem, and this is the whole bug. At 1rem the handle spanned
    // -18.4px to -2.4px while the editor's edge is at 0 — a 2.4px strip of
    // nothing between them. Reaching for the handle crossed that strip, which
    // is a real mouseleave on the editor, so the handle hid itself at the
    // instant it was grabbed for and the drag could never start. Widening it to
    // meet the edge removes the dead zone; onLeave/onMove above guard the
    // sub-pixel case. Measured on localhost, not reasoned about.
    width: "1.15rem",
    cursor: "grab",
    color: "var(--ui-text-quaternary)",
    fontSize: "0.8rem",
    lineHeight: "1.5",
    userSelect: "none",
    opacity: "0",
    transition: "opacity 120ms ease",
  },
  // `.cm-content:hover ~ .cm-block-handle` used to be here and could never
  // match: the handle is a child of .cm-editor while .cm-content lives inside
  // .cm-scroller, so they are not siblings (verified in the DOM). Only the
  // editor-hover rule below was ever doing anything.
  // (the `:hover` rule that reveals it fully is the HANDLE_CLASS one below)
  "&:hover .cm-block-handle": { opacity: "0.55" },
  [`.${HANDLE_CLASS}:hover`]: { opacity: "1 !important" },
  "&.cm-block-dragging": { cursor: "grabbing" },
  "&.cm-block-dragging .cm-content": { userSelect: "none" },
  [`.${INDICATOR_CLASS}`]: {
    position: "absolute",
    left: "0",
    right: "0",
    height: "2px",
    background: "var(--theme-primary)",
    borderRadius: "2px",
    pointerEvents: "none",
  },
});

/** Drag whole markdown blocks to reorder them. */
export const blockDrag = [ViewPlugin.fromClass(BlockDragPlugin), blockDragTheme];
