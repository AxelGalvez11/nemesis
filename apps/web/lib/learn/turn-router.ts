// What the learner meant, decided by the model rather than by a regex.
//
// 🔴🔴 THIS FILE REPLACES A HAND-BUILT LANGUAGE UNDERSTANDER (`learning-intent.ts`, deleted). That
// file read an utterance with anchored regexes — an imperative-verb list, a "help me understand"
// list, a reasoning-opener list, an interrogative-opener list — and its final rule was: *text that
// is not a question is a topic, so teach it*. Typing `hello` into a fresh canvas therefore meant
// "teach me the topic hello", and the learner got a lesson instead of a greeting. Every fix that
// stays inside that design is another list: hi, hey, yo, thanks, ok, lol, "this sucks", "I'm
// tired", "wait", "what?". A language model already knows all of them and every phrasing nobody
// thought to enumerate. Putting a miniature language understander in FRONT of the language model
// was the mistake, and the mistake is the architecture, not the list.
//
// 🔴 SO THE SPLIT IS: THE SOFTWARE KEEPS WHAT IT ALREADY KNOWS, THE MODEL DECIDES WHAT THINGS MEAN.
// Nothing here weakens a deterministic invariant, and none of them route through this file:
//   · a visible unanswered question + a composer submission IS an answer to it (composer-intent.ts)
//   · a staged selection scopes the turn to that passage (learning-canvas.tsx's `submit`)
//   · an explicit rewrite phrase rewrites, or refuses and says why (canvas-phrases.ts)
//   · evidence writes, auth, persistence, rate limits, provider failover
// The canvas already knows those. It does not know whether "innate immunity" is a request to be
// taught or the answer to "what are you studying", and that is the question this file forwards.
//
// 🔴 ONE CALL RETURNS BOTH WHAT NEMESIS SAYS AND WHAT NEMESIS DOES, and that shape is the reason
// this is a JSON envelope rather than an OpenAI `tools` round. Tool calling is available on this
// model and rides this valve today (the Sessions surface does exactly that), but a tool round
// answers with a CALL and needs a second round to produce the sentence that goes with it. The
// owner's own worked example is a turn that does both at once:
//
//     User uploads a lecture.
//     Nemesis: alright.
//     [Canvas transitions into useful teaching]
//
// "alright." and the transition are one turn. A round trip to learn that would double the latency
// of the first thing a learner ever types. The envelope goes through `postChatCompletion` like
// every other model call in the product — same device key, same cost attribution, same daily
// budget, same `labTrace` — so this is not a parallel path, it is the same door with a contract.
//
// 🔴 THE FAILURE MODES ARE STILL ASYMMETRIC, AND THE DEFAULT FLIPPED. Answering when teaching was
// wanted costs one turn: the learner asks again, or presses Learn this. Teaching when an answer
// was wanted hijacks somebody who said hello. The old file said that too, and then defaulted the
// unrecognised case to TEACH. Here an unparseable or empty decision falls back to conversation.

import type { WireMsg } from "@/lib/workspace/chat-api";
import { extractJson } from "./canvas-parse";

/**
 * What Nemesis does with this turn, beyond speaking.
 *
 * 🔴 TWO VALUES BECAUSE THE FRONT DOOR HAS TWO DOORS, not because two is a tidy number. A canvas
 * can answer transiently without changing the page, or it can hand the text to the learning
 * system. A third name would be a third word for one of those two, and the model would have to
 * guess which fiction we wanted.
 */
export type TurnAction =
  /** Say it and stop. Nothing on the page changes, nothing is stored, no learner model is engaged. */
  | "reply"
  /**
   * Hand this to the learning system. On a canvas that has not begun this starts a session; on one
   * that has, it steers the study document. Both destinations are the canvas's to pick from the
   * state it is in — see `learning-canvas.tsx`. The model chooses the INTENT, never the mechanism.
   */
  | "study"
  /**
   * The material on the page failed them, so fix the material rather than adding to it.
   *
   * 🔴 THIS REPLACES `canvas-phrases.ts`'s PHRASE LIST — `simpler|simplify|rephrase|reword|rewrite`,
   * plus a confusion matcher and a question guard in front of it to stop the two colliding. That
   * file argued its list was legitimate because it named INSTRUCTIONS rather than subject matter,
   * and "make this simpler" does mean the same thing in a statute and a weld procedure. True, and
   * beside the point: the list still had to enumerate every way a person says it, and the file's own
   * comments record two phrasings it got wrong before anybody noticed. "Can you rephrase that" is an
   * instruction wearing a question's clothes and the guard refused it; "how do I understand this"
   * would have rewritten the page.
   *
   * 🔴 WHAT IS REWRITTEN IS STILL NOT THE MODEL'S TO CHOOSE. §11's referent rule is untouched:
   * exactly one active reading region, derived from the learner's own Continue presses, or a
   * visible refusal. See `routeRewrite` in canvas-phrases.ts.
   */
  | "rewrite";

