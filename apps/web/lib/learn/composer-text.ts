// What the composer does with text that is more than a sentence.
//
// Owner, 2026-08-31, three asks in one message about the box people type into:
// the controls stay put when it grows, lists can be written in it, and a pasted
// wall of text becomes a file instead of swallowing the composer — *"similarly
// to ChatGPT and Claude, that they will turn really long prompts that are pasted
// into text files or markdown files so that it doesn't take up the whole
// composer."*
//
// 🔴 PURE, AND THAT IS WHY IT IS ITS OWN FILE. Both composers — the front door's
// single-line field and the canvas's growing one — must behave identically here,
// and the repo has been bitten before by a per-door copy of a rule (see the
// `ACCEPTED_MATERIAL` note in `canvas-composer.tsx`, where one door refused
// spreadsheets the other accepted). One implementation, two callers, and the
// behaviour is testable without a browser.

/**
 * A line that is already a list item: indent, marker, and an optional task box.
 *
 * 🔴 THE MARKERS ARE MARKDOWN'S, NOT A HOUSE DIALECT. `-`, `*` and `+` for
 * bullets and `1.` / `1)` for ordered items are what every editor a learner
 * arrives from produces, and what the renderer on the other side of the send
 * button already reads. Inventing a fourth bullet would make the composer
 * produce text its own transcript renders as prose.
 */
const LIST_LINE = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(\[[ xX]\][ \t]+)?/;

export interface ListContinuation {
  readonly text: string;
  /** Where the caret goes once the new text is on screen. */
  readonly caret: number;
}

/**
 * The next line of a list the learner is already writing, or `null` to let the
 * newline happen untouched.
 *
 * 🔴 AN EMPTY ITEM ENDS THE LIST RATHER THAN EXTENDING IT. Pressing the newline
 * key twice is how every editor says "I am done listing", and a composer that
 * answered the second press with a third empty bullet would force the learner
 * to reach for backspace to escape something they never asked to start.
 *
 * 🔴 A SELECTION IS NEVER CONTINUED. Replacing highlighted text with a newline
 * is an edit, not a list gesture, and guessing at a marker there would silently
 * eat the selection.
 */
export function continueList(text: string, start: number, end: number): ListContinuation | null {
  if (start !== end || start < 0 || start > text.length) return null;

  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineBreak = text.indexOf("\n", start);
  const lineEnd = lineBreak === -1 ? text.length : lineBreak;
  const line = text.slice(lineStart, lineEnd);

  const match = LIST_LINE.exec(line);
  if (!match) return null;

  const [prefix, indent, marker, task] = [match[0], match[1] ?? "", match[2] ?? "", match[3]];
  const content = line.slice(prefix.length);

  // Nothing was written under the marker: take the marker away and leave the
  // line blank, which is what "stop listing" looks like.
  if (!content.trim()) {
    return { caret: lineStart, text: text.slice(0, lineStart) + text.slice(lineStart + prefix.length) };
  }

  const ordered = /^(\d{1,9})([.)])$/.exec(marker);
  // 🔴 THE NUMBER COMES FROM THE LINE ABOVE, NOT FROM A COUNTER. A learner who
  // starts at 3 because they are continuing a list from their notes gets 4, and
  // renumbering their text underneath them would be the composer overruling
  // something they typed on purpose.
  const nextMarker = ordered ? `${Number(ordered[1]) + 1}${ordered[2]}` : marker;
  // A finished task is not a template for the next one: the box always starts empty.
  const insert = `\n${indent}${nextMarker} ${task ? "[ ] " : ""}`;
  return { caret: start + insert.length, text: text.slice(0, start) + insert + text.slice(start) };
}

/**
 * How much pasted text stops being a message and starts being a document.
 *
 * 🔴 MEASURED AGAINST THE BOX IT WOULD FILL, NOT PICKED FOR ROUNDNESS. The
 * canvas composer caps at `MAX_COMPOSER_HEIGHT` (160px) over a 26px line, so
 * about six lines are visible before it scrolls; at the ~75 characters its
 * 16px text fits per line that is roughly 450 characters on screen. Four
 * screenfuls past that — 1,800 — is unambiguously a thing somebody pasted
 * rather than something they wrote, while a long paragraph quoted into a
 * question still stays in the box where they can see it and edit around it.
 */
export const PASTE_TO_FILE_CHARS = 1_800;

/** Longest name derived from the text's own first line. */
const NAME_MAX = 60;

/**
 * What the attachment is called.
 *
 * 🔴 THE TEXT'S OWN FIRST LINE, BECAUSE THIS BECOMES A SOURCE. A pasted lecture
 * does not stop at the composer: it is filed, read for knowledge, and later
 * cited by name. "Pasted text" on four different chips tells the learner nothing
 * about which is their pharmacology outline. The fallback stays for text with no
 * usable first line.
 */
export function pastedFileName(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const cleaned = firstLine
    // A markdown heading's hashes are notation, not part of the title.
    .replace(/^#{1,6}[ \t]+/, "")
    // Characters a file name may not carry, and the control range with them.
    .replace(/[\\/:*?"<>|]/g, " ")
    // eslint-disable-next-line no-control-regex -- the range is the point
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return `${cleaned || "Pasted text"}.md`;
}

/**
 * The file a long paste becomes, or `null` when the paste belongs in the box.
 *
 * 🔴 `text/markdown`, THROUGH THE SAME DOOR A REAL UPLOAD USES. `attachUrl`
 * already wraps a fetched page as a synthetic file for exactly this reason: one
 * path for "this canvas gained a source" means filing, extraction and every
 * later reader treat pasted text as what it is — material — with no second
 * implementation free to drift.
 */
export function pastedTextFile(text: string): File | null {
  if (text.length < PASTE_TO_FILE_CHARS) return null;
  return new File([text], pastedFileName(text), { type: "text/markdown" });
}
