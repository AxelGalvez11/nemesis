// Pure selection-aware markdown transforms for the phone note editor's toolbar
// (bold / italic / wikilink / list / heading). No react-native imports so this
// Deno-tests like the rest of src/lib. All indices are plain JS string (UTF-16)
// offsets — exactly what RN TextInput's onSelectionChange reports — and every
// function returns a NEW state (text + where the selection should land), never
// mutating its input.
//
// Caret rule for line-start inserts: a real selection GROWS to include a prefix
// added at its own start (so a second tap sees and removes it), but a bare
// caret sitting exactly at the line start hops past the new prefix — the
// student is about to type, and the words belong after the "# ".

export interface EditSel {
  text: string;
  start: number;
  end: number;
}

/** Clamp + order a selection into the text's bounds (defensive: RN selection
 * events can momentarily lag a text change). */
function normalize({ text, start, end }: EditSel): EditSel {
  const lo = Math.max(0, Math.min(text.length, Math.min(start, end)));
  const hi = Math.max(0, Math.min(text.length, Math.max(start, end)));
  return { text, start: lo, end: hi };
}

/**
 * Wrap the selection in an inline marker pair (`**` bold, `*` italic,
 * `[[`+`]]` wikilink). Toggles: if the selection already contains or is
 * directly surrounded by the pair, it unwraps instead. Empty selection inserts
 * the pair with the caret sitting between the markers, ready to type.
 */
export function wrapInline(state: EditSel, marker: string, closeMarker: string = marker): EditSel {
  const { text, start, end } = normalize(state);
  const sel = text.slice(start, end);

  // Unwrap A: the markers are part of the selection itself ("**hi**" selected).
  if (sel.length >= marker.length + closeMarker.length && sel.startsWith(marker) && sel.endsWith(closeMarker)) {
    const inner = sel.slice(marker.length, sel.length - closeMarker.length);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }

  // Unwrap B: the markers sit just outside the selection ("hi" selected inside
  // "**hi**"), which is also where the caret lands right after an empty insert.
  if (text.slice(start - marker.length, start) === marker && text.slice(end, end + closeMarker.length) === closeMarker) {
    const newStart = start - marker.length;
    return {
      text: text.slice(0, newStart) + sel + text.slice(end + closeMarker.length),
      start: newStart,
      end: newStart + sel.length,
    };
  }

  // Wrap: selection stays on the inner text so a second tap unwraps (case B).
  return {
    text: text.slice(0, start) + marker + sel + closeMarker + text.slice(end),
    start: start + marker.length,
    end: end + marker.length,
  };
}

/** Absolute start offsets of every line the selection touches (caret counts as
 * touching its line). */
function touchedLineStarts(text: string, start: number, end: number): number[] {
  const starts: number[] = [];
  let lineStart = 0;
  for (;;) {
    const nl = text.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? text.length : nl;
    if (lineStart <= end && lineEnd >= start) starts.push(lineStart);
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  return starts;
}

/** One line-start edit: delete `removeLen` chars at `at`, then insert `insert`.
 * Returns the new text plus the selection indices shifted the way a caret
 * expects: deletions clamp a caret caught inside the removed prefix to the line
 * start; insertions at the selection's exact start don't push it right (so the
 * new prefix lands INSIDE the selection). */
function editAtLineStart(state: EditSel, at: number, removeLen: number, insert: string): EditSel {
  let { text, start, end } = state;
  if (removeLen > 0) {
    text = text.slice(0, at) + text.slice(at + removeLen);
    start = start >= at + removeLen ? start - removeLen : start > at ? at : start;
    end = end >= at + removeLen ? end - removeLen : end > at ? at : end;
  }
  if (insert) {
    text = text.slice(0, at) + insert + text.slice(at);
    if (at < start || (at === start && start === end)) start += insert.length;
    if (at <= end) end += insert.length;
  }
  return { text, start, end };
}

/**
 * Toggle a line prefix (e.g. `- ` for a bullet list) on every line the
 * selection touches. If every touched line already has the prefix, all lose it;
 * otherwise the ones missing it gain it (Obsidian's behavior).
 */
export function toggleLinePrefix(state: EditSel, prefix: string): EditSel {
  let current = normalize(state);
  const starts = touchedLineStarts(current.text, current.start, current.end);
  const allPrefixed = starts.every((at) => current.text.startsWith(prefix, at));

  // Walk back-to-front so earlier line-start offsets stay valid throughout.
  for (const at of [...starts].reverse()) {
    const has = current.text.startsWith(prefix, at);
    if (allPrefixed) current = editAtLineStart(current, at, prefix.length, "");
    else if (!has) current = editAtLineStart(current, at, 0, prefix);
  }
  return current;
}

const NUMBERED_RE = /^\d+[.)] /;