/**
 * Something worth saying out loud above the "Learn this" offer.
 *
 * 🔴 AN OBSERVATION ABOUT THE CONVERSATION, NEVER A VERDICT ABOUT THE LEARNER — the rule
 * `offer-copy.ts` already holds and the reason this list is two values and not a mood detector.
 * Absent on nearly every reply, because a nudge on every single answer is nagging.
 */
export type TurnOffer = "returning" | "reasoning";

export interface TurnDecision {
  /**
   * Does answering this need live sources off the web.
   *
   * 🔴 THE MODEL ANSWERS THIS NOW, WHERE A WORD LIST USED TO. `askCanvasChat` imported Sessions'
   * `shouldSearchWeb` — `latest|current|today|price|weather|score|version|…` — and the header of
   * that import argued the rule should stay deterministic because searching spends money. The
   * spending is real; the word list was never what made it careful. It bought a search for any
   * sentence containing "update" and refused one for "has the guideline been revised", and it
   * could not read a question asked in Spanish at all.
   *
   * A canvas turn that asks for the web costs one extra round: the search runs, and this same
   * packet is asked again with the results in it. Only web turns pay it, and on those the search
   * itself dominates the wait.
   */
  needsWeb: boolean;
  /** What to type into a search engine, when `needsWeb`. Null otherwise. */
  webQuery: string | null;
  /**
   * How many pages to read, when `needsWeb`. Null when the model did not choose.
   *
   * 🔴 THE LEARNER'S QUESTION DECIDES, NOT A CONSTANT. Every cap between the provider and the
   * answer was ours: the provider returns up to 50 and bills the same unit whatever the count.
   */
  webResults: number | null;
  /**
   * What Nemesis says. Present even when it also acts: acting silently reads as a bug, and the
   * owner's example ("alright.") is a turn that speaks and acts at once.
   */
  say: string;
  then: TurnAction;
  /**
   * The subject this turn is about, or null when it has none.
   *
   * 🔴 IT IS ALSO THE OFFER GATE. A plain answer shows a "Learn this" button, and under "Hello.
   * What can I do for you?" that button had nothing to start — it appeared because the code asked
   * "was there a question?" rather than "is there a subject?". The model already knows which, and
   * a null topic is the answer to the second question.
   */
  topic: string | null;
  offer: TurnOffer | null;
}

