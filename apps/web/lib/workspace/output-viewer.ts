// Shell-mounted output viewer state (same import-free module-store pattern as
// upgrade-prompt.ts): any surface calls openOutputViewer(output) and the
// dialog mounted in workspace-shell presents it. Immutable state replacement.

import type { SessionOutput } from "@/lib/workspace/sessions-store";

export interface OutputViewerState {
  open: boolean;
  output: SessionOutput | null;
}

const CLOSED: OutputViewerState = { open: false, output: null };

let state: OutputViewerState = CLOSED;
const listeners = new Set<() => void>();

function emit(next: OutputViewerState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function openOutputViewer(output: SessionOutput): void {
  emit({ open: true, output });
}

export function closeOutputViewer(): void {
  emit(CLOSED);
}

export function subscribeOutputViewer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function outputViewerSnapshot(): OutputViewerState {
  return state;
}

/** Stable constant so useSyncExternalStore's server snapshot never loops. */
export function outputViewerServerSnapshot(): OutputViewerState {
  return CLOSED;
}
