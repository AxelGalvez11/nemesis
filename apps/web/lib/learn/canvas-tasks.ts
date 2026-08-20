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
  locate: "Name the covered part…",
  predict: "What happens next, and why?",
  apply: "Use it on this case…",
  solve: "Work it through, showing your steps…",
};

/** A recall card is a short prompt with a short answer, and it carries no task of its own. */
export const RECALL_PLACEHOLDER = "Answer…";

/** What the composer says when nothing is being asked. */
export const ASK_PLACEHOLDER = "Ask Nemesis or change how you're learning…";

/**
 * Material is attached and the canvas has not begun.
 *
 * 🔴 IT NAMES THE OPTION, NOT THE OBLIGATION — UX brief §3, *"uploading without a prompt must
 * work"*. "Add an instruction" would read as a required field on a screen whose entire point is
 * that nothing more is needed; "or just send" is what makes the empty case obviously legitimate
 * rather than something the learner has to work out is allowed.
 */
export const START_WITH_MATERIAL_PLACEHOLDER = "Say how to approach this, or just send…";

/**
 * What every Canvas upload door accepts.
 *
 * 🔴 ONE LIST, BECAUSE THREE COPIES HAD ALREADY DRIFTED. The Sources panel and the front door
 * accepted `.xlsx` and `.csv`; the composer did not — so a learner was told by one control that
 * their spreadsheet was unsupported and by another that it was fine, with nothing in the codebase
 * recording which was right. UX brief §2 names a spreadsheet explicitly among what the composer
 * must take, and §15's one-component rule makes a per-door capability list precisely the drift it
 * exists to prevent.
 *
 * 🔴 THE LIST IS A CLAIM ABOUT THE EXTRACTOR, NOT A PREFERENCE. Adding an extension here promises
 * that the ingestion path can read it; `canvas-shell.test.ts` pins the three doors equal so the
 * promise cannot be made in one place and broken in another.
 */
// 🔴 `.heif` WAS MISSING, AND IT IS WHAT AN IPHONE ACTUALLY WRITES. `IMAGE_EXTENSIONS` in
// `chat-attachments.ts` has listed both `.heic` and `.heif` all along and the reader handles both;
// this list had only the first, so the OS picker greyed out half of a learner's camera roll and the
// refusal happened before any code of ours ran. Kept in step with that list by hand because the two
// serve different jobs -- one is what we can READ, this is what the dialog OFFERS -- and a guard
// asserts they do not drift.
export const ACCEPTED_MATERIAL = ".pdf,.docx,.pptx,.md,.txt,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.heic,.heif";
