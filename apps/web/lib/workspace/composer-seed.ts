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
