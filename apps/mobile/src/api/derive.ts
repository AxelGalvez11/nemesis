import type { AskResponse, SafetyFlag, SourceDetail } from "@pharmabro/shared";

// Pure view-state selectors (no I/O, no react-native imports → Deno-testable). Kept
// out of the screen so the doc-06 state decisions are unit-tested, not buried in JSX.

// The hard-routing safety flags: any one forces the urgent-care template.
const HARD_FLAGS: SafetyFlag[] = ["emergency_possible", "overdose_possible", "self_harm"];

export type AnswerKind = "emergency" | "refused" | "normal";

/**
 * Which render shape the AnswerView uses for an AskResponse:
 *   emergency -> the deterministic urgent-care banner (early return)
 *   refused   -> the structured layout WITH the "no source supports this" note
 *   normal    -> the structured layout
 * Extracted + unit-tested because the refused/zero-citation render has no
 * deterministic live trigger against the current corpus (see phase6b-3 notes).
 */
export function answerKind(a: AskResponse): AnswerKind {
  if (a.template === "emergency_routing" || a.safety_flags.some((f) => HARD_FLAGS.includes(f))) {
    return "emergency";
  }
  if (a.refused_unsupported) return "refused";
  return "normal";
}

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