/** Everything the canvas already knows, stated as facts for the model to reason over. */
export interface TurnContext {
  /**
   * Today, as the learner's browser sees it.
   *
   * 🔴 PASSED IN, NEVER READ HERE, so the packet stays a pure function of its inputs. And it is
   * carried at all because the model does not have one: measured 2026-08-18, "what day is it?" came
   * back as a confident, invented date. That is a listed acceptance case, and an answer that is
   * plausible and wrong is worse than one that says it does not know.
   */
  today: string;
  canvasTitle: string;
  /** How many sources are attached. */
  sources: number;
  /** How many passages the study document holds. */
  passages: number;
  /**
   * Is the teaching policy contributing anything right now.
   *
   * 🔴 THIS IS CONTEXT, NOT AN OVERRIDE, AND THAT IS A DELIBERATE CHANGE. The old file treated
   * "a lesson is running" as a hard rule that every utterance belonged to the lesson, with one
   * carve-out for a hardcoded utility list — so `hello` mid-session was hijacked exactly like
   * `hello` on the front door. The tight invariant (a question is visibly awaiting an answer) is
   * owned upstream by `composerIntent` and never reaches this file. What is left is broad enough
   * to be true while the learner is merely reading, and a broad fact belongs in the packet rather
   * than in a branch.
   *
   * 🔴 A BOOLEAN, NOT THE ACTION'S NAME. `retrieve`, `show_correction` and `recognise` are internal
   * identifiers for how a question is staged; none of them changes whether "hello" is a greeting,
   * and putting one in a prompt would leak vocabulary the model would then try to speak.
   */
  lessonInProgress: boolean;
  /** Objectives this canvas holds, and how many the learner has demonstrated. */
  objectives: number;
  demonstrated: number;
  /** Excerpts from the attached material. Empty when there is none. */
  materialContext: string;
  /**
   * The passage the learner has highlighted, or empty when they have highlighted nothing.
   *
   * 🔴 IT IS WHAT MAKES "this" RESOLVABLE. A staged passage plus a typed sentence used to be read
   * by `/^(where|which source|what source)\b/i`: three openers answered beside the passage, and
   * everything else was treated as an instruction to EDIT it. So "is this the same as what we did
   * last week?" silently rewrote the paragraph the learner was asking about. The passage is a fact
   * the canvas holds; what the learner wants done with it is a reading, and this is what lets the
   * model make it.
   */
  stagedPassage: string;
  /** Formatted live web results, when a search ran. Empty when it did not. */
  webContext: string;
  /**
   * How many more searches this turn may still run.
   *
   * 🔴 STATED TO THE MODEL RATHER THAN ENFORCED BEHIND ITS BACK. Deciding it has enough to answer
   * is the model's judgement (owner: "deepseek should decide itself when it has enough information
   * to answer"), and the loop stops when it stops asking. This number exists only so a turn cannot
   * run away — and a model that is TOLD the budget can spend its last search on the best query it
   * has, where one that is silently cut off has already wasted it.
   */
  searchesLeft: number;
  /**
   * The conversation so far, oldest first, learner and Nemesis alternating.
   *
   * 🔴 BOUNDED, AND BOTH SIDES. The canvas used to keep the learner's last six utterances in a ref
   * for thread detection and send NONE of them to the model: every conversational turn was
   * literally stateless, which is why "why?" and "no, I meant the first one" could not work. It is
   * bounded rather than complete because a whole session in every packet is a cost with no
   * matching benefit; six exchanges is enough for a pronoun to resolve.
   */
  history: readonly TurnExchange[];
}

export interface TurnExchange {
  /** What the learner said. */
  said: string;
  /** What Nemesis said back. Empty when Nemesis acted instead of speaking. */
  replied: string;
}

/** How many exchanges ride in the packet. */
export const HISTORY_TURNS = 6;

/**
 * The one semantic identity.
 *
 * 🔴 IT REPLACES `canvas-chat.ts`'s OWN SYSTEM PROMPT RATHER THAN SITTING BESIDE IT. Two prompts
 * describing the same Nemesis is how they drift into two personalities, and the product only has
 * one. The plain-reply rules that prompt carried (no heading, no lesson framing, no em dash, never
 * assume the learner's field) are kept here verbatim in effect, because they were right.
 */
const NEMESIS_SYSTEM = [
  "You are Nemesis, an academic operating system a learner talks to. You work in every field: law, "
  + "engineering, history, nursing, computer science, a trade. Never assume the learner's discipline "
  + "or level beyond what this conversation tells you.",

  "Behave like a person in ordinary conversation. A greeting is a greeting, a complaint is a "
  + "complaint, a joke is a joke, and a question about the date is a question about the date. Do "
  + "not turn small talk into a lesson and do not answer with study-app boilerplate.",

  "When learning IS what the learner wants, take the fastest honest path to them actually knowing "
  + "the thing: explain when explaining helps, test when testing helps, name a missing prerequisite "
  + "when one is in the way. Do not drill someone who has already shown they know something, and do "
  + "not pad an answer to look thorough.",

  "Use the attached material faithfully when it is relevant, and say plainly when something is not "
  + "in it. You may also answer from what you know: this reply is not limited to the attached "
  + "material, and a question outside it should still get a real answer. When live web results are "
  + "supplied, use them for anything time-sensitive and cite the numbered result inline like this: [1].",

  "Keep continuity. Earlier turns of this conversation are given to you; resolve references like "
  + "\"why?\", \"that one\", \"keep going\" or \"no, I meant the first one\" against them rather than "
  + "asking the learner to repeat themselves.",

  "Write plainly and as short as the turn allows. No heading, no bullet list of learning points, no "
  + "closing offer to help further, no unearned enthusiasm. Never use an em dash character; use a "
  + "comma, a colon, or a new sentence instead.",
].join("\n\n");

/**
 * The action vocabulary, stated to the model in the same message that carries the utterance.
 *
 * 🔴 IT DESCRIBES WHAT EACH CHOICE DOES TO THE PAGE, not what it is called internally. A model
 * choosing between "reply" and "study" needs to know that one of them takes over the screen.
 */
