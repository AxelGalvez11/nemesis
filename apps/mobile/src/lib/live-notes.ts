// AI notes for a recording (pure logic) — the prompt, the parsing, the merge,
// and how a finished transcript is split into passes. The prompt mirrors
// apps/web/lib/workspace/live-audio-contract.ts so a lecture recorded on either
// surface produces the same kind of notes; keep the string in sync with the web
// original. Dependency-free and Deno-testable; the completion call lives in
// api/chat.ts.
//
// NOTES ARE WRITTEN ONCE, WHEN THE RECORDING ENDS (owner 2026-07-27: "would
// just recording the audio, showing the live transcript … and waiting until the
// finished recording be cheaper, so the audio gets a clean high-quality pass …
// and the AI notes generate the quality notes once?"). Yes, on both counts:
//
//   * COST. The old live pass ran every 45s, sending up to 8,000 characters
//     each time — about 80 model calls for an hour of lecture, ~200k tokens.
//     Those tokens come out of the STUDENT'S monthly allowance, so one hour of
//     live notes spent roughly a tenth of a Plus plan's entire month. The
//     single end-of-recording pass over the same lecture is ~14 calls, ~24k
//     tokens: about an eighth of the spend, and about 1% of the month.
//   * QUALITY. The live pass could only ever read the phone's rough on-device
//     transcript, because that is the only text that exists mid-lecture. The
//     end pass reads the server's high-accuracy transcript. Better words in,
//     better notes out — and it was ALREADY running, on top of the live pass,
//     so the live bullets were being paid for and then thrown away.
//
// What the student sees while recording is unchanged and still free: the phone
// transcribes on-device (SFSpeechRecognizer), costing nothing and no minutes.

import type { WireMsg } from "./chat-thread.ts";

/** Don't summarize until there's something to summarize. Still the floor for a
 *  window: below this a chunk of transcript is not worth its own model call. */
export const LIVE_NOTES_MIN_CHARS = 160;
/** How much transcript buildLiveNotesMessages actually sends. Exported so the
 *  window planner can size against it — a window bigger than this is silently
 *  truncated by the prompt builder, not summarized. */
export const LIVE_NOTES_TRANSCRIPT_CHARS = 8_000;
const MAX_NEW_NOTES = 10;
const MAX_KEPT_NOTES = 40;
const MAX_NOTE_LENGTH = 520;

/** The messages one notes pass sends. Named for web's live contract, which it
 *  still mirrors verbatim, though on the phone every call now comes from the
 *  end-of-recording rebuild rather than a timer. */
