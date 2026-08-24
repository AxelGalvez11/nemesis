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
// asks for one costs an extra round: search, then ask the identical packet again with the results
// in it — and it may ask again, until it says it has enough. Only web turns pay, and on those the
// search is most of the wait anyway.

import { postChatCompletion, searchWebContext } from "@/lib/workspace/chat-api";
import {
  citedWebResults,
  formatWebSearchContext,
  usableWebResults,
  webContextThatFits,
  type ChatWebResult,
} from "@/lib/workspace/chat-web-search";
import type { ChatRouteDecision } from "@/lib/workspace/chat-routing";
import { sourceDisagreementInstruction } from "@/lib/workspace/source-authority";
import { groundingBlock } from "@/lib/learn/canvas-grounding";
import type { LearningCanvas } from "@/lib/learn/canvas-model";
import { prepareAnswer } from "@/lib/learn/answer-prepare";
import type { TurnStage } from "@/lib/learn/turn-preview";
import {
  decisionOrReply,
  turnRouterMessages,
  type TurnDecision,
  type TurnExchange,
} from "@/lib/learn/turn-router";
import { hostnameOf } from "@/lib/favicon";
import { loadMemory, memoryBlock } from "@/lib/learn/learner-memory";

/** The non-thinking model, same choice `lib/learn/canvas-api.ts`'s own `ask()` makes for every
 *  other canvas call: a plain reply is a writing job, not a reasoning job, and `searchWeb` here is
 *  descriptive only (the actual search runs beforehand, in `askCanvasChat`, and its result is
 *  folded into the packet before this decision object ever reaches the wire). */
const CHAT_DECISION: ChatRouteDecision = { route: "conversation", model: "deepseek-chat", searchWeb: false };

/**
 * The most searches one turn may run.
 *
 * 🔴 A BACKSTOP, NOT THE DECISION. The model stops when it says it has enough; this exists so a
 * turn cannot run away, and the number is stated to the model rather than enforced behind its back
 * (see `searchesLeft` in `TurnContext`). Small enough that the worst case is a wait a learner will
 * sit through.
 */
export const MAX_SEARCH_ROUNDS = 4;

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
   * How far the work actually got, and what the model said it would be doing there.
   *
   * 🔴 RETURNED FOR THE RECORD, NOT FOR THE PREVIEW. The preview is live and is driven by `onStage`
   * as each stage opens; by the time this comes back the turn is over and the line has faded. This
   * is here so a caller can tell what a turn DID without re-deriving it from the sources list.
   */
  stage: TurnStage;
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
/**
 * The distinct sites a set of results came from, in the order they arrived.
 *
 * 🔴 `hostnameOf` IS THE ONE PARSER, shared with the source pills and the sources panel, so a host
 * that renders one way in the panel cannot render another way on the dock. A URL it cannot parse
 * contributes nothing rather than a placeholder chip.
 *
 * PURE.
 */
export function searchedDomains(sources: readonly { url: string }[]): readonly string[] {
  const seen = new Set<string>();
  const domains: string[] = [];
  for (const source of sources) {
    const host = hostnameOf(source.url);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    domains.push(host);
  }
  return domains;
}

