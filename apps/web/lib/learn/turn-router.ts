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
import { readClarifyQuestion, type UserQuestion } from "./clarify-question";

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
  | "study";

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
  /**
   * A decision Nemesis needs from the learner before this turn can finish, or null when it does not
   * need one. Null on nearly every turn.
   *
   * 🔴🔴 IT SITS BESIDE `then`, IT IS NOT A VALUE OF IT, AND THAT IS THE WHOLE PLACEMENT ARGUMENT.
   * `then` answers one question — does the page change? — and the header above says a third value
   * would only ever be a third word for one of the two doors. Asking is not a third door: it is
   * either of the two, PARKED. `{then: "study", question: …}` is "I am going to teach this, once
   * you tell me which kind", and the caller runs the same "study" it would have run, afterwards.
   * A `"clarify"` action would have forced every consumer to learn a third destination and then
   * work out which of the two real ones to run when the answer came back.
   *
   * 🔴 WHICH MEANS THE PARKING IS THE CALLER'S, NOT THE MODEL'S. Nothing here defers anything. The
   * canvas holds the decision, shows the card, and re-runs `then` when the answer lands — and when
   * it cannot host a card right now (an answer is already owed to a real question), it drops this
   * field and runs `then` immediately. Going ahead is always a legal reading of a clarification.
   */
  question: UserQuestion | null;
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
  /** Formatted live web results, when a search ran. Empty when it did not. */
  webContext: string;
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
  /**
   * Decisions the learner has already made this sitting, in answer to questions Nemesis itself
   * asked. Empty on nearly every turn. See `clarify-question.ts`.
   *
   * 🔴🔴 IT IS HERE SO THE MODEL STOPS ASKING, AND THAT IS THE WHOLE JOB. A clarification the model
   * cannot see on the next turn is a clarification it will ask again, and a product that asks the
   * same question twice is worse than one that never asked: the first ask reads as care, the second
   * reads as not listening. The contract tells it not to re-ask; this is what makes that
   * instruction possible to obey.
   *
   * 🔴 SEPARATE FROM `history` BECAUSE IT IS NOT SOMETHING ANYONE SAID. The exchanges are a
   * conversation and pronouns resolve against them. This is a settled fact about what to build, and
   * it stays true for the rest of the sitting no matter how far back the exchange that produced it
   * scrolls out of the bounded window.
   */
  clarified: readonly string[];
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

  // 🔴🔴 THE CANVAS CAN DRAW A MOLECULE, AND UNTIL THIS LINE EXISTED THE MODEL HAD NO WAY TO KNOW.
  // Reported 2026-08-20: "i asked it to create the chemical structures using the new tools we gave
  // it", and it answered "Alcohol: R-OH (hydroxyl group)" in prose. `ChemicalStructure` had been
  // rendering SMILES for weeks — from the TEACHING path only — so the capability was real, reachable
  // by code, and invisible to the one participant who decides whether to use it.
  //
  // 🔴 IT SAYS WHEN NOT TO, TOO. A drawing of `CCO` beside the words "ethanol is CCO" teaches
  // nothing that the words did not; the picture earns its place when the SHAPE is the lesson.
  // Without that clause the cheapest way to look helpful is to draw everything.
  // 🔴 THE ONE-LINE FORM IS THE ONE IT IS TOLD ABOUT, AND THAT IS A MEASURED CHOICE. The first
  // version described a fenced block; driven twice in a browser, the model answered in prose both
  // times. `say` is a STRING INSIDE A JSON OBJECT and the contract demands strict JSON, so a fence
  // needs literal newlines and backticks inside that string and the model steers away. A bracketed
  // token costs it nothing. The parser accepts both.
  "You can DRAW a molecule, not only describe one. Write [smiles: CCO] inline in your answer, with "
  + "the SMILES after the colon, and the canvas replaces it with a real structural diagram exactly "
  + "where you put it. Use [reaction: A>>B] for a reaction. Draw when the shape is the point, and "
  + "whenever a learner asks to be SHOWN a structure. Keep writing the prose around it as normal, "
  + "and do not draw something whose shape adds nothing to the sentence beside it.",

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
  '{"say": "...", "then": "reply" | "study", "topic": "..." | null, "offer": "returning" | "reasoning" '
  + '| null, "question": {...} | null}',
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
  '"offer" says why a learner reading a plain answer might be shown a Learn this button. Use '
  + '"returning" when they keep circling the same subject across turns, "reasoning" when they are '
  + "working something out rather than asking for a fact. Use null on nearly every turn; it is a "
  + "remark about the conversation, never a judgement about the learner.",
  "",
  // 🔴🔴 THE GATE IS COST OF BEING WRONG, NOT VAGUENESS, AND THAT IS THE OWNER'S OWN CORRECTION
  // (2026-08-22): *"it should ask when the result is a course structure etc. ... it shouldnt always
  // ask for things like throwaway questions for a websearch."*
  //
  // An earlier draft of this gate said "ask when an unresolved decision would materially change
  // what you are about to build OR SAY", which reads sensibly and is wrong in a way that produces
  // exactly the behaviour he named. Almost every vague utterance would change what gets SAID —
  // "tell me about enzymes" could be a paragraph on catalysis or a paragraph on kinetics — so a
  // model obeying that sentence asks a clarifying question before answering a one-line factual
  // question. The learner wanted a sentence and got a form.
  //
  // 🔴 VAGUENESS IS NOT THE TRIGGER, BECAUSE PEOPLE ARE VAGUE AND THAT IS FINE. The trigger is what
  // the turn is about to PRODUCE. A sentence is disposable: guess, and a learner who wanted the
  // other reading simply asks again, one turn lost. A course is structural: it retitles their
  // canvas, picks a scope, orders a curriculum and gets taught for days, and the way out of a wrong
  // one is to throw the work away. Same vagueness, two completely different costs of guessing.
  //
  // 🔴 SO THE GATE IS TIED TO `then`, WHICH IS THE ONE FACT THAT ALREADY DISTINGUISHES THEM. It is
  // not a new judgement the model has to make on top of the one it is already making, and it is
  // enforced in `readTurnDecision` rather than merely requested here — see that function.
  '"question" pauses this turn to get one decision from the learner. Whatever you put in "then" '
  + "happens once they have answered, so it is not a way to avoid deciding what this turn is. Use "
  + "null on nearly every turn.",
  "",
  "🔴 ONLY EVER ASK ON A \"study\" TURN. On a \"reply\" you are producing a sentence, and a "
  + "sentence is cheap to get wrong: guess the most useful reading, answer it, and let the learner "
  + "redirect you in one line. Never hold up an answer to ask which kind of answer they wanted. A "
  + "\"study\" turn is different, because it BUILDS something: it takes over the canvas, fixes a "
  + "scope, orders a curriculum and gets taught for days, and the only way out of the wrong one is "
  + "to throw the work away.",
  "",
  "On a \"study\" turn, ask only when the request could honestly become several genuinely "
  + "different courses and you cannot tell which. If the learner's words, the attached material or "
  + "the earlier turns point at one of them, take it and go ahead. Never ask about something you "
  + "could adjust later just as easily, and never ask a learner to confirm what they have already "
  + "told you.",
  "",
  "\"teach me biology\" or \"create a course on biology\" is worth a question: general biology, "
  + "cell and molecular biology and human biology are different courses, and building the wrong one "
  + "wastes days. \"teach me Python\" is too, because programming fundamentals, data analysis and "
  + "automation are different courses. \"teach me my cardiovascular lectures for the exam on "
  + "Friday\" is not: the subject, the material and the goal are all there, so asking would only "
  + "delay them. And \"what does osmolarity mean\", \"what is the half-life of caffeine\" or "
  + "\"whats the latest news on ai\" are never worth one, however loosely they are phrased: those "
  + "are answers, and an answer that missed the point costs one more sentence.",
  "",
  "When you do ask, the shape is:",
  '  {"id": "course-depth", "prompt": "How deep should this course go?", "options": [{"id": "survey",'
  + ' "label": "Overview", "description": "The major ideas, without going deeply technical."}, {"id":'
  + ' "academic", "label": "Academic", "description": "Comparable to a college course."}],'
  + ' "allowOther": true}',
  "",
  "Two to four options, each a real alternative somebody would pick on purpose. Do not pad to four: "
  + "three is a complete answer and so is two. Give every option a short \"description\" saying "
  + "what choosing it means, keep \"prompt\" to one plain question, and set \"allowOther\" to "
  + "false only when the options really are the whole space. Ask at most one question at a time, and "
  + "when the learner has just answered one, do not ask another: go and do the thing.",
  "",
  "Keep \"say\" to a sentence at most when you ask, and do not repeat the question inside it. The "
  + "learner is about to read the question itself on a card underneath.",
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
  "1. Did the learner, in this message, ask to be taught, tested, quizzed, drilled or walked "
  + "through something, ask for help understanding something, or ask for the study document itself "
  + "to be written or changed? Then \"study\". Go ahead with what they said: do not ask which part "
  + "first and do not ask them to narrow it down, because the learning system asks better questions "
  + "than you can from here. Keep \"say\" to a few words.",
  "",
  // 🔴🔴 MEASURED 2026-08-20, BASELINE 6/8 ON THIS EXACT SET. "show me functional groups" started a
  // LESSON: the canvas was retitled, four web pages were searched and ingested, and the owner
  // watched "Reading that page…" while waiting for a list he could have read in ten seconds.
  //
  // 🔴 THE ASYMMETRY IS THE ARGUMENT, AND IT IS WHY THIS SITS INSIDE STEP 1 RATHER THAN AFTER IT.
  // Choosing "reply" wrongly costs one sentence and the learner asks again. Choosing "study"
  // wrongly costs minutes, retitles their canvas and takes the screen. Where the two readings are
  // close, the cheap mistake is the right one to make.
  "   Two phrasings do NOT belong in step 1, and they are the only exceptions to it. \"show me X\", "
  + "\"what are the X\", \"list the X\", \"give me the X\" and \"which X are there\" ask for the "
  + "information itself, in your answer, right now. Those are \"reply\", and the answer must "
  + "actually contain the thing rather than asking which part they meant. Everything else in step 1 "
  + "is unchanged: \"teach me\", \"walk me through\", \"help me understand\", \"quiz me\" and \"test "
  + "me\" are all still \"study\", including when they name the same subject a \"show me\" would "
  + "have.",
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
    ...(context.clarified.length > 0
      ? [{
        content:
          "DECISIONS THE LEARNER HAS ALREADY MADE, in answer to questions you asked earlier. These "
          + "are settled. Do not ask about them again.\n\n"
          + context.clarified.join("\n"),
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
  return value === "reply" || value === "study" ? value : null;
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
  // 🔴 A QUESTION IS NOT ENOUGH TO BE A DECISION ON ITS OWN. It parks a turn; a parked turn with no
  // turn behind it is a card the learner answers into nothing. Read it, but let the same two fields
  // as before decide whether there was a decision here at all.
  const asked = readClarifyQuestion(parsed.question);
  // Neither field survived, so there is no decision here — only text that happened to be JSON.
  if (!then && !say) return null;
  // 🔴🔴 A CLARIFICATION ON A "reply" TURN IS DROPPED, AND THIS IS THE OWNER'S RULE MADE STRUCTURAL
  // RATHER THAN REQUESTED (2026-08-22): *"it should ask when the result is a course structure etc.
  // ... it shouldnt always ask for things like throwaway questions for a websearch."*
  //
  // The gate is the COST OF GUESSING WRONG, not how vague the learner was. People are vague and
  // that is fine. A "reply" produces a sentence, and a sentence guessed wrong costs one more turn:
  // the learner says "no, the other thing" and gets it. A "study" turn BUILDS — it takes the
  // canvas, fixes a scope, orders a curriculum — and the way out of the wrong one is to bin the
  // work. Identical vagueness, two costs that are nowhere near each other.
  //
  // 🔴 IT IS ENFORCED HERE BECAUSE THE PROMPT ALONE CANNOT HOLD IT. Asking is the cheapest way for
  // a model to look careful, "would this change what I say?" is true of nearly every loose
  // question, and one drifting sentence in a long contract is all it takes to put a card in front
  // of "what is the half-life of caffeine". Dropping it costs nothing: `then` still runs, so the
  // learner gets their answer instead of a form.
  const question = then === "study" ? asked : null;
  return {
    offer: asOffer(parsed.offer),
    question,
    // 🔴 THE FALLBACK IS "reply", NOT "study". See the header: the expensive mistake is teaching
    // somebody who did not ask to be taught, and a model that answered in prose instead of JSON
    // has told us nothing about which one this is.
    say,
    then: then ?? "reply",
    topic: asText(parsed.topic) || null,
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
  // 🔴 NO QUESTION IS EVER INVENTED HERE. A model that answered in prose asked for nothing, and
  // manufacturing a card from text nobody parsed would park a turn behind a choice the model never
  // offered — the same class of mistake as promoting an unreadable decision to "study".
  return { offer: null, question: null, say: prose, then: "reply", topic: null };
}
