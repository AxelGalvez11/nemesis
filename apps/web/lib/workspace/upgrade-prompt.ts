// Global "out of credits" upgrade prompt — a tiny module store the transport
// layer can trigger from anywhere (Sessions chat, notebook chats, live audio)
// and the shell-mounted dialog renders. Import-free on purpose: the tsx test
// runner executes this file without @/ alias resolution, and the transport
// layer can depend on it without pulling UI code.

export interface UpgradePromptState {
  open: boolean;
  message: string | null;
}

let state: UpgradePromptState = { open: false, message: null };
const listeners = new Set<() => void>();

function emit(next: UpgradePromptState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function subscribeUpgradePrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function upgradePromptSnapshot(): UpgradePromptState {
  return state;
}

// Stable reference for React's server snapshot (useSyncExternalStore).
const CLOSED: UpgradePromptState = { open: false, message: null };
export function upgradePromptServerSnapshot(): UpgradePromptState {
  return CLOSED;
}

/** Open the upgrade popup. `message` is the server's student-readable line
 *  when available (e.g. which limit was hit); re-opening replaces it. */
export function showUpgradePrompt(message?: string | null): void {
  const trimmed = typeof message === "string" ? message.trim() : "";
  emit({ open: true, message: trimmed ? trimmed : null });
}

export function dismissUpgradePrompt(): void {
  if (!state.open) return;
  emit({ open: false, message: state.message });
}
