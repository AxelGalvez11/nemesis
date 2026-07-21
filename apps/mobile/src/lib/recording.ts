// Phone recorder (pure logic) — live-transcription state for the Record
// screen plus the save-shapes shared with web's Record mode. Dependency-free
// and Deno-testable; the speech-recognition events and Supabase writes live in
// hooks/useLiveTranscription.ts and api/chat.ts.
//
// Transcript model: iOS SFSpeechRecognizer streams the CURRENT utterance's
// full text on every "result" event, then marks it final and starts a fresh
// utterance. So the screen's state is a list of committed paragraphs plus one
// live interim line that keeps rewriting itself until it commits.

import type { ChatOutput } from "./chat-thread.ts";

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

/** Same default title web's Record mode saves with (recording-artifacts.ts). */
export function recordingTitle(at: Date): string {
  return `Recording · ${at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
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
