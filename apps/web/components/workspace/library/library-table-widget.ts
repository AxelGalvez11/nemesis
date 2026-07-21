import type { EditorState, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

import {
  buildTableRow,
  columnAlignments,
  displayCellText,
  emptyTableRow,
  splitTableRow,
  tableRowSlots,
} from "@/lib/workspace/library-table-model";

// Always-rendered, cell-editable GFM tables for the Library editor (owner
// 2026-07-21: "tables in edit mode should not show the markdown when the
// cursor is in them"). Each cell is its own contenteditable island —
// CodeMirror ignores events inside widgets by default, so typing stays local
// to the cell until it commits (blur/Enter/Tab), which rewrites just that row
// line in the document. Raw pipe syntax only ever appears when a drag
// selection spans into the table (the escape hatch for copying/deleting the
// source, and the one way to edit column alignment).

/** Focus a cell after a commit rebuilt the widget DOM. The table's start
 *  position is stable across in-table edits, so the wrapper is refound by its
 *  data-table-from tag. */
function focusCellAfterRebuild(view: EditorView, tableFrom: number, row: number, cell: number) {
  window.queueMicrotask(() => {
    const wrap = view.dom.querySelector(`[data-table-from="${tableFrom}"]`);
    const target = wrap?.querySelectorAll("tr")[row]?.children[cell]?.querySelector("input");
    if (!(target instanceof HTMLInputElement)) return;
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
  });
}

class EditableTableWidget extends WidgetType {
  constructor(private readonly source: string, private readonly from: number) { super(); }

  override eq(other: EditableTableWidget) {
    return other.source === this.source && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const slots = tableRowSlots(this.source);
    const aligns = columnAlignments(slots[1]?.line ?? "");
    const wrap = document.createElement("div");
    wrap.className = "cm-md-table";
    wrap.dataset.tableFrom = String(this.from);
    const table = document.createElement("table");
    const rendered = slots.filter((slot) => !slot.isDelimiter);

    rendered.forEach((slot, renderedIndex) => {
      const isHeader = renderedIndex === 0;
      const row = document.createElement("tr");
      splitTableRow(slot.line).forEach((cellRaw, cellIndex) => {
        const el = document.createElement(isHeader ? "th" : "td");
        const raw = cellRaw.trim();
        // Each cell edits through a real <input>, NOT contenteditable: an
        // input's text selection lives outside the document's selection
        // model, so CodeMirror's selection observer can't see it and yank
        // focus back to the note (which it reliably does for a
        // contenteditable island inside its contentDOM).
        const input = document.createElement("input");
        input.type = "text";
        input.value = displayCellText(raw);
        input.dataset.raw = raw;
        input.style.textAlign = aligns[cellIndex] ?? "left";
        input.spellcheck = true;
        input.setAttribute("aria-label", isHeader ? "Table header cell" : "Table cell");
        input.addEventListener("focus", () => {
          // Reveal the cell's raw inline markdown for editing; committed back
          // on blur, so nothing is lost by the stripped display form.
          if (input.value !== raw) input.value = input.dataset.raw ?? raw;
        });
        input.addEventListener("blur", () => {
          this.commitCell(view, input, slot.offset, cellIndex);
        });
        input.addEventListener("keydown", (event) => {
          this.handleCellKey(view, event, input, slot.offset, renderedIndex, cellIndex, rendered.length);
        });
        el.appendChild(input);
        row.appendChild(el);
      });
      (isHeader ? table.createTHead() : table.tBodies[0] ?? table.createTBody()).appendChild(row);
    });

    wrap.appendChild(table);
    // Keyboard and clipboard activity in a cell must never reach CodeMirror's
    // contentDOM handlers — a Meta+A there selects the whole note and the
    // next keystroke edits invisible text under the widget.
    for (const type of ["keydown", "keyup", "beforeinput", "paste", "copy", "cut"]) {
      wrap.addEventListener(type, (event) => event.stopPropagation());
    }
    return wrap;
  }

  /** Rewrite this cell's row line if the cell text changed. Returns true when
   *  a document change was dispatched (the widget will be rebuilt). */
  private commitCell(view: EditorView, input: HTMLInputElement, rowOffset: number, cellIndex: number): boolean {
    // The dispatch below rebuilds this widget's DOM, which blurs this very
    // input mid-update — without the flag that nested blur would re-enter
    // here and dispatch inside the in-progress update (CodeMirror throws).
    if (input.dataset.committing === "true") return false;
    const raw = input.dataset.raw ?? "";
    const next = input.value.replace(/\r?\n/g, " ").trim();
    if (next === raw) {
      input.value = displayCellText(raw);
      return false;
    }
    // A detached cell (widget was rebuilt under this handler) or a target
    // line that is no longer a table row means our offsets went stale —
    // dropping the edit beats corrupting unrelated text.
    if (!input.isConnected) return false;
    const lineStart = this.from + rowOffset;
    const line = view.state.doc.lineAt(Math.min(lineStart, view.state.doc.length));
    if (!line.text.includes("|")) return false;
    const cells = splitTableRow(line.text).map((cell) => cell.trim());
    if (cellIndex < 0 || cellIndex >= cells.length) return false;
    cells[cellIndex] = next;
    input.dataset.committing = "true";
    try {
      view.dispatch({ changes: { from: line.from, insert: buildTableRow(cells), to: line.to } });
    } finally {
      delete input.dataset.committing;
    }
    return true;
  }

  private handleCellKey(
    view: EditorView,
    event: KeyboardEvent,
    input: HTMLInputElement,
    rowOffset: number,
    renderedRow: number,
    cellIndex: number,
    renderedRows: number,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      // Back to the raw text so the blur commit sees "unchanged" and merely
      // re-renders the display form — resetting to the DISPLAY text here
      // would commit it and strip the cell's inline marks.
      input.value = input.dataset.raw ?? "";
      input.blur();
      view.focus();
      return;
    }
    const isTab = event.key === "Tab";
    const isEnter = event.key === "Enter";
    if (!isTab && !isEnter) return;
    event.preventDefault();

    const columns = input.closest("tr")?.children.length ?? 1;
    let nextRow = renderedRow;
    let nextCell = cellIndex;
    if (isTab && event.shiftKey) {
      nextCell -= 1;
      if (nextCell < 0) { nextRow -= 1; nextCell = columns - 1; }
    } else if (isTab) {
      nextCell += 1;
      if (nextCell >= columns) { nextRow += 1; nextCell = 0; }
    } else {
      nextRow += 1;
    }
    if (nextRow < 0) { input.blur(); view.focus(); return; }

    const tableFrom = this.from;
    const needsNewRow = nextRow >= renderedRows;
    // Commit first (may rebuild the widget), then append a row if we walked
    // off the end, then focus the target cell in the fresh DOM.
    const committed = this.commitCell(view, input, rowOffset, cellIndex);
    if (needsNewRow) {
      const state = view.state;
      const tableLine = state.doc.lineAt(Math.min(tableFrom, state.doc.length));
      const tableNodeEnd = findTableEnd(state, tableLine.from);
      view.dispatch({ changes: { from: tableNodeEnd, insert: `\n${emptyTableRow(columns)}` } });
      focusCellAfterRebuild(view, tableFrom, nextRow, isEnter ? cellIndex : 0);
      return;
    }
    if (committed) {
      focusCellAfterRebuild(view, tableFrom, nextRow, nextCell);
      return;
    }
    // No document change happened, so the DOM is still the same widget.
    const target = input.closest(".cm-md-table")?.querySelectorAll("tr")[nextRow]?.children[nextCell]?.querySelector("input");
    if (target instanceof HTMLInputElement) target.focus();
  }
}

/** End offset of the table block whose first line starts at `tableFrom`. */
function findTableEnd(state: EditorState, tableFrom: number): number {
  let end = tableFrom;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "Table" && node.from === tableFrom) {
        end = node.to;
        return false;
      }
      return undefined;
    },
  });
  return end;
}

export function tableDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      // Rendered even while editing (cells edit through their own inputs, and
      // cell clicks never move the CodeMirror cursor). Raw pipes appear only
      // when a drag selection overlaps the table, or when such a selection
      // collapsed to a caret strictly inside it — that caret must never hide
      // behind the widget (typing would edit invisible text), and it doubles
      // as the escape hatch for editing alignment rows by hand.
      const touched = state.selection.ranges.some(
        (range) =>
          (!range.empty && range.from <= node.to && range.to >= node.from) ||
          (range.empty && range.from > node.from && range.from < node.to),
      );
      if (touched) return;
      const source = state.doc.sliceString(node.from, node.to);
      ranges.push(
        Decoration.replace({ block: true, widget: new EditableTableWidget(source, node.from) }).range(node.from, node.to),
      );
    },
  });
  return Decoration.set(ranges, true);
}
