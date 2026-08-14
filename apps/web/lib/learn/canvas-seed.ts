// One-shot handoff of files (and an optional topic) picked on the Canvas home composer, before
// any canvas exists to attach them to. Same pattern as lib/workspace/composer-seed.ts: a File
// cannot ride in a URL query string, so CanvasHome stages it here, navigates, and the freshly
// mounted LearningCanvas consumes it exactly once on mount.

let pending: SeededCanvasIntent | null = null;

export interface SeededCanvasIntent {
  files: File[];
  /** "" when the learner only attached material and typed nothing. */
  topic: string;
}

export function seedCanvasIntent(intent: SeededCanvasIntent): void {
  pending = intent.files.length > 0 || intent.topic.trim() ? { files: [...intent.files], topic: intent.topic } : null;
}

/** Returns the seeded intent exactly once, then clears it. */
export function consumeSeededCanvasIntent(): SeededCanvasIntent | null {
  const intent = pending;
  pending = null;
  return intent;
}