const DECISION_CONTRACT = [
  "Answer with a single JSON object and nothing else:",
  "",
  '{"say": "...", "then": "reply" | "study" | "rewrite", "topic": "..." | null, "offer": "returning" | "reasoning" | null, '
  + '"needsWeb": true | false, "webQuery": "..." | null, "webResults": <number> | null}',
  "",
  '"say" is what Nemesis says out loud. Always write something, even when you also act.',
  "",
  '"then" is what happens to the canvas:',
  '  "reply" changes nothing on the page. The learner gets your sentence and the canvas stays as it '
  + "is. This is the right choice for almost everything: greetings, small talk, complaints, "
  + "acknowledgements, and ordinary questions the learner just wants answered.",
  '  "study" hands the turn to the learning system, which takes over the canvas. Choose it when the '
  + "learner has asked to be taught, tested, quizzed, drilled or walked through something, when they "
  + "have named material to work through, or when they have asked for the study document itself to "
  + "be written or changed. On a canvas that has already begun this steers the existing lesson "
  + "rather than starting a new one. Keep \"say\" to a few words here, since the canvas is about to "
  + "change underneath it.",
  '  "rewrite" fixes the passage the learner is reading, in place. Choose it when they are telling '
  + "you the MATERIAL failed: it is too dense, pitched wrong, or they do not follow it. They may say "
  + "so as an instruction or as a complaint, and both mean the same thing. Do not choose it for a "
  + "question about a term or an idea, however confused it sounds: that wants an answer beside the "
  + "passage, and answering it changes nothing on the page. Nemesis keeps the old wording and offers "
  + "to put it back, so rewriting is reversible; stacking another explanation underneath the passage "
  + "they already could not read is not. Keep \"say\" to a few words here.",
  "",
  // 🔴 THE MODEL WAS REFUSING TO STUDY AN EMPTY CANVAS, AND IT WAS RIGHT TO FROM WHAT IT KNEW.
  // Measured 2026-08-18 against the real model: "teach me innate immunity" on a fresh canvas came
  // back as a friendly question, 0 of 4 explicit learning requests started anything. The state block
  // truthfully says no material is attached, and without this sentence the only sensible reading of
  // that is "there is nothing here to teach from". `begin()` searches for material on the topic and
  // ingests it through the ordinary source door; the model simply had not been told.
  "An empty canvas is not a reason to refuse. Choosing \"study\" with a topic makes Nemesis go and "
  + "find material on it and build the session from that, so a named subject with nothing attached "
  + "is still a workable study turn.",
  "",
  // 🔴 ON EVERY TURN THAT HAS ONE, NOT ONLY ON A STUDY TURN. It is also what the "Learn this"
  // button under a plain answer would start, and whether a turn HAS a nameable subject is the
  // honest test for whether that button belongs there at all. Under "hello" it does not.
  '"topic" is the subject this turn is about, whenever the learner named one. On a "study" turn it '
  + 'is what gets taught; on a "reply" it is what a Learn this button beside the answer would start, '
  + "so give it for a real question about a subject and leave it null for a greeting, a remark or "
  + "anything with no subject in it.",
  "",
  '"needsWeb" is true when answering well depends on something that changes or that you could not '
  + "have memorised: recent or ongoing events, current prices, standings, releases, versions, laws, "
  + "guidelines, schedules, anything the learner says is new or has changed, or a specific source "
  + "they want read. It is false for settled knowledge, explanations, definitions, calculations, "
  + "translations, and anything answerable from the attached material. Searching costs money and "
  + "time, so when it is genuinely borderline, say false.",
  "",
  // 🔴 THE MODEL DECIDES WHEN IT HAS ENOUGH, WHICH MEANS IT HAS TO BE ABLE TO SAY "NOT YET". A
  // single upfront count was still a guess made blind: nothing has been read at the moment it is
  // chosen. This is the half that makes it a judgement rather than a bet.
  "When results are already in this packet, you have searched once. Say false if they answer the "
  + "question. Say true AGAIN, with a different webQuery, if they did not: because the first search "
  + "was aimed wrong, because they disagree and you want to see which is right, or because they "
  + "opened something you now need to look up. Everything you have found so far stays in front of "
  + "you, so a second search adds to it rather than replacing it. Stop as soon as you can answer "
  + "properly; do not keep searching to be thorough.",
  "",
  '"webQuery" is what to type into a search engine, when needsWeb is true. Write it as a search '
  + "rather than as a sentence, and put a date or year in it yourself when recency is the point. "
  + "Null when needsWeb is false.",
  "",
  // 🔴 NO CEILING IS QUOTED. Naming one makes it the answer to every question — a model told "up
  // to 50" asks for 50 every time. What it needs is the trade, not a number.
  '"webResults" is how many pages to read, when needsWeb is true. Ask for what the question '
  + "actually needs: a definition or a single current fact settles in a handful of pages, while a "
  + "comparison across sources, a contested question, or anything where you want to see whether "
  + "sources agree needs many more. Reading more costs no extra search, only the room they take up "
  + "in your context. Null when needsWeb is false.",
  "",
  '"offer" says why a learner reading a plain answer might be shown a Learn this button. Use '
  + '"returning" when they keep circling the same subject across turns, "reasoning" when they are '
  + "working something out rather than asking for a fact. Use null on nearly every turn; it is a "
  + "remark about the conversation, never a judgement about the learner.",
  "",
  // 🔴🔴 AN ORDERED PROCEDURE, NOT A PILE OF MAXIMS, AND THE ORDER IS MEASURED. Three earlier
  // drafts each fixed one direction and broke the other, because the two rules genuinely conflict
  // for a broad request:
  //
  //   · an unqualified "when in doubt, reply" suppressed explicit teaching too — 0 of 4 requests
  //     started anything, and "help me understand this" chose conversation 3 runs out of 3;
  //   · "if you are asking a question back, reply" fixed a real defect (measured in the browser,
  //     "I'm studying pharmacology" came back as a chatty question AND took the canvas over on
  //     turn 2 of the owner's own example) and immediately re-broke the explicit asks, which the
  //     model answers by asking which part first.
  //
  // Numbering them resolves it: the explicit case is settled before the question-back rule is ever
  // consulted, so neither has to be softened to accommodate the other.
  "Decide in this order.",
  "",
  "0. Is the learner saying the material in front of them failed, rather than asking a question "
  + "about it? Then \"rewrite\". This is settled first because a confused learner and a curious one "
  + "sound alike, and the difference is whether the PAGE is the problem or the SUBJECT is.",
  "",
  "1. Did the learner, in this message, ask to be taught, tested, quizzed, drilled or walked "
  + "through something, ask for help understanding something, or ask for the study document itself "
  + "to be written or changed? Then \"study\". Go ahead with what they said: do not ask which part "
  + "first and do not ask them to narrow it down, because the learning system asks better questions "
  + "than you can from here. Keep \"say\" to a few words.",
  "",
  "2. Otherwise \"reply\". A greeting, a remark, a complaint, an acknowledgement, or a question "
  + "they simply want answered all change nothing on the page. \"then\" is not about whether the "
  + "message mentions a subject, which nearly everything said to Nemesis does; it is about whether "
  + "the canvas should change right now. If you get here and find yourself asking the learner a "
  + "question back, that settles it: you cannot ask someone what they want and take the screen over "
  + "in the same turn. Starting a lesson for someone who said hello is the most annoying thing this "
  + "product can do.",
].join("\n");