/**
 * Toggle a numbered list across the touched lines (web editor parity, owner
 * 2026-07-21). If every touched line already carries an `N. ` marker they all
 * lose it; otherwise every line gains a sequential `1. `, `2. `, … marker
 * (existing markers are renumbered so a partial selection comes out uniform).
 */
export function toggleNumberedList(state: EditSel): EditSel {
  let current = normalize(state);
  const starts = touchedLineStarts(current.text, current.start, current.end);
  const allNumbered = starts.every((at) => NUMBERED_RE.test(current.text.slice(at)));

  // Walk back-to-front so earlier line-start offsets stay valid; number by
  // position within the selection (last line gets the highest number).
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const at = starts[i];
    const existing = NUMBERED_RE.exec(current.text.slice(at))?.[0].length ?? 0;
    if (allNumbered) current = editAtLineStart(current, at, existing, "");
    else current = editAtLineStart(current, at, existing, `${i + 1}. `);
  }
  return current;
}

/**
 * Wrap the selection as a markdown link. With text selected the caret lands on
 * the url placeholder, selected, ready to be replaced; with a bare caret an
 * empty link skeleton is inserted with the caret in the label.
 */
export function insertLink(state: EditSel): EditSel {
  const { text, start, end } = normalize(state);
  const sel = text.slice(start, end);
  if (sel) {
    const before = `${text.slice(0, start)}[${sel}](`;
    return { text: `${before}url)${text.slice(end)}`, start: before.length, end: before.length + 3 };
  }
  return { text: `${text.slice(0, start)}[](url)${text.slice(end)}`, start: start + 1, end: start + 1 };
}

/** Insert `blockText` as its own paragraph-level block at the caret: pushed
 * past the end of the current line, blank-line separated on both sides (only
 * where a separator is actually missing). Caret lands at `caretInBlock`
 * offsets within the inserted text. */
function insertBlock(state: EditSel, blockText: string, caretInBlock: { start: number; end: number }): EditSel {
  const { text, end } = normalize(state);
  const lineEnd = (() => {
    const nl = text.indexOf("\n", end);
    return nl === -1 ? text.length : nl;
  })();
  const before = text.slice(0, lineEnd);
  const after = text.slice(lineEnd);
  const lead = before === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after.startsWith("\n\n") || after === "" ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const insertAt = before.length + lead.length;
  return {
    text: before + lead + blockText + trail + after,
    start: insertAt + caretInBlock.start,
    end: insertAt + caretInBlock.end,
  };
}

/** Insert a horizontal rule below the current line (web toolbar's Divider). */
export function insertDivider(state: EditSel): EditSel {
  return insertBlock(state, "---", { end: 3, start: 3 });
}

const TABLE_SKELETON = "| Column | Column |\n| --- | --- |\n|  |  |";

/** Insert an empty 2x2 GFM table below the current line (web toolbar's
 * Table). Caret lands selecting the first header cell's placeholder word. */
export function insertTable(state: EditSel): EditSel {
  return insertBlock(state, TABLE_SKELETON, { end: 8, start: 2 });
}

const HEADING_RE = /^(#{1,6}) /;

/**
 * Cycle the heading level of the touched line(s): none → # → ## → ### → none
 * (#### and deeper also clear). With a multi-line selection, the FIRST line's
 * next level is applied to every touched line, so they end up uniform.
 */
export function cycleHeading(state: EditSel): EditSel {
  let current = normalize(state);
  const starts = touchedLineStarts(current.text, current.start, current.end);
  if (starts.length === 0) return current;

  const levelAt = (text: string, at: number): number => HEADING_RE.exec(text.slice(at))?.[1].length ?? 0;
  const firstLevel = levelAt(current.text, starts[0]);
  const nextLevel = firstLevel >= 3 ? 0 : firstLevel + 1;
  const insert = nextLevel === 0 ? "" : `${"#".repeat(nextLevel)} `;

  for (const at of [...starts].reverse()) {
    const existing = levelAt(current.text, at);
    const removeLen = existing === 0 ? 0 : existing + 1; // hashes + the space
    current = editAtLineStart(current, at, removeLen, insert);
  }
  return current;
}
