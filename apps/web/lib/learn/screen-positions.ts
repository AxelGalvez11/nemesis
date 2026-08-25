// The model does not get to say where things are on screen.
//
// 🔴🔴🔴 THE OWNER CAUGHT THIS ON SCREEN, 2026-08-25: *"it also said 'the image above', and it was
// actually below."* The reply had written "The quiz above will test you on these parts" with the
// quiz card sitting underneath it.
//
// 🔴 THE CONTRACT WAS TOLD, AND THE CONTRACT WAS NOT ENOUGH. A paragraph was added to
// `turn-router.ts` forbidding it outright — *"NEVER SAY WHERE SOMETHING IS ON SCREEN"* — and the
// very next production run came back with *"Now, try the questions below."* This is the fourth
// time in this feature that a prompt rule has failed to hold, and the house answer is already
// written down: when the model declines a rule after several attempts, stop rewriting the prompt
// and let trusted code finish the request. `figure-fallback.ts` says the same thing.
//
// 🔴 THE MODEL CANNOT SEE THE PAGE, so every one of these is a guess. Some guesses land — the
// questions really were below that day — and the ones that miss are read by somebody looking
// straight at the thing, which makes the whole product look broken over one word. A phrase that
// is right by luck is not worth keeping either: the same reply renders on a phone, in a narrow
// column, and on a laptop, and the card is not always in the same place.
//
// 🔴 IT REMOVES A WORD, IT DOES NOT REWRITE A SENTENCE. "try the questions below" becomes "try the
// questions", which is what the model should have written. Anything cleverer would be this module
// deciding what the answer says, and an answer edited by a regex is a worse failure than a
// misplaced adverb.
//
// 🔴 THE NOUNS ARE INTERFACE NOUNS, NEVER SUBJECT-MATTER ONES (CLAUDE.md). "questions", "diagram",
// "card" mean the same thing to a law student and a mechanical engineer. A geology lesson saying
// "the layer below" keeps it, because `layer` is not a thing this product draws.
//
// PURE. No I/O, no React.

/**
 * Things the canvas puts on screen, which the model is therefore not allowed to locate.
 *
 * 🔴 SINGULAR AND PLURAL BOTH, because "the questions below" was the measured miss and "the
 * question below" is the same sentence one learner later.
 */
const SURFACE_NOUNS = [
  "answers?",
  "cards?",
  "charts?",
  "chips?",
  "diagrams?",
  "figures?",
  "flashcards?",
  "graphs?",
  "images?",
  "options?",
  "pictures?",
  "questions?",
  "quiz(?:zes)?",
  "slides?",
  "tables?",
  "tests?",
  "visuals?",
].join("|");

/**
 * `the questions below`, `this diagram above`, `the quiz to the right`.
 *
 * 🔴 THE NOUN MUST COME FIRST. Matching a bare "below" would eat "the temperature below freezing",
 * which is a fact about the world rather than a claim about the page.
 */
const PLACED = new RegExp(
  String.raw`\b(${SURFACE_NOUNS})\s+(?:just\s+)?(?:above|below|underneath|beneath|overhead|` +
    String.raw`(?:down|up|over)\s+here|(?:to\s+the\s+|on\s+the\s+)(?:right|left)|here)\b`,
  "gi",
);

/**
 * The same prose with any claim about screen position removed.
 *
 * 🔴 PUNCTUATION AND SPACING SURVIVE. "the questions below." must not become "the questions ." —
 * the noun is kept exactly as written and only the placement is dropped, so whatever followed it
 * closes up naturally.
 */
export function stripScreenPositions(text: string): string {
  return text.replace(PLACED, (_match, noun: string) => noun);
}
