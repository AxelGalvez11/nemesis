// Grounding a phone chat turn in the student's OWN Library.
//
// The web app answers library questions through agent tools: the model calls
// search_library, reads what comes back, and decides what to do. The phone has no
// tool lane at all, so nothing on this device has ever been able to reach the
// semantic index — the Library could fill up all semester and the phone's answers
// would not improve by one word.
//
// Retrieval-then-answer is the shape that works without tools: look the question
// up first, hand the matching passages to the model as context, and let it answer
// from them. It is exactly what searchWebContext already does for the web, one
// source further in.
//
// WHY THE GATE IS ALMOST NOTHING (shouldSearchLibrary). Every previous attempt in
// this codebase to decide IN ADVANCE whether a turn needs the workspace has been a
// bug that recurred — a question about study performance routed to the tool-less
// model and silently answered from nothing. A lookup that finds nothing costs one
// embedding call and returns an empty block, so the cost of over-searching is a
// rounding error and the cost of under-searching is a wrong answer. Only turns
// with no question in them at all are skipped.
//
// PURE: hits in, prompt text out.

/** One matching passage, as public.match_library_chunks returns it. */
export interface LibraryHit {
  path: string;
  title: string;
  chunk_index: number;
  content: string;
  similarity: number;
}

/** Passages folded into one turn. Six is enough to cover a topic from more than
 *  one note without crowding out the conversation itself. */
export const MAX_CONTEXT_HITS = 6;
/** From any single note, so one long lecture cannot fill the whole block and hide
 *  a better answer sitting in a different note. */
export const MAX_HITS_PER_NOTE = 2;
/** Per passage. Chunks are ~2,000 characters; the head of one carries the point. */
export const HIT_CHAR_LIMIT = 700;

/** Acknowledgements — a turn that asks nothing. Everything else is a question as
 *  far as this is concerned, including one-word topics like "digoxin". */
const NO_QUESTION = new Set([
  "ok", "okay", "k", "kk", "yes", "yeah", "yep", "no", "nope", "sure",
  "thanks", "thank you", "ty", "thx", "cheers", "got it", "gotcha",
  "cool", "nice", "great", "perfect", "lol", "haha", "hi", "hey", "hello",
]);

/**
 * Is this turn worth a Library lookup? Deliberately generous — see the note at the
 * top of this file on why a tight gate is the failure mode, not the safe choice.
 * PURE.
 */
export function shouldSearchLibrary(userText: string): boolean {
  const flat = userText.replace(/\s+/g, " ").trim().toLowerCase();
  if (!flat) return false;
  if (NO_QUESTION.has(flat.replace(/[!.?,]+$/, ""))) return false;
  // Something has to be a word. Bare punctuation or an emoji is not a question.
  return /[a-z0-9]/.test(flat);
}

/**
 * Trim the raw hit list down to what goes in one prompt: strongest first, no more
 * than MAX_HITS_PER_NOTE from any one note, MAX_CONTEXT_HITS overall.
 *
 * The per-note cap runs BEFORE the overall cap on purpose. A long lecture split
 * into forty chunks will own the top of a similarity ranking, and taking the first
 * six would answer every question out of that one lecture — including questions a
 * different note answers better. PURE.
 */
export function selectHits(
  hits: readonly LibraryHit[],
  maxHits = MAX_CONTEXT_HITS,
  perNote = MAX_HITS_PER_NOTE,
): LibraryHit[] {
  const ranked = [...hits].sort((a, b) => b.similarity - a.similarity);
  const seenPerNote = new Map<string, number>();
  const out: LibraryHit[] = [];
  for (const hit of ranked) {
    if (out.length >= maxHits) break;
    const used = seenPerNote.get(hit.path) ?? 0;
    if (used >= perNote) continue;
    seenPerNote.set(hit.path, used + 1);
    out.push(hit);
  }
  return out;
}

/**
 * How many DISTINCT notes actually made it into the prompt — what the thinking
 * line reports. Six passages out of two notes is "2 notes", because that is what
 * the student would count if they looked. Runs the same selection the formatter
 * does, so the line can never claim a note the model was not given. PURE.
 */
export function notesUsed(hits: readonly LibraryHit[]): number {
  return new Set(selectHits(hits).map((hit) => hit.path)).size;
}

/** A passage's display name: its title, or the file name when the title is blank. */
function nameOf(hit: LibraryHit): string {
  const title = hit.title.trim();
  if (title) return title;
  const segment = hit.path.split("/").filter(Boolean).pop() ?? hit.path;
  return segment.replace(/\.(md|markdown|txt)$/i, "");
}

/**
 * Format selected passages into the block appended to the student's question.
 * Returns "" when there is nothing to add, so the caller can append unconditionally.
 *
 * The instruction line matters as much as the passages. Without it the model treats
 * its own general knowledge and the student's notes as interchangeable, which is
 * precisely backwards: the student is examined on what their course said, so where
 * the two disagree the note wins and the disagreement is worth saying out loud.
 * PURE.
 */
export function formatLibraryContext(hits: readonly LibraryHit[]): string {
  const chosen = selectHits(hits);
  if (chosen.length === 0) return "";
  return [
    "From this student's own Library notes (their course material — prefer it over " +
      "general knowledge, name the note you used, and say so plainly if it disagrees " +
      "with what you would otherwise answer):",
    ...chosen.map((hit, index) => {
      const body = hit.content.trim().slice(0, HIT_CHAR_LIMIT);
      return `${index + 1}. ${nameOf(hit)} (${hit.path})\n${body}`;
    }),
  ].join("\n\n");
}
