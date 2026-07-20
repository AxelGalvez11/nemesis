// One-shot "open this notebook chat in recording mode" handoff. The notebook
// home sets it right before navigating into the chat it just created; the
// chat view consumes it on mount and starts the recorder. Module-level and
// import-free (same pattern as workspace/composer-seed).

let pendingChatId: string | null = null;

export function requestNotebookRecording(chatId: string): void {
  pendingChatId = chatId;
}

/** True exactly once for the chat the request targeted. */
export function consumeNotebookRecording(chatId: string): boolean {
  if (pendingChatId !== chatId) return false;
  pendingChatId = null;
  return true;
}
