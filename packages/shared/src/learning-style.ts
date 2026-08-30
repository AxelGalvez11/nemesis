// How much Nemesis hands over: the learner's own choice, in three settings.
//
// Owner 2026-08-28: "could you implement both the ChatGPT study mode and the Claude Socratic
// approach to learning, in Nemesis."
//
// ── WHY THIS IS A CHOICE AND NOT A BEHAVIOUR ───────────────────────────────────────────────────
//
// 🔴🔴 BOTH OF THE THINGS BEING COPIED ARE OPT-IN, AND COPYING THEM AS DEFAULTS WOULD BREAK THE
// PRODUCT. ChatGPT Study Mode's own instructions say "DO NOT DO THE USER'S WORK FOR THEM" and
// refuse to solve a problem on the first response; Claude's Learning mode answers a calculus
// question with "what is the first step you would take?". Those are correct for something a person
// deliberately switched on, and hostile to somebody who typed a question because they wanted the
// answer. `thinking-stance.ts` therefore keeps ANSWER THE QUESTION as the default and this file is
// the door out of it, which the learner opens themselves.
//
// 🔴 AND THAT IS WHY IT IS A PREFERENCE, NOT A MODE THE CANVAS INFERS. The canvas has no modes
// (#873): intent ROUTES a turn, and must never change what the composer is. A learner-chosen
// setting is a different thing entirely, and voice mode is the standing precedent for exactly this
// shape: off by default, turned on in the options menu, remembered, reversible in one press.
//
// ── THE ESCAPE HATCH, WHICH NEITHER SOURCE PRODUCT HAS ─────────────────────────────────────────
//
// 🔴 EVERY STYLE YIELDS THE MOMENT THE LEARNER ASKS IT TO. Study Mode can trap you: it is told not
// to give answers, so a person who is genuinely stuck at 1am has to argue with a teaching protocol.
// A tutor that cannot be told "just tell me" is not being rigorous, it is being deaf, and the
// learner's fix is to turn the whole thing off for ever. Both instructions below end by yielding,
// and the stance's own "never ask twice" rule sits underneath them.
//
// PURE. No React, no I/O, no storage access. The reader passes the stored string in.

/**
 * How much the learner wants handed to them.
 *
 * 🔴 ONE VALUE WITH THREE STATES, NOT TWO BOOLEANS. The same argument `voice-preferences.ts` makes
 * about `AutoDictation`: two flags have four combinations, one of which means nothing, and the
 * first piece of code to read one without the other gets it wrong.
 */
export type LearningStyle = "direct" | "guided" | "socratic";

/** 🔴 DIRECT. Nobody is Socratised for asking a question. A learner opts in, and until they do the
 *  product answers, which is what `thinking-stance.ts` promises. */
export const DEFAULT_LEARNING_STYLE: LearningStyle = "direct";

export const LEARNING_STYLE_STORAGE_KEY = "nemesis.canvas.learningStyle.v1";

export interface LearningStyleOption {
  id: LearningStyle;
  /** What the menu row says. */
  label: string;
  /** One line under the label. Says what CHANGES, never how good it is. */
  hint: string;
}

/**
 * What the picker shows.
 *
 * 🔴 THE HINTS DESCRIBE THE TRADE, NOT THE BENEFIT. "Deepens understanding" is a claim the learner
 * cannot check from a menu; "will not hand you the answer" is one they can check in a turn. A
 * setting whose label oversells it gets switched on once, disappoints, and is never used again.
 */
export const LEARNING_STYLES: readonly LearningStyleOption[] = [
  { hint: "Answers first, teaches alongside", id: "direct", label: "Direct" },
  { hint: "Works through it with you instead of handing it over", id: "guided", label: "Guided" },
  { hint: "Leads with questions, one at a time", id: "socratic", label: "Socratic" },
];

/**
 * Guided: ChatGPT Study Mode's protocol, in our own words.
 *
 * Derived from the published instructions (openai.com/index/chatgpt-study-mode, 2025-07-29), which
 * OpenAI says were written with teachers and pedagogy experts for active participation, cognitive
 * load, metacognition, curiosity and actionable feedback. The moves kept here are the ones that
 * survive outside their product: start from what they know, one question per turn, let them try
 * before revealing, check they can restate it, vary the rhythm.
 *
 * 🔴 THE LOOKUP CARVE-OUT IS OURS AND IT IS LOAD BEARING. Study Mode applies its rule to
 * everything, so it will Socratise a request for a date. Nemesis is a general assistant as well as
 * a teacher, and a study setting that makes the calendar useless is a setting people turn off.
 */
export const GUIDED_INSTRUCTION =
  "THE LEARNER HAS ASKED TO BE TAUGHT RATHER THAN TOLD. For anything they are trying to learn or " +
  "work out, do not hand over the finished answer and do not do the work for them. Take it one " +
  "step at a time: find out what they already know, ask a single question that moves them one step " +
  "on, and wait for their reply before the next one. Break a problem into steps and spend a turn on " +
  "each. Let them attempt it before you reveal anything, and when they get a piece right say so and " +
  "move on. After a hard part, ask them to put it in their own words. Change the activity when one " +
  "has done its job: explain, then ask, then have them try, then have them teach it back to you. " +
  "This does not apply to a plain lookup: a date, a definition, a formula, a fact about their own " +
  "notes or calendar is answered straight away, because a setting that hides those is a setting " +
  "that gets switched off. And it never survives a direct request. If they say they are stuck, ask " +
  "for the answer, or say they do not want to be taught right now, give them the answer plainly " +
  "and without complaint, then offer to walk back through it.";

