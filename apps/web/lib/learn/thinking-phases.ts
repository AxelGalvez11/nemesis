// What Nemesis is actually doing right now, said in the learner's language.
//
// 🔴 EVERY PHASE HERE NAMES A STEP THAT IS GENUINELY RUNNING. None of them is scheduled, cycled on
// a timer, or advanced by a progress bar that guesses. This is the microphone waveform's rule
// applied to text: those bars move because a real amplitude changed, and a canned loop would look
// identical while the microphone was dead. A caption that walked "Mapping what you know → Finding
// the next gap → Building the next step" on a 900ms interval would look exactly like a system
// thinking and would be theatre — and the moment a step got slower or was reordered, the caption
// would be confidently describing work that was not happening.
//
// 🔴 SO THE VOCABULARY IS DELIBERATELY SHORTER THAN THE ONE WE WERE GIVEN. "Choosing the right
// difficulty" and "Building the next step" are excellent names for steps THIS RUNTIME DOES NOT YET
// HAVE — nothing selects a difficulty, and nothing generates a next step; the policy chooses one
// action from stored state and the canvas renders it. They belong here on the day that work exists
// and can report itself, and not one commit earlier.
//
// 🔴 ASKED FOR AGAIN ON 2026-08-13 AND REFUSED AGAIN, SO NOBODY RE-LITIGATES IT. §K of the v1
// acceptance doc asked for four richer captions. Two of them describe steps that exist and were
// taken — `finding_gap` and `reading_answer` below now say what they actually do. The other two
// were dropped:
//
//   "Connecting this to the previous concept…"   needs relations BETWEEN knowledge objects.
//                                                There are no prerequisite edges. Nothing connects.
//   "Building from what you already understand…" needs scaffolding selection. Nothing selects one.
//
// Both are the same shape as the two refused above, and §K7 is what makes it binding: a caption is
// a CLAIM ABOUT WHAT NEMESIS IS DOING. A vocabulary that cycles plausible stages is indistinguishable
// from a working system right up until it narrates a step that never ran — and then it has been
// lying the whole time. Better words for real steps is the whole of what this file allows.
//
// The captions are written and waiting. They land the day the capability does.

/** A step that is really executing. Added only when something can emit it. */
export type ThinkingPhase =
  /** Fetching and parsing the canonical stored document. */
  | "reading_source"
  /** Extracting knowledge objects from it and storing their objectives. */
  | "mapping_knowledge"
  /** Reading durable evidence and projecting learner state to decide what is owed. */
  | "finding_gap"
  /** The evaluator is judging a submitted answer. */
  | "reading_answer";

/**
 * 🔴 PLAIN, AND ABOUT THE LEARNER RATHER THAN THE MACHINE. "Fetching parsed_documents" is what the
 * step does; "Reading your material" is what it means to the person waiting. Neither is a status
 * code, and neither is "Loading…", which tells someone only that software exists.
 */
export const THINKING_COPY: Record<ThinkingPhase, string> = {
  finding_gap: "Looking for the weak point…",
  mapping_knowledge: "Mapping what you know",
  reading_answer: "Checking your reasoning…",
  reading_source: "Reading your material",
};

/**
 * How long a step must run before it is worth SAYING anything.
 *
 * 🔴 A FLASHED LOADING STATE IS WORSE THAN NONE. Most of these finish in well under a second, and a
 * caption that appears and vanishes inside 200ms reads as a glitch rather than as progress — it
 * draws the eye, then punishes it for looking. Below the threshold the interface simply stays
 * still, which is what "instant" is made of.
 */
export const THINKING_VISIBLE_AFTER_MS = 600;

/**
 * The same idea for the composer's own activity dot, but sooner.
 *
 * Shorter than the ambient state because it is smaller and closer to what the learner just did:
 * after pressing enter, a completely inert control for half a second reads as a dropped keystroke.
 * Still long enough that a fast judgement never flickers.
 */
export const COMPOSER_ACTIVITY_AFTER_MS = 320;
