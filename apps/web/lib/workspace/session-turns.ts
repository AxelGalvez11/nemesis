// Flat message list -> the user/assistant pairs the Thread draws.
//
// Extracted from session-chat.tsx (owner 2026-07-28: a finished recording still
// never showed up in the conversation). The previous version dropped any
// assistant message that was not answering an unanswered user message:
//
//   const open = turns[turns.length - 1];
//   if (open && open.assistant === null) open.assistant = message;
//   // else: silently discarded
//
// A recording is exactly that message. Pressing record opens a fresh "Recorded
// session" with no user message in it at all, so the card announcing the
// finished recording had no turn to attach to and was thrown away on every
// single run — and with zero turns the Thread rendered its empty-state intro,
// which is why the conversation looked untouched. The message itself was always
// saved: chat_messages holds it, with the artifact (transcript + notes) in
// meta.outputs, so the fix is purely in the drawing, not in the saving.
//
// A turn can now stand on either leg: user-only (a question mid-answer) or
// assistant-only (something the app posted by itself — a recording today,
// anything else the workspace announces later).

import type { SessionMessage } from "./sessions-store";

export interface ThreadTurn {
  user: SessionMessage | null;
  assistant: SessionMessage | null;
}

export function groupTurns(messages: readonly SessionMessage[]): ThreadTurn[] {
  const turns: ThreadTurn[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ assistant: null, user: message });
      continue;
    }
    const open = turns[turns.length - 1];
    // Fills the open question when there is one; otherwise stands on its own
    // rather than disappearing.
    if (open && open.assistant === null) turns[turns.length - 1] = { ...open, assistant: message };
    else turns.push({ assistant: message, user: null });
  }
  return turns;
}
