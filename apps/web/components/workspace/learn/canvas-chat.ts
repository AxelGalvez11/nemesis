// The turn the learner takes with Nemesis, and the one model call that decides what it means.
//
// Every other call in this product (lib/learn/canvas-api.ts's `runCommand`, `generateLesson`, and
// the rest) writes into the persistent study document, through a system prompt that says outright
// "you are not chatting" and that grounds every claim in the attached material or refuses it.
// Product mandate rule 1 (owner, 2026-08-15) asks for the other half: "the learner must be able to
// ask ordinary questions about their sources WITHOUT being forced into tutoring behaviour." This
// file is that other half.
//
// 🔴🔴 AND SINCE 2026-08-18 IT IS ALSO THE FRONT DOOR'S SEMANTIC DECISION. It used to answer only
// the turns a regex classifier (`learning-intent.ts`, deleted) had already ruled conversational;
// everything else was sent to the teaching machinery without a model ever seeing it, which is how
// `hello` became "teach me the topic hello". Now the same call that answers also decides whether
// answering is the right thing to do at all. There is one model call at the front door, not a
// classifier and then a call. See lib/learn/turn-router.ts for why the decision rides a JSON
// envelope rather than a tool round, and for what stays deterministic.
//
// 🔴 THE SAME DOOR EVERYTHING ELSE USES. `postChatCompletion` is the shared call every chat surface
// in this app goes through: the same device key, the same cost attribution header, the same daily
// budget enforcement. A new answer surface that reached the model through its own path would be
// the exact hole the unit-economics audit already found once (see lib/learn/canvas-api.ts's own
// header comment) and this file exists specifically not to repeat it.
//
// 🔴 WEB SEARCH IS PART OF THE SAME DECISION NOW. It used to ride Sessions' `shouldSearchWeb` — a
// list of English words: latest, current, today, price, weather, score, version — and the comment
// here defended that as "a RETRIEVAL choice rather than a reading of what the learner meant".
// That was wrong, and the two halves of the sentence are the reason: deciding whether a question
// turns on something that changes IS a reading of what the learner meant, and no word list has
// ever done it. It bought a search for any sentence containing "update" and refused one for "has
// that guideline been revised", and it could not read a question asked in Spanish at all.
//
// So the model says whether it needs the web, in the same envelope as everything else. A turn that
// asks for one costs a second round: search, then ask the identical packet again with the results
// in it. Only web turns pay, and on those the search is most of the wait anyway.

import { postChatCompletion, searchWebContext } from "@/lib/workspace/chat-api";
import {
  citedWebResults,
  type ChatWebResult,
} from "@/lib/workspace/chat-web-search";
import type { ChatRouteDecision } from "@/lib/workspace/chat-routing";
import { sourceDisagreementInstruction } from "@/lib/workspace/source-authority";
import { groundingBlock } from "@/lib/learn/canvas-grounding";
import type { LearningCanvas } from "@/lib/learn/canvas-model";
import {
  decisionOrReply,
  turnRouterMessages,
  type TurnDecision,
  type TurnExchange,
} from "@/lib/learn/turn-router";

/** The non-thinking model, same choice `lib/learn/canvas-api.ts`'s own `ask()` makes for every
 *  other canvas call: a plain reply is a writing job, not a reasoning job, and `searchWeb` here is
 *  descriptive only (the actual search runs beforehand, in `askCanvasChat`, and its result is
 *  folded into the packet before this decision object ever reaches the wire). */
const CHAT_DECISION: ChatRouteDecision = { route: "conversation", model: "deepseek-chat", searchWeb: false };

/** What only the canvas's runtime knows, which the session cannot read for itself. */
export interface TurnSurroundings {
  /** Whether the teaching policy is contributing anything right now. */
  lessonInProgress: boolean;
  objectives: number;
  demonstrated: number;
  history: readonly TurnExchange[];
}

export interface CanvasTurnReply {
  decision: TurnDecision | null;
  /** Live web results actually used, in the order cited. Empty when no search ran. */
  sources: readonly ChatWebResult[];
  error: string | null;
}

/**
 * Read one turn: what Nemesis says, and what Nemesis should do about it.
 *
 * The caller executes the action — this function never touches the canvas. See `converse` in
 * `use-canvas-session.ts` for the two things "study" can mean and why the canvas, not the model,
 * picks between them.
 */
export async function askCanvasChat(
  uid: string,
  canvas: LearningCanvas,
  question: string,
  surroundings: TurnSurroundings,
  signal?: AbortSignal,
  /** The passage the learner staged, so "this" has something to resolve against. */
  stagedPassage = "",
): Promise<CanvasTurnReply> {
  const materialContext = groundingBlock(canvas.sources);

  /** One round of the envelope. `webContext` is empty on the first pass and full on the second. */
  const ask = (webContext: string) => postChatCompletion(
    uid,
    turnRouterMessages({
      context: {
        canvasTitle: canvas.title,
        demonstrated: surroundings.demonstrated,
        history: surroundings.history,
        materialContext,
        objectives: surroundings.objectives,
        passages: canvas.blocks.length,
        sources: canvas.sources.length,
        // The learner's own day, formatted the way they would say it. Read here rather than inside the
        // packet builder so `turnRouterMessages` stays pure and its tests stay deterministic.
        today: new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", weekday: "long", year: "numeric" }),
        lessonInProgress: surroundings.lessonInProgress,
        stagedPassage,
        webContext,
      },
      sourceRule: sourceDisagreementInstruction({
        hasAttachedMaterial: materialContext.trim().length > 0,
        hasExternalEvidence: webContext.trim().length > 0,
      }),
      utterance: question,
    }),
    { decision: CHAT_DECISION, signal },
  );

  const first = await ask("");
  if (first.errorText) return { decision: null, error: first.errorText, sources: [] };
  let decision = first.text ? decisionOrReply(first.text) : null;
  let sources: ChatWebResult[] = [];

  // 🔴 THE SECOND ROUND HAPPENS ONLY WHEN THE MODEL ASKED FOR IT, and only once — the packet it
  // gets back says the search has already run, so a model that asks again is answered from what it
  // was given rather than sent round a third time.
  if (decision?.needsWeb) {
    const found = await searchWebContext(uid, decision.webQuery || question, signal);
    sources = found.sources;
    const second = await ask(found.context);
    if (second.errorText) return { decision: null, error: second.errorText, sources: [] };
    // A failed second round still leaves the first answer standing, which is better than an error.
    decision = (second.text ? decisionOrReply(second.text) : null) ?? decision;
  }

  return {
    decision,
    error: null,
    // Only the pages the answer cited become promotion candidates. Search rank is retrieval
    // evidence, not permission to turn every hit into durable learning material.
    sources: decision?.say ? citedWebResults(decision.say, sources) : [],
  };
}