/**
 * Socratic: Claude's Learning mode, in our own words.
 *
 * 🔴 THE HARD PART OF SOCRATIC IS THE QUESTION BEING ANSWERABLE. A question the learner has no way
 * to answer is not teaching, it is a locked door with a riddle on it, and it is the single failure
 * that makes people hate this method. So the instruction is not "ask questions", it is "ask a
 * question they can answer from what they already have", which is a far stronger constraint.
 *
 * 🔴 AND IT GIVES UP AFTER TWO. A method that never concedes is indistinguishable from one that
 * cannot help. Two turns of being stuck is the point where a real tutor supplies the step and
 * carries on, so that is what this says.
 */
export const SOCRATIC_INSTRUCTION =
  "THE LEARNER HAS ASKED TO BE LED TO ANSWERS RATHER THAN GIVEN THEM. End every turn with a " +
  "question, not with an explanation. That is the rule that makes this setting different from " +
  "ordinary teaching: even when explaining would be faster, ask instead, and let them take the " +
  "step. Ask exactly one question, small enough to answer in a sentence; never send a list of them, " +
  "and never ask a second before the first is answered. The question must be answerable from what " +
  "they already know or from what is in front of them, because a question they have no way into is " +
  "not teaching, it is a locked door. When their answer is partly right, say which part is right in " +
  "one sentence and then ask the next question rather than completing the thought for them. Do not " +
  "supply a derivation, a formula or a final number while there is still a step they could take " +
  "themselves. Two things override all of this. If they have been stuck on the same step for two " +
  "turns, stop asking: give them that step, explain it plainly, and carry on. And if they ask " +
  "outright for the answer, or say they want to be told, or say they are done guessing, tell them " +
  "straight away and without complaint. Never ask a question about a plain lookup.";

/**
 * The one-line reminder that rides at the END of the turn, after the learner's own words.
 *
 * 🔴🔴 THIS IS NOT BELT AND BRACES. IT IS THE THING THAT MAKES THE SETTING WORK AT ALL. Measured
 * against a live model 2026-08-28: with the full instruction in the system prompt and nothing else,
 * Guided and Socratic produced near-identical answers three turns in, and Socratic broke its own
 * defining rule by handing over the complete derivation and the final number. A rule two thousand
 * characters back loses to the local pull of the conversation, every time, because the model is
 * completing a teaching exchange that is right in front of it.
 *
 * With this line appended to the last user message the two separated immediately and visibly:
 * Guided set up the mechanism and closed on a question, Socratic answered in two sentences and one
 * question with no derivation and no number. Same system prompt, same history, same temperature.
 *
 * 🔴 AND IT IS THE REFERENCE IMPLEMENTATION'S OWN MECHANISM, not an invention. Claude Code's output
 * styles do exactly this: the docs say Claude Code "also reminds Claude of the style during the
 * conversation" rather than relying on the system prompt alone. Somebody hit this and solved it the
 * same way.
 *
 * KEEP IT SHORT. It is paid for on every turn a style is on, and a long reminder is a second copy
 * of the instruction that can drift from the first. It restates the ONE defining behaviour, never
 * the whole protocol.
 */
export function learningStyleReminder(style: LearningStyle): string {
  if (style === "guided") {
    return "[Teaching style: Guided. Work through it with them one step at a time. Do not hand over "
      + "the finished answer this turn unless they asked outright or this is a plain lookup.]";
  }
  if (style === "socratic") {
    return "[Teaching style: Socratic. End this turn with a single question. Do not give the "
      + "derivation or the final number while a step remains for them, unless they asked outright "
      + "or this is a plain lookup.]";
  }
  return "";
}

function isLearningStyle(value: unknown): value is LearningStyle {
  return value === "direct" || value === "guided" || value === "socratic";
}

/**
 * The stored choice, or the default.
 *
 * Anything unreadable comes back `direct` for the same reason `readVoice` falls back: a setting
 * written by an older build must not leave somebody in a teaching protocol they cannot name.
 */
export function readLearningStyle(stored: string | null): LearningStyle {
  const value = (stored ?? "").trim();
  return isLearningStyle(value) ? value : DEFAULT_LEARNING_STYLE;
}

/** What the picker shows as the current selection. */
export function learningStyleLabel(id: LearningStyle): string {
  return LEARNING_STYLES.find((style) => style.id === id)?.label ?? "Direct";
}

/**
 * The instruction this style adds to the system prompt, or nothing at all.
 *
 * 🔴 `direct` RETURNS THE EMPTY STRING, WHICH IS THE WHOLE REASON THIS IS A FUNCTION. The default
 * turn must be BYTE-IDENTICAL to what shipped before this feature existed: no extra tokens, no
 * changed cache prefix, and no chance of a teaching instruction reaching somebody who never asked
 * for one. A style that costs nothing when unused is a style that can ship on by default in the
 * menu without anybody paying for it.
 */
export function learningStyleInstruction(style: LearningStyle): string {
  if (style === "guided") return GUIDED_INSTRUCTION;
  if (style === "socratic") return SOCRATIC_INSTRUCTION;
  return "";
}