/** The canvas's own state, written as facts rather than as instructions. */
export function stateBlock(context: TurnContext): string {
  const lines: string[] = [];
  if (context.today) lines.push(`Today is ${context.today}.`);
  if (context.canvasTitle.trim()) lines.push(`This canvas is called "${context.canvasTitle.trim()}".`);
  lines.push(
    context.sources > 0
      ? `${context.sources} source${context.sources === 1 ? "" : "s"} attached.`
      : "No material attached yet.",
  );
  lines.push(
    context.passages > 0
      ? `The study document holds ${context.passages} passage${context.passages === 1 ? "" : "s"}.`
      : "The study document is empty, so this canvas has not begun teaching.",
  );
  if (context.lessonInProgress) lines.push("A lesson is in progress on this canvas right now.");
  if (context.webContext.trim()) {
    lines.push(
      context.searchesLeft > 0
        ? `Web results from your earlier searches are below. You may run ${context.searchesLeft} more `
          + `${context.searchesLeft === 1 ? "search" : "searches"} this turn if they did not settle the question.`
        : "Web results from your earlier searches are below, and no further search is available this "
          + "turn. Answer from what you have, and say plainly what it did not settle.",
    );
  }
  if (context.stagedPassage.trim()) {
    lines.push(
      "The learner has highlighted this passage, so anything they say now is most likely about it:\n"
      + context.stagedPassage.trim(),
    );
  }
  if (context.objectives > 0) {
    lines.push(`${context.demonstrated} of ${context.objectives} things to learn have been demonstrated.`);
  }
  return lines.join("\n");
}

