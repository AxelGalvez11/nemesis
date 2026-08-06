// THE prompt that turns a recording into notes, and the rules for reading its
// answer back. One copy, shared by every surface that composes one.
//
// It lives here because it has been duplicated before and it cost real time.
// On 2026-07-29 the owner reported that xAI's notes were "worser than the
// assemblyai" ones and a provider order was reversed to fix it — but the
// transcripts were near-identical (79 words against 77 on the same recording).
// What actually differed was the PROMPT: the phone was still running an older
// one that demanded a JSON array of short bullets. Same audio, same engine,
// different instructions, and every signal in the product read as success.
//
// So when the compose pass moved server-side on 2026-08-05 — into
// supabase/functions/recording-worker, which cannot reach the Next.js app — the
// answer was not a second copy with a comment asking people to keep them in
// step. It was this file. The worker imports it by relative path (the same way
// the ask function imports answer.ts), and the web app re-exports it.
//
// apps/mobile/src/lib/live-notes.ts still carries its own copy for the phone's
// own lane. That is the remaining duplicate, and this is where it should point.

/** How much transcript rides the compose call. A 60k-char window is roughly a
 *  three-hour lecture at speaking pace, and the clip takes the END so a long
 *  session keeps its conclusions rather than its housekeeping. */
export const RECORDING_NOTE_TRANSCRIPT_CHARS = 60_000;

/** Longest title kept. Past this the chat card ellipsises and the Library
 *  filename gets unwieldy, so the extractor clips on a word boundary. */
export const RECORDING_TITLE_MAX_CHARS = 70;

export interface RecordingNoteMessage {
  role: "system" | "user";
  content: string;
}

function cleanLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

/** The single compose pass. Pure, so the instructions can be pinned by tests. */
export function buildRecordingNoteMessages(transcript: string, context?: string): RecordingNoteMessage[] {
  const clipped = transcript.slice(-RECORDING_NOTE_TRANSCRIPT_CHARS);
  const contextLine = cleanLine(context, 500);
  return [
    {
      role: "system",
      content:
        "You are turning a recording into the notes a student will revise from. Any subject or profession; never assume a biomedical one. " +
        "Write markdown. Open with one short paragraph saying what this session covered and what the listener should be able to do afterwards. " +
        "Then organise BY IDEA, not by chronology — group what belongs together even if it was said twenty minutes apart. Use headings. " +
        "For each idea give the point, the reasoning or mechanism behind it, and whatever example, number, or case the speaker used to make it. Prose and short lists both fine; a page of bare bullets is not. " +
        "Mark explicitly anything the speaker called examinable, important, or likely to appear on a test, and anything they were openly unsure about. " +
        "Keep every figure, unit, name, and definition exactly as spoken. Never add material that was not said — if the transcript is too fragmentary to support a section, leave it out rather than padding it. " +
        "Finish with a short 'Open questions' list of what was raised but not resolved. " +
        // The title rides on this same call rather than a second round-trip
        // (owner 2026-07-28: "can the note title also be renamed instead of
        // being just 'recording'"). It names the note in the Library, the card
        // in chat, and the note's filename, so it has to be about the SUBJECT.
        // splitRecordingNote strips this line back off before the body is saved,
        // and the caller falls back to the dated title when the model skips it.
        "Start your reply with one line in exactly this form: Title: <4 to 8 words naming what was actually discussed>. " +
        "Make it specific enough to recognise a month later — never the word 'Recording', never a date, never 'Lecture Notes'. " +
        "Then a blank line, then the markdown body only: no title heading, no code fences, no preamble.",
    },
    {
      role: "user",
      content: [
        contextLine ? `Session context: ${contextLine}` : "",
        `Transcript:\n${clipped}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

/** A "Title: …" first line, with the decoration models like to add: a heading
 *  hash, bold or italic markers, and either colon. */
const TITLE_LINE = /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*|__|\*|_)?[ \t]*title[ \t]*(?:\*\*|__|\*|_)?[ \t]*[:：][ \t]*(.*)$/i;

/** Emphasis, wrapping quotes, runs of whitespace and a trailing full stop all
 *  go: this string becomes a FILENAME as well as a label, and the note writers
 *  only guard the path separators. */
function cleanTitle(value: string): string {
  const stripped = value
    .replace(/[*_`]/g, "")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/, "")
    .trim();
  if (stripped.length <= RECORDING_TITLE_MAX_CHARS) return stripped;
  const clipped = stripped.slice(0, RECORDING_TITLE_MAX_CHARS);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > 30 ? clipped.slice(0, lastSpace) : clipped).trim();
}

/**
 * Peel the model's "Title: …" line off the front of the note.
 *
 * Only the FIRST non-empty line is ever considered — a "Title:" further down is
 * the note's own content. When that line is not there the body comes back
 * byte-identical and the title is "", which leaves the caller on the dated
 * fallback rather than guessing that line one was meant as a heading.
 */
export function splitRecordingNote(raw: string): { body: string; title: string } {
  const lines = raw.split("\n");
  const index = lines.findIndex((line) => line.trim().length > 0);
  if (index < 0) return { body: raw, title: "" };
  const match = lines[index]!.match(TITLE_LINE);
  // Matched the label, so the line is scaffolding either way: strip it even
  // when what followed cleans down to nothing, or "Title:" ends up in the note.
  if (!match) return { body: raw, title: "" };
  return { body: lines.slice(index + 1).join("\n").replace(/^\s+/, ""), title: cleanTitle(match[1] ?? "") };
}

// ── Countable detail about a finished note ──────────────────────────────────

/** Words in a transcript. Whitespace-split, because that is what "words" means
 *  to the person reading the number — no attempt to be clever about hyphens or
 *  speaker labels, which would make it harder to explain than it is worth. */
export function countTranscriptWords(transcript: string): number {
  const trimmed = transcript.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Markdown headings in the finished notes, which is what "sections" means to
 * someone looking at them.
 *
 * Fenced code blocks are skipped so a `# comment` inside one is not counted as a
 * section — the prompt above forbids code fences, but a transcript of a
 * programming lecture is exactly the case where the model ignores that, and a
 * section count that jumps because someone dictated shell commands is a number
 * nobody can reconcile.
 */
export function countNoteSections(notes: string): number {
  let fenced = false;
  let sections = 0;
  for (const line of notes.split("\n")) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && /^\s{0,3}#{1,6}\s+\S/.test(line)) sections += 1;
  }
  return sections;
}