export function buildLiveNotesMessages(transcript: string, previousNotes: string[], context?: string): WireMsg[] {
  const clippedTranscript = transcript.slice(-LIVE_NOTES_TRANSCRIPT_CHARS);
  const contextLine = cleanLine(context, 500);
  return [
    {
      role: "system",
      content:
        "You turn a finished recording into faithful, useful notes. Support any subject, discipline, meeting, interview, lecture, or research conversation; never assume a biomedical context. " +
        "Keep the speaker's meaning, names, examples, qualifications, disagreements, and uncertainty. Attribute opinions and allegations to the speaker instead of rewriting them as facts. " +
        "For teaching content, capture definitions, mechanisms, relationships, steps, examples, and conclusions. For meetings, capture decisions, rationale, open questions, and action items. " +
        "Write self-contained, polished notes in complete sentences, not telegraphic fragments. Extract only what the recording establishes and never fill gaps in a poor transcript. " +
        "Return strict JSON with exactly one string-array key: notes (up to 10 substantive new notes, each one to three sentences). " +
        "Keep the recording's order, do not repeat prior notes, and include no markdown fences or text outside the JSON object.",
    },
    {
      role: "user",
      content: [
        contextLine ? `Known session context: ${contextLine}` : "",
        previousNotes.length ? `Notes already captured:\n- ${previousNotes.slice(-12).join("\n- ")}` : "",
        `Most recent transcript:\n${clippedTranscript}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

/** How much transcript the FINAL note pass sends. Matches web's
 *  RECORDING_NOTE_TRANSCRIPT_CHARS — roughly a three-hour lecture at speaking
 *  pace — and the clip takes the END so a long session keeps its conclusions. */
export const FINAL_NOTE_TRANSCRIPT_CHARS = 60_000;

/**
 * The finished recording's notes, in ONE pass, as markdown.
 *
 * WHY THIS EXISTS (owner 2026-07-30). The phone and the web produced visibly
 * different notes from the same feature, and the cause was not the model, the
 * transcript, or a provider fallback — it was this file. buildLiveNotesMessages
 * asks for "strict JSON with exactly one string-array key" and "no markdown",
 * so the phone was STRUCTURALLY incapable of the headings, opening summary and
 * point-plus-reasoning the web produced. It was not degraded output; it was a
 * different brief, working exactly as written.
 *
 * So this mirrors apps/web/lib/workspace/recording-note.ts verbatim. Two prompts
 * for one feature is what caused the divergence, and the fix is not to write a
 * third — if this drifts from web's again, the phone's notes get quietly worse
 * again and nothing will say so.
 */
export function buildFinalNoteMessages(transcript: string, context?: string): WireMsg[] {
  const clipped = transcript.slice(-FINAL_NOTE_TRANSCRIPT_CHARS);
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

/** A "Title: …" first line, with the decoration models like to add. Mirrors
 *  web's splitRecordingNote so both surfaces strip it identically. */
const TITLE_LINE = /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*|__|\*|_)?[ \t]*title[ \t]*(?:\*\*|__|\*|_)?[ \t]*[:：][ \t]*(.*)$/i;

/**
 * Peel the model's "Title: …" line off the front of the note.
 *
 * Only the FIRST non-empty line is considered — a "Title:" further down is the
 * note's own content. No match returns the body byte-identical with an empty
 * title, which leaves the caller on its dated fallback rather than guessing
 * that line one was meant as a heading.
 */
export function splitFinalNote(raw: string): { body: string; title: string } {
  const lines = raw.split("\n");
  const index = lines.findIndex((line) => line.trim().length > 0);
  if (index < 0) return { body: raw, title: "" };
  const match = lines[index]!.match(TITLE_LINE);
  if (!match) return { body: raw, title: "" };
  const title = (match[1] ?? "")
    .replace(/[*_`]/g, "")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/, "")
    .trim();
  return { body: lines.slice(index + 1).join("\n").replace(/^\s+/, ""), title };
}

/** Tolerant parse of the model reply — fences stripped, outer braces sliced,
 *  anything that isn't a clean notes array becomes []. */
export function parseLiveNotes(raw: string): string[] {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>;
    return cleanList(parsed.notes, MAX_NEW_NOTES, MAX_NOTE_LENGTH);
  } catch {
    return [];
  }
}

/** Append-and-dedupe, keeping the newest `keep` notes (web parity at the
 *  default; the post-enhance rebuild below passes its own larger ceiling
 *  because it summarizes a whole lecture in one go, not a rolling window). */
export function mergeLiveNotes(previous: string[], next: string[], keep: number = MAX_KEPT_NOTES): string[] {
  return Array.from(new Set([...previous, ...next])).slice(-keep);
}

/** The saved artifact string — web's record-workspace joins with plain
 *  newlines (the "- " bullet prefix is display-only on both surfaces). */
export function liveNotesText(notes: string[]): string {
  return notes.join("\n");
}

// --- The notes pass ---------------------------------------------------------
//
// Runs once, when a recording is saved and its transcript is final. It walks
// the transcript in order and runs the prompt above per window; each call sees
// the notes already on the board and is told not to repeat them, so the bullets
// accumulate across a lecture the way they would have if written live.
//
// Two transcripts can reach it (api/chat.ts enhanceRecordingArtifact): the
// server's high-accuracy one, which is the normal case, or — when that pass
// cannot run at all (offline, upload failure, monthly allowance spent) — the
// phone's own on-device text. The second is worse, but notes written from a
// rough transcript beat no notes at all, and it is the reason removing the live
// pass costs the student nothing when the network is against them.

