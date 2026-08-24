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
import { readMilestones } from "./turn-preview";
import type { CanvasVisualRequest } from "./canvas-visual";
import { extractJson } from "./canvas-parse";
import { readClarifyQuestion, type UserQuestion } from "./clarify-question";
import { MEMORY_KINDS, MEMORY_STATEMENT_LIMIT, type MemoryKind } from "./learner-memory";

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
 * 🔴 `TurnOffer` WAS DELETED HERE ON 2026-08-20, AND IT HAD BEEN DEAD FOR HOURS BEFORE ANYONE
 * NOTICED. It named why a learner might be shown a "Learn this" button, and rendered as one line of
 * copy above it. That offer was removed the same day — the owner asked about it twice — and the
 * whole chain behind it kept running: the model was still asked to compute `offer` on every turn,
 * `readTurnDecision` still parsed it, `use-canvas-session` still stored it on the aside, and
 * `offerLine` was still IMPORTED by `learning-canvas.tsx` and never called.
 *
 * Found by grepping the LIVE bundle for "Learn this" after the deploy, which is the only instrument
 * that sees this class of drift: a prompt is shipped text that nothing renders, so no screenshot
 * and no unit test looks at it.
 *
 */
/**
 * One durable fact about the learner, as they said it.
 *
 * 🔴 THE KIND IS THE SCHEMA'S, THE SENTENCE IS THE LEARNER'S. `MemoryKind` is a closed set of
 * four in `learner-memory.ts`; anything outside it is dropped rather than coerced, because a
 * kind nobody recognises is a row the Settings screen cannot file under any heading.
 */
export interface RememberedFact {
  readonly kind: MemoryKind;
  readonly statement: string;
}

/** The most facts one turn may produce. A turn that "remembers" eight things has summarised the
 *  conversation rather than noticed something durable in it. */
export const REMEMBER_LIMIT = 3;

export interface TurnDecision {
  /**
   * The learner asked to be CHECKED on what this canvas has taught them.
   *
   * 🔴🔴 A PHRASE, NEVER A BUTTON, AND §38 IS THE REASON THIS FIELD EXISTS AT ALL. §38 bans
   * learner-facing controls that steer the learning machine and names the banned ones outright —
   * *"quiz me, test me, easier, harder"* — then says exactly where a test request DOES belong:
   *
   *     "If the learner wants to say 'test me on this again', that is A PHRASE TO THE COMPOSER,
   *      not a control."
   *
   * So this is the phrase path made real. There is no `ComposerCapability` for a test, there is no
   * chip in the `+` menu, and `test-run.test.ts` holds both of those absences. The owner's
   * instruction — *"the 'tests' are supposed to be in chat chips for users to click through"* —
   * is about how a test is ANSWERED (clickable options in the chat) and not about a button that
   * starts one.
   *
   * 🔴 IT IS NOT A MODE AND CANNOT BECOME ONE. It describes THIS submission, exactly as
   * `curriculumFor` does, and nothing carries it to the next turn. A test is one bounded run that
   * ends in a score; it does not change what Nemesis teaches afterwards or how.
   *
   * 🔴 AND IT DOES NOT FORCE A TEST TO EXIST. `buildTestRun` still refuses when the material
   * cannot carry honest questions — an objective whose wrong options would have to be invented is
   * left off, and too few survivors means no test at all. This field says what was asked for; the
   * material decides whether it can be given.
   *
   * 🔴 THE MODEL READS THE SENTENCE, A WORD LIST DOES NOT. The same argument `needsWeb` records
   * below: "test me", "can you check I've got this", "give me some practice", and the same request
   * in any other language are all this, and no keyword list has ever caught the third one. See
   * `no-scripted-intent.test.ts`.
   */
  wantsTest: boolean;
  /**
   * Things worth remembering about this learner beyond this canvas.
   *
   * 🔴🔴 FACTS THE LEARNER STATED, NEVER INFERENCES ABOUT THEM. "I have a contract law final on
   * the 14th" is a fact they said out loud. "Struggles with abstraction" is a judgement about a
   * person, and a learning app that quietly accumulates those has become something else. The
   * contract paragraph says so to the model; `readRemembered` caps the shape here so a drifting
   * sentence cannot turn one turn into a dossier.
   *
   * 🔴 EVERY LINE IS SHOWN TO THE LEARNER VERBATIM in Settings, and can be deleted with one
   * press. That is the whole reason this may exist at all: memory the subject can read and
   * remove is a feature, memory they cannot is surveillance.
   *
   * 🔴 EMPTY ON ALMOST EVERY TURN, AND THAT IS THE EXPECTED SHAPE. Most messages contain nothing
   * durable. A model that fills this every turn produces a memory nobody can navigate, which is
   * the same failure as remembering nothing.
   */
  remember: readonly RememberedFact[];
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
   * How recent the pages have to be, when `needsWeb`. Null means any age will do.
   *
   * 🔴 RECENCY IS A PROPERTY OF THE QUESTION, NOT OF THE WORDS IN IT. "What is the current
   * inflation rate" and "what did inflation do in 2019" both name inflation and want opposite
   * things from the archive. Brave has had a `freshness` filter the whole time and nothing in this
   * product had ever set it, so a question about this week was answered from pages of any age.
   *
   * 🔴 NOT THE SAME AS PUTTING A YEAR IN `webQuery`. A year is a hint the ranker may overrule; a
   * freshness window is applied by the index before ranking. The vocabulary is validated in the
   * search function, which is the only place that knows what Brave accepts.
   */
  webFreshness: string | null;
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
  /**
   * What Nemesis will be doing at each stage of this turn, in the learner's words.
   *
   * 🔴🔴 THE SANITISED SUMMARY, WRITTEN BY THE PARTICIPANT THAT CAN SANITISE IT. Owner, 2026-08-21:
   * *"internal reasoning → sanitized progress summary → UI"*, and *"do not expose reasoning_content
   * directly to the user."* Paraphrasing a chain of thought in code would produce a chain of thought
   * with the hedging stripped out, which is worse rather than safer. The model writes these FOR a
   * learner, so nothing internal has to be translated at all.
   *
   * 🔴 ONE PER STAGE, AND A STAGE IS ENTERED ONLY BY SOMETHING HAPPENING. `turn-preview.ts` indexes
   * these by stage rather than consuming them in order: a turn that never searches never shows the
   * line written for searching, however confidently the model wrote it. That is what keeps this out
   * of the territory `thinking-phases.ts` bans — a plausible sequence on a timer.
   *
   * 🔴 EMPTY ON MOST TURNS, WHICH IS THE OWNER'S FIRST RULE: *"for a simple conversational response,
   * do not show a thinking preview, answer immediately."* A greeting that flashes a line about
   * planning teaches the learner that the preview means nothing.
   */
  milestones: readonly string[];
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
  /**
   * The subject the learner asked to have PLANNED OUT as a persistent course, as opposed to asked
   * about. Null on almost every turn.
   *
   * 🔴 NOT A FOURTH `TurnAction`, AND THAT IS THE WHOLE SAFETY ARGUMENT. `asAction` stays a
   * three-value whitelist and `readTurnDecision`'s fallback stays `reply` — a field that FORCED
   * `study` would be a bypass wearing a hint's clothes. A course request usually rides a `study`
   * turn, and the canvas applies the plan AFTER doing exactly what the turn would have done anyway,
   * which is what keeps it a scope change rather than a mode.
   *
   * 🔴 A SUBJECT, NOT AN INSTRUCTION. No operation, no difficulty, no strategy, no task form, no
   * surface and no engine name may ever ride here. If its effect can be described as "run the
   * policy differently", it is the arm picker this file's header forbids.
   *
   * 🔴🔴 ONLY BEHIND THE COURSE CHIP — owner ruling, 2026-08-23, after watching production: *"The
   * course mode's only supposed to be for when a user wants to create the actual course. It's not
   * supposed to run the whole research from just me saying, teach me this. What the heck?"* This
   * field originally had a second door — the model reading plain language as wanting a course —
   * and that door is what turned "teach me" over an attached PDF into a minutes-long web research
   * pass and a retitled canvas the learner never asked for. A course build is the most expensive,
   * most visible thing a turn can trigger, and the one honest signal that the learner wants it is
   * the declaration they made at the composer: the chip. Plain words that sound like wanting a
   * course get a SENTENCE pointing at the chip, never a build.
   *
   * 🔴 ENFORCED BY `courseGate`, NOT ONLY REQUESTED HERE. The contract tells the model the rule;
   * the gate makes a leak unreachable — the same split `question` uses one field down.
   */
  curriculumFor: string | null;
  /**
   * A decision Nemesis needs from the learner before this turn can finish, or null when it does not
   * need one. Null on nearly every turn.
   *
   * 🔴🔴 IT SITS BESIDE `then`, IT IS NOT A VALUE OF IT, AND THAT IS THE WHOLE PLACEMENT ARGUMENT.
   * `then` answers one question — does the page change? — and the header above says a new value
   * would only ever be another word for one of the existing doors. Asking is not a door: it is
   * one of them, PARKED. `{then: "study", question: …}` is "I am going to teach this, once you
   * tell me which kind", and the caller runs the same "study" it would have run, afterwards. A
   * `"clarify"` action would have forced every consumer to learn a new destination and then work
   * out which real one to run when the answer came back.
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
   * What Nemesis remembers about this learner from earlier sessions, already rendered.
   *
   * 🔴 A STRING, ALREADY FORMATTED BY `memoryBlock`, AND THAT IS DELIBERATE. This module does not
   * know what a memory row is and must not learn: it takes a block of prose exactly as it takes
   * `materialContext` and `webContext`. Empty means nothing is known, and nothing is emitted.
   */
  memory: string;
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
  /**
   * The learner attached the Course capability to THIS submission — an explicit declaration that
   * they want a persistent learning path, made at the composer boundary the way a file is attached.
   *
   * 🔴 A FACT ABOUT THE REQUEST, NOT AN OVERRIDE. `lessonInProgress` is the template: a broad fact
   * belongs in the packet, and what it MEANS stays the model's reading. The declaration removes
   * ambiguity about what the learner wanted; it does not remove the model's judgement about whether
   * it can be done — an ambiguous subject still comes back as a question, and a bare category still
   * gets the WHICH-SUBJECT refusal.
   */
  courseRequested: boolean;
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
  "You can DRAW, not only describe. A molecule fits in the line itself: write [smiles: CCO] inline "
  + "and the canvas replaces it with a real structural diagram exactly where you put it, or "
  + "[reaction: A>>B] for a reaction.",

