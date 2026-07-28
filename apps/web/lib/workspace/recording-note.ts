"use client";

// Turning a finished recording into the note the student keeps.
//
// Replaces live-audio-contract.ts + live-audio-insights.ts, which also carried
// the streaming transcript plumbing and a "live learning copilot" prompt that
// ran every 45 seconds while you spoke. Both are gone (owner 2026-07-27: "Drop
// live transcript entirely, one live high quality pass") — nothing is written
// until the recording stops, and then once, from all of it.
//
// The old split existed because a live note had to be short enough to appear
// mid-sentence, which is exactly the "bullet points of facts" problem: a
// constraint of being live, not a description of a good note. Without that
// constraint there is only one prompt, and it can organise by idea.

import { postChatCompletion, type WireMsg } from "@/lib/workspace/chat-api";

/** How much transcript rides the compose call. A 60k-char window is roughly a
 *  three-hour lecture at speaking pace, and the clip takes the END so a long
 *  session keeps its conclusions rather than its housekeeping. */
export const RECORDING_NOTE_TRANSCRIPT_CHARS = 60_000;

function cleanLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return compact || null;
}

/** mm:ss, or h:mm:ss once it runs past an hour. */
export function formatLiveDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/** The single compose pass. Pure, so the instructions can be pinned by tests. */
export function buildRecordingNoteMessages(transcript: string, context?: string): WireMsg[] {
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
        "Return the markdown body only: no title heading, no code fences, no preamble.",
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

/**
 * Compose the note once the transcript is back.
 *
 * Returns "" rather than throwing. There are no live notes to fall back on any
 * more, so a failure here means the student keeps the transcript and is told
 * plainly that the write-up did not happen — which is strictly better than an
 * exception that loses the recording on its way out.
 */
export async function requestRecordingNote(input: {
  uid: string;
  transcript: string;
  context?: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (!input.transcript.trim()) return "";
  try {
    const reply = await postChatCompletion(
      input.uid,
      buildRecordingNoteMessages(input.transcript, input.context),
      {
        decision: { model: "deepseek-chat", route: "learning", searchWeb: false },
        signal: input.signal,
      },
    );
    return reply.text?.trim() ?? "";
  } catch {
    return "";
  }
}
