// What the composer should say it wants, per retrieval task.
//
// 🔴 These are PLACEHOLDERS, not instructions shouted at the learner, and they must match the
// task. "Say it back in your own words…" was printed under every prompt including
// "Which ion carries phase 0?" — where the answer is one noun and there is nothing to
// paraphrase. A response box that asks for the wrong shape of answer teaches the wrong shape
// of answer.
//
// Lives here rather than in the stage that used to own it: the persistent composer is now the
// only place a learner answers anything, so this vocabulary is shared by the composer, the
// recall state and the test state.

import type { RetrievalTask } from "./canvas-model";

export const RESPONSE_PLACEHOLDER: Record<RetrievalTask, string> = {
  name: "Answer…",
  define: "In your own words…",
  explain: "Explain it in your own words…",
  mechanism: "Walk through it, step by step…",
  reconstruct: "Rebuild it from memory…",
  compare: "Compare them…",
  predict: "What happens next, and why?",
  apply: "Use it on this case…",
  solve: "Work it through, showing your steps…",
};

/** A recall card is a short prompt with a short answer, and it carries no task of its own. */
export const RECALL_PLACEHOLDER = "Answer…";

/** What the composer says when nothing is being asked. */
export const ASK_PLACEHOLDER = "Ask Nemesis or change how you're learning…";
