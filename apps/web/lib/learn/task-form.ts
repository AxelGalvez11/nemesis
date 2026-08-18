// WHICH KIND of task a performance was, alongside how much help it carried.
//
// 🔴 THIS IS NOT THE SCAFFOLD RUNG, AND THE TWO ANSWER DIFFERENT QUESTIONS. `ScaffoldRung` is an
// ORDERED axis — how much of THIS TASK'S ANSWER was on screen when the learner answered. This is an
// UNORDERED one — what KIND of task was staged. A completion is both: the learner produced the
// missing piece, so it is weaker than unaided production and moves down the rung ladder, AND it is a
// different shape of task from the material's own question, which the rung cannot say.
//
// 🔴 TWO VALUES TODAY, AND THE SET IS EXPECTED TO GROW. A transfer form — the same grounded relation
// put to a case the material never stated — was drafted alongside this one and removed before merge:
// every way it could derive a reference answer from a `CausalRelation` required a monotonicity,
// necessity or exclusivity claim the extractor does not record. See docs/canvas-cognitive-runtime.md.
// The column is deliberately unconstrained so adding a form later is a code change and not a
// migration.
//
// 🔴 AND IT IS A PROPERTY OF THE TASK, KNOWN BEFORE THE LEARNER ANSWERS. Same side of
// `learner-store.ts`'s line as the rung: what was measured, never what it means.
//
// 🔴 NO CHECK CONSTRAINT BACKS THIS COLUMN, deliberately, for the reason the `error_type` migration
// gives: `recordEvidence` treats a failed insert as a warning, so a value the database did not know
// would discard the WHOLE demonstration rather than one field. Validated on read instead.

/** What kind of task a response was produced against. */
export type TaskForm =
  /** The objective's own question, asked as the material states it. */
  | "direct"
  /** Part of a valid solution was on screen; the learner supplied the missing piece. */
  | "completion";

export const TASK_FORMS: readonly TaskForm[] = ["direct", "completion"];

/**
 * What a task is when nothing says otherwise.
 *
 * 🔴 A REAL VALUE RATHER THAN `null`, AND ONLY FOR TASKS THIS RUNTIME BUILDS. Every prompt minted
 * from now on knows its own form, so "the ordinary question" is a thing said rather than a thing
 * inferred from silence. Rows written before the column existed still read back as `null` — see
 * `readTaskForm` — because nothing observed their form and guessing one would be a claim about a
 * performance nobody recorded.
 */
export const DIRECT_TASK: TaskForm = "direct";

/** A stored value, back as a form — or null when the row does not say. */
export function readTaskForm(value: unknown): TaskForm | null {
  return typeof value === "string" && (TASK_FORMS as readonly string[]).includes(value)
    ? (value as TaskForm)
    : null;
}

/**
 * Does this form put part of the answer in front of the learner?
 *
 * 🔴 THE ONE PLACE THAT QUESTION IS ANSWERED, so a caller cannot decide for itself what counts as
 * assistance. A form added later that shows the learner CONTEXT rather than part of the answer must
 * come back false here, and must say so in this function rather than at its own call site.
 */
export function formSuppliesPartOfTheAnswer(form: TaskForm): boolean {
  return form === "completion";
}
