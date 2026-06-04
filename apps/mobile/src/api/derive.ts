import type { SourceDetail } from "@pharmabro/shared";

// Pure view-state selectors (no I/O, no react-native imports → Deno-testable). Kept
// out of the screen so the doc-06 state decisions are unit-tested, not buried in JSX.

export type SourceViewState = "not-found" | "outdated" | "ok";

/**
 * Which doc-06 state the Source Viewer shows for a get_source result:
 *   null         -> "not-found"  (PostgREST 200 null / bad id)
 *   !is_current  -> "outdated"   (superseded_at set upstream)
 *   otherwise    -> "ok"
 * The "outdated" branch has no live trigger today (0 superseded sources in the
 * corpus), so it is proven here prop-driven rather than via Playwright.
 */
export function sourceViewState(src: SourceDetail | null): SourceViewState {
  if (!src) return "not-found";
  if (!src.is_current) return "outdated";
  return "ok";
}