  // 🔴🔴 REPORTED 2026-08-21: *"nemesis is still not using smiles to represent orgo chemical
  // structures … asking 'show me basic functional groups' should indicate that user wants to see
  // the structure."* It does not, and the reason is not reluctance — it is that the answer to that
  // question has no specific molecule in it. A functional group is a FRAGMENT with an open bond,
  // chemistry writes the open end as `R`, and `R-OH` is the worst input this pipeline can receive:
  //
  //     validateStructure("smiles", "R-OH")  → ok       (R, O and H are all alphabet letters)
  //     SmilesDrawer.Parser.parse("R-OH")    → SyntaxError: Expected "*", "B", "C", … but "R" found
  //     SmilesDrawer.Parser.parse("*O")      → parses, and draws
  //
  // It passes every check this codebase makes and then dies at the depiction library, so the model
  // gets no signal, learns nothing from the attempt, and answers "Alcohol: R-OH (hydroxyl group)"
  // in prose the next time — which is the exact string that was reported a second time.
  //
  // 🔴 SO THIS IS A NOTATION FACT, NOT A SUBJECT RULE (§41). `*` is how SMILES spells an attachment
  // point, the same kind of fact as `\frac` being how LaTeX spells a fraction. Nothing here names
  // chemistry as a discipline Nemesis favours; it tells the model how to write the thing it is
  // already allowed to draw.
  "A group with an open attachment point — a functional group, a side chain, a monomer, any "
  + "fragment a chemist would write with an R — uses \"*\" where the rest of the molecule would "
  + "continue: [smiles: *O] is an alcohol, [smiles: *C(=O)O] a carboxylic acid, [smiles: *C(=O)N] "
  + "an amide, [smiles: *C#N] a nitrile. \"R\" is not a SMILES atom, so [smiles: R-OH] draws "
  + "nothing at all. When the learner asks to see a family of groups, draw each one.",

  // 🔴🔴 §42's RULE, AND UNTIL 2026-08-21 NOTHING OBEYED IT. `chem-resolver.ts` was built, tested
  // and merged with one dev-only caller, so every molecule Nemesis had ever drawn was one the model
  // REMEMBERED. §42 is explicit about why that is the dangerous case: a remembered SMILES is
  // usually right, carries no signal when it is not, and one wrong atom draws a clean, confident
  // picture of a different compound. A wrong plot looks wrong; a wrong molecule looks like
  // chemistry.
  //
  // 🔴 AND IT IS ADDITIVE, BECAUSE A GENERIC GROUP HAS NO NAME. `*O` is every alcohol and no
  // database holds it. So the model is told which channel fits which case rather than being pushed
  // off the one that was just made to work.
  "When the molecule has a NAME, write [compound: aspirin] instead of writing the notation "
  + "yourself. The structure is looked up in a chemical database and drawn from what comes back, "
  + "which is more reliable than notation recalled from memory. Use [smiles: …] for generic groups, "
  + "fragments and anything a database would not hold under a name.",

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

