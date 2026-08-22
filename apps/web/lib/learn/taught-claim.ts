// What a screen that TEACHES actually prints, once the duplicates are taken out.
//
// 🔴🔴 REPORTED 2026-08-19, AND IT WAS THE SAME SENTENCE THREE TIMES. The teach screen printed a
// fixed grey preamble, then `cue → answer`, then `knowledge.statement`. For an `association` those
// are three different things and it reads well. For a `conceptual_system` there is no pair — the
// claim IS one sentence — so `cue` and `answer` both resolve to it and the learner was shown:
//
//     Worth having in front of you first.
//     Chemically, a given functional group behaves … → Chemically, a given functional group behaves …
//     Chemically, a given functional group behaves …
//     From 3.1Functional Groups, 3.1Functional Groups
//
// 🔴 THE RENDERER WAS ASKING THE WRONG QUESTION. It asked "which action is this?" — teach, simplify,
// contrast — and every one of those branches assumed a two-sided claim, because `association` was
// the only knowledge type that existed when they were written. The question that matters is whether
// this particular claim HAS two sides, which is a fact about the knowledge and not about the move.
//
// 🔴 PURE, AND SEPARATE FROM THE COMPONENT, because "is this a duplicate" is a text question with
// awkward edges — smart quotes, trailing full stops, one side being a prefix of the other — and
// those are cheap to state as tests and expensive to eyeball in a browser.

/**
 * Curly and straight quotes, trailing punctuation, JOINERS and case all removed, so two renderings
 * of the same claim compare equal. Not exported: this is a comparison key, never anything displayed.
 *
 * 🔴🔴 THE JOINERS ARE WHY A CLAIM PRINTED ITSELF TWICE ON PRODUCTION, 2026-08-21. Reported with a
 * screenshot of a JavaScript canvas showing, one under the other:
 *
 *     JavaScript → enables dynamic elements to your site      (the heading, built from cue + answer)
 *     JavaScript — enables — dynamic elements to your site    (the statement, as the model wrote it)
 *
 * Those are the same claim. The heading joins the two sides with `→` because this file builds it
 * that way; the model had written the identical pair out with em dashes and called it a statement.
 * The duplicate check compared the strings literally, saw two different ones, and kept both — so
 * the learner read the same sentence twice in two typographies and reasonably concluded the app was
 * showing them two different things.
 *
 * 🔴 NORMALISING THE JOINER CANNOT SUPPRESS A BODY THAT ADDS ANYTHING, which is the check worth
 * making before widening a comparison key. `body` survives whenever the statement says MORE than the
 * heading — "Mitochondria produce ATP through oxidative phosphorylation" still differs from
 * "Mitochondria → produce ATP" after both are stripped, because the extra clause is still there.
 * What this removes is only the case where the two differ by punctuation alone.
 *
 * 🔴 AND THE HYPHEN IS DELIBERATELY NOT IN THE LIST. `well-known` and `T-cell` are one word with a
 * hyphen in them, and collapsing those would make two genuinely different statements compare equal
 * — a body silently dropped is worse than one shown twice.
 */
function sameish(value: string): string {
  return value
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    // The joiners a claim can be written with: arrow, em dash, en dash, colon.
    .replace(/[→—–:]/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface TaughtClaim {
  /** The line the learner reads first. Never `X → X`. */
  heading: string;
  /** The fuller statement, or null when it would repeat the heading. */
  body: string | null;
}

/**
 * 🔴 THE ARROW IS EARNED, NOT DECORATIVE. It means "this side goes with that side", which is a claim
 * about the knowledge. Printed between two copies of one sentence it asserts a relationship that
 * does not exist, and the learner is left trying to work out what the difference is meant to be.
 */
export function taughtClaim(input: { cue: string; answer: string; statement: string }): TaughtClaim {
  const cue = input.cue.trim();
  const answer = input.answer.trim();
  const statement = input.statement.trim();

  // One-sided claim: the two halves are the same thing, so there is nothing to join.
  const twoSided = cue.length > 0 && answer.length > 0 && sameish(cue) !== sameish(answer);
  const heading = twoSided ? `${cue} → ${answer}` : statement || cue || answer;

  // 🔴 THE BODY IS DROPPED WHENEVER IT ADDS NOTHING, INCLUDING WHEN IT MERELY CONTAINS THE HEADING.
  // A one-sided claim's statement IS the heading; a two-sided claim's statement is often the same
  // pair written out as a sentence, which is worth keeping — it is the claim in prose. What is never
  // worth keeping is the identical string twice.
  const headingKey = sameish(heading);
  const bodyKey = sameish(statement);
  const body = statement && bodyKey !== headingKey && !headingKey.includes(bodyKey) ? statement : null;

  return { body, heading };
}

/**
 * Where a claim came from, said once.
 *
 * 🔴 "From 3.1Functional Groups, 3.1Functional Groups" IS WHAT THIS REPLACES. The trail printed
 * `sourceTitle, label` unconditionally, and for a web page the extractor often names the section
 * exactly what it named the document — so the citation said the same words twice and read like a
 * bug, which cost the provenance line the credibility it exists to have.
 *
 * 🔴 THE LINE ITSELF STAYS. It was in the "wordy grey text" the owner asked about, and the wordiness
 * is being fixed rather than the citation removed: a claim that loses its origin is the thing the
 * evidence rules exist to prevent, and "where did this come from" is worth four words.
 */
export function citationLine(
  citations: readonly { sourceTitle: string; label?: string | null }[],
): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const citation of citations) {
    const title = citation.sourceTitle.trim();
    if (!title) continue;
    const label = (citation.label ?? "").trim();
    // A label that repeats the title, or is already inside it, adds nothing.
    const useLabel = label.length > 0 && !sameish(title).includes(sameish(label));
    const text = useLabel ? `${title}, ${label}` : title;
    const key = sameish(text);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
