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
// 🔴 WEB SEARCH RIDES THE SAME REGEX-FIRST GATE SESSIONS CHAT ALREADY USES (`shouldSearchWeb`,
// lib/workspace/chat-web-search.ts). That stays a deterministic decision on purpose: it spends
// money and adds latency, and it is a RETRIEVAL choice rather than a reading of what the learner
// meant. Nothing here reimplements it; it is imported and reused so a canvas question about "the
// current inflation rate" and a Sessions question about the same thing are judged by the identical
// rule rather than by two rules that can quietly diverge.

import { postChatCompletion, searchWebContext } from "@/lib/workspace/chat-api";
import {
  buildFreshSearchQuery,
  citedWebResults,
  shouldSearchWeb,
  usableWebResults,
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
  /** Decisions the learner already made this sitting, as facts. See `clarify-question.ts`. */
  clarified: readonly string[];
  /**
   * A real question is on screen with no answer yet.
   *
   * 🔴 IT NEVER REACHES THE PACKET, AND THAT IS DELIBERATE — `turn-router.ts`'s header says this
   * invariant is owned by `composerIntent` upstream and does not route through the model. It is
   * carried here because `converse` needs it for a different decision the model has no part in:
   * whether it may PARK this turn behind a clarification card. It may not while the learner already
   * owes an answer, because two things awaiting an answer at once is the one shape
   * `canvas-hosting.ts` exists to make impossible.
   */
  answerOwed: boolean;
}

export interface CanvasTurnReply {
  decision: TurnDecision | null;
  /**
   * Live web results actually used, in the order CITED. Empty when no search ran.
   *
   * 🔴 ANSWER ORDER, WHICH IS WHY IT MUST NEVER BE USED TO RESOLVE AN `[n]` MARKER. `citedWebResults`
   * walks the answer and pushes each first-seen result, so an answer citing [4] then [1] returns
   * `[fourth, first]` — index 0 is the page the model called 4. This list answers "which pages
   * earned a place in the canvas", which is what the promote control and `learnFromAside` need.
   */
  sources: readonly ChatWebResult[];
  /**
   * Every result the search returned, in the order the MODEL was shown them.
   *
   * 🔴🔴 THIS EXISTS BECAUSE `[n]` IS AN INDEX INTO THIS LIST AND NOTHING ELSE. Resolving a marker
   * against `sources` above would attribute a sentence to the wrong page — `[4]` would open
   * whichever page happened to be cited fourth — and a citation that resolves to real text from the
   * wrong place is the exact defect this repository's provenance rules exist to make impossible.
   *
   * 🔴 AND IT IS ALSO THE HONEST FALLBACK WHEN THE MODEL CITES NOTHING. Measured in a browser on
   * 2026-08-20: "whats the latest news on ai?" returned an answer plainly built from live pages
   * (a hack, an ECB warning, a phone launch) with NOT ONE `[n]` in it — so `citedWebResults`
   * returned empty, and the learner saw an answer about this week's news with no indication that
   * anything had been searched at all. The search ran, it was paid for, it shaped the answer; a
   * surface that shows nothing is claiming the model knew this by itself.
   */
  consulted: readonly ChatWebResult[];
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
  /**
   * Called the moment this turn decides to buy a web search, so the surface can say so.
   *
   * 🔴🔴 THE SEARCH WAS INVISIBLE, AND THE OWNER NOTICED BEFORE ANY OF US: *"i believe its doing a
   * websearch but there isnt any indication for that."* `converse` sets one label, "Thinking", for
   * the whole turn — so a question that quietly went and read four pages looked exactly like one
   * answered from the model's own head. That matters beyond politeness: a learner who cannot tell
   * whether an answer came from the live web has no way to judge how much to trust it, and this
   * product's whole evidence argument is that provenance is visible.
   *
   * 🔴 A CALLBACK RATHER THAN A RETURN FIELD, BECAUSE THE POINT IS THE TIMING. `sources` already
   * comes back in the reply, but that arrives AFTER the search and the model call — several seconds
   * too late to be the thing that says "searching". This fires before the request goes out.
   */
  onSearching?: (found: number | null) => void,
): Promise<CanvasTurnReply> {
  let webContext = "";
  let sources: ChatWebResult[] = [];
  if (shouldSearchWeb(question)) {
    // 🔴 TWO BEATS, BECAUSE THE COUNT DOES NOT EXIST YET AT THE FIRST ONE. ChatGPT says "Searching
    // 54 websites" because it issues the queries and knows the number; ours comes back with the
    // results. So the first call says a search is happening (`null`) and the second says how much
    // came back — which is the honest version of the same information, and neither is a timer.
    onSearching?.(null);
    const result = await searchWebContext(uid, buildFreshSearchQuery(question), signal);
    onSearching?.(result.sources.length);
    webContext = result.context;
    sources = result.sources;
  }

  const materialContext = groundingBlock(canvas.sources);
  const reply = await postChatCompletion(
    uid,
    turnRouterMessages({
      context: {
        canvasTitle: canvas.title,
        clarified: surroundings.clarified,
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

  if (reply.errorText) return { consulted: [], decision: null, error: reply.errorText, sources: [] };
  const decision = reply.text ? decisionOrReply(reply.text) : null;
  return {
    decision,
    error: null,
    // Only the pages the answer cited become promotion candidates. Search rank is retrieval
    // evidence, not permission to turn every hit into durable learning material.
    // 🔴 THE SAME LIST THE MODEL WAS NUMBERED AGAINST. `formatWebSearchContext` numbers
    // `usableWebResults(sources)`, so that is what an `[n]` counts into — not the raw results.
    consulted: usableWebResults([...sources]),
    sources: decision?.say ? citedWebResults(decision.say, sources) : [],
  };
}
