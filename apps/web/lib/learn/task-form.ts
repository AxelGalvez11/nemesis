// WHICH KIND of task a performance was, alongside how much help it carried.
//
// 🔴 THIS IS NOT THE SCAFFOLD RUNG, AND THE TWO ANSWER DIFFERENT QUESTIONS. `ScaffoldRung` is an
// ORDERED axis — how much of THIS TASK'S ANSWER was on screen when the learner answered. This is an
// UNORDERED one — what cognitive operation the task staged. The distinction is load-bearing in both
// directions:
//
//     completion   part of a valid solution supplied, the learner produced the missing piece
//                  → weaker than unaided production, so it also moves DOWN the rung ladder
//     transfer     the same grounded principle, a case the material never stated
//                  → nothing about the answer supplied, so the rung stays `independent`
//
// A transfer probe is HARDER than the ordinary question and carries no assistance at all. Trying to
// express that as a rung would mean inventing a sixth rung above `independent`, which would claim
// that a transfer pass ENTAILS an ordinary pass — it does not, and `entails` would then quietly
// credit recall the learner never produced. Two fields, each saying one true thing.
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
  | "completion"
  /** The same grounded relation, applied to a case the material never stated. */
  | "transfer";

export const TASK_FORMS: readonly TaskForm[] = ["direct", "completion", "transfer"];

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
 * 🔴 THE ONE PLACE THAT QUESTION IS ANSWERED, so a caller cannot decide for itself that a transfer
 * probe was "assisted because we showed them the case". A transfer names a condition; it never
 * names the consequence being asked for.
 */
export function formSuppliesPartOfTheAnswer(form: TaskForm): boolean {
  return form === "completion";
}
