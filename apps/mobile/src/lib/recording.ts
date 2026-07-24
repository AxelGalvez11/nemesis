// Phone recorder (pure logic) — live-transcription state for the Record
// screen plus the save-shapes shared with web's Record mode. Dependency-free
// and Deno-testable; the speech-recognition events and Supabase writes live in
// hooks/useLiveTranscription.ts and api/chat.ts.
//
// Transcript model: iOS SFSpeechRecognizer streams the CURRENT utterance's
// full text on every "result" event, then marks it final and starts a fresh
// utterance. So the screen's state is a list of committed paragraphs plus one
// live interim line that keeps rewriting itself until it commits.

import type { ChatOutput, WireMsg } from "./chat-thread.ts";

// --- Library note body (owner item 4) --------------------------------------
//
// A saved recording's notes are mirrored into the Library as a plain markdown
// note (api/chat.ts's enhance pass writes it via api/cloudLibrary.ts). This
// builds the body; the path/filename lives in lib/library-paths.ts
// (recordingLibraryPath). Kept pure so the exact markdown is pinned by a test.

/** The markdown body for a recording's Library note. `notes` is the enhanced
 *  bullet text (liveNotesText joins the points with bare newlines, so each line
 *  is re-emitted as a "- " bullet — markdown would otherwise collapse them into
 *  one run-on paragraph). The transcript section is appended ONLY when the
 *  student turned the setting on (profile/general.tsx, default off).
 *
 *  Deliberately NO "# <title>" heading: note.tsx renders the note's title as its
 *  own heading above the body, so a heading line here would print the title
 *  twice — the same divergence documented in api/cloudLibrary.ts's createNote. */
