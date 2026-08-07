// A canvas mid-retest, for a learner who pressed "Again" on the very concept being re-asked.
//
// 🔴 This state was a dead end before `clearEvidenceForRetest`. Recall evidence outlived the
// retest, so k4 stayed weak however many times it was answered correctly: the diagnosis kept
// naming it, `correctedConceptIds` stayed empty, and "Finish" never appeared — relearn →
// retest → complete, the arc the pilot exists to test, could not be reached.
//
// The fixture runs the SAME function the session runs when it generates a retest, so what the
// browser checks is the real behaviour rather than a hand-written "after" state.

import { clearEvidenceForRetest } from "./canvas-diagnosis";
import { diagnoseSeed } from "./canvas-preview-fixture";
import type { LearningCanvas } from "./canvas-model";

export function retestAfterFailedRecall(): LearningCanvas {
  const diagnosed = diagnoseSeed();
  const weak = ["k4"];
  const before: LearningCanvas = {
    ...diagnosed,
    weakConceptIds: weak,
    // The failed recall grade that used to be permanent.
    recallResults: [{ cardId: "r3", conceptId: "k4", grade: "again" }],
  };
  return {
    ...clearEvidenceForRetest(before, weak),
    state: "retest",
    // A retest asks only about what went wrong.
    questions: diagnosed.questions.filter((question) => weak.includes(question.conceptId ?? "")),
  };
}
