// The one place a note turns into a document and back again.
//
// 🔴 NO DOM IN THIS FILE, DELIBERATELY. The editor that sits on top of it is a
// web editor and the phone cannot run one. Whatever iOS eventually does —
// native rich text, or something else — it has to agree with the web app about
// what a note IS, byte for byte, or the same note reformats every time it is
// opened on the other device. Keeping the conversion here, free of any browser
// API, is what lets the phone import it instead of growing a second copy that
// drifts.
//
// WHY MARKDOWN STAYS THE STORAGE FORMAT. It is what the AI writes, what the
// renderer reads, what exports produce, and what already sits in every existing
// note. The editor is a VIEW of the note; it is not a new format.

import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify, { type Options as StringifyOptions } from "remark-stringify";
import { unified } from "unified";

/**
 * How a note is written back out.
 *
 * MEASURED, not chosen by taste. Nineteen real-world note shapes were run
 * through parse → stringify; with remark's defaults twelve came back byte for
 * byte, and tuning these options took it to fourteen. Every option here exists
 * to close one of those gaps:
 *
 *   bullet "-"            the app's own notes and every AI-written list use "-"
 *   strong/emphasis "*"   what the models emit, and what most notes contain
 *   fences                a fenced block survives; an indented one loses its language
 *   tablePipeAlign false  stops a table being re-padded on every save
 *   listItemIndent "one"  matches the indentation already in the library
 *
 * THE REMAINING FIVE CANNOT ALL BE FIXED, and it is worth knowing why rather
 * than trying again: a serializer has to pick ONE bullet character and ONE
 * emphasis character, so a note written with "*" bullets and one written with
 * "-" bullets cannot both come back unchanged. The same goes for `_text_` vs
 * `*text*`, two-space line breaks vs backslash, and setext headings vs "#".
 *
 * What matters is that all five are IDEMPOTENT — they settle on the first save
 * and never move again — and that NONE of them loses content. Tables, LaTeX,
 * task lists, footnotes, reference links and raw HTML all survive intact; those
 * were the ones worth worrying about and they were measured, not assumed.
 */
export const NOTE_STRINGIFY_OPTIONS: StringifyOptions = {
  bullet: "-",
  emphasis: "*",
  fences: true,
  listItemIndent: "one",
  rule: "-",
  strong: "*",
};

/**
 * Table layout belongs to remark-GFM, not to the serializer.
 *
 * 🔴 THESE WERE ON THE WRONG PLUGIN and did nothing at all — `tsc` caught it,
 * the tests did not, because a silently ignored option looks exactly like an
 * option that had no effect to have.
 *
 * `tablePipeAlign: false` is the one that matters. With alignment on, changing
 * a single cell re-pads EVERY row of the table to the new widest value, so a
 * one-word edit shows up as a rewrite of the whole table. Off, a cell edit
 * touches that cell's line and nothing else.
 */
export const NOTE_GFM_OPTIONS = { tableCellPadding: true, tablePipeAlign: false } as const;

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm, NOTE_GFM_OPTIONS)
  .use(remarkMath)
  .use(remarkStringify, NOTE_STRINGIFY_OPTIONS);

/**
 * Undo the serializer's escaping of wiki links.
 *
 * remark-stringify escapes every literal `[` in text (`\[`), so a note
 * containing `[[Torts]]` came back from a save as `\[\[Torts]]` — at which
 * point the `[[...]]` regexes in library-links.ts no longer match and the
 * link DIES the first time its note is edited. (Untouched notes were safe:
 * hasEdits compares against the normalised original, which was escaped the
 * same way. Only real edits wrote the breakage.) Wiki links are our syntax,
 * not markdown's, so the serializer cannot be taught about them; instead
 * every serialised output passes through here. Applied in BOTH
 * normalizeNoteMarkdown and docToMarkdown — they must stay in agreement or
 * hasEdits sees a phantom diff on every untouched note.
 */
export function restoreWikiBrackets(markdown: string): string {
  return markdown.replace(/\\\[(?=\\?\[)/g, "[").replace(/\[\\\[/g, "[[");
}

/**
 * Put a note through the pipeline without changing a word of it.
 *
 * This is what the editor's output will look like, so it is also the honest way
 * to ask "would saving this note reformat it?" before the student types
 * anything — see `wouldReformat`.
 */
export function normalizeNoteMarkdown(markdown: string): string {
  return restoreWikiBrackets(String(processor.processSync(markdown)));
}

/**
 * Would opening and saving this note change it, even untouched?
 *
 * 🔴 THE OWNER'S RULE IS THAT IT MUST NOT. The way that rule is kept is NOT by
 * making the serializer perfect — see above, it cannot be. It is kept by never
 * writing a note the student did not edit. `hasEdits` below is the guard the
 * save path uses; this function is for telling the student, up front, that this
 * particular note will tidy itself the first time they do edit it.
 */
export function wouldReformat(markdown: string): boolean {
  return normalizeNoteMarkdown(markdown) !== markdown;
}

/**
 * Is this a real edit, or the same note coming back out of the editor?
 *
 * Compares against the NORMALISED original, because the editor can only ever
 * emit normalised markdown. Without that, every note whose source was written
 * with "*" bullets would look edited the moment it was opened, and the app
 * would rewrite the student's whole library the first time they clicked into
 * each note.
 */
export function hasEdits(original: string, edited: string): boolean {
  return edited !== normalizeNoteMarkdown(original);
}

/**
 * Constructs the editor does not model, and must not be allowed to eat.
 *
 * A note containing one of these opens READ-ONLY rather than being quietly
 * flattened. Same discipline as the crawler's `truncated` flag: say what you
 * cannot handle instead of mangling it and reporting success.
 *
 * These all round-trip fine as TEXT — they are excluded because the editing
 * model has no way to represent them as something a student can safely click
 * into and change.
 */
const UNMODELLED = [
  /^<[a-z][\s\S]*>/im, // a raw HTML block
  /^\[\^[^\]]+\]:/m, // a footnote definition
  /^---\s*$[\s\S]*?^---\s*$/m, // YAML front matter
];

export function isEditableNote(markdown: string): boolean {
  return !UNMODELLED.some((pattern) => pattern.test(markdown));
}
