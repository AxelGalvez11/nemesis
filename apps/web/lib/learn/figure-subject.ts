// What a diagram is allowed to be called when the model asks for one.
//
// 🔴🔴 THIS RULE WAS LEARNED IN PRODUCTION, TWICE, AND IT IS NOT A STYLE PREFERENCE. Measured
// 2026-08-24, the same diagram asked for four ways:
//
//   "meiosis"                                   → a meiosis diagram ✓
//   "meiosis I and meiosis II stages"           → a meiosis diagram ✓
//   "the stages of meiosis"                     → *Naegleria fowleri* life stages
//   "diagram of meiosis showing both divisions" → the layers of human skin
//   "meiosis showing both divisions"            → cleft lip
//
// Every one of those returned `ok`. Generic caption words — stages, diagram, showing, both — are
// printed under thousands of unrelated pictures, so they outvote the one word that identifies the
// subject. The fix is not a better search; it is refusing to search for a description.
//
// 🔴 IT REFUSES RATHER THAN TRIMS. Shortening "diagram of meiosis showing both divisions" to the
// right name means guessing which word identifies the thing, and guessing wrong fetches a
// confidently irrelevant picture. When that picture is then used to GRADE a learner — an occlusion
// question marks them against what the diagram shows — a wrong picture is worse than no picture.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md). It counts words. It does not know what any of
// them mean, which is why "nephron", "Bundesrat", "camshaft" and "sonata form" all pass.
//
// PURE.

/**
 * A ceiling on words, not characters.
 *
 * 🔴 FIVE, MATCHING `figure-fallback.ts`. "meiosis" and "the ornithine cycle" are subjects; a topic
 * written as a phrase is a description. Five leaves room for a genuinely multi-word name — "left
 * ventricular outflow tract", "four-stroke internal combustion engine" — without admitting a
 * sentence.
 */
export const MAX_FIGURE_SUBJECT_WORDS = 5;

/** The longest a name may be, matching `study_decks`-style text bounds and `canvas-visual.ts`. */
const MAX_FIGURE_SUBJECT_CHARS = 120;

/** The diagram a model asked for, or null when what it wrote is a description rather than a name. */
export function readFigureSubject(value: unknown): string | null {
  const subject = typeof value === "string" ? value.trim() : "";
  if (!subject || subject.length > MAX_FIGURE_SUBJECT_CHARS) return null;
  return subject.split(/\s+/).length > MAX_FIGURE_SUBJECT_WORDS ? null : subject;
}