  // 🔴🔴 §45 SHIPPED THIS AND NOTHING COULD REACH IT. The expression evaluator, the distribution
  // maths and the curve builder were built, hardened against a real sandbox-escape probe, tested
  // and merged — and §45's status line said so plainly for two days: "NO LESSON EMITS ONE YET."
  // The plot renderer even carried a comment about colouring a curve split by a pole, for curves
  // nothing could produce. The missing piece was never maths: it was somewhere for the model to
  // write `x^2` instead of a hundred and sixty coordinate pairs, and being told it may.
  //
  // 🔴 AND THE FUNCTION LIST IS `expression.ts`'s OWN ALLOW LIST, stated rather than left to be
  // discovered. A model that reaches for `integrate(...)`, gets no curve and is told nothing learns
  // that plotting does not work — which is exactly how chemistry lost three reports to `R-OH`.
  "A plotted series may give a FORMULA instead of points: {\"label\":\"sin x\",\"expression\":\"sin(x)\","
  + "\"from\":0,\"to\":6.28} is evaluated by trusted code and drawn as a smooth curve, and "
  + "{\"label\":\"IQ\",\"distribution\":{\"shape\":\"normal\",\"mean\":100,\"sd\":15},\"from\":55,\"to\":145} "
  + "draws a density curve. Write the formula rather than listing points whenever the shape comes "
  + "from one. A formula may use + - * / ^ ( ), pi and e, and these functions: abs acos asin atan "
  + "cbrt ceil cos cosh exp floor ln log log2 max min round sign sin sinh sqrt tan tanh. "
  + "Distributions are normal (mean, sd), uniform (from, to), binomial (trials, probability) and "
  + "poisson (rate). Nothing else runs, and anything else draws no curve.",

  "Draw when the shape, the trend or the arrangement is the point, and whenever the learner asks "
  + "to be SHOWN something. Keep writing the prose around it as normal, and do not draw something "
  + "that adds nothing to the sentence beside it.",

  // 🔴🔴 MEASURED ON PRODUCTION 2026-08-20, AND THE MODEL'S OWN CLOSING LINE IS THE EVIDENCE.
  // Asked to show the structure of ethanol it drew this, in a code block:
  //
  //       H   H
  //       |   |
  //   H — C — C — O — H
  //       |   |
  //       H   H
  //
  // ...and finished with *"if you want it as a proper structural diagram in the canvas, just say
  // the word."* It KNEW the real channel existed and picked characters anyway, so this is not a
  // capability gap and no amount of describing `[smiles: …]` more clearly would have caught it.
  // The instruction it was missing is the negative one.
  //
  // 🔴 A CODE BLOCK IS NOT BANNED, ONLY A PICTURE MADE OF CHARACTERS. Real code and real notation
  // still belong in fences — `reply-visuals.ts` deliberately leaves any fence it does not
  // understand in the prose for exactly that reason.
  // 🔴 THE FIRST VERSION OF THIS SAID "a code fence is for code, never for a drawing", AND THE
  // MODEL PUT THE ASCII ART IN PROSE INSTEAD. Measured, 3 runs: it drew a real structure once. The
  // clause was true and aimed at the wrong container — where the characters sit was never the
  // point. So this names the ACT, in any container, and then names the one case that has to be
  // unambiguous rather than merely discouraged.
  "Never draw a picture out of text characters, anywhere in your answer — not in a code fence, not "
  + "in the prose, not indented. No ASCII diagrams, no molecules built from dashes and pipes, no "
  + "plots made of spaces. A code fence is for code and notation, never for a drawing.",

  // 🔴 THIS NAMES THE CHANNEL, NOT THE SUBJECTS. It used to list "a molecule, a structure, a
  // functional group or a compound" — four nouns I happened to think of, which is a keyword list
  // living in a prompt instead of in an `if`. Whether a request is asking to SEE something is a
  // judgement about language, and the model is what this product uses to make those.
  //
  // 🔴🔴 BUT THE IMPERATIVE STAYS, AND REMOVING IT WAS MEASURED AS A REGRESSION. Rewriting this as
  // a description — "the drawing IS the answer" — dropped a single structure from 3 of 3 runs to 2
  // of 3, and "draw the functional groups" from drawing to 0 of 2, answering with a tab-separated
  // table instead. The owner's correction was about hardcoded JUDGEMENT (my quota, my noun list),
  // not about force: the model decides WHETHER this is a request to see something and HOW MANY
  // pictures it needs, and is told firmly what to do once it has decided. Those are different
  // things and only one of them was the problem.
  "When the learner is asking to see something rather than read about it, you MUST draw it with "
  + "[smiles: …] rather than describe it. Spelling a structure out in characters, or listing it in "
  + "a table, is answering a different question.",

  // 🔴🔴 A CAPABILITY AND AN INTENT, NOT A QUOTA — owner correction, 2026-08-20: *"dont add
  // hardcoded instructions, make sure prompt instructions drive behavior so deepseek handles the
  // judgement."*
  //
  // The first version of this said "draw the most important half dozen", which is MY taste about
  // how many drawings a screen should hold, written as a rule the model has to obey. How many
  // pictures an answer needs is exactly the sort of judgement that depends on the question — three
  // functional groups and fifteen are different answers — and the model is the participant that can
  // see which one was asked.
  //
  // So this states what it CAN do and what the learner asked FOR, and stops there.
  "You can draw more than one thing in an answer: each [smiles: …] costs a line, and several in one "
  + "reply is normal. Use as many as the answer actually needs.",

  // 🔴🔴 THE INSTRUCTION WITHOUT WHICH §43 AND §47 STAY UNREACHABLE. A router that speaks a target
  // -language sentence in a named variety, an Azure integration with a queryable catalogue of four
  // hundred voices, and a `/api/speech/tts` that refuses to guess an accent — all built, none of it
  // reachable, because a reply was a string and a string has no locale. The capability the model was
  // never told about did not exist, however completely it was built. Same lesson as `[figure n]`,
  // learned again.
  //
  // 🔴 THE MODEL STATES THE VARIETY, WHICH IS THE WHOLE DESIGN. The alternative was detecting it
  // from the characters, and a detector that guesses `es-ES` for a Mexican lesson teaches the wrong
  // accent with nothing on screen to say so. The participant that chose the sentence is the one
  // that knows what it is.
  "You can make a sentence HEARD, not only written. Write [say: es-MX | Buenos días] inline and the "
  + "canvas mounts that sentence with a play button, spoken by a voice chosen for that exact "
  + "variety. The tag is BCP-47 — language then region: es-MX, es-ES, fr-FR, de-DE, ja-JP. Name the "
  + "variety you are actually teaching, because es-MX and es-ES differ in precisely the things a "
  + "pronunciation drill is about and the learner has no way to hear that they got the wrong one.",

