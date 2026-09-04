// Key terms in an answer: the model marks them, the renderer turns them into pills.
//
// Owner 2026-09-03, about the board: "i like how it automatically gives definitions for vocab that
// can be looked at, can you extrapolate that to the regular chat". One instruction and one link
// form, shared by the chat and the board, so a term reads the same wherever it appears.
//
// 🔴 THE MODEL NAMES THE TERMS, AT WRITING TIME. There is no keyword list and there must never be
// one: a list built from one field marks "myocardial" and walks past "promissory estoppel" and
// "shear modulus" (lib/learn/canvas-vocabulary.ts says the same about the document lane). The
// model that just wrote the paragraph is the only thing that knows what it introduced.

/** The link form the model writes. `chat-markdown.tsx` renders any link to this href as a pill. */
export const CONCEPT_HREF = "#concept";

export const CONCEPT_INSTRUCTION =
  "Mark two to five key terms in the answer, at their first appearance only, as markdown links of exactly this form: " +
  '[term](#concept "one plain sentence explaining the term"). Only terms a learner might want defined; never mark ordinary words, ' +
  "and never mark a term more than once.";

/** The follow-up "Dive deeper" asks, in the learner's voice so the thread reads naturally. */
export function diveDeeperMessage(term: string): string {
  return `Dive deeper into "${term}": explain it more thoroughly and surface what matters most about it.`;
}
