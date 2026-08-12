// "I don't know" is a statement about the learner, not an attempt at the answer.
//
// 🔴 THIS EXISTS BECAUSE THE BUTTON WENT AWAY, AND THE MEANING MUST NOT GO WITH IT. There used to be
// an "I don't know this one" control, and it wrote evidence saying a demonstration was NOT obtained
// — no verdict, because nothing was shown. The control is gone from the recall surface on purpose:
// it competed with the question, and someone who does not know can simply say so. But if a typed
// admission were sent to the evaluator it would come back `incorrect`, and "we still do not know"
// would be recorded as "they got it wrong". That is absence of evidence stored as negative
// evidence — the one thing this whole learner model is built to refuse.
//
// 🔴 STRUCTURAL, NOT SUBJECT MATTER. Every phrase here is the learner reporting their own state, so
// it reads identically for a law student, a machinist and someone learning a language. Nothing in
// it knows anything about any field. The honest limit is LANGUAGE: this recognises English
// admissions, and an admission in another language will be judged as an attempt. That is a real gap
// and it is written down rather than hidden — the fix is a judge that can report "no attempt", not
// a longer list.

/** Ways of saying "nothing came to mind". Longest first, so "don't know" cannot match inside
 *  "i don't know" and leave a stray "i" behind that looks like content. */
const ADMISSIONS: readonly string[] = [
  "i have no idea",
  "i do not know this",
  "i don't know this",
  "i do not know",
  "i don't know",
  "no clue",
  "no idea",
  "not sure",
  "cant remember",
  "can't remember",
  "cannot remember",
  "do not remember",
  "don't remember",
  "dont know",
  "don't know",
  "unsure",
  "dunno",
  "idk",
  "skip",
  "pass",
  "blank",
];

/**
 * Did this response say only that they could not produce the answer?
 *
 * 🔴 "ONLY" IS THE LOAD-BEARING WORD. "Not sure, maybe Diovan?" IS an attempt — a hedged one, and
 * hedging is exactly the kind of thing the evaluator should read rather than a string matcher. So
 * the admission has to account for the WHOLE response: strip the phrase and the politeness around
 * it, and if anything substantive is left, this was a real try and the judge should see it.
 */
export function isAdmissionOfNotKnowing(text: string): boolean {
  const normalised = text
    .toLowerCase()
    .replace(/[’']/g, "'")
    // Punctuation goes, so "I don't know!" and "idk..." are the same statement.
    .replace(/[.,!?;:\-—…"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalised) return false;

  let remainder = normalised;
  let matched = false;
  for (const phrase of ADMISSIONS) {
    if (!remainder.includes(phrase)) continue;
    remainder = remainder.replace(phrase, " ");
    matched = true;
  }
  if (!matched) return false;

  // Filler that carries no answer. Anything else left over means they attempted something.
  const FILLER = new Set(["i", "im", "i'm", "sorry", "really", "at", "all", "of", "it", "this", "one", "the", "a", "hmm", "um", "uh", "still", "yet", "honestly", "just"]);
  return remainder
    .split(" ")
    .filter(Boolean)
    .every((word) => FILLER.has(word));
}
