import type { EditorState, Range } from "@codemirror/state";
import { StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

import {
  addProperty,
  readFrontmatter,
  removeProperty,
  setPropertyValue,
  type NoteProperty,
} from "@/lib/workspace/library-properties";

// Obsidian-style Properties rendered at the top of a note (owner 2026-07-23).
// The YAML frontmatter block is replaced by an editable key/value table, the
// same trick library-table-widget.ts plays on GFM tables — including the two
// details that were expensive to learn there:
//   - cells are real <input>s, never contenteditable, because an input's text
//     selection sits outside CodeMirror's selection model and so cannot be
//     yanked back to the note;
//   - keyboard/clipboard events are stopped at the wrapper, or Meta+A selects
//     the whole note and the next keystroke edits invisible text.
//
// Scalars edit inline. LISTS ARE READ-ONLY here on purpose: rewriting one would
// mean re-emitting YAML, and the whole point of lib/library-properties.ts is
// that we only ever splice the exact bytes we are changing. Clicking into the
// block still reveals the raw YAML (the selection escape hatch below), so a
// list is edited by hand — nothing is a dead end, and nothing is reformatted
// behind the user's back.

const DISPLAY_TYPE: Record<NoteProperty["type"], string> = {
  text: "text",
  list: "list",
  number: "number",
  checkbox: "checkbox",
  date: "date",
  datetime: "datetime",
};

function scalarText(property: NoteProperty): string {
  if (property.value === null || property.value === undefined) return "";
  if (property.value instanceof Date) return property.value.toISOString().slice(0, property.type === "date" ? 10 : 19);
  return String(property.value);
}

class PropertiesWidget extends WidgetType {
  constructor(private readonly source: string) { super(); }

  override eq(other: PropertiesWidget) {
    return other.source === this.source;
  }

  override ignoreEvent() {
    return true;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-note-properties";
    wrap.dataset.testid = "note-properties";

    const properties = readFrontmatter(view.state.doc.toString()).properties;
    const table = document.createElement("div");
    table.className = "cm-note-properties-rows";

    for (const property of properties) {
      table.appendChild(this.renderRow(view, property));
    }
    wrap.appendChild(table);
    wrap.appendChild(this.renderAddRow(view));

    for (const type of ["keydown", "keyup", "beforeinput", "paste", "copy", "cut"]) {
      wrap.addEventListener(type, (event) => event.stopPropagation());
    }
    return wrap;
  }

  private renderRow(view: EditorView, property: NoteProperty): HTMLElement {
    const row = document.createElement("div");
    row.className = "cm-note-property";
    row.dataset.propertyKey = property.key;

    const name = document.createElement("span");
    name.className = "cm-note-property-key";
    name.textContent = property.key;
    name.title = `${property.key} (${DISPLAY_TYPE[property.type]})`;
    row.appendChild(name);

    const valueCell = document.createElement("div");
    valueCell.className = "cm-note-property-value";

    if (property.type === "list") {
      const items = Array.isArray(property.value) ? property.value : [];
      for (const item of items) {
        const chip = document.createElement("span");
        chip.className = "cm-note-property-chip";
        chip.textContent = String(item);
        valueCell.appendChild(chip);
      }
      valueCell.title = "Lists are edited in the raw block — click the block to reveal it.";
    } else if (property.type === "checkbox") {
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = property.value === true;
      box.setAttribute("aria-label", property.key);
      box.addEventListener("change", () => {
        this.commit(view, (doc) => setPropertyValue(doc, property.key, box.checked ? "true" : "false"));
      });
      valueCell.appendChild(box);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.value = scalarText(property);
      input.spellcheck = false;
      input.setAttribute("aria-label", property.key);
      input.dataset.original = input.value;
      input.addEventListener("blur", () => {
        const next = input.value.trim();
        if (next === input.dataset.original) return;
        this.commit(view, (doc) => setPropertyValue(doc, property.key, next));
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); input.blur(); }
        if (event.key === "Escape") { event.preventDefault(); input.value = input.dataset.original ?? ""; input.blur(); }
      });
      valueCell.appendChild(input);
    }
    row.appendChild(valueCell);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cm-note-property-remove";
    remove.textContent = "×";
    remove.title = `Remove ${property.key}`;
    remove.setAttribute("aria-label", `Remove ${property.key}`);
    remove.addEventListener("click", () => {
      this.commit(view, (doc) => removeProperty(doc, property.key));
    });
    row.appendChild(remove);
    return row;
  }

  private renderAddRow(view: EditorView): HTMLElement {
    const row = document.createElement("div");
    row.className = "cm-note-property-add";

    const key = document.createElement("input");
    key.type = "text";
    key.placeholder = "Add property";
    key.spellcheck = false;
    key.setAttribute("aria-label", "New property name");

    const value = document.createElement("input");
    value.type = "text";
    value.placeholder = "Value";
    value.spellcheck = false;
    value.setAttribute("aria-label", "New property value");

    const submit = () => {
      const name = key.value.trim();
      if (!name) return;
      this.commit(view, (doc) => addProperty(doc, name, value.value.trim()));
    };
    for (const field of [key, value]) {
      field.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); submit(); }
      });
    }
    value.addEventListener("blur", submit);

    row.append(key, value);
    return row;
  }

  /** Every mutation goes through library-properties.ts and is applied as one
   *  replacement of the WHOLE document, because a property edit can change the
   *  block's length (add/remove) and stale offsets would corrupt the body. The
   *  pure module guarantees the body bytes are identical either way. */
  private commit(view: EditorView, rewrite: (doc: string) => string) {
    const current = view.state.doc.toString();
    const next = rewrite(current);
    if (next === current) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: next } });
  }
}

export function propertiesDecorations(state: EditorState): DecorationSet {
  const doc = state.doc.toString();
  const front = readFrontmatter(doc);
  if (!front.present || !front.range) return Decoration.none;
  const [from, to] = front.range;

  // Same escape hatch the tables use: a selection touching the block reveals
  // the raw YAML, which is how a list (or anything this table cannot model) is
  // edited by hand. A collapsed caret strictly inside must also reveal it, or
  // the user would be typing into text hidden behind the widget.
  const touched = state.selection.ranges.some(
    (range) =>
      (!range.empty && range.from <= to && range.to >= from) ||
      (range.empty && range.from > from && range.from < to),
  );
  if (touched) return Decoration.none;
  if (front.properties.length === 0) return Decoration.none;

  const ranges: Range<Decoration>[] = [
    Decoration.replace({ block: true, widget: new PropertiesWidget(doc.slice(from, to)) }).range(from, to),
  ];
  return Decoration.set(ranges, true);
}

export const liveProperties = StateField.define<DecorationSet>({
  create: propertiesDecorations,
  update(value, tr) {
    if (tr.docChanged || tr.selection) return propertiesDecorations(tr.state);
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});
