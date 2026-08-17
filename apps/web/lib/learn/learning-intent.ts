// What this turn actually requires: an answer, or teaching.
//
// 🔴 THERE ARE NO MODES, AND THAT IS THE WHOLE DESIGN. The learner never picks "chat" or "tutor".
// They type or say a thing, and Nemesis works out what that thing needs. Exposing the choice would
// be asking the learner to do the system's job, which is the same rule the composer already holds
// for cognitive state ("the canvas already knows which state it is in").
//
// 🔴 LEARNING INTENT IS CONTINUOUS, NOT A KEYWORD SWITCH. "Teach me X" is the easy case and the
// least interesting one. The real signal is a THREAD: somebody who asks what a dollar is, then why
// paper has value, then what stops anyone printing more, is not running three lookups — they are
// building a model, and the third question is the moment Nemesis should start steering. A rule that
// only fires on the word "teach" would miss every learner who does not talk like a syllabus.
//
// 🔴 AND THE FAILURE MODES ARE NOT SYMMETRIC. Answering when teaching was wanted costs one turn:
// the learner asks again, or presses Learn this. Teaching when an ANSWER was wanted hijacks
// somebody who asked what day it is, and it is the single most annoying thing this product could
// do. So the bar for entering teaching is high, every path back out is cheap, and an explicit ask
// always outranks an inferred one in both directions.
//
// 🔴 FIELD-AGNOSTIC BY CONSTRUCTION. Every signal here is about the SHAPE of the exchange —
// imperative vs interrogative, how many turns, whether they repeat, whether the learner is
// producing reasoning rather than requesting facts. Nothing names a discipline, and nothing would
// work better if it did.

/** What Nemesis should do with this turn. */
export type TurnIntent =
  /** Answer it and stop. Utility, current information, a single fact. No learner model is engaged. */
  | { kind: "answer"; because: IntentReason }
  /**
   * Answer it, AND note that a conceptual thread is forming.
   *
   * 🔴 THE MIDDLE STATE EXISTS BECAUSE THE ALTERNATIVE IS A CLIFF. Without it the only options are
   * "plain reply" and "hijack into a lesson", and the second one is what makes tutors exhausting.
   * The learner still gets the answer they asked for; Nemesis begins modelling underneath, and
   * offers rather than seizes.
   */
  | { kind: "answer_and_offer"; because: IntentReason }
  /** Teach. The learner has asked to be taught, or the thread is unmistakable. */
  | { kind: "teach"; because: IntentReason };

export type IntentReason =
  | "explicit-teaching-request"
  | "explicit-learn-this"
  /** Material is attached; the canvas exists to learn from it. */
  | "material-attached"
  /** A teaching session is already running; a mid-session utterance belongs to it. */
  | "session-underway"
  /** Several turns circling one idea. */
  | "conceptual-thread"
  /** The learner is producing reasoning, not requesting a fact — that IS the teachable moment. */
  | "learner-reasoning"
  /** Reads as a question and nothing else is going on. */
  | "ordinary-question"
  /** Not a question, no signals — the old default, which is to treat it as a topic to learn. */
  | "bare-topic";

/**
 * An explicit request to be taught.
 *
 * 🔴 IMPERATIVE VERBS, NOT THE WORD "LEARN". "Learn about photosynthesis" and "I want to learn
 * French" are teaching requests; "what did you learn from that" is not, and neither is a source
 * titled "Learning Objectives". Anchored at the start because an imperative is a sentence opening,
 * which also keeps "explain why the answer above is wrong" (a follow-up about an answer) out.
 */
const TEACH_ME =
  /^(?:can you |could you |please |i(?:'| a)?m ready to |i want to |i(?:'| wou)?ld like to |help me )?(?:teach|tutor|coach|quiz|test|drill|train|walk me through|take me through|study|revise|review|learn)\b/i;

