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
  formatWebSearchContext,
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

/**
 * How many searches one turn may run before it must answer.
 *
 * 🔴 A BACKSTOP AGAINST A RUNAWAY TURN, NOT A JUDGEMENT ABOUT SUFFICIENCY. Whether the evidence
 * settles the question is the model's call and the loop ends when it stops asking; this only stops
 * a turn that never stops. It is stated to the model in the packet (`searchesLeft`) rather than
 * enforced silently, because a model that knows it has one search left spends it on its best query,
 * where one that is cut off mid-thought has already wasted it.
 *
 * Four, because the shapes that need more than one are real and bounded: a first query aimed wrong,
 * sources that disagree and need a tiebreak, and an answer that opens one more thing worth looking
 * up. A fifth round has not been a thing anyone could name.
 */
export const MAX_SEARCH_ROUNDS = 4;

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

  /** One round of the envelope. `webContext` carries everything found so far; empty on the first. */
  const ask = (webContext: string, searchesLeft: number) => postChatCompletion(
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
        searchesLeft,
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

  const first = await ask("", MAX_SEARCH_ROUNDS);
  if (first.errorText) return { decision: null, error: first.errorText, sources: [] };
  let decision = first.text ? decisionOrReply(first.text) : null;

  // 🔴 THE MODEL SEARCHES UNTIL IT SAYS IT HAS ENOUGH. It used to get exactly one search: the
  // packet told it "the search has happened, answer from them", so a first query aimed slightly
  // wrong ended the turn — the model had to answer from pages it had already judged unhelpful, and
  // could not say so. Owner: *"deepseek should decide itself when it has enough information to
  // answer."* So the loop ends when `needsWeb` comes back false, not when a counter says so.
  //
  // 🔴 WHAT COMES BACK ACCUMULATES RATHER THAN REPLACING. A later search narrows or corrects an
  // earlier one; throwing the earlier pages away would make the model re-find them, and would make
  // an inline [3] in the answer point at whatever happened to be third in the last batch.
  const seen = new Set<string>();
  const sources: ChatWebResult[] = [];
  for (let round = 0; round < MAX_SEARCH_ROUNDS && decision?.needsWeb; round += 1) {
    const found = await searchWebContext(uid, decision.webQuery || question, signal, decision.webResults);
    for (const source of found.sources) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      sources.push(source);
    }
    // Re-numbered over everything gathered, so the numbers the model reads are the numbers
    // `citedWebResults` resolves against.
    const next = await ask(formatWebSearchContext(sources), MAX_SEARCH_ROUNDS - round - 1);
    if (next.errorText) return { decision: null, error: next.errorText, sources: [] };
    // A failed round leaves the previous answer standing, which is better for the learner than an
    // error — and stops the loop, since a null decision cannot ask for another search.
    decision = (next.text ? decisionOrReply(next.text) : null) ?? decision;
    if (!next.text) break;
  }

  return {
    decision,
    error: null,
    // Only the pages the answer cited become promotion candidates. Search rank is retrieval
    // evidence, not permission to turn every hit into durable learning material.
    sources: decision?.say ? citedWebResults(decision.say, sources) : [],
  };
}
