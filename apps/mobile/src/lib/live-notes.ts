// Live AI notes for the Record screen (pure logic) — the phone half of web's
// recorder notes panel. Cadence, prompt, parsing, and merge rules mirror
// apps/web/lib/workspace/live-audio-contract.ts + use-live-audio.ts so a
// lecture recorded on either surface produces the same kind of notes; keep the
// prompt string in sync with the web original. Dependency-free and
// Deno-testable; the timer and the completion call live in
// hooks/useLiveNotes.ts and api/chat.ts.

import type { WireMsg } from "./chat-thread.ts";

// Web parity: don't summarize until there's something to summarize, and at
// most one model call per interval. The growth gate is phone-only thrift — a
// silent stretch (no new words) never spends a call on an unchanged prompt.
export const LIVE_NOTES_MIN_CHARS = 160;
export const LIVE_NOTES_INTERVAL_MS = 45_000;
export const LIVE_NOTES_MIN_GROWTH_CHARS = 40;
const LIVE_NOTES_TRANSCRIPT_CHARS = 8_000;
const MAX_NEW_NOTES = 6;
const MAX_KEPT_NOTES = 18;
const MAX_NOTE_LENGTH = 240;

export interface LiveNotesGate {
  transcriptLength: number;
  lastLength: number;
  lastAt: number;
  inFlight: boolean;
  now: number;
}

/** One decision per timer tick: is a notes pass worth a model call yet? */
export function shouldRequestLiveNotes(gate: LiveNotesGate): boolean {
  if (gate.inFlight) return false;
  if (gate.transcriptLength < LIVE_NOTES_MIN_CHARS) return false;
  if (gate.transcriptLength - gate.lastLength < LIVE_NOTES_MIN_GROWTH_CHARS) return false;
  if (gate.lastAt && gate.now - gate.lastAt < LIVE_NOTES_INTERVAL_MS) return false;
  return true;
}

/** Same messages web's recorder sends (live-audio-contract.ts, notes-only
 *  version) so both surfaces read from one prompt. */
export function buildLiveNotesMessages(transcript: string, previousNotes: string[], context?: string): WireMsg[] {
  const clippedTranscript = transcript.slice(-LIVE_NOTES_TRANSCRIPT_CHARS);
  const contextLine = cleanLine(context, 500);
  return [
    {
      role: "system",
      content:
        "You are Nemesis's live learning copilot. Support any subject, discipline, major, profession, meeting, interview, or research conversation; never assume a biomedical context. " +
        "Extract only what the speaker actually established. Separate uncertainty from fact. Return strict JSON with exactly one string-array key: notes (up to 6 concise new note bullets). " +
        "Do not repeat prior notes. Do not include markdown fences or any text outside the JSON object.",
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

// --- Post-enhance notes rebuild --------------------------------------------
//
// The live pass above summarizes the phone's ON-DEVICE transcript while it
// grows, because that is the only text that exists during a lecture. When the
// server's accuracy pass finishes (api/chat.ts enhanceRecordingArtifact) a
// sharper transcript replaces it — at which point the saved notes are the best
// bullets we could write from the WORSE text, and nothing rewrote them.
//
// So the rebuild walks the finished transcript in order and re-runs the SAME
// prompt per window: each call sees the notes already on the board and is told
// not to repeat them, exactly as the live pass sees a growing transcript. One
// call per window (three or so for an hour of lecture) against the ~80 the
// live pass already spent — cheap enough to be unconditional.

export const FINAL_NOTES_WINDOW_CHARS = 20_000;
export const FINAL_NOTES_MAX_WINDOWS = 6;
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
      windows.push(text.slice(cursor).trim());
      break;
    }
    const end = cursor + windowEnd(text.slice(cursor, cursor + FINAL_NOTES_WINDOW_CHARS));
    windows.push(text.slice(cursor, end).trim());
    cursor = end;
  }
  return windows.filter(Boolean);
}

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
