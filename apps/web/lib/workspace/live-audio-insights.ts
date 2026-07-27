"use client";

import { postChatCompletion } from "@/lib/workspace/chat-api";
import {
  buildLiveAudioInsightMessages,
  buildRecordingNoteMessages,
  parseLiveAudioInsights,
  type LiveAudioInsights,
} from "@/lib/workspace/live-audio-contract";

export async function requestLiveAudioInsights(input: {
  uid: string;
  transcript: string;
  previousNotes: string[];
  context?: string;
  signal?: AbortSignal;
}): Promise<LiveAudioInsights | null> {
  const reply = await postChatCompletion(
    input.uid,
    buildLiveAudioInsightMessages(input.transcript, input.previousNotes, input.context),
    {
      decision: { model: "deepseek-chat", route: "conversation", searchWeb: false },
      signal: input.signal,
    },
  );
  return reply.text ? parseLiveAudioInsights(reply.text) : null;
}

/**
 * Compose the keeper note once recording stops.
 *
 * Returns "" rather than throwing: the recording itself is already safe by the
 * time this runs, and a failed compose must never cost the student their
 * transcript. The caller falls back to the live notes.
 */
export async function requestRecordingNote(input: {
  uid: string;
  transcript: string;
  liveNotes: string[];
  context?: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (!input.transcript.trim()) return "";
  try {
    const reply = await postChatCompletion(
      input.uid,
      buildRecordingNoteMessages(input.transcript, input.liveNotes, input.context),
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