/**
 * The packet. Pure, so what the model is asked can be checked without a model in the loop — the
 * same split `canvas-prompts.ts` and `composer-intent.ts` already use.
 */
export function turnRouterMessages(input: {
  utterance: string;
  context: TurnContext;
  /** Extra rules the caller owns, e.g. which source wins when they disagree. */
  sourceRule?: string;
}): WireMsg[] {
  const { context, utterance } = input;
  return [
    { content: [NEMESIS_SYSTEM, input.sourceRule].filter(Boolean).join("\n\n"), role: "system" },
    {
      content: "NEMESIS STATE. These are facts about the canvas, not something the learner said.\n\n"
        + stateBlock(context),
      role: "system",
    },
    ...(context.materialContext.trim()
      ? [{
        content:
          "ATTACHED COURSE OR ASSESSMENT MATERIAL. This is source context, not something the learner "
          + "said in their message.\n\n"
          + context.materialContext.trim(),
        role: "system" as const,
      }]
      : []),
    ...(context.webContext.trim()
      ? [{
        content:
          "PROVISIONAL EXTERNAL EVIDENCE retrieved live for this turn. This is source context, not "
          + "something the learner said or has demonstrated knowing.\n\n"
          + context.webContext.trim(),
        role: "system" as const,
      }]
      : []),
    // 🔴 REAL ALTERNATING TURNS, NOT A SUMMARY OF THEM. A pronoun resolves against a conversation;
    // it does not resolve against a paragraph describing one. Nemesis's own past turns go in as the
    // plain sentence the learner actually saw rather than as the envelope it arrived in, because
    // that is what the learner is referring back to.
    ...context.history.slice(-HISTORY_TURNS).flatMap((exchange): WireMsg[] => [
      { content: exchange.said, role: "user" },
      ...(exchange.replied.trim() ? [{ content: exchange.replied, role: "assistant" as const }] : []),
    ]),
    { content: `${utterance}\n\n---\n${DECISION_CONTRACT}`, role: "user" },
  ];
}

function asAction(value: unknown): TurnAction | null {
  return value === "reply" || value === "study" || value === "rewrite" ? value : null;
}

function asOffer(value: unknown): TurnOffer | null {
  return value === "returning" || value === "reasoning" ? value : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Read the model's decision, or null when there is nothing usable in it.
 *
 * 🔴 NULL IS A REAL ANSWER AND THE CALLER MUST NOT INVENT ONE. A missing or unrecognised `then` is
 * not silently promoted to "study": the caller treats an unreadable decision as conversation,
 * which is the cheap failure. A decision that says "study" but is otherwise empty is still a
 * decision, so `say` is allowed to be blank there and the canvas simply transitions.
 */
export function readTurnDecision(raw: string): TurnDecision | null {
  const parsed = extractJson(raw);
  if (!parsed) return null;
  const then = asAction(parsed.then);
  const say = asText(parsed.say);
  // Neither field survived, so there is no decision here — only text that happened to be JSON.
  if (!then && !say) return null;
  return {
    needsWeb: parsed.needsWeb === true,
    offer: asOffer(parsed.offer),
    // 🔴 THE FALLBACK IS "reply", NOT "study". See the header: the expensive mistake is teaching
    // somebody who did not ask to be taught, and a model that answered in prose instead of JSON
    // has told us nothing about which one this is.
    say,
    then: then ?? "reply",
    topic: asText(parsed.topic) || null,
    // A query without a search is dropped: the half that spends money loses the contradiction.
    webQuery: parsed.needsWeb === true ? asText(parsed.webQuery) || null : null,
    webResults: parsed.needsWeb === true && typeof parsed.webResults === "number"
      && Number.isFinite(parsed.webResults) && parsed.webResults >= 1
      ? Math.floor(parsed.webResults)
      : null,
  };
}

/**
 * What the learner is shown when the model produced prose instead of a decision.
 *
 * 🔴 THE PROSE IS THE ANSWER. A model that ignored the envelope and simply answered the question
 * has still answered the question, and throwing that away to show an error would be strictly worse
 * for the learner than showing it. Only genuinely empty text has nothing to fall back to.
 */
export function decisionOrReply(raw: string): TurnDecision | null {
  const read = readTurnDecision(raw);
  if (read) return read;
  const prose = raw.trim();
  if (!prose) return null;
  return { needsWeb: false, offer: null, say: prose, then: "reply", topic: null, webQuery: null, webResults: null };
}
