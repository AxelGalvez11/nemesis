// How Nemesis talks to a learner, as a rule rather than as taste.
//
// WHY A RULE AND NOT A STYLE GUIDE. Every string a learner reads was written by a model or by
// someone working alongside one, and the default voice of that collaboration is the assistant's:
// warm, hedged, first-person-plural, faintly congratulatory. It is a good voice for a chatbot and
// a bad one for a teacher. "Not quite — let's fix it" is not a correction; it is a companion
// noise. The learner already knows they were wrong. What they need is the thing they got wrong.
//
// 🔴 THE PROBLEM IS THAT IT DRIFTS BACK. Copy gets rewritten during unrelated work, a hedge
// creeps in to soften a verdict, an exclamation mark arrives with a new state, and none of it is
// visible in review because each individual string reads fine. The tics only look like a voice
// when you see forty of them together — which is exactly what a test can do and a reviewer cannot.
//
// 🔴 AND CONCISE IS PART OF THE RULE, NOT A SEPARATE ONE. A verdict the learner has to read twice
// is a verdict that competes with the material. The cap here is deliberately tight; anything that
// genuinely needs more room is a body of feedback, not a headline.

/** Phrases that mark the assistant's voice rather than a teacher's. */
export const ASSISTANT_TICS: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /\blet'?s\b/i,
    why: "first-person-plural cheerleading — the learner is doing the work, not a pair",
  },
  {
    pattern: /\b(?:great|nice|good|excellent|awesome|perfect|well done)\b[!,.]/i,
    why: "praise inflation — a verdict that congratulates is a verdict the learner discounts",
  },
  {
    pattern: /\b(?:I'?m happy to|I can help|I'?d be happy|as an AI|I'?m here to)\b/i,
    why: "assistant self-reference — Nemesis is not a helper standing beside the material",
  },
  {
    pattern: /\b(?:it seems|it looks like|I think|perhaps you|you might want to|maybe try)\b/i,
    why: "hedging — a teacher that is unsure says what it is unsure ABOUT",
  },
  {
    pattern: /\b(?:don'?t worry|no problem|that'?s okay|not to worry)\b/i,
    why: "reassurance the learner did not ask for, which implies they should have been worried",
  },
  {
    pattern: /\b(?:feel free|go ahead and|simply|just )\b.*\b(?:click|tap|press|type)\b/i,
    why: "instructional filler — the control is on screen and says what it does",
  },
  {
    pattern: /!{1}/,
    why: "an exclamation mark is enthusiasm about an interface, and the subject is the material",
  },
  {
    pattern: /\bcertainly\b|\babsolutely\b|\bof course\b/i,
    why: "conversational filler that opens a reply rather than saying anything",
  },
];

/**
 * Words a headline may run to before it stops being a headline.
 *
 * 🔴 A CEILING ON THE VERDICT, NOT ON THE TEACHING. Feedback, corrections and explanations are
 * allowed to be as long as the idea requires. This governs only the one line that names what
 * happened, which the learner reads at a glance on their way back to the question.
 */
export const MAX_HEADLINE_WORDS = 8;

export interface VoiceProblem {
  text: string;
  why: string;
}

/**
 * What is wrong with a learner-facing line, if anything.
 *
 * Returns every problem rather than the first, so a rewrite fixes the line in one pass instead of
 * revealing the next tic on the next run. PURE.
 */
export function voiceProblems(text: string, options?: { maxWords?: number }): VoiceProblem[] {
  const problems: VoiceProblem[] = [];
  for (const tic of ASSISTANT_TICS) {
    if (tic.pattern.test(text)) problems.push({ text, why: tic.why });
  }
  const limit = options?.maxWords;
  if (limit && text.trim().split(/\s+/).filter(Boolean).length > limit) {
    problems.push({ text, why: `longer than ${limit} words — a headline the learner reads twice` });
  }
  return problems;
}
