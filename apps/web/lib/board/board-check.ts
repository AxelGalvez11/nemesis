// A test on the board: questions the learner taps through, in a card of their own.
//
// Owner, 2026-09-04: *"it still cannot make tests (it drops tests in chat)"*. Asking a card for a
// quiz produced a numbered list of questions inside the answer, because a board turn is one
// streamed reply and prose is the only channel it had. That is the SAME defect the chat met on
// 2026-08-26 (*"i asked for a quiz and it put it in chat not as component"*) and its fix is written
// down in turn-router.ts: questions go in a typed field or nowhere, and the answer never prints
// them.
//
// 🔴🔴 THE CHIPS ARE THE CHAT'S CHIPS AND THE VALIDATOR IS THE CHAT'S VALIDATOR. `CanvasCheck`
// renders the run, `readChatCheck` refuses anything unusable, `describeAttempt` writes the account
// the model marks. Nothing about a question, its options or its scoring is decided here. What is
// new is only WHERE the run lives: a board card beside the thread it came from, rather than the
// chat's docked panel.
//
// 🔴 NOTHING IS KEPT IN THE LIBRARY, and that is the owner's standing rule about tests (*"at the
// end it shouldn't show anything… it's just up to DeepSeek to report the results in its own
// words"*). A run is written into the board's own document so reopening the board brings the card
// back; no deck, no note, no assets row. The marking is a reply in the thread, as in the chat.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md): `readCheckAsk` matches the way a learner asks to
// be tested, in any field. Nothing here knows what any subject is about.

import { canvasBriefFor, canvasHasMaterial } from "@/lib/learn/canvas-deliverables";
import { readChatCheck } from "@/lib/learn/chat-check";
import type { LearningCanvas } from "@/lib/learn/canvas-model";
import { MAX_QUESTIONS, MIN_QUESTIONS, type TestRun } from "@/lib/learn/test-run";
import { readModelJson } from "@/lib/model-json";
import { EXAM_ITEM_RULES_SHORT } from "@/lib/workspace/item-writing";
import { postChatCompletion } from "@/lib/workspace/chat-api";

/** A pack of questions with their options is JSON, and JSON that runs out of room is unreadable. */
const CHECK_MAX_TOKENS = 4096;

/** How many questions a board check asks for. Below the chat's ceiling: this is a card on a board
 *  beside other cards, not a panel that owns the screen. */
const ASK_FOR = 6;

export const CHECK_SYSTEM = [
  "You write one short test for a learner, as JSON and nothing else.",
  "",
  'Answer with exactly this shape: {"check": [{"prompt": "…", "options": [{"text": "…", "correct": true}, {"text": "…"}]}]}',
  `Write ${MIN_QUESTIONS} to ${ASK_FOR} questions, each with two to five options and EXACTLY ONE marked correct.`,
  // 🔴 THE SAME CRAFT THE REST OF THE PRODUCT WRITES QUESTIONS TO. `item-writing.ts` exists so the
  // app's test writers cannot drift apart; the chat's check prompt already carries this line.
  `Write them to the standard the rest of the product writes exam questions to: ${EXAM_ITEM_RULES_SHORT}`,
  // 🔴 GROUNDED IN WHAT IS ON THE BOARD, NEVER IN GENERAL KNOWLEDGE OF THE SUBJECT. A test about
  // something the learner never met is a test of somebody else's course.
  "Every question comes from the material below: what the learner attached, and what Nemesis said in this thread. Never test something that is not there.",
  "Vary which seat the right answer sits in. Never write prose, never explain the questions, never wrap the JSON in commentary.",
  "Never use emojis. Never use em dashes; use a comma, a colon, or a new sentence.",
].join("\n");

/**
 * Read an unmistakable ask to be tested, or nothing.
 *
 * 🔴 NARROW, ON `readDeliverableAsk`'S RULE: the cost of a false match is a stolen turn. "How do I
 * test a hypothesis" is a question about testing and must be answered, so a leading question word
 * refuses the whole match, and the verb must be within reach of the noun.
 *
 * 🔴 "quiz me" AND "test me" ARE THE COMMON PHRASINGS AND NEED NO VERB — they are the ask, whole.
 * Every phrasing this list lacks is a feature the learner cannot reach (#1061's lesson), so it
 * carries the ordinary ways people say it: quiz me, test me, practice questions, some questions on
 * this, check my understanding, exam questions, a practice test.
 */
