// Writing cloze deletions on the phone (owner 2026-07-24: "users should be able
// to select card type for adding new cards. There should be an editing toolbar
// above the keyboard when editing cards for cloze").
//
// Anki's cloze syntax is `{{c1::hidden text}}`, optionally with a hint:
// `{{c1::hidden text::hint}}`. Typing that by hand on a phone keyboard is
// miserable — four braces and two colons per blank — so the toolbar wraps the
// selection instead. This module is the pure half: given the field's text and
// the current selection, it returns the new text and where the caret should
// land. The screen does the rest.
//
// Numbering follows Anki's own rule: each new deletion gets the next unused
// number (so one note becomes several cards, one per number), and "same number"
// adds another blank that is hidden at the SAME time as the last one. Reading
// the numbers back out of the text — rather than counting button presses —
// means it stays right after the student edits or deletes a blank by hand.
//
// Deno-tested like the rest of src/lib: no react-native imports.

/** A text field and its selection, as the toolbar sees it. An empty selection
 *  (start === end) is a plain caret. */
export interface ClozeSelection {
  text: string;
  start: number;
  end: number;
}

/** Every cloze number already used in `text`, ascending and de-duplicated.
 *
 *  Deliberately its own scan rather than lib/study-cloze.ts's clozeNumbers:
 *  that one reads FINISHED cards for rendering, this one reads text mid-edit,
 *  where a half-typed `{{c2::` with no closing braces is normal and still has
 *  to count. Matching only completed deletions would hand the next blank a
 *  number already in use. */
export function usedClozeNumbers(text: string): number[] {
  const found = new Set<number>();
  const re = /\{\{c(\d+)::/g;
  let match = re.exec(text);
  while (match !== null) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) found.add(n);
    match = re.exec(text);
  }
  return [...found].sort((a, b) => a - b);
}

/** The number a NEW deletion should get: one past the highest in use. */
export function nextClozeNumber(text: string): number {
  const used = usedClozeNumbers(text);
  return used.length === 0 ? 1 : used[used.length - 1] + 1;
}

/** The number "same as the last one" means: the highest in use, or 1 in a field
 *  with no deletions yet (where "same" and "next" are the same thing). */
export function currentClozeNumber(text: string): number {
  const used = usedClozeNumbers(text);
  return used.length === 0 ? 1 : used[used.length - 1];
}

/**
 * Wrap the selection in a cloze deletion.
 *
 * With text selected, that text becomes the hidden span and the caret lands
 * just after the closing braces — ready to keep typing the sentence. With no
 * selection, an empty deletion is inserted and the caret lands INSIDE it, so
 * the next keystroke types the answer. Those two behaviours are what make the
 * button usable either way round: select-then-tap, or tap-then-type.
 *
 * `sameNumber` reuses the highest number instead of taking a new one — Anki's
 * "cloze same card", for two blanks that should disappear together.
 */
export function wrapCloze(selection: ClozeSelection, opts?: { sameNumber?: boolean }): ClozeSelection {
  const { text } = selection;
  // A backwards drag reports end < start on some platforms; normalize, and
  // clamp into the string so a stale selection can never slice out of range.
  const rawStart = Math.min(selection.start, selection.end);
  const rawEnd = Math.max(selection.start, selection.end);
  const start = Math.max(0, Math.min(rawStart, text.length));
  const end = Math.max(start, Math.min(rawEnd, text.length));

  const number = opts?.sameNumber ? currentClozeNumber(text) : nextClozeNumber(text);
  const open = `{{c${number}::`;
  const close = "}}";
  const inner = text.slice(start, end);
  const next = `${text.slice(0, start)}${open}${inner}${close}${text.slice(end)}`;

  if (inner.length === 0) {
    // Caret inside the empty blank.
    const caret = start + open.length;
    return { end: caret, start: caret, text: next };
  }
  // Caret after the whole deletion.
  const caret = start + open.length + inner.length + close.length;
  return { end: caret, start: caret, text: next };
}

/** Add a `::hint` to the deletion the caret sits in, so a blank can show a clue
 *  ("[European city]") instead of "[...]". No-op when the caret isn't inside
 *  one, or when that deletion already carries a hint. */
export function addClozeHint(selection: ClozeSelection, hint: string): ClozeSelection {
  const { text } = selection;
  const caret = Math.max(0, Math.min(selection.start, text.length));
  const open = text.lastIndexOf("{{c", caret);
  if (open === -1) return selection;
  const close = text.indexOf("}}", open);
  // Caret is past the end of this deletion — it isn't inside one at all.
  if (close === -1 || close < caret) return selection;
  const body = text.slice(open, close);
  // `::` after the number's own separator means a hint is already there.
  if (body.indexOf("::", body.indexOf("::") + 2) !== -1) return selection;
  const next = `${text.slice(0, close)}::${hint}${text.slice(close)}`;
  const at = close + 2 + hint.length;
  return { end: at, start: at, text: next };
}

/** A cloze card needs at least one deletion, or it is just a sentence and will
 *  never generate a card. The Add button reads this. */
export function hasClozeDeletion(text: string): boolean {
  return /\{\{c\d+::[^]*?\}\}/.test(text);
}
