// What the learner attached to their NEXT submission, beyond the words and the files.
//
// 🔴🔴 THIS IS A DECLARATION OF INTENT AT THE COMPOSER BOUNDARY. IT IS NOT A MODE, AND THE
// DIFFERENCE IS THE WHOLE REASON §38 PERMITS IT.
//
// §38 of docs/canvas-product-contract.md bans learner-facing controls that steer the learning
// machine — "Retest me", "Fix my weak spots", easier, harder, quiz me. Those are dead and not
// wanted back, because those behaviours are *already owed to the learner automatically*: re-testing
// is the system's job and weak-spot targeting is what objective ordering does. A button for either
// is the learner managing the system.
//
// A capability is a different object. Owner ruling, 2026-08-23:
//
//     "`Course` is … a one-shot declaration of user intent at the composer boundary, analogous to
//      attaching a file. It tells Nemesis: 'Treat this next submission as a request to create a
//      persistent curriculum.' It does not tell the teaching engine what to do next."
//
// The line, stated so a future capability can be tested against it:
//
//     A CAPABILITY SAYS WHAT THIS SUBMISSION IS.  A MODE SAYS WHAT NEMESIS SHOULD DO NEXT.
//
// `+ attach` was always on §38's KEEP list for exactly this reason — it changes what the next
// message CARRIES, and it clears when the message is sent. Course is the same shape.
//
// 🔴 SO THE CLEARING IS NOT A UI NICETY, IT IS THE INVARIANT. A capability that survived its
// submission would BE a mode, whatever it was called, and §38 would be right to ban it. See
// `clearsOnSubmit`, and the guard test that pins it.
//
// PURE. No React, no I/O.

/**
 * The capabilities the composer can attach to one submission.
 *
 * 🔴 THE UNION WAS BUILT FOR THE SECOND MEMBER AND THIS IS IT. The note that used to sit here said
 * a bare `course: boolean` would be the same information until the second capability arrived as a
 * second boolean, at which point two could be set at once and nothing would say what that means.
 * `research` is that second member, and it arrives as a union member rather than a flag for
 * exactly the reason predicted: Course and Deep research are mutually exclusive declarations about
 * one submission, and a type that cannot hold both is the cheapest way to keep them so.
 */
export type ComposerCapability = "course" | "research";

export const COMPOSER_CAPABILITIES: readonly ComposerCapability[] = ["course", "research"];

/** How a capability presents itself in the `+` menu and as a chip. */
export interface CapabilityCopy {
  /** The menu row's first line, and the chip's label. */
  readonly label: string;
  /** The menu row's second line. Says what it does, not what it is. */
  readonly detail: string;
  /** A codicon name. `Codicon` is the only icon set on this surface. */
  readonly icon: string;
}

export const CAPABILITY_COPY: Record<ComposerCapability, CapabilityCopy> = {
  // 🔴 "Build a learning path", NOT "Build a curriculum". The learner is not writing a syllabus and
  // has no reason to know the word the schema uses. §38's own copy rule: a control names what the
  // learner gets, never what the system does with it.
  course: { detail: "Build a learning path", icon: "map", label: "Course" },
  // 🔴 "Get a detailed report" NAMES WHAT THE LEARNER GETS, which is §38's copy rule and also the
  // only honest description: they get a document, not a faster answer. "Search harder" or
  // "Thorough mode" would both describe the machine, and both would be chosen by people who wanted
  // an answer in the chat.
  research: { detail: "Get a detailed report", icon: "telescope", label: "Deep research" },
};

/**
 * Whether a capability survives its own submission.
 *
 * 🔴🔴 ALWAYS FALSE, AND IT IS A FUNCTION RATHER THAN A COMMENT SO A TEST CAN HOLD IT. The moment
 * any capability returns true it has become a persistent teaching mode, which is the thing §38
 * bans and the thing the owner's amendment explicitly carves out an exception AROUND rather than
 * FOR:
 *
 *     "These capabilities clear after submission and must not become persistent teaching modes."
 *
 * The Canvas owns the curriculum once one exists. The composer never stays in Course.
 */
export function clearsOnSubmit(_capability: ComposerCapability): boolean {
  return true;
}

/**
 * What a capability adds to the packet the model reads.
 *
 * 🔴🔴 IT IS A FACT ABOUT THE LEARNER'S REQUEST, NOT AN INSTRUCTION TO THE ENGINE. "The learner
 * explicitly asked for a learning path" is something the model should know when it reads their
 * sentence, in the same way that "a lesson is already in progress" is. It does not name an
 * operation, a difficulty, a strategy, a task form or a surface, and it must never grow one — a
 * capability whose effect can be described as "run the policy differently" is the mode selector
 * §38 bans, wearing a chip's clothes.
 *
 * 🔴 IT DOES NOT FORCE THE OUTCOME, AND THAT IS DELIBERATE. The model may still answer a Course
 * submission with a clarifying question — `[Course] Apple` genuinely needs one — and it may still
 * refuse a subject too broad to plan, which is the WHICH-SUBJECT-vs-WHICH-PART refusal
 * `turn-router.ts` already carries. An explicit declaration removes AMBIGUITY about what the
 * learner wanted; it does not remove the model's judgement about whether it can be done.
 */
export function capabilityBrief(capability: ComposerCapability): string {
  // 🔴 RESEARCH ADDS NOTHING TO THE PACKET, AND THE EMPTY STRING IS THE POINT. Course tells the
  // model something it should know while reading the sentence; research does not go to the turn
  // model at all. The learner declaring it means the run happens, so there is nothing for the
  // router to weigh and nothing to say to it. `TurnDecision.wantsReport` is the OTHER path, for
  // turns where nobody declared anything and the model has to read the intent out of the words.
  if (capability === "research") return "";
  if (capability === "course") {
    return (
      "The learner has explicitly asked for a COURSE: a persistent learning path through a subject, " +
      "rather than an answer to a question. Treat this submission as a request to plan that subject " +
      "out. If the subject is clear enough to plan, name it. If it genuinely is not — a word with " +
      "several unrelated meanings, or a request so broad that planning it would mean guessing which " +
      "subject they meant — ask which, exactly as you would for any other ambiguous turn."
    );
  }
  return "";
}
