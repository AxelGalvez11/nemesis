// Is this actually a picture of the thing? — the check the ladder never had.
//
// 🔴🔴 THE LICENCE GATE IS NOT A RELEVANCE GATE, AND SHIPPING WITHOUT THIS WOULD HAVE PUT
// CONFIDENT NONSENSE ON SCREEN. Measured against the live provider on 2026-09-04, before any of
// this existed:
//
//   "DNA double helix"              -> DNA double helix horizontal            ✅
//   "mitosis stages"                -> A diagram of mitosis stages            ✅
//   "four stroke engine cycle"      -> Animated four stroke engine scheme     ✅
//   "the doctrine of precedent"     -> Kant, *Doctrine du droit*              ❌ matched "doctrine"
//   "consideration in contract law" -> an 1859 law textbook's cover scan      ❌ matched "contract"
//   "shear force diagram"           -> a tension-shear test result curve      ❌ matched "shear"
//
// Every one of those six cleared `chooseAsset` — the licences really are fine. Wikimedia Commons
// almost always returns SOMETHING, so a router that asks only "may we show this?" shows a picture
// for every request and is wrong roughly half the time on abstract subjects. A learner reading a
// law answer beside a photograph of Kant does not conclude our search is weak; they conclude the
// picture is the point.
//
// 🔴 THIS IS THE FIELD-AGNOSTIC TEST, FAILING. CLAUDE.md: *"would this work for a law student and
// a mechanical engineering student?"* Before this module: engineering yes, law no.
//
// 🔴 A MODEL JUDGES IT, NOT A WORD LIST — and not word overlap either, which fails in BOTH
// directions on the measurements above. "the doctrine of precedent" vs "Doctrine du droit" shares
// a content word and is wrong; "Krebs cycle" vs "Tricarboxylic acid cycle" shares only "cycle" and
// is exactly right, because they are two names for one thing. No threshold separates those, and a
// list of subject synonyms is the keyword scoping [[keyword-scoping-hides-in-prompts]] forbids.
// Reading a caption and saying whether it depicts a concept is a language judgement, so it is put
// to a language model, cheaply, once per answer.
//
// PURE. Builds a prompt, reads a reply. The call itself belongs to the caller, which is what keeps
// this testable without a network and keeps the metering on the lane that already meters.

/** One picture offered for judging. Only what a reader would need to decide. */
export interface RelevanceCandidate {
  /** The provider's own description of the file. */
  readonly caption?: string;
  /** The file's name, used when a candidate arrived with no caption at all. */
  readonly title?: string;
}

/**
 * How many candidates are ever judged at once.
 *
 * 🔴 SMALL ON PURPOSE. This is a choice between a handful of pictures, not a gallery to rank. Every
 * extra candidate is prompt tokens on a call that happens on every answer that wants a picture, and
 * the provider already returns its own best matches first.
 */
export const MAX_JUDGED = 5;

/** Cap on a caption, so one file with a 4,000-word description cannot dominate the prompt. */
const MAX_CAPTION = 220;

/**
 * What to ask the model.
 *
 * 🔴 IT MUST BE ABLE TO SAY NONE, AND THE PROMPT SAYS SO TWICE. A judge offered five options and no
 * way out picks the least bad one, which on "the doctrine of precedent" means picking Kant — the
 * exact failure this module exists to stop. "0" is listed as a valid answer and named again as the
 * right answer when nothing depicts the concept.
 *
 * 🔴 IT ASKS ABOUT THE PICTURE, NOT ABOUT THE SUBJECT. "Is this a picture of X" is answerable from
 * a caption. "Is this a good teaching image for X" is not, and invites the model to reason about
 * pedagogy from a filename.
 */
export function relevancePrompt(concept: string, candidates: readonly RelevanceCandidate[]): string {
  const lines = candidates.slice(0, MAX_JUDGED).map((candidate, index) => {
    const text = (candidate.caption ?? candidate.title ?? "").replace(/\s+/g, " ").trim();
    return `${index + 1}. ${text.slice(0, MAX_CAPTION) || "(no description)"}`;
  });
  return [
    `A learner is being shown a picture of: ${concept}`,
    "",
    "These files were found. Which one is a picture OF that thing?",
    "",
    ...lines,
    "",
    "Answer with the number alone. Answer 0 if none of them depicts it — a file that merely shares",
    "a word with it, a book cover, a portrait, or a picture of something related but different is",
    "not a picture of it, and 0 is the right answer for all of those.",
  ].join("\n");
}

/**
 * What the judge decided.
 *
 * 🔴🔴 THREE STATES, AND COLLAPSING ANY TWO OF THEM IS A REAL BUG. "none of these depicts it" and
 * "the judge could not be run" look identical to a caller holding `number | null`, and they must
 * lead to opposite outcomes: the first REMOVES a picture, the second must KEEP the one the licence
 * gate already chose. A gate whose outage silently blanks every picture is worse than no gate — it
 * turns one bad picture in law into no pictures anywhere.
 */
export type FigureVerdict =
  /** This one is a picture of it. `index` addresses the captions that were judged. */
  | { verdict: "shows"; index: number }
  /** Read the captions, none of them depicts the concept. The picture is dropped. */
  | { verdict: "none" }
  /** No answer to read — offline, unparseable, out of range, refused. Keep what was already chosen. */
  | { verdict: "unknown" };

/**
 * The model's reply, read into a verdict.
 *
 * 🔴 ONLY A CLEAN "0" MEANS none. An unparseable answer, an out-of-range number, an empty string
 * and a model that wrote a sentence instead all come back `unknown`, which keeps the picture. The
 * judge is a filter on a lane that already works, and a filter that cannot be read must not be
 * allowed to close it.
 *
 * `judged` is how many captions were actually shown to the model.
 */
export function readRelevanceChoice(raw: string | null, judged: number): FigureVerdict {
  if (!raw || judged <= 0) return { verdict: "unknown" };
  // The FIRST integer in the reply. A model that answers "2" and one that answers "Picture 2 — it
  // shows the helix" both mean 2, and one that opens with prose before a number is still read.
  const match = /-?\d+/.exec(raw);
  if (!match) return { verdict: "unknown" };
  const picked = Number.parseInt(match[0], 10);
  if (!Number.isFinite(picked)) return { verdict: "unknown" };
  if (picked === 0) return { verdict: "none" };
  const capped = Math.min(judged, MAX_JUDGED);
  if (picked < 0 || picked > capped) return { verdict: "unknown" };
  return { index: picked - 1, verdict: "shows" };
}
