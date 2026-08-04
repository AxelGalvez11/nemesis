// Recognize a syllabus from its EXTRACTED TEXT, not its filename.
//
// The filename gate in session-chat misses real syllabi: the owner's own four
// course PDFs are named "Fall-2026-PHCY-2105-01-….pdf" — nothing in the name
// says syllabus, and if the message alongside doesn't say "calendar" either,
// 141k characters of course schedule used to pour into a plain chat turn,
// where the model can't hold them across turns (2026-08-04: three of four
// courses never reached the calendar). Once extraction has run anyway, the
// text itself is the honest signal.
//
// Field-agnostic on purpose: these are STRUCTURAL course-document markers
// (grading, office hours, schedule, integrity policy…) that a law syllabus
// and a mechanical-engineering syllabus share — never subject keywords.

/** Below this much text a document is a snippet, not a course document. */
const MIN_SNIFF_CHARS = 1_500;

/** Only the head is read: every real syllabus declares itself in the first
 *  pages, and a stray "grading" mention on page 20 of a lecture must not
 *  reclassify the lecture. */
const SNIFF_HEAD_CHARS = 12_000;

const STRUCTURAL_MARKERS: readonly RegExp[] = [
  /course\s+description/,
  /\bgrading\b|\bgrade\s+(scale|breakdown|distribution)\b/,
  /office\s+hours/,
  /learning\s+(objectives|outcomes)/,
  /course\s+(schedule|outline|calendar)/,
  /academic\s+(integrity|honesty|dishonesty)/,
  /\bprerequisites?\b/,
  /\bcredit\s+hours?\b/,
  /attendance\s+polic/,
  /\blate\s+(work|polic|assignment)/,
  /required\s+(text|textbook|materials)/,
];

/** Three independent markers, or the word itself. One or two can happen in a
 *  lecture deck ("learning objectives" + "prerequisites" is a normal first
 *  slide); three different administrative sections is a course document. */
export function sniffsAsSyllabus(text: string): boolean {
  const head = text.slice(0, SNIFF_HEAD_CHARS).toLowerCase();
  if (head.trim().length < MIN_SNIFF_CHARS) return false;
  if (/\bsyllabus\b/.test(head)) return true;
  let hits = 0;
  for (const marker of STRUCTURAL_MARKERS) if (marker.test(head)) hits += 1;
  return hits >= 3;
}