/** A request for help understanding, which is a teaching request wearing softer clothes. */
const HELP_ME_UNDERSTAND =
  /\b(?:help me (?:understand|learn|revise|study|get)|explain .{0,40}\bto me\b|i (?:don'?t|do not|can'?t|cannot) (?:understand|get|follow)|i(?:'| a)?m (?:confused|stuck|lost) (?:about|on|with|by)|make sure i (?:actually )?understand|get me (?:up to speed|ready) (?:on|for))\b/i;

/**
 * The learner is REASONING rather than asking — attempting, hypothesising, checking their model.
 *
 * 🔴 THE HIGHEST-VALUE SIGNAL IN THIS FILE, AND THE ONE A KEYWORD LIST WOULD NEVER FIND. Somebody
 * who says "so is it because the pressure drops?" has produced a model and is asking to have it
 * checked. That is the exact moment teaching is worth more than answering, and it looks nothing
 * like "teach me".
 */
const LEARNER_REASONING =
  /^(?:so |then |but |ok(?:ay)?,? so |wait,? )?(?:is it|isn'?t it|does that mean|would that mean|so it'?s|i think|i'?d guess|my guess is|am i right that|if .{3,60}\bthen\b)/i;

/** Utility and current-information requests: answer them, never teach them. */
const UTILITY =
  /^(?:what(?:'s| is) (?:the )?(?:date|time|day)\b|what day\b|what time\b|how (?:do i|can i) (?:log|sign|reset|cancel|upload|export|delete)\b|who are you\b|what (?:are you|can you do)\b)/i;

/** Openings that read as a question regardless of punctuation. */
const INTERROGATIVE =
  /^(what|why|how|when|where|which|who|whose|does|do|did|is|are|was|were|can|could|would|should|will|has|have|had)\b/i;

export interface TurnContext {
  /** Sources already attached to this canvas. */
  attachedSources: number;
  /** A teaching session is running — the policy has begun producing actions. */
  sessionUnderway: boolean;
  /**
   * The learner's own recent utterances on this canvas, newest last, excluding this one.
   *
   * 🔴 THEIRS ONLY, NEVER NEMESIS'S REPLIES. A thread is something the LEARNER is doing. Counting
   * our own answers would make every long reply look like engagement.
   */
  recentAsks: readonly string[];
  /** The learner pressed "Learn this". Outranks everything. */
  explicitLearnThis?: boolean;
}

/** Words too common to mean two questions are about the same thing. */
const STOPWORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "because", "but", "by", "can", "did", "do",
  "does", "for", "from", "has", "have", "how", "i", "if", "in", "is", "it", "its", "just", "me",
  "my", "no", "not", "of", "on", "or", "over", "so", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "to", "was", "were", "what", "when", "where", "which", "who",
  "why", "will", "with", "would", "you", "your",
]);

/**
 * Fold the one inflection that actually breaks this.
 *
 * 🔴 PLURALS ONLY, AND ONLY THE SAFE ONES. "What is a dollar" followed by "what stops anyone
 * printing more dollarS" is the owner's own worked example, and without this it reads as two
 * unrelated questions — the thread never forms and the feature does nothing. A full stemmer is the
 * wrong instrument: it would fold "policy"/"police" and "arterial"/"artery" together, and
 * over-matching here means teaching somebody who wanted an answer.
 *
 * So: drop a trailing `s` only on a word long enough for it to be an inflection, and never after
 * `ss`, `us` or `is` — which protects "process", "status" and "analysis", the shapes that would
 * otherwise be mangled into something that is not a word.
 */
function singular(word: string): string {
  if (word.length < 4 || !word.endsWith("s")) return word;
  if (/(?:ss|us|is)$/.test(word)) return word;
  return word.slice(0, -1);
}

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
  return new Set(
    words.filter((word) => word.length > 2 && !STOPWORDS.has(word)).map(singular),
  );
}

/**
 * Do two utterances circle the same idea?
 *
 * 🔴 OVERLAP OF CONTENT WORDS, NOT A TOPIC MODEL. This has to run on every keystroke-free turn in
 * the browser, and a shared uncommon word ("dollar", "arteriole", "estoppel") is a strong enough
 * signal for a decision whose cost of being wrong is one extra offer the learner can ignore.
 * Deliberately NOT stemmed: over-matching here means teaching somebody who wanted an answer.
 */
export function sharesSubject(a: string, b: string): boolean {
  const left = contentWords(a);
  if (left.size === 0) return false;
  const right = contentWords(b);
  for (const word of right) if (left.has(word)) return true;
  return false;
}

/**
 * How many of the recent turns, including this one, are about the same thing.
 *
 * Counts a CHAIN ending at the current utterance rather than any two similar questions in the
 * session: a learner who returns to a subject after ten unrelated turns has not built momentum,
 * they have remembered something.
 */
export function threadDepth(current: string, recentAsks: readonly string[]): number {
  let depth = 1;
  let anchor = current;
  for (let i = recentAsks.length - 1; i >= 0; i -= 1) {
    const earlier = recentAsks[i];
    if (!earlier || !sharesSubject(anchor, earlier)) break;
    depth += 1;
    // Walk the chain: each link is compared with the one before it, so a subject that DRIFTS
    // (dollar → inflation → interest rates) still reads as one thread, which is what it is.
    anchor = earlier;
  }
  return depth;
}

/** Turns on one subject before Nemesis offers to teach rather than only answering. */
export const THREAD_OFFER_DEPTH = 3;

/**
 * What this turn requires.
 *
 * Order is deliberate and every early return is a case where a later, weaker signal must not get a
 * vote. Explicit beats inferred; utility beats everything except an explicit request.
 */
export function readTurnIntent(utterance: string, context: TurnContext): TurnIntent {
  const text = utterance.trim();

  // Pressing the button is not a signal to weigh. It is an instruction.
  if (context.explicitLearnThis) return { because: "explicit-learn-this", kind: "teach" };

  if (!text) {
    // An empty send with material attached is "learn this material with me", inferred rather than
    // asked for — the behaviour the composer already relies on.
    return context.attachedSources > 0
      ? { because: "material-attached", kind: "teach" }
      : { because: "bare-topic", kind: "teach" };
  }

  // 🔴 UTILITY OUTRANKS EVERY INFERRED SIGNAL, INCLUDING A RUNNING SESSION. "What day is it" during
  // a lesson is still a request for the date, and answering it is not an interruption of teaching —
  // treating it as one would be the hijack this whole file exists to prevent.
  if (UTILITY.test(text)) return { because: "ordinary-question", kind: "answer" };

  if (TEACH_ME.test(text) || HELP_ME_UNDERSTAND.test(text)) {
    return { because: "explicit-teaching-request", kind: "teach" };
  }

  // Mid-session, an utterance belongs to the lesson unless it was one of the cases above.
  if (context.sessionUnderway) return { because: "session-underway", kind: "teach" };

  // The learner is producing a model and asking for it to be checked. Answer — they asked a
  // question — but this is the moment worth building on.
  if (LEARNER_REASONING.test(text)) return { because: "learner-reasoning", kind: "answer_and_offer" };

  const question = INTERROGATIVE.test(text) || text.endsWith("?");

  if (question) {
    if (threadDepth(text, context.recentAsks) >= THREAD_OFFER_DEPTH) {
      return { because: "conceptual-thread", kind: "answer_and_offer" };
    }
    // 🔴 ATTACHED MATERIAL DOES NOT TURN A QUESTION INTO A LESSON. "Rule 1" (owner, 2026-08-15):
    // the learner must be able to ask ordinary questions about their sources WITHOUT being forced
    // into tutoring. Material makes teaching AVAILABLE, never automatic.
    return { because: "ordinary-question", kind: "answer" };
  }

  // Not a question, not utility, no session: a bare noun phrase is a topic. "Innate immunity" typed
  // into an empty canvas means teach it.
  return context.attachedSources > 0
    ? { because: "material-attached", kind: "teach" }
    : { because: "bare-topic", kind: "teach" };
}

/** Does this intent put anything on screen beyond a conversational reply? */
export function intentTeaches(intent: TurnIntent): boolean {
  return intent.kind === "teach";
}
