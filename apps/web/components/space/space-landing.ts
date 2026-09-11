import { DEFAULT_LANDING_PATH } from "@/lib/auth-redirect";

/** Session storage key: this tab has already opened the workspace once. */
export const SPACE_LANDED_KEY = "nemesis.space.landed";

/**
 * Where a tab on the Space workspace goes when it first opens the workspace, or null to stay put.
 *
 * Owner, 2026-09-11: a learner who signs in lands in the new workspace. Sign-in, the site root and a password reset
 * all send people to DEFAULT_LANDING_PATH, the canvas, which stays right for everyone else. For an account on the
 * workspace, the first page a tab opens there becomes Home. Only the first page counts, so Canvas stays one click away
 * in the sidebar, and a canvas address that carries a query (a shared or saved canvas) is kept.
 */
export function spaceLanding(input: { firstInTab: boolean; pathname: string; search: string }): string | null {
  if (!input.firstInTab || input.search) return null;
  return input.pathname === DEFAULT_LANDING_PATH ? "/home" : null;
}
