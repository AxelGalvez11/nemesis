// Auto-depth — PURE, deterministic. The "Auto" composer mode's depth picker: decide whether a question
// deserves the quick single answer ("fast") or the longer, wider one ("thorough"), so the user doesn't
// have to choose. Heuristic over the query SHAPE (length + multi-part / comparison / depth markers).
// No LLM, no network — a transparent, safe default; an LLM router is the owner-gated refinement on top.

export type AskDepth = "fast" | "thorough";

// Markers that a question wants a fuller, more technical answer (comparisons, mechanisms, trade-offs).
const COMPLEX_MARKERS = [
  " vs ", "versus", "compare", "comparison", "compared to", "difference between",
  "interaction", "contraindicat", "mechanism", "meta-analysis", "systematic review",
  "how does", "why does", "trade-off", "tradeoff", "pros and cons", "risks and benefits",
  "long-term", "long term", "guideline", "first-line", "evidence for",
];

/**
 * Pick the answer depth for an Auto-mode question. PURE + deterministic.
 * INVERTED BIAS (owner report 2026-07-07, "answers aren't thorough"): the composer no longer has a
 * depth dial, so Auto must err RICH — there is no way to force Thorough anymore. Thorough is the
 * default for any substantive question; fast only for bare lookups (<=4 words, single question,
 * no depth markers — 'what is metformin') where a quick gist genuinely serves better.
 */
export function autoDepth(query: string): AskDepth {
  const q = query.trim().toLowerCase();
  if (!q) return "fast";
  const words = q.split(/\s+/).length;
  const questionMarks = (q.match(/\?/g) ?? []).length;
  const hasComplexMarker = COMPLEX_MARKERS.some((m) => q.includes(m));
  if (hasComplexMarker || questionMarks >= 2 || words >= 5) return "thorough";
  return "fast";
}
