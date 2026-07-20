"use client";

import { postChatCompletion } from "@/lib/workspace/chat-api";
import {
  buildLiveAudioInsightMessages,
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
