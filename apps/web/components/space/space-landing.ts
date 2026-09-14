import { DEFAULT_LANDING_PATH } from "@/lib/auth-redirect";

/** Session storage key: this tab has already opened the workspace once. */
export const SPACE_LANDED_KEY = "nemesis.space.landed";

/**
 * Where a tab on the Space workspace goes when it first opens the workspace, or null to stay put.
 *
 * Owner, 2026-09-14: entering Nemesis should feel like opening your notes, the way a note-taking app opens
 * (docs/space/PLAN.md, "Notes, Flashcards and Nemesis AI"). So the first page a tab opens is Notes: /home, which opens
 * the note you were on last, or your first one. This replaces the new chat he chose on 2026-09-11.
 * Sign-in, the site root and a password reset all send people to DEFAULT_LANDING_PATH, the canvas, which stays right
 * for everyone else. Only the first page a tab opens counts, and a canvas address that carries a query (a shared or
 * saved canvas) is kept.
 */
export function spaceLanding(input: { firstInTab: boolean; pathname: string; search: string }): string | null {
  if (!input.firstInTab || input.search) return null;
  return input.pathname === DEFAULT_LANDING_PATH ? "/home" : null;
}
