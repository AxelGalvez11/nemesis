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

import { MAX_REPLY_VISUALS, replyVisuals } from "./reply-visuals";
import type { CanvasVisualRequest } from "./canvas-visual";
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
   * Figures this turn wants to draw, already validated, in the order `[figure n]` counts into.
   *
   * 🔴 REPORTED 2026-08-20: *"i thought we integrated the new chem draw and math plot abilities but
   * it says it still cant."* It could not, and it was right to say so. `SemanticVisual` renders
   * nine kinds, and until now a REPLY could reach exactly one of them — a molecule, through
   * `[smiles: …]`. Asked for a plot, the model correctly reported a capability it did not have.
   *
   * A model cannot fit a plot in a bracketed token, so structure rides here and only POSITION
   * rides in `say`. Empty on nearly every turn.
   */
  visuals: readonly CanvasVisualRequest[];
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
  "You can DRAW, not only describe. A molecule fits in the line itself: write [smiles: CCO] inline "
  + "and the canvas replaces it with a real structural diagram exactly where you put it, or "
  + "[reaction: A>>B] for a reaction.",

  // 🔴 THE OTHER EIGHT ARE NEW HERE, 2026-08-20, AND THEY ARE WHY THE MODEL USED TO REFUSE. It was
  // told about one kind and had one channel, so "plot this" got an honest "I can't" out of a
  // renderer that has drawn plots for weeks. A capability the model is not told about does not
  // exist, however completely it is built.
  "For anything with structure — a plot, a diagram, a table, a timeline, a geometric construction, "
  + "a force diagram, an equation, a traced snippet of code — put the figure in the \"visuals\" "
  + "array and write [figure 1], [figure 2] inline where each one belongs. Every kind takes "
  + "\"kind\" and \"learningGoal\", plus its own fields: quantitative (series of {x,y} points, "
  + "xLabel, yLabel), relationship (nodes, edges), table (columns, rows), timeline (events), "
  + "construction (points, segments), vectors (vectors, bodyLabel), equation (latex), code "
  + "(language, source, trace). At most " + String(MAX_REPLY_VISUALS) + " per answer.",

  "Draw when the shape, the trend or the arrangement is the point, and whenever the learner asks "
  + "to be SHOWN something. Keep writing the prose around it as normal, and do not draw something "
  + "that adds nothing to the sentence beside it.",

  "Keep continuity. Earlier turns of this conversation are given to you; resolve references like "
  + "\"why?\", \"that one\", \"keep going\" or \"no, I meant the first one\" against them rather than "
  + "asking the learner to repeat themselves.",

  // 🔴 REPORTED 2026-08-20: *"why are nemesis's responses so short, is there a prompt telling it to
  // give short answers?"* There was, and this is it. It read "write plainly and as short as the
  // turn allows", which was written to stop cheerful padding and did — along with the working.
  //
  // 🔴 THE OLD RULE MADE BREVITY THE GOAL, WHICH IS THE WRONG TARGET. Asked to integrate x², the
  // model returned the answer and no derivation, because the shortest true response to "integrate
  // x²" is "x³/3 + C" and it had been told to be short. The learner wanted the steps. Length is
  // not a virtue or a vice; it is a function of what the question needs, and that is what this now
  // says. The padding clauses survive verbatim, because they were never the problem.
  "Give the question the length it needs, the way a good explanation does. Work through a "
  + "derivation, a proof, a calculation or a procedure step by step, showing the intermediate "
  + "steps rather than only the result. Use headings, short lists or a table when the material "
  + "genuinely has that shape. Answer a small question in a sentence.",

  "No closing offer to help further, no restating the question back, no unearned enthusiasm, no "
  + "summary of what you are about to say. Never use an em dash character; use a comma, a colon, "
  + "or a new sentence instead.",
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
  '{"say": "...", "then": "reply" | "study", "topic": "..." | null, "offer": "returning" | "reasoning" | null, "visuals": [...]}',
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
  // Neither field survived, so there is no decision here — only text that happened to be JSON.
  if (!then && !say) return null;
  return {
    offer: asOffer(parsed.offer),
    // 🔴 THE FALLBACK IS "reply", NOT "study". See the header: the expensive mistake is teaching
    // somebody who did not ask to be taught, and a model that answered in prose instead of JSON
    // has told us nothing about which one this is.
    say,
    then: then ?? "reply",
    topic: asText(parsed.topic) || null,
    // Refused figures are dropped here, never repaired — see `replyVisuals`.
    visuals: replyVisuals(parsed.visuals),
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

  // 🔴🔴 AN ENVELOPE THAT DID NOT PARSE MUST NOT BE SHOWN AS THE ANSWER, AND IT WAS BEING. Measured
  // in a browser 2026-08-20: a turn whose JSON was broken by literal newlines printed
  // `{"say": "∫ 𝑥 2 …", "then": "reply", "topic": "integration"}` on screen, verbatim. The rule
  // above — "the prose IS the answer" — is right for a model that IGNORED the envelope and simply
  // answered. It is exactly wrong for one that ATTEMPTED it and mangled it: that text is
  // machinery, and no learner should ever read the word "topic" in a reply.
  //
  // 🔴 THIS IS PROTOCOL PARSING, NOT LANGUAGE UNDERSTANDING — it reads our own output format after
  // `JSON.parse` has already refused it, which is the one category where matching literal syntax
  // is the right tool rather than a heuristic standing in for meaning.
  if (looksLikeEnvelope(prose)) {
    const salvaged = salvageSay(prose);
    return salvaged ? { offer: null, say: salvaged, then: "reply", topic: null, visuals: [] } : null;
  }
  return { offer: null, say: prose, then: "reply", topic: null, visuals: [] };
}

/** Did the model try to answer in our format and fail? Both marks are required, so ordinary prose
 *  ABOUT JSON — a learner asking what an object literal is — is not mistaken for a broken turn. */
function looksLikeEnvelope(prose: string): boolean {
  return prose.startsWith("{") && /"(?:say|then)"\s*:/.test(prose);
}

/**
 * The sentence out of a broken envelope, when one can be recovered without guessing.
 *
 * 🔴 IT RETURNS NULL RATHER THAN A BEST EFFORT. The reason the parse failed is that the string
 * contents are untrustworthy; a partial recovery risks presenting half a sentence, or one ending
 * mid-symbol, as the considered answer. `null` reaches the caller's ordinary "that turn did not
 * work" path, which the learner can act on.
 */
function salvageSay(prose: string): string | null {
  const opened = prose.indexOf('"say"');
  if (opened < 0) return null;
  const colon = prose.indexOf(":", opened + 5);
  if (colon < 0) return null;
  const quote = prose.indexOf('"', colon + 1);
  if (quote < 0) return null;
  // Up to the next quote followed by a comma or a closing brace — the shape a value ends with.
  // Anything else means the string ran into the structure and is not recoverable.
  const closing = /"\s*[,}]/.exec(prose.slice(quote + 1));
  if (!closing) return null;
  const value = prose.slice(quote + 1, quote + 1 + closing.index).replace(/\\n/g, " ").replace(/\s*\n\s*/g, " ").trim();
  return value.length >= 12 ? value : null;
}
