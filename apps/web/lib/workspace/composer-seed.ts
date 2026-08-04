// One-shot handoff of attachment files into the next mounted chat composer.
// Used by "Attach to AI chat" in the Library sidebar: selected notes become
// virtual .md Files here, then the caller navigates to Sessions, whose
// composer consumes them as ordinary attachment chips (the existing
// prepareChatAttachments path reads their text into the wire message).
// Module-level and import-free on purpose (same pattern as upgrade-prompt).

let pendingFiles: File[] | null = null;

export function seedComposerFiles(files: File[]): void {
  pendingFiles = files.length > 0 ? [...files] : null;
}

/** Returns the seeded files exactly once, then clears the seed. */
export function consumeSeededComposerFiles(): File[] | null {
  const files = pendingFiles;
  pendingFiles = null;
  return files;
}

// One-shot chat INTENT — a message that should be SENT on arrival, not typed.
// Used by the learning loop's note actions (Teach me / Flashcards / Test,
// owner 2026-08-03): the student clicked a verb on a note, so Sessions sends
// the request immediately with the note attached instead of parking it in the
// composer for a second confirmation.

export interface SeededChatIntent {
  /** Sent as the student's message the moment Sessions mounts. */
  prompt: string;
  files: File[];
}

let pendingIntent: SeededChatIntent | null = null;

export function seedChatIntent(intent: SeededChatIntent): void {
  pendingIntent = intent.prompt.trim() ? { prompt: intent.prompt, files: [...intent.files] } : null;
}

/** Returns the seeded intent exactly once, then clears it. */
export function consumeSeededChatIntent(): SeededChatIntent | null {
  const intent = pendingIntent;
  pendingIntent = null;
  return intent;
}
