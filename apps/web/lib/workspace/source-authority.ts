// How Nemesis behaves when the learner's assessment material and outside evidence coexist.
//
// The two sources do different jobs. An uploaded lecture can be outdated and still be the answer
// an examiner expects; a current source can be the best account of reality and still be the wrong
// thing to silently substitute into course revision. The model should preserve that disagreement,
// then let the learner's requested goal decide which account leads.

export const SOURCE_DISAGREEMENT_RULE =
  "The attached material and the live web evidence have different source roles. Treat the attached " +
  "material as the learner's course or assessment context, and the web results as provisional external " +
  "evidence. If they disagree, never silently overwrite either one and never pretend the disagreement " +
  "does not exist. When the learner's goal is their course or exam, teach what the course expects while " +
  "clearly labeling both 'Course expects:' and 'External/current evidence:'. When they ask what is current " +
  "or evidence based, lead with the external evidence while still naming what the course says. If the goal " +
  "is unclear and the difference changes the answer, present both briefly. Do not force these labels when " +
  "the sources do not actually conflict.";

/** Only spend prompt space on the rule when both source roles are present. */
export function sourceDisagreementInstruction(input: {
  hasAttachedMaterial: boolean;
  hasExternalEvidence: boolean;
}): string {
  return input.hasAttachedMaterial && input.hasExternalEvidence ? SOURCE_DISAGREEMENT_RULE : "";
}