export function buildRecordingNoteMarkdown(input: {
  notes: string | undefined;
  transcript: string | undefined;
  includeTranscript: boolean;
}): string {
  const noteLines = (input.notes ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sections: string[] = [];
  if (noteLines.length > 0) {
    sections.push(noteLines.map((line) => (/^[-*]\s/.test(line) ? line : `- ${line}`)).join("\n"));
  } else {
    // A short or quiet recording can finish before the live-notes pass wrote a
    // single bullet — say so plainly rather than saving an empty note.
    sections.push("No notes were captured for this recording.");
  }
  if (input.includeTranscript) {
    const transcript = (input.transcript ?? "").trim();
    sections.push(`## Transcript\n\n${transcript || "No transcript was captured for this recording."}`);
  }
  return `${sections.join("\n\n")}\n`;
}

export interface LiveTranscript {
  finals: string[];
  interim: string;
}

export function emptyTranscript(): LiveTranscript {
  return { finals: [], interim: "" };
}

export function applyRecognitionResult(current: LiveTranscript, transcript: string, isFinal: boolean): LiveTranscript {
  if (!isFinal) return { ...current, interim: transcript };
  const text = transcript.trim();
  if (!text) return { ...current, interim: "" };
  return { finals: [...current.finals, text], interim: "" };
}

/** The saved transcript: committed paragraphs plus any still-open interim. */
export function fullTranscript(current: LiveTranscript): string {
  return [...current.finals, current.interim.trim()].filter(Boolean).join("\n\n");
}

export function hasTranscript(current: LiveTranscript): boolean {
  return fullTranscript(current).length > 0;
}

/** "0:05" / "12:34" / "1:02:03" — the recording clock. */
export function formatRecordingClock(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** The recording card's plain-spoken length — the "…" in "Recorded 25 minutes"
 *  (owner item 3). Whole minutes, FLOORED like a clock so a 25:40 lecture reads
 *  "25 minutes" (the honest "how far it got" number, not a rounded-up 26), with
 *  anything under a minute collapsed to one phrase rather than a bare "0
 *  minutes". Kept pure so the card and the fullscreen view read identically. */
export function spokenDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return "less than a minute";
  const minutes = Math.floor(total / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** Same default title web's Record mode saves with (recording-artifacts.ts).
 *  A timestamp, deliberately: it's what stands until the AI title pass replaces
 *  it (api/chat.ts enhanceRecordingArtifact), and what stays if that pass never
 *  runs (no audio kept) or fails. */
export function recordingTitle(at: Date): string {
  return `Recording · ${at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}

// --- AI title pass (owner item 3) ------------------------------------------
//
// Once the enhanced transcript is final, api/chat.ts asks the model for a short
// human title so two recordings in one thread stop reading as identical
// "Recording" chips. Runs on the CHEAP conversational route (LIVE_NOTES_DECISION
// — never the reasoner), the same slot the live-notes pass uses. The prompt
// build and the reply clean-up are pure and live here; the model call is in
// api/chat.ts (requestRecordingTitle).

/** How much transcript the title pass sends. A title only needs the gist, and
 *  a lecture states its topic early, so the opening slice is plenty — and it
 *  keeps the metered call small on a multi-hour recording. */
export const RECORDING_TITLE_TRANSCRIPT_CHARS = 6_000;
/** Titles are cut here before they reach the row/chip — a headline, not a
 *  paragraph. (saveRecordingArtifact also caps at 200; this is the tighter,
 *  card-friendly bound.) */
export const RECORDING_TITLE_MAX_CHARS = 80;

/** The completion messages for the title pass. Mirrors buildLiveNotesMessages'
 *  shape (system framing + a single transcript user turn); the reply is plain
 *  prose, not JSON, so cleanRecordingTitle — not a JSON parse — reads it. */
export function buildRecordingTitleMessages(transcript: string): WireMsg[] {
  const clipped = transcript.trim().slice(0, RECORDING_TITLE_TRANSCRIPT_CHARS);
  return [
    {
      role: "system",
      content:
        "You name a recording of a lecture, meeting, or study session. " +
        "Read the transcript and reply with ONE short, specific title in plain words — " +
        "3 to 8 words naming the actual topic. No quotes, no markdown, no 'Title:' prefix, " +
        "no trailing period. Never answer with 'Recording' or 'Untitled'. Reply with the title only.",
    },
    { role: "user", content: `Transcript:\n${clipped}` },
  ];
}

/** Turn the model's reply into a card-ready title, or null to KEEP the existing
 *  timestamp title. A conversational reply is plain prose (never JSON), and a
 *  model still wraps or labels it in a dozen small ways — take the first real
 *  line, drop a leading "Title:"/heading/bullet marker, strip surrounding
 *  quotes/backticks/bold, drop a trailing period, and cap the length. An empty
 *  result returns null so the caller never overwrites a good timestamp with
 *  nothing. */
export function cleanRecordingTitle(raw: string): string | null {
  const firstLine = (raw ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return null;
  const title = firstLine
    // A model sometimes prefixes a label ("Title:") or a markdown heading/bullet mark.
    .replace(/^(?:title\s*[:\-–]\s*|#+\s*|[-*]\s+)/i, "")
    // Strip quotes / backticks / bold asterisks it may WRAP the title in (surrounding only —
    // an internal quote in a real title is left alone).
    .replace(/^["'`*“”‘’]+/, "")
    .replace(/["'`*“”‘’]+$/, "")
    // A trailing period on an otherwise headline-style phrase reads wrong on a card.
    .replace(/\s*\.\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return title ? title.slice(0, RECORDING_TITLE_MAX_CHARS) : null;
}

export interface RecordingDraft {
  title: string;
  transcript: string;
  notes: string;
  durationSeconds: number;
  createdAt: string;
}

export function buildRecordingDraft(current: LiveTranscript, elapsedSeconds: number, at: Date, notesText = ""): RecordingDraft {
  return {
    title: recordingTitle(at),
    transcript: fullTranscript(current),
    notes: notesText,
    durationSeconds: Math.max(0, Math.round(elapsedSeconds)),
    createdAt: at.toISOString(),
  };
}

// A pending flag older than this reads as abandoned (app killed mid-enhance,
// poll timed out without the clearing write landing) — the indicator must
// never say "polishing" forever.
const POLISH_STALE_MS = 45 * 60 * 1000;

export type PolishState = "pending" | "done" | "none";

/** What the chip/sheet should say about the enhance pass for one recording
 *  entry. Reads the `polish` flag api/chat.ts maintains on the chip entry,
 *  with a staleness cutoff so an interrupted pass degrades to silence. */
export function polishState(entry: Pick<ChatOutput, "polish" | "createdAt">, now: Date): PolishState {
  if (entry.polish === "done") return "done";
  if (entry.polish !== "pending") return "none";
  const createdAt = entry.createdAt ? new Date(entry.createdAt).getTime() : Number.NaN;
  if (!Number.isFinite(createdAt)) return "pending";
  return now.getTime() - createdAt > POLISH_STALE_MS ? "none" : "pending";
}

/**
 * Merges a recording entry into a thread's `chat_threads.meta.outputs` —
 * the chip row both the phone chat and web session read — preserving every
 * other meta key and replacing any earlier entry with the same id (so a
 * retried save can't duplicate a chip).
 */
export function mergeOutputsMeta(meta: unknown, entry: ChatOutput): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof meta === "object" && meta !== null && !Array.isArray(meta) ? { ...(meta as Record<string, unknown>) } : {};
  const existing = Array.isArray(base.outputs) ? base.outputs : [];
  const kept = existing.filter(
    (item) => !(typeof item === "object" && item !== null && (item as Record<string, unknown>).id === entry.id),
  );
  return { ...base, outputs: [...kept, entry] };
}