export async function askCanvasChat(
  uid: string,
  canvas: LearningCanvas,
  question: string,
  surroundings: TurnSurroundings,
  signal?: AbortSignal,
  /** The passage the learner staged, so "this" has something to resolve against. */
  stagedPassage = "",
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
  /**
   * Fires twice per search round: `null` when the request goes out, then the running page count
   * once the results are in hand.
   *
   * 🔴🔴 THE SECOND BEAT NOW ALSO CARRIES THE HOSTS, because that is the first moment they are
   * KNOWN rather than guessed. The dock renders a favicon chip per host (nemesis-5e's lane, agreed
   * contract 2026-08-24), and `thinking-phases.ts`'s standing rule applies to a picture exactly as
   * it does to a caption: a favicon for a domain we merely might hit is the same theatre as a
   * caption for a step that is not running. So the first beat passes `[]` — a search is happening
   * and nothing is known about where yet — and the second passes what actually came back.
   *
   * 🔴 DEDUPED BY HOST, NOT BY URL. Four pages from one site is one place the answer stands on;
   * four identical favicons would say the opposite. Order is the order the results arrived, which
   * is the order the search ranked them, and NOT truncated — the dock decides how many to draw and
   * wants the real count for its "+N".
   */
  onSearching?: (found: number | null, domains: readonly string[]) => void,
  /**
   * The milestones this turn will show, the moment the model states them.
   *
   * 🔴🔴 A CALLBACK, FOR THE SAME REASON `onSearching` IS ONE: THE POINT IS THE TIMING. The
   * milestones also come back on the decision, and that arrives WITH the answer — exactly too late
   * for lines whose whole job is to be read during the wait. This fires as soon as the first
   * decision is parsed, which on a searching turn is before any page has been fetched and before
   * the second model call.
   *
   * 🔴 AND IT FIRES AGAIN ON EVERY LATER ROUND. A turn that searches twice may revise what it is
   * doing, and a stale first-round list sitting over a second-round search would describe work that
   * finished.
   */
  onMilestones?: (milestones: readonly string[]) => void,
  /**
   * The turn moved into a new stage, because something real happened.
   *
   * 🔴 THE PREVIEW ADVANCES ON THIS AND ON NOTHING ELSE. Owner, 2026-08-21: *"Real tool activity
   * should be authoritative… Never claim an action that did not happen."* So the surface does not
   * walk a list; it is TOLD, by the code that just did the thing.
   */
  onStage?: (stage: TurnStage) => void,
  /**
   * A step the runtime is running right now, or null when it finishes.
   *
   * 🔴 THE HONEST FALLBACK WHEN THE MODEL HAS NO LINE FOR THIS STAGE. Looking a compound up in
   * PubChem and evaluating a curve are real round trips the model could not have anticipated when
   * it wrote its milestones — it does not know whether the resolver will be slow. These labels name
   * work that is executing, which is exactly what `thinking-phases.ts` permits in the caption slot.
   */
  onWork?: (label: string | null) => void,
  /**
   * The learner attached the Course capability to this submission.
   *
   * 🔴 A FACT FOR THE PACKET, NEVER A BRANCH IN THIS FILE. It rides into `TurnContext` beside
   * `lessonInProgress` and the model reads it there; nothing in this function routes on it. The
   * owner's rule for the whole feature: the button adds structured intent to the SAME submission
   * pipeline everything else uses — it is not a second execution path.
   */
  courseRequested = false,
): Promise<CanvasTurnReply> {
  const materialContext = groundingBlock(canvas.sources);
  // 🔴 LOADED ONCE PER TURN, NOT ONCE PER ROUND. `ask` runs again when a web search comes back,
  // and re-reading the learner's memory for the second round would be a second query for an
  // answer that cannot have changed in the intervening seconds.
  //
  // 🔴 AND IT NEVER BLOCKS THE TURN. `loadMemory` swallows its own failures and returns [] —
  // including when the table has not been migrated yet — so a canvas still answers with no
  // memory rather than not answering at all.
  const memory = memoryBlock(await loadMemory(uid));

  /** One round of the envelope. `webContext` carries everything found so far; empty on the first. */
  const ask = (webContext: string, searchesLeft: number) => postChatCompletion(
    uid,
    turnRouterMessages({
      context: {
        canvasTitle: canvas.title,
        clarified: surroundings.clarified,
        demonstrated: surroundings.demonstrated,
        history: surroundings.history,
        materialContext,
        memory,
        objectives: surroundings.objectives,
        passages: canvas.blocks.length,
        sources: canvas.sources.length,
        // The learner's own day, formatted the way they would say it. Read here rather than inside the
        // packet builder so `turnRouterMessages` stays pure and its tests stay deterministic.
        today: new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", weekday: "long", year: "numeric" }),
        lessonInProgress: surroundings.lessonInProgress,
        courseRequested,
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
    {
      decision: CHAT_DECISION,
      signal,
    },
  );

  /**
   * How far this turn has actually got.
   *
   * 🔴🔴 ADVANCED BY EVENTS, NEVER BY TIME, WHICH IS THE WHOLE HONESTY OF THE PREVIEW. Each `enter`
   * below sits immediately beside the thing it names — the search request going out, the results
   * coming back — so a stage cannot be reached by waiting. A turn that answers straight away goes
   * `decided` → `finishing` and never shows the two lines in between, however confidently the model
   * wrote them.
   */
  let stage: TurnStage = "decided";
  const enter = (next: TurnStage) => {
    stage = next;
    onStage?.(next);
  };

  // 🔴 A NAMED COMPOUND IS LOOKED UP AND A FORMULA BECOMES POINTS BEFORE THE DECISION IS READ
  // (§42, §45). `prepareAnswer` is a no-op — two
  // `String.includes` — unless the answer actually contains an expression or a distribution, so the
  // ordinary turn pays nothing for this. When it does contain one, the round trip has to happen
  // HERE rather than inside the parser: `decisionOrReply` is synchronous, and the maths layer may
  // not reach the learner's bundle (see lib/learn/plot-compute.ts for why that forces a route).
  const readDecision = async (text: string) => {
    const read = decisionOrReply(await prepareAnswer(text, undefined, signal, (label) => onWork?.(label)));
    // 🔴 REPORTED AS SOON AS THEY ARE READ, NOT WHEN THE TURN RETURNS. See `onMilestones`.
    onMilestones?.(read?.milestones ?? []);
    return read;
  };

  const first = await ask("", MAX_SEARCH_ROUNDS);
  if (first.errorText) return { consulted: [], decision: null, error: first.errorText, sources: [], stage };
  let decision = first.text ? await readDecision(first.text) : null;

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
    // 🔴 TWO BEATS, BECAUSE THE COUNT DOES NOT EXIST YET AT THE FIRST ONE. ChatGPT says "Searching
    // 54 websites" because it issues the queries and knows the number; ours comes back with the
    // results. So the first call says a search is happening (`null`) and the second says how much
    // came back — which is the honest version of the same information, and neither is a timer.
    //
    // 🔴 THE SECOND BEAT REPORTS THE RUNNING TOTAL, NOT THIS ROUND'S HAUL. The learner is watching
    // one turn, and a counter that went 12, then 9, then 14 would describe our loop rather than
    // their search. What they are being told is how many pages this answer stands on.
    // 🔴 THE REQUEST IS ABOUT TO GO OUT. This is the event, not a prediction of one.
    enter("searching");
    onSearching?.(null, []);
    const found = await searchWebContext(
      uid,
      decision.webQuery || question,
      signal,
      decision.webResults,
      decision.webFreshness,
    );
    for (const source of found.sources) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      sources.push(source);
    }
    // 🔴 BUILT FROM `sources`, WHICH IS THE DEDUPED, ACCUMULATED LIST THE ANSWER ACTUALLY STANDS
    // ON — not `found.sources`, which is this round's haul and would make the chips flicker between
    // rounds of one turn. Same argument the running total above is built on.
    onSearching?.(sources.length, searchedDomains(sources));
    // Pages are in hand and the model is about to read them.
    enter("reading");
    // Re-numbered over everything gathered, so the numbers the model reads are the numbers
    // `citedWebResults` resolves against.
    const next = await ask(formatWebSearchContext(sources), MAX_SEARCH_ROUNDS - round - 1);
    if (next.errorText) return { consulted: [], decision: null, error: next.errorText, sources: [], stage };
    // A failed round leaves the previous answer standing, which is better for the learner than an
    // error — and stops the loop, since a null decision cannot ask for another search.
    decision = (next.text ? await readDecision(next.text) : null) ?? decision;
    if (!next.text) break;
  }

  // 🔴🔴 THE LIST THE MODEL WAS NUMBERED AGAINST, COMPUTED THE SAME WAY `formatWebSearchContext`
  // COMPUTES IT. An `[n]` is an index into what the model was SHOWN, and what it was shown is the
  // usable results that fitted the context budget — not the raw haul. Resolving a marker against
  // the raw list would attribute a sentence to the wrong page as soon as one result was unusable
  // or one was evicted, and a citation that resolves to real text from the wrong place is the
  // exact defect this repository's provenance rules exist to make impossible.
  // Tools are done; what is left is the answer itself.
  enter("finishing");
  const numbered = webContextThatFits(usableWebResults([...sources])).kept;
  return {
    decision,
    error: null,
    // 🔴 AND IT IS ALSO THE HONEST FALLBACK WHEN THE MODEL CITES NOTHING. Measured in a browser on
    // 2026-08-20: "whats the latest news on ai?" returned an answer plainly built from live pages
    // with NOT ONE `[n]` in it — so `citedWebResults` returned empty, and the learner saw an answer
    // about this week's news with no indication that anything had been searched at all.
    consulted: numbered,
    // Only the pages the answer cited become promotion candidates. Search rank is retrieval
    // evidence, not permission to turn every hit into durable learning material.
    sources: decision?.say ? citedWebResults(decision.say, numbered) : [],
    stage,
  };
}
