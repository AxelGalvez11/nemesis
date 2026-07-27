// Revising a Library note the student already has.
//
// The agent could create notes but never change one, so "explain this again, I still
// don't get it" left the student with two notes saying different things and no way to
// tell which was current. This is the missing half.
//
// THE SAFETY PROPERTY THIS MODULE EXISTS TO ENFORCE: a revision must never destroy
// work the student can't get back. Library notes are the student's own writing, and
// an agent that can overwrite them is one bad tool call away from erasing a
// semester. So:
//
//   • The default modes are ADDITIVE (append / prepend). They cannot lose anything.
//   • replace_section replaces exactly one markdown section and REFUSES when it
//     can't find that heading — it never falls back to replacing the whole note,
//     because a fallback that silently widens its blast radius is how data
//     disappears. Missing heading is an error the model can see and correct.
//   • replace_all exists because sometimes a rewrite IS the right answer, but it
//     requires the caller to have read the note first (see `expectedLength`), so a
//     model that never looked cannot blindly clobber.
//
// Pure: string in, string out. No Supabase, no fetch, fully unit-tested.

/** Notes above this are refused rather than truncated — silently dropping the tail
 *  of a student's note is exactly the data loss this module prevents elsewhere. */
export const MAX_REVISED_CHARS = 100_000;

export type RevisionMode = "append" | "prepend" | "replace_section" | "replace_all";

export const REVISION_MODES: readonly RevisionMode[] = ["append", "prepend", "replace_section", "replace_all"];

export interface NoteRevision {
  mode: RevisionMode;
  /** The markdown being added, or the replacement body. */
  content: string;
  /** For replace_section: the heading text to replace under, without the #s. */
  section?: string;
  /** For replace_all: the length of the note the caller believes it read. A
   *  mismatch means the note changed underneath them, or they never read it. */
  expectedLength?: number;
}

export type RevisionResult =
  | { ok: true; content: string; summary: string }
  | { ok: false; error: string };

/** Apply one revision to a note's markdown. Never throws. */
export function applyNoteRevision(existing: string, revision: NoteRevision): RevisionResult {
  const addition = revision.content.trim();
  if (!addition && revision.mode !== "replace_all") {
    return { error: "Nothing to add — provide the markdown to write.", ok: false };
  }

  const result = route(existing, revision, addition);
  if (!result.ok) return result;
  if (result.content.length > MAX_REVISED_CHARS) {
    return { error: `That would make the note longer than ${MAX_REVISED_CHARS.toLocaleString()} characters.`, ok: false };
  }
  if (result.content.trim() === existing.trim()) {
    return { error: "That revision would not change anything.", ok: false };
  }
  return result;
}

function route(existing: string, revision: NoteRevision, addition: string): RevisionResult {
  switch (revision.mode) {
    case "append":
      return { content: joinBlocks(existing, addition), ok: true, summary: "added to the end" };
    case "prepend":
      return { content: joinBlocks(addition, existing), ok: true, summary: "added to the top" };
    case "replace_section":
      return replaceSection(existing, revision.section ?? "", addition);
    case "replace_all":
      return replaceAll(existing, revision, addition);
    default:
      return { error: `Unknown mode. Use one of: ${REVISION_MODES.join(", ")}.`, ok: false };
  }
}

function joinBlocks(before: string, after: string): string {
  const head = before.replace(/\s+$/, "");
  const tail = after.replace(/^\s+/, "");
  if (!head) return tail;
  if (!tail) return head;
  return `${head}\n\n${tail}`;
}

/**
 * Replace the body under one markdown heading, keeping the heading itself and
 * everything outside that section untouched. A section runs from its heading to the
 * next heading of the SAME OR SHALLOWER depth — so replacing "## Mechanism" also
 * replaces its "### Details" subsection, which is what a reader means by "that
 * section", while leaving the next "## Adverse effects" alone.
 */
function replaceSection(existing: string, section: string, addition: string): RevisionResult {
  const wanted = section.trim();
  if (!wanted) return { error: "replace_section needs the heading to replace.", ok: false };

  const lines = existing.split(/\r?\n/);
  const start = lines.findIndex((line) => headingMatches(line, wanted));
  if (start < 0) {
    return {
      error: `No section headed '${wanted}' in this note. Read it first and use one of its real headings, or use append.`,
      ok: false,
    };
  }

  const depth = headingDepth(lines[start] ?? "");
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const nextDepth = headingDepth(lines[index] ?? "");
    if (nextDepth > 0 && nextDepth <= depth) {
      end = index;
      break;
    }
  }

  const rebuilt = [...lines.slice(0, start + 1), "", addition, "", ...lines.slice(end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
  return { content: rebuilt, ok: true, summary: `rewrote the '${wanted}' section` };
}

/**
 * Whole-note rewrite, gated on the caller proving it read the current note. Without
 * the gate a model that never called read_library_note could erase a note it has
 * never seen; with it, the worst case is a refusal telling it to read first.
 */
function replaceAll(existing: string, revision: NoteRevision, addition: string): RevisionResult {
  if (!addition) return { error: "A full rewrite needs the new note body.", ok: false };
  if (typeof revision.expectedLength !== "number") {
    return { error: "A full rewrite needs expected_length — read the note first and pass its length.", ok: false };
  }
  // Tolerance covers the read path's own trimming, not a different note.
  const drift = Math.abs(revision.expectedLength - existing.length);
  if (drift > Math.max(50, existing.length * 0.02)) {
    return {
      error: `This note is ${existing.length} characters, not ${revision.expectedLength}. Read it again before rewriting it.`,
      ok: false,
    };
  }
  return { content: addition, ok: true, summary: "rewrote the whole note" };
}

/** Heading depth (1-6), or 0 when the line is not an ATX heading. PURE. */
export function headingDepth(line: string): number {
  const match = /^(#{1,6})\s+\S/.exec(line);
  return match ? match[1]!.length : 0;
}

/** Does this line head the wanted section? Compares heading TEXT, so the model may
 *  pass "Mechanism" or "## Mechanism" and either works. PURE. */
export function headingMatches(line: string, wanted: string): boolean {
  if (headingDepth(line) === 0) return false;
  const text = line.replace(/^#{1,6}\s+/, "").replace(/\s+#*\s*$/, "").trim().toLowerCase();
  const target = wanted.replace(/^#{1,6}\s+/, "").trim().toLowerCase();
  return text === target;
}

/** Every heading in a note, for telling the model what it can target. PURE. */
export function noteHeadings(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .filter((line) => headingDepth(line) > 0)
    .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/\s+#*\s*$/, "").trim())
    .filter(Boolean);
}