export function readCheckAsk(text: string): boolean {
  const said = text.trim();
  if (/^(?:how|why|what|when|where|whether)\b/i.test(said)) return false;
  if (/\b(?:quiz|test|drill|grill|examine)\s+(?:me|us)\b/i.test(said)) return true;
  if (/\b(?:check|assess)\s+(?:my|our)\s+(?:understanding|knowledge|recall)\b/i.test(said)) return true;
  // 🔴 "give me some questions" HAS NO PREPOSITION AFTER IT, and that phrasing was the one this
  // regex missed: bare `questions` counts when a make-verb is within reach of it.
  return /\b(?:make|create|build|generate|give|write|set|ask)\b[^.?!\n]{0,60}?\b(?:(?:practice|exam|multiple[- ]choice|mcq|revision)\s+(?:questions?|test|quiz)|questions?|quiz|test)\b/i.test(
    said,
  );
}

/**
 * Does this turn ALSO ask to be taught?
 *
 * 🔴🔴 "EXPLAIN X THEN QUIZ ME" IS TWO ASKS AND MUST NOT LOSE ONE OF THEM. `readCheckAsk` on its own
 * would route the whole turn to the test writer, and the learner would be tested on a lesson that
 * was never given. The chat's prompt carries the same rule in words: *"sending questions with an
 * empty answer leaves them being tested on a lesson you never gave"*, measured on production
 * 2026-08-24 when five good chips arrived above an empty answer.
 *
 * So a turn that asks for both gets both, in the honest order: the answer is written first, and the
 * test card is made from that thread once it lands.
 *
 * 🔴 INSTRUCTION WORDS, NOT SUBJECT WORDS (CLAUDE.md). Every entry is a way of asking to be told
 * something, so it reads a law student's sentence and a machinist's sentence the same way.
 */
export function asksToBeTaughtToo(text: string): boolean {
  return /\b(?:explain|teach|walk me through|talk me through|summari[sz]e|describe|compare|contrast|outline|go over|break down|tell me about|help me understand)\b/i.test(text);
}

export type BoardCheckResult = { run: TestRun } | { error: string };

/**
 * Write a test from one thread and the documents behind it.
 *
 * 🔴 ONE MODEL CALL, THROUGH THE ONE DOOR. `postChatCompletion` is the same device key, the same
 * cost header and the same daily budget as every other turn (board-turn.ts's header says why).
 *
 * 🔴 A REFUSAL IS AN ANSWER. Too little material, or a pack that comes back unusable, says so in
 * the card rather than putting invented questions in front of a learner and calling it a score.
 */
export async function makeBoardCheck(uid: string, canvas: LearningCanvas, topic?: string): Promise<BoardCheckResult> {
  if (!canvasHasMaterial(canvas)) return { error: "There is nothing on this thread to test you on yet." };
  const subject = topic?.trim();
  const ask = subject
    ? `Write the test on this in particular: ${subject}`
    : "Write the test on what this thread has covered.";
  const reply = await postChatCompletion(
    uid,
    [
      { content: CHECK_SYSTEM, role: "system" },
      { content: [await canvasBriefFor(canvas, subject), ask].filter(Boolean).join("\n\n"), role: "user" },
    ],
    { maxTokens: CHECK_MAX_TOKENS },
  );
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. No test was made." };
  const run = readBoardCheck(reply.text);
  if (!run) return { error: "The questions came back unusable, so nothing was shown. Try again." };
  return { run };
}

/**
 * The pack the model wrote, validated.
 *
 * 🔴 TWO REPLY SHAPES, BECAUSE MODELS ANSWER BOTH WAYS: a bare array of questions, or the
 * `{"check": [...]}` object the prompt asks for. `readCardsJson` learned the same lesson and the
 * guard it added is the reason this is not a slice from the first `[` to the last `]`.
 *
 * 🔴 FEWER THAN `MIN_QUESTIONS` IS A REFUSAL, NOT A SHORT TEST. `test-run.ts` fixes the floor at
 * three and says why: two questions cannot tell a learner anything about themselves, and a "test"
 * that turns out to be one question reads as a bug.
 */
export function readBoardCheck(text: string): TestRun | null {
  const parsed = readModelJson(text);
  const list = Array.isArray(parsed) ? parsed : (parsed as { check?: unknown } | null)?.check;
  const run = readChatCheck(list);
  if (!run || run.questions.length < MIN_QUESTIONS) return null;
  return run.questions.length > MAX_QUESTIONS ? { questions: run.questions.slice(0, MAX_QUESTIONS) } : run;
}
