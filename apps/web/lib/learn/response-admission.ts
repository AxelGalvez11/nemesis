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

/** Filler that carries no answer. Anything else left over means they attempted something.
 *
 *  🔴 UNCHANGED, DELIBERATELY, WHEN THE ECHO RULE WAS ADDED BESIDE THE ADMISSION ONE. Widening a
 *  shared filler list to suit a new caller silently rewrites the old one — and the old one is `D4`,
 *  which already passes in production. A rule that passes is not a rule to adjust in passing. */
const FILLER = new Set(["i", "im", "i'm", "sorry", "really", "at", "all", "of", "it", "this", "one", "the", "a", "hmm", "um", "uh", "still", "yet", "honestly", "just"]);

/** The copula an echo can be wrapped in without becoming a claim: "it's losartan", "losartan is".
 *
 *  🔴 KEPT SEPARATE AND KEPT SHORT. Every word added here converts some real attempt into "no
 *  demonstration", and that direction of error DENIES A LEARNER CREDIT FOR WORK THEY DID — strictly
 *  worse than missing a subtle echo, which merely sends it to the judge that reads it today. */
const ECHO_FILLER = new Set(["is", "its", "it's", "was", "would", "be", "the", "answer"]);

/** One spelling of a response, so two of them can be compared for what they SAY rather than how
 *  they were typed. Punctuation goes, so "I don't know!" and "idk..." are the same statement. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,!?;:\-—…"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Is everything left over after removing the matched phrase just filler? */
function nothingSubstantiveLeft(remainder: string, filler: ReadonlySet<string> = FILLER): boolean {
  return remainder
    .split(" ")
    .filter(Boolean)
    .every((word) => filler.has(word));
}

/**
 * Did this response say only that they could not produce the answer?
 *
 * 🔴 "ONLY" IS THE LOAD-BEARING WORD. "Not sure, maybe Diovan?" IS an attempt — a hedged one, and
 * hedging is exactly the kind of thing the evaluator should read rather than a string matcher. So
 * the admission has to account for the WHOLE response: strip the phrase and the politeness around
 * it, and if anything substantive is left, this was a real try and the judge should see it.
 */
export function isAdmissionOfNotKnowing(text: string): boolean {
  const normalised = normalise(text);
  if (!normalised) return false;

  let remainder = normalised;
  let matched = false;
  for (const phrase of ADMISSIONS) {
    if (!remainder.includes(phrase)) continue;
    remainder = remainder.replace(phrase, " ");
    matched = true;
  }
  if (!matched) return false;

  return nothingSubstantiveLeft(remainder);
}

/**
 * Did this response give back the very thing it was given?
 *
 * Asked *"what is the brand for **losartan**?"*, answered `losartan`. The learner produced the
 * OTHER SIDE of the pair — the side they were handed — and asserted **no belief at all about the
 * direction they were asked.** They restated the prompt.
 *
 * 🔴 THIS IS `D4` WITH A DIFFERENT SURFACE. "I don't know" is absence of demonstration rather than
 * incorrect knowledge, and so is this: nothing was claimed, so nothing was contradicted. Recorded
 * as `partial` it becomes a durable claim that someone partly knows something they showed nothing
 * about — absence of evidence stored as evidence, which is the one thing this learner model exists
 * to refuse. D4 already passes in production, so this is a gap in the RULE, not in its
 * implementation.
 *
 * 🔴 AND IT MATTERS THAT THE JUDGE CANNOT CATCH IT. An echo has maximum lexical overlap with the
 * question, so every string, substring and embedding comparison scores it highly — the answer token
 * is literally inside the prompt. Integration measured the real judge reading it as `partial`,
 * confidence 0.30. It is not a judge failure: the judge was asked "how good is this answer" and
 * the honest reading of `losartan` for a question about losartan is "some of the right material".
 * The question that was never asked is whether an ATTEMPT was made at all, and that is structural
 * — which is why it belongs here, before the judge, beside the other non-attempt.
 *
 * 🔴 STRUCTURAL, NOT SUBJECT MATTER, LIKE EVERYTHING ELSE IN THIS FILE. It compares the response to
 * the cue this objective was built with. Nothing here knows what a cue means, so it reads
 * identically for a law student naming a case, a machinist naming a part number and a language
 * learner naming a word.
 *
 * 🔴 THE ANSWER CHECK COMES FIRST AND IS NOT OPTIONAL. Where a cue and its answer coincide — a
 * degenerate pair, a term defined as itself, a source that listed one column twice — saying the cue
 * IS saying the answer, and treating that as no demonstration would deny a learner credit for a
 * correct response. Whenever the two readings collide, the one that credits the learner wins.
 */
export function isEchoOfTheCue(input: { response: string; cue: string; expectedAnswer: string }): boolean {
  const said = normalise(input.response);
  const cue = normalise(input.cue);
  const expected = normalise(input.expectedAnswer);
  if (!said || !cue) return false;

  // Saying the answer is a demonstration however much else it echoes. Checked before anything.
  if (expected && said.includes(expected)) return false;

  if (!said.includes(cue)) return false;
  // 🔴 EVERY OCCURRENCE, NOT THE FIRST. "losartan is losartan" restates the cue twice and claims
  // nothing; removing one copy would leave the other looking like a substantive answer.
  //
  // 🔴 AND THE RULE STAYS NARROW ON PURPOSE. "the brand for losartan is losartan" is NOT caught —
  // "brand" and "for" are words from the question, and recognising them would mean matching against
  // the prompt's prose, where a legitimate answer that reuses one of its words starts being read as
  // an echo. That phrasing goes to the judge, exactly as it does today. Missing it costs nothing
  // this change was made to buy; catching a real attempt would cost a learner their credit.
  return nothingSubstantiveLeft(said.replaceAll(cue, " "), new Set([...FILLER, ...ECHO_FILLER]));
}