  // 🔴 THE CHANNEL, NOT A SUBJECT LIST — the same correction the drawing instruction already took
  // (owner, 2026-08-20). "Sound is the material" is true of a language lesson and equally true of a
  // case name, a drug name and a technical term, and a rule that named languages would be a
  // discipline hardcoded into a prompt.
  "Use it whenever how something SOUNDS is part of what you are teaching: a phrase in a language "
  + "being learned, a term the learner asked how to pronounce, two words that differ only in "
  + "stress. This is not a language-lesson feature — a case name, a drug name, an anatomical term "
  + "or a foreign phrase in any field all qualify.",

  // 🔴 A SYNTHESISER READS WHAT IS BETWEEN THE PIPE AND THE BRACKET, LITERALLY. Quotation marks are
  // said aloud, a parenthesised translation is said aloud, and a phonetic respelling is said as
  // nonsense. `canvas-speech.ts` already refuses notation for exactly this reason; this is the same
  // rule stated where the text is written rather than where it is rejected.
  "Only the utterance goes inside the token — no quotation marks, no translation, no notes, no "
  + "phonetic respelling. The translation, the gloss and your own explanation belong in the prose "
  + "beside it, where the learner reads them. Do not use it for a sentence they only need to read, "
  + "and never for your own explanation: Nemesis already speaks that in its own voice.",

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
  // 🔴🔴🔴 THE PROSE LEFT THE JSON, 2026-08-20, AND THIS IS THE WHOLE REASON MATHS AND CHEMISTRY
  // CAN RENDER AT ALL.
  //
  // `say` used to be a STRING INSIDE THIS OBJECT. A model answering "integrate x²" writes
  // `\int x^2\,dx = \frac{x^3}{3} + C`, and inside a JSON string every one of those backslashes
  // has to be doubled. `\i` and `\,` are not valid JSON escapes, so a single missed doubling made
  // `JSON.parse` refuse the ENTIRE decision — the routing, the topic, everything — and the raw
  // envelope fell through onto the learner's screen. Measured twice.
  //
  // The model's own workaround was to stop writing notation: told nothing, it answered in Unicode
  // (`∫x² dx = x³/3 + C`), which is readable and is NOT typeset. The owner asked for rendering, and
  // no amount of prompting gets reliable backslash-doubling out of a language model.
  //
  // So the envelope now carries only the DECISION — short enums and a topic, none of which ever
  // contains a backslash — and the answer is written after it as ordinary text. `$$…$$` and
  // `[smiles: …]` cost the model nothing there, and KaTeX and the structure drawer have been
  // waiting on the other side of `AssistantMarkdown` the whole time.
  "Answer with a fenced JSON block for the decision, then your answer as ordinary text after it:",
  "",
  "```json",
  '{"then": "reply" | "study" | "rewrite", "topic": "..." | null, "milestones": ["..."],'
  + ' "needsWeb": true | false, "webQuery": "..." | null, "webResults": <number> | null,'
  + ' "webFreshness": "pd" | "pw" | "pm" | "py" | null, "question": {...} | null,'
  + ' "wantsTest": true | false, "remember": [{"kind": "subject" | "deadline" | "preference" | "context", "statement": "..."}],',
  // 🔴 THE FIELD IS SHOWN FILLED IN, AND THAT IS THE FIX RATHER THAN A FLOURISH. It read
  // `"visuals": []` — an empty array, in the highest-signal position in the whole contract — and
  // the model obliged on every single turn. Measured: asked to plot y = x², it wrote the answer,
  // typeset the coordinates, wrote `[figure 1]` in the right place, and sent `visuals: []`. It had
  // understood the marker and been shown that the payload is empty.
  ' "visuals": [{"kind": "quantitative", "learningGoal": "…", "xLabel": "x", "yLabel": "y",',
  '   "series": [{"label": "y = x²", "points": [{"x":0,"y":0},{"x":1,"y":1},{"x":2,"y":4}]}]}]}',
  "```",
  "Then the answer itself, in plain markdown. Everything outside the block is what Nemesis says out "
  + "loud, so always write something, even when you also act.",
  "",
  // 🔴 THE PAYOFF, STATED WHERE THE MODEL WILL SEE IT. Outside the JSON there is no escaping to get
  // wrong, so this instruction is finally safe — it was removed twice for breaking whole turns.
  "Because your answer is outside the JSON, write mathematics as real LaTeX: $$ … $$ on its own "
  + "line for a displayed equation, $ … $ inline. Do not substitute Unicode symbols for it. The "
  + "canvas typesets it.",
  "",
  '"then" is what happens to the canvas:',
  '  "reply" changes nothing on the page. The learner gets your sentence and the canvas stays as it '
  + "is. This is the right choice for almost everything: greetings, small talk, complaints, "
  + "acknowledgements, and ordinary questions the learner just wants answered.",
  '  "study" hands the turn to the learning system, which takes over the canvas. Choose it when the '
  + "learner has asked to be taught, tested, quizzed, drilled or walked through something, when they "
  + "have named material to work through, or when they have asked for the study document itself to "
  + "be written or changed. On a canvas that has already begun this steers the existing lesson "
  + "rather than starting a new one. Keep your answer to a few words here, since the canvas is "
  + "about to change underneath it.",
  '  "rewrite" fixes the passage the learner is reading, in place. Choose it when they are telling '
  + "you the MATERIAL failed: it is too dense, pitched wrong, or they do not follow it. They may say "
  + "so as an instruction or as a complaint, and both mean the same thing. Do not choose it for a "
  + "question about a term or an idea, however confused it sounds: that wants an answer beside the "
  + "passage, and answering it changes nothing on the page. Nemesis keeps the old wording and offers "
  + "to put it back, so rewriting is reversible; stacking another explanation underneath the passage "
  + "they already could not read is not. Keep your answer to a few words here.",
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
  // 🔴 THIS NO LONGER DESCRIBES A BUTTON, BECAUSE THE BUTTON IS GONE. It read "what a Learn this
  // button beside the answer would start" — accurate when written, and stale the moment that offer
  // was deleted on 2026-08-20. Found by grepping the LIVE bundle for "Learn this" after the deploy,
  // which is the only way this kind of drift ever surfaces: the prompt is shipped text that nothing
  // renders, so no screenshot and no unit test can catch it describing a product that changed.
  //
  // The field itself is unchanged and still earns its place: whether a turn NAMED a subject is what
  // `learnFromAside` starts when the learner asks to be taught it, and it is the honest test that
  // kept "hello" from being treated as a topic.
  // 🔴🔴 THESE ARE SHOWN WHILE THE TURN RUNS, WHICH IS WHY THEY ARE BOUNDED SO HARD. They are the
  // only strings in this contract a learner reads BEFORE the answer, and therefore the easiest
  // place for a model to describe a system that is not there. `turn-preview.ts` refuses a line that
  // carries a percentage, a step number, a token count or our own vocabulary, and refuses any line
  // mentioning a search on a turn that bought none. What survives is a milestone, not a log.
  '"milestones" is 1-4 short lines, in order, saying what you will be DOING at each stage of this '
  + "turn. They are shown one at a time beside the Nemesis character while the learner waits, and "
  + "each one appears only when that stage actually begins. Write them for the learner, in your own "
  + "words, about their subject: \"Comparing your notes with the current guidance\", \"Checking the "
  + "latest treatment recommendations\". Four to twelve words each, conversational, no percentages, "
  + "no step numbers, no counts, no jargon, and never the word \"thinking\". The order is: what you "
  + "are doing first; what you do while searching (only if needsWeb is true); what you do with what "
  + "you find; how you finish. Give an empty array for anything you can simply answer, which is "
  + "most turns.",
  "",
  '"topic" is the subject this turn is about, whenever the learner named one. On a "study" turn it '
  + "is what gets taught; on a \"reply\" it is what Nemesis would teach if the learner then asked to "
  + "learn it. Give it for a real question about a subject and leave it null for a greeting, a "
  + "remark or anything with no subject in it.",
  "",
  // 🔴🔴 MEASURED ON PRODUCTION 2026-08-23, AND THE PRODUCT APOLOGISED FOR IT IN ITS OWN WORDS. A
  // learner attached a whole-course drug-chart PDF and said, in effect, "teach me this". The
  // excerpts the packet carries begin where the document begins, the model named the subject off
  // the first charts it could see, and the canvas — whose name IS the study turn's topic — was
  // retitled "asthma and COPD". Two turns later Nemesis itself had to say: *"this canvas was
  // labeled 'asthma and COPD' when you never asked for that."* The SOURCE header has carried the
  // document's own title the whole time; what was missing is the instruction to weigh it over the
  // sample, and the stake — the rename — stated where the choice is made.
  'On a "study" turn the topic also becomes the canvas\'s name. When what the learner wants taught '
  + "IS the material they attached, the topic is what the WHOLE attachment covers — the source's "
  + "own title above usually says it best — never the subsection the excerpts happen to begin "
  + "with. Excerpts are a sample of the document, and a canvas named after one chapter of it is "
  + "named wrong.",
  "",
  // 🔴 THE BORDERLINE CASE SEARCHES, AND THAT IS AN OWNER DECISION (2026-08-21: *"make it search
  // when unsure, remove the 'costs money and time' it should be able to search web"*). This
  // sentence used to read *"Searching costs money and time, so when it is genuinely borderline, say
  // false"* — so a coin-flip question was answered from training data, and the whole point of
  // letting the model decide was to stop answering current questions from stale memory.
  //
  // 🔴 IT IS ONLY THE TIE-BREAK THAT MOVED. The false list above is untouched and is what actually
  // does the work: an explanation, a definition, a calculation, a translation and anything the
  // attached material answers are all still false, and none of those are borderline. What flipped
  // is the residue — the questions where the model genuinely cannot tell — and on those a wrong
  // "false" is invisible to the learner while a wrong "true" costs a search.
  '"needsWeb" is true when answering well depends on something that changes or that you could not '
  + "have memorised: recent or ongoing events, current prices, standings, releases, versions, laws, "
  + "guidelines, schedules, anything the learner says is new or has changed, or a specific source "
  + "they want read. It is false for settled knowledge, explanations, definitions, calculations, "
  + "translations, and anything answerable from the attached material. When it is genuinely "
  + "borderline, say true. An answer built on pages that exist beats one built on a memory nobody "
  + "can date, and the learner cannot tell the two apart.",
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
  // 🔴 A FILTER, NOT A HINT. Putting a year in the query asks the ranker nicely; this is applied
  // by the index before ranking, so it is the only one of the two that can actually exclude a page.
  '"webFreshness" is how recent the pages have to be, when needsWeb is true: "pd" for the last day, '
  + '"pw" the last week, "pm" the last month, "py" the last year. Use it when an older page would be '
  + "WRONG rather than merely less interesting: a price, a standing, a score, a version, a rule that "
  + "was amended, anything still unfolding. Leave it null everywhere else, including for most "
  + "questions about the past, where a narrow window would hide the source that actually explains "
  + "it. When in doubt, null: an old page you can judge beats no page at all.",
  "",
  // 🔴🔴 THE CHIP IS THE ONLY DOOR — owner ruling, 2026-08-23, watching production: *"The course
  // mode's only supposed to be for when a user wants to create the actual course. It's not
  // supposed to run the whole research from just me saying, teach me this."* This paragraph used
  // to offer a second door ("or their own words ask for one"), and that door is what read "teach
  // me" over an attached PDF as a course order: a minutes-long research pass and a retitled canvas
  // out of an ordinary study turn. `courseGate` enforces what this paragraph asks for.
  //
  // 🔴 A SUBJECT THE PLANNER CAN LOOK UP, NOT A RESTATEMENT OF THE SENTENCE. The same reason
  // `topic` is "the model's subject or nothing": a canvas called "teach me innate immunity" is the
  // measured failure this vocabulary exists to prevent.
  '"curriculumFor" names the subject when the learner has attached Course to this message — the '
  + "canvas facts above say so when they have. That chip is an explicit order for a persistent "
  + "learning path through a subject over time, and it is the ONLY thing that makes this field "
  + "non-null. Without it, this is null on every turn, however much their words sound like wanting "
  + 'a course: "teach me X", "walk me through X properly", even "make me a plan for X" are study '
  + "or reply turns, not course orders — do the turn, and when a full course genuinely seems to be "
  + "what they want, say in one line that the Course button under + will build one. When the chip "
  + 'IS attached, name the subject the path should cover, as a subject ("organic chemistry"), '
  + 'never their sentence back at them. It rides WITH your other answers: a course request is '
  + 'usually also "study". The WHICH-SUBJECT rule applies here unchanged — a category with no '
  + "member chosen is a question back, not a plan — and if they asked an ordinary question, this "
  + "is null even with the chip attached.",
  "",
  // 🔴🔴 THIS IS §38's PHRASE PATH, WRITTEN OUT. The contract bans a "test me" BUTTON and then
  // says the request belongs in words instead. There is no chip for this and there must never be
  // one — `test-run.test.ts` holds that absence — so this paragraph is the only way a learner can
  // ever ask to be checked.
  '"wantsTest" is true when the learner is asking to be CHECKED on material this canvas has '
  + 'already taught them, rather than taught something new: "test me on this", "can you check I '
  + 'actually know this", "give me some practice questions", "quiz me before my exam". Read what '
  + "they mean, not the words they used — the same request in any language, and phrased any way, "
  + "is this. It rides WITH your other answers and is only ever true on a \"study\" turn.",
  "",
  // 🔴 THE THREE REFUSALS ARE STATED SO THE MODEL DOES NOT PROMISE WHAT THE CANVAS CANNOT DELIVER.
  // `buildTestRun` is the authority and it refuses freely; a reply that has already said "here are
  // ten questions" before that refusal lands is the mismatch this paragraph prevents.
  // 🔴🔴 THE LEARNER READS EVERY LINE OF THIS BACK, IN SETTINGS, AND DELETES ANY OF IT. That is
  // what makes remembering permissible at all, and it is why the paragraph forbids inference so
  // bluntly: a sentence they recognise is a feature, a judgement about them is not.
  '"remember" is for things about this learner that are still true NEXT WEEK and on a different '
  + 'canvas: what they are studying ("subject"), something with a date ("deadline"), how they have '
  + 'asked to be taught ("preference"), or who they are as a learner where nothing else fits '
  + '("context"). Write each as one short sentence in plain language, because they will be shown '
  + "these sentences and can delete any of them.",
  "",
  "Only what they actually SAID, never what you concluded about them. \"I have a contract law "
  + "final on the 14th\" is a fact they stated. \"Finds abstraction difficult\" is a judgement "
  + "about a person and must never be written. Never record what they got right or wrong — that "
  + "is measured elsewhere, properly. Leave this an empty list on almost every turn: most "
  + "messages contain nothing durable, and a list filled every turn is a memory nobody can read. "
  + "At most three, and never something already in what you know about them above.",
  "",
  "It is false when they are asking to be TAUGHT, when they want to be walked through something, "
  + "or when nothing has been taught on this canvas yet — there is nothing to check. Do not "
  + "promise a number of questions or say what they will cover: the canvas builds the test from "
  + "what it can honestly ask about, and it may find too little and say so. One line is enough.",
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
  // 🔴🔴 MEASURED ON PRODUCTION 2026-08-23, THE OTHER DIRECTION OF THE SAME GATE. Over a
  // seventeen-section drug-chart PDF, Nemesis wrote the whole list into a reply and ended "Which
  // one do you want to start with?" — twice — and the owner's reading was immediate: *"that's
  // when it should have used the chip with the multiple choice."* A pick over how the session
  // proceeds IS the structural case the card exists for; it was falling through because the ask
  // rules above only describe the course-shaped version of it, and a reply-turn question is
  // (rightly) dropped by `readTurnDecision`. So the steering case is named as "study", where the
  // card is allowed — the throwaway-question drop is untouched.
  "A session already underway can need a decision too. When the honest next move is the learner "
  + "picking — which part of their material to take first, what order to go in, how to approach "
  + "the session — that pick is a \"study\" turn with a \"question\": two to four real options "
  + "drawn from their material, allowOther true, never a paragraph that lists everything and ends "
  + "\"which one do you want?\". The card is how a learner picks; prose that asks them to type an "
  + "option back makes them do the card's job by hand.",
  "",
  // 🔴 THE RECONCILIATION IS STATED, NOT LEFT TO THE MODEL. Without this sentence the steering
  // case sits between two older rules that both push it to prose: step 1's "do not ask which part
  // first" and the question-back rule's "asking back means reply" — and a reply-turn question is
  // dropped by `readTurnDecision`, so a model obeying either rule makes the card unreachable
  // exactly where the owner asked for it.
  "That is not what step 1 bans and not what the question-back rule below bans. Step 1 bans "
  + "interrogating someone INSTEAD of starting — when they first name a subject, you still go. The "
  + "question-back rule bans asking in prose while taking the screen. A pick offered through "
  + "\"question\" on a \"study\" turn does neither: the turn is parked, the card is shown, and the "
  + "study you chose runs once they answer.",
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
  "Keep the text after the block to a sentence at most when you ask, and do not repeat the "
  + "question inside it. The learner is about to read the question itself on a card underneath.",
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
  // 🔴🔴 MEASURED IN A BROWSER 2026-08-21, AND IT IS THE ONLY GAP LEFT IN STEP 1. Owner typed "can
  // you teach me a new language". Step 1 fired, correctly — that is a request to be taught — and
  // "do not ask them to narrow it down" is stated without exception, so the model chose "study"
  // with the topic "new language learning". Everything after that followed:
  //
  //   · the canvas was retitled "new language learning";
  //   · `needsGrounding` saw a topic and no material, so it searched the web for that phrase;
  //   · what a search for that phrase returns is advertising, so two marketing pages for a
  //     language app were ingested as the learner's study material;
  //   · the lesson built from them was "Korean, Japanese, French, Spanish, Italian, English,
  //     Chinese → Speak", which is a pricing page's language list, not a thing anyone can learn.
  //
  // 🔴 THE DISTINCTION IS "WHICH PART OF A SUBJECT" versus "WHICH SUBJECT". Step 1's rule is right
  // and stays: asked to teach the Krebs cycle, the model must not ask which enzyme first, because
  // the learning system reads the material and asks better. But "a new language" names a CATEGORY
  // with no member chosen, and there is nothing to read, ground or teach until the learner picks
  // one. Starting anyway does not begin a lesson early; it begins the wrong lesson.
  //
  // 🔴 STATED STRUCTURALLY SO IT HOLDS IN EVERY FIELD. A law student asking to be taught "a case",
  // an engineer "a material", a historian "a period", a nurse "a drug class" are the same shape,
  // and a list of category words would only ever cover the ones I happened to think of.
  "   One exception, and it is about WHICH SUBJECT rather than which part of one. If the learner "
  + "has named a CATEGORY but not a member of it, so that you would have to choose the subject for "
  + "them, that is \"reply\": ask which one, in a sentence. Nemesis goes and finds material on the "
  + "subject you name, so naming it yourself does not start their lesson early, it starts a "
  + "different lesson. Everything else in step 1 is unchanged: a real subject, however broad, is "
  + "still \"study\" and you must not ask them to narrow it.",
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
  + "the canvas should change right now. Starting a lesson for someone who said hello is the most "
  + "annoying thing this product can do.",
  "",
  // 🔴🔴 THIS SENTENCE WAS THE TAIL OF STEP 2 AND IT BELONGS TO EVERY STEP. As a step-2 tiebreaker
  // it was unreachable exactly when it mattered: step 1 settles the explicit asks first and never
  // consults step 2, so the one turn that most needed it — "can you teach me a new language",
  // measured 2026-08-21 — chose "study" AND asked "Which language, and do you have any starting
  // level or goal in mind?" in the same breath.
  //
  // 🔴 AND THE LEARNER SEES BOTH, WHICH IS WHY IT IS NOT MERELY UNTIDY. An owed question is the one
  // thing a reply may not push off the canvas (see `composeSurface`), so the lesson screen and the
  // question stack on one surface and the composer now points at two different things at once.
  "This holds whatever you chose above: if you are asking the learner a question back, \"then\" is "
  + "\"reply\". You cannot ask someone what they want and take the screen over in the same turn — "
  + "they would be looking at a lesson you started and a question you asked, with one box to answer "
  + "both.",
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
  if (context.courseRequested) {
    // 🔴 LEARNER-FACING PROSE, NO INTERNAL IDENTIFIERS — the same rule the whole block obeys, and
    // turn-router.test.ts pins. "Course" is the word on the chip the learner pressed, so it is
    // their vocabulary, not ours.
    lines.push(
      "The learner attached Course to this message: they are explicitly asking for a persistent "
      + "learning path through a subject, not a one-off answer. Read their message as naming what "
      + "that path should cover.",
    );
  }
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
    // 🔴🔴 FACTS ABOUT THE PERSON, LABELLED AS FACTS. The same line every other context block in
    // this packet is held to: it says what is true, never what to do about it. A remembered line
    // that could be read as an instruction ("teach them slowly") is the mode selector §38 bans
    // wearing a memory's clothes — which is why `remember`'s own contract paragraph forbids
    // recording judgements in the first place, upstream of this.
    ...(context.memory.trim()
      ? [{
        content:
          "WHAT YOU ALREADY KNOW ABOUT THIS LEARNER, from earlier sessions on other canvases. Facts "
          + "about them, not instructions to you, and not something they said in this message. They "
          + "can see and delete every line of this.\n\n"
          + context.memory.trim(),
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
  return value === "reply" || value === "study" || value === "rewrite" ? value : null;
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
/** ```json { … } ``` — the decision block, and everything outside it is the answer. */
const DECISION_BLOCK = /```json\s*\n?([\s\S]*?)```/;

/**
 * Read a turn: the decision out of the fenced block, the answer out of everything else.
 *
 * 🔴🔴 THE ANSWER IS TAKEN FROM OUTSIDE THE JSON, WHICH IS THE POINT OF THE FORMAT. It used to be a
 * `say` string INSIDE the object, where every backslash the model wrote had to be doubled — so
 * `\frac` made `JSON.parse` refuse the whole decision and the envelope leaked onto the screen.
 * Out here, `$$\frac{x^3}{3}$$` is just text, and KaTeX renders it.
 *
 * 🔴 PROSE ON BOTH SIDES IS KEPT. A model that writes a sentence, then the block, then the rest is
 * describing the same answer in two halves; dropping either would lose part of it.
 */
/**
 * The milestones this turn may show, or none.
 *
 * 🔴 THE SHAPE CHECKS LIVE IN `turn-preview.ts`, WHICH IS PURE AND HAS NO OPINION ABOUT TURNS. What
 * belongs here is the one judgement that file cannot make: whether this turn is the kind that has
 * stages at all.
 *
 * 🔴 A PLAIN REPLY GETS NONE. `reply` leaves the page exactly as it was and, without a search,
 * finishes in one round — so there is nothing to narrate, and a line announcing one would train
 * learners to ignore the slot. The owner's first rule, enforced where the turn's kind is known.
 */
function milestonesFrom(parsed: Record<string, unknown>, then: TurnAction): readonly string[] {
  const searching = parsed.needsWeb === true;
  if (then === "reply" && !searching) return [];
  return readMilestones(parsed.milestones, searching);
}

/**
 * Read the durable facts off a decision, strictly.
 *
 * 🔴🔴 EVERY GATE HERE IS A GATE ON WHAT MAY BE STORED ABOUT A PERSON, which is why they are
 * refusals rather than repairs. An unknown kind is dropped, not coerced to "context"; an
 * over-long statement is dropped, not truncated mid-sentence into something the learner never
 * said; a non-string is dropped. The cheap failure is forgetting something worth keeping. The
 * expensive one is a memory screen showing a learner a sentence they do not recognise.
 */
function readRemembered(value: unknown): readonly RememberedFact[] {
  if (!Array.isArray(value)) return [];
  const facts: RememberedFact[] = [];
  for (const entry of value) {
    if (facts.length >= REMEMBER_LIMIT) break;
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const kind = typeof row.kind === "string" ? row.kind : "";
    const statement = typeof row.statement === "string" ? row.statement.trim() : "";
    if (!(MEMORY_KINDS as readonly string[]).includes(kind)) continue;
    if (!statement || statement.length > MEMORY_STATEMENT_LIMIT) continue;
    // 🔴 DEDUPED WITHIN THE TURN TOO. One sentence said twice in one message is one fact.
    if (facts.some((fact) => fact.statement.toLowerCase() === statement.toLowerCase())) continue;
    facts.push({ kind: kind as MemoryKind, statement });
  }
  return facts;
}

export function readTurnDecision(raw: string): TurnDecision | null {
  const block = DECISION_BLOCK.exec(raw);
  if (!block) return null;
  const parsed = extractJson(block[1] ?? "");
  if (!parsed) return null;

  const outside = (raw.slice(0, block.index) + "\n" + raw.slice(block.index + block[0].length)).trim();
  // 🔴🔴 A MODEL THAT PUT ITS ANSWER BACK INSIDE THE OBJECT IS STILL ANSWERING, AND THIS COSTS THE
  // LEARNER NOTHING TO ACCEPT. Reproduced on production 2026-08-20: "draw the functional groups"
  // returned "Nemesis had nothing to add." on one run out of two, with an empty canvas behind it.
  //
  // The cause is the format change of the same day. `say` used to live INSIDE this object and the
  // model has years of habit saying so; when it writes the block with a `say` field and puts
  // nothing after it, the prose outside is empty, `decision.say` is empty, and the reply branch
  // reports having nothing to add — while the answer sits in the field right there.
  //
  // 🔴 THE OUTSIDE STILL WINS WHEN BOTH EXIST. Prose outside the block is the contract; this is a
  // fallback for a turn that would otherwise be thrown away, not a second supported shape. LaTeX
  // written into `say` will still be mangled by JSON escaping — which is exactly why the contract
  // moved — so this recovers the turn without making the old shape safe.
  const say = outside || asText(parsed.say);
  const then = asAction(parsed.then);
  // 🔴 A BLOCK WITH NO `then` AND NO ANSWER IS NOT A DECISION. Both empty means the model emitted
  // something JSON-shaped that says nothing, and treating it as a turn would blank the screen.
  // 🔴 A QUESTION IS NOT ENOUGH TO BE A DECISION ON ITS OWN. It parks a turn; a parked turn with no
  // turn behind it is a card the learner answers into nothing. Read it, but let the same two fields
  // as before decide whether there was a decision here at all.
  const asked = readClarifyQuestion(parsed.question);
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
    // 🔴 ONLY ON A "study" TURN, AND FOR THE SAME REASON `question` IS. Being checked on the
    // material IS handing this to the learning system; a "reply" turn that also claimed to want a
    // test would be the model asking for the canvas to be taken over while answering a question.
    // Dropping it costs nothing — `then` still runs and the learner still gets their answer.
    wantsTest: then === "study" && parsed.wantsTest === true,
    remember: readRemembered(parsed.remember),
    needsWeb: parsed.needsWeb === true,
    question,
    say,
    // 🔴 THE FALLBACK IS "reply", NOT "study". The expensive mistake is teaching somebody who did
    // not ask to be taught, and a model that skipped the field has told us nothing about which
    // this is.
    then: then ?? "reply",
    milestones: milestonesFrom(parsed, then ?? "reply"),
    topic: asText(parsed.topic) || null,
    // Refused figures are dropped here, never repaired — see `replyVisuals`.
    visuals: replyVisuals(parsed.visuals),
    // A query without a search is dropped: the half that spends money loses the contradiction.
    webQuery: parsed.needsWeb === true ? asText(parsed.webQuery) || null : null,
    webResults: parsed.needsWeb === true && typeof parsed.webResults === "number"
      && Number.isFinite(parsed.webResults) && parsed.webResults >= 1
      ? Math.floor(parsed.webResults)
      : null,
    // Passed through as text; which windows exist belongs to the search function, which is the one
    // place that talks to the provider. Same contradiction rule: no search, no window.
    webFreshness: parsed.needsWeb === true ? asText(parsed.webFreshness) || null : null,
    // 🔴 A SUBJECT OR NOTHING, AND IT FORCES NO ACTION. `then` above was already decided before
    // this line runs, and nothing here can change it — which is what keeps this a request the
    // canvas may act on rather than a fourth action smuggled around `asAction`'s whitelist.
    curriculumFor: asText(parsed.curriculumFor) || null,
  };
}

/**
 * Drop a course request the learner never made.
 *
 * 🔴🔴 THE CHIP IS THE ONLY DOOR, ENFORCED — owner ruling, 2026-08-23: *"The course mode's only
 * supposed to be for when a user wants to create the actual course. It's not supposed to run the
 * whole research from just me saying, teach me this."* The contract says so too, but a prompt
 * cannot make a leak unreachable (the exact argument `mayAsk` records in use-canvas-session): one
 * enthusiastic reading of "teach me" and the canvas spends minutes researching and retitles
 * itself. This is the same split `question` already uses — requested in the contract, enforced in
 * code — and it is a GATE, not a parser concern: `readTurnDecision` reads what the model said,
 * and whether the learner attached the chip is a fact about the submission the parser never sees.
 *
 * 🔴 EVERYTHING ELSE PASSES UNTOUCHED. The turn still runs exactly as decided — `then`, the
 * answer, the visuals — because a wrongly-claimed course rides BESIDE a turn, never inside it.
 */
export function courseGate(decision: TurnDecision, courseAttached: boolean): TurnDecision {
  if (courseAttached || !decision.curriculumFor) return decision;
  return { ...decision, curriculumFor: null };
}

/**
 * What the learner is shown when the model produced prose instead of a decision.
 *
 * 🔴 THE PROSE IS THE ANSWER. A model that ignored the envelope and simply answered the question
 * has still answered it, and throwing that away to show an error would be strictly worse for the
 * learner. Only genuinely empty text has nothing to fall back to.
 */
export function decisionOrReply(raw: string): TurnDecision | null {
  const read = readTurnDecision(raw);
  if (read) return read;
  const prose = raw.trim();
  if (!prose) return null;

  // 🔴🔴 AN ENVELOPE THAT DID NOT PARSE MUST NOT BE SHOWN AS THE ANSWER, AND IT WAS BEING. Measured
  // 2026-08-20, under the old all-in-one-object format: a turn whose JSON broke printed
  // `{"say": "…", "then": "reply", "topic": "integration"}` on screen, verbatim. The rule above is
  // right for a model that IGNORED the envelope and simply answered, and exactly wrong for one
  // that ATTEMPTED it and mangled it — that text is machinery, and no learner should read the word
  // "topic" in a reply. Kept after the format change, because a model can still reach for the old
  // shape, and because a leak is silent when it does.
  //
  // 🔴 THIS IS PROTOCOL PARSING, NOT LANGUAGE UNDERSTANDING — it reads our own output format after
  // `JSON.parse` has already refused it.
  if (looksLikeEnvelope(prose)) {
    const salvaged = salvageSay(prose);
    return salvaged
      // 🔴 NO MILESTONES ON EITHER, AND NOT AS A FILLER. These are the paths where the model ignored
      // the envelope and simply answered; nothing announced an intention, so there is nothing to
      // show. Inventing a plan here would be the product narrating on the model's behalf.
      ? { curriculumFor: null, milestones: [], needsWeb: false, question: null, say: salvaged, then: "reply", topic: null, remember: [], visuals: [], wantsTest: false, webFreshness: null, webQuery: null, webResults: null }
      : null;
  }
  // 🔴 NO QUESTION IS EVER INVENTED HERE. A model that answered in prose asked for nothing, and
  // manufacturing a card from text nobody parsed would park a turn behind a choice the model never
  // offered — the same class of mistake as promoting an unreadable decision to "study".
  return { curriculumFor: null, milestones: [], needsWeb: false, question: null, say: prose, then: "reply", topic: null, remember: [], visuals: [], wantsTest: false, webFreshness: null, webQuery: null, webResults: null };
}

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