// A window is deliberately HALF of LIVE_NOTES_TRANSCRIPT_CHARS. The prompt
// builder keeps only the LAST LIVE_NOTES_TRANSCRIPT_CHARS of whatever it is
// handed, so a window larger than that clip is not summarized — it is silently
// truncated, and most of the lecture never reaches the model. Half rather than
// exactly equal also keeps note density proportionate: one pass of up to
// MAX_NEW_NOTES bullets per ~5 minutes of speech. The test suite pins
// `FINAL_NOTES_WINDOW_CHARS <= LIVE_NOTES_TRANSCRIPT_CHARS` so the two can
// never drift apart again.
export const FINAL_NOTES_WINDOW_CHARS = LIVE_NOTES_TRANSCRIPT_CHARS / 2;
/** ~4 hours of speech, comfortably above the 3h ceiling the server's
 *  transcription route enforces — so the truncation branch should be
 *  unreachable in practice. It still logs if it is ever hit. */
export const FINAL_NOTES_MAX_WINDOWS = 45;
export const FINAL_NOTES_MAX_KEPT = 40;

/** Break marks tried in order of preference when choosing where a window ends. */
const FINAL_NOTES_BREAKS = ["\n\n", "\n", ". ", " "] as const;

/** Ordered windows over a FINISHED transcript. Cuts land on the last natural
 *  boundary in the window so no window starts or ends mid-word; a transcript
 *  with no boundaries at all is cut hard rather than looping forever. Past
 *  FINAL_NOTES_MAX_WINDOWS the tail is dropped — a bounded, visible ceiling
 *  beats an unbounded model spend on a runaway recording. */
export function planFinalNotesWindows(transcript: string): string[] {
  const text = transcript.trim();
  if (!text) return [];
  const windows: string[] = [];
  let cursor = 0;
  while (cursor < text.length && windows.length < FINAL_NOTES_MAX_WINDOWS) {
    if (text.length - cursor <= FINAL_NOTES_WINDOW_CHARS) {
      const tail = text.slice(cursor).trim();
      if (!tail) break;
      const previous = windows.pop();
      if (previous === undefined) {
        windows.push(tail);
      } else if (tail.length < LIVE_NOTES_MIN_CHARS) {
        // A sliver left over after the last boundary cut is not worth its own
        // metered model call, so it rides along with the window before it.
        // NEVER dropped — a lecture's closing words are often its point. This
        // is the one window that may exceed FINAL_NOTES_WINDOW_CHARS, which is
        // why that constant sits at half the prompt builder's clip.
        windows.push(`${previous} ${tail}`);
      } else {
        windows.push(previous, tail);
      }
      break;
    }
    const end = cursor + windowEnd(text.slice(cursor, cursor + FINAL_NOTES_WINDOW_CHARS));
    windows.push(text.slice(cursor, end).trim());
    cursor = end;
  }
  return windows.filter(Boolean);
}

/** How many bullets a saved notes blob holds (the artifact stores them as one
 *  newline-joined string — see liveNotesText). */
export function countNotes(text: string | undefined | null): number {
  return (text ?? "").split("\n").filter((line) => line.trim()).length;
}

// `shouldReplaceNotes` used to live here: it kept the live bullets whenever the
// rebuilt ones were FEWER, on the theory that ground covered beats wording. In
// practice that meant a student could be handed the notes written from the
// rougher transcript purely because there were more of them — the better text
// losing on a count. With the live pass gone there are no bullets to compare
// against, so the rule is gone rather than left in place as a guard that can no
// longer fire.

/** Offset just past the last natural break in the window, or its full length
 *  when it holds none. Breaks in the first half are ignored so a stray early
 *  newline can't shrink a window to almost nothing. */
function windowEnd(window: string): number {
  const floor = Math.floor(window.length / 2);
  for (const mark of FINAL_NOTES_BREAKS) {
    const at = window.lastIndexOf(mark);
    if (at >= floor) return at + mark.length;
  }
  return window.length;
}

function cleanLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return compact || null;
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const clean = cleanLine(item, maxLength);
    if (clean) unique.add(clean);
    if (unique.size >= maxItems) break;
  }
  return Array.from(unique);
}
