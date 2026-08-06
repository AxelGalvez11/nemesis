"use client";

// The recording clock, and the doorway to the shared notes prompt.
//
// 🔴 THE PROMPT AND ITS PARSER MOVED TO packages/shared/src/recording-note.ts on
// 2026-08-05, and the compose pass they belong to moved off this app entirely.
// It now runs in supabase/functions/recording-worker, which is what lets a
// lecture finish being written up after the page that recorded it has gone.
//
// They are re-exported here rather than deleted because two things still point
// at these names — apps/web/lib/workload-cost.ts prices a recording against
// RECORDING_NOTE_TRANSCRIPT_CHARS, and apps/mobile/src/lib/live-notes.ts
// documents its own copy against splitRecordingNote — and because the tests
// beside this file are the ones that pin the wording. Moving the words without
// moving the tests would have quietly unguarded them.
//
// `requestRecordingNote` is GONE. It called the model from the browser through
// the device-key valve, which cannot work from a background worker and could
// not survive a navigation even when it did.

export {
  buildRecordingNoteMessages,
  countNoteSections,
  countTranscriptWords,
  RECORDING_NOTE_TRANSCRIPT_CHARS,
  RECORDING_TITLE_MAX_CHARS,
  splitRecordingNote,
  type RecordingNoteMessage,
} from "@nemesis/shared";

/** mm:ss, or h:mm:ss once it runs past an hour. The recorder's live clock — the
 *  one thing in this file that is genuinely the browser's business. */
export function formatLiveDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
