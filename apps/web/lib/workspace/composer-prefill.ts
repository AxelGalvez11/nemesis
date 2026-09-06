// A one-shot hand-off of text into the canvas composer.
//
// Onboarding's last screen offers three example questions. Picking one has to
// close onboarding AND land the words in the composer on /learn, and the two
// live in different parts of the tree: the gate is mounted in the workspace
// layout, the composer inside the learn page. sessionStorage is the hand-off.
// It is written once, read once, and cleared on read, so a reload never
// re-plants an old prompt. sessionStorage rather than localStorage because a
// prompt meant for this tab must not appear in another one.
//
// A composer that is ALREADY mounted (the learner was on /learn when onboarding
// closed) would never see a mount-time read, so the stash also fires a window
// event the composer listens for. Both paths drain the same key.

export const COMPOSER_PREFILL_KEY = "nemesis.composer.prefill";
export const COMPOSER_PREFILL_EVENT = "nemesis:composer-prefill";

/** Store text for the next composer to pick up, and tell any mounted one now. */
export function stashComposerPrefill(text: string): void {
  if (typeof window === "undefined") return;
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    window.sessionStorage.setItem(COMPOSER_PREFILL_KEY, trimmed);
  } catch {
    // Storage can be disabled. The event below still reaches a mounted composer.
  }
  try {
    window.dispatchEvent(new CustomEvent(COMPOSER_PREFILL_EVENT, { detail: trimmed }));
  } catch {
    // Nothing to do; the mount-time read will still find the stored value.
  }
}

/** Read and clear the stashed text. Null when there is nothing waiting. */
export function takeComposerPrefill(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(COMPOSER_PREFILL_KEY);
    if (value !== null) window.sessionStorage.removeItem(COMPOSER_PREFILL_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}
