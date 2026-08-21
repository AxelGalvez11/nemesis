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
  '{"then": "reply" | "study" | "rewrite", "topic": "..." | null,'
  + ' "needsWeb": true | false, "webQuery": "..." | null, "webResults": <number> | null,'
  + ' "webFreshness": "pd" | "pw" | "pm" | "py" | null,',
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
  '"topic" is the subject this turn is about, whenever the learner named one. On a "study" turn it '
  + "is what gets taught; on a \"reply\" it is what Nemesis would teach if the learner then asked to "
  + "learn it. Give it for a real question about a subject and leave it null for a greeting, a "
  + "remark or anything with no subject in it.",
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
  // 🔴 A FILTER, NOT A HINT. Putting a year in the query asks the ranker nicely; this is applied
  // by the index before ranking, so it is the only one of the two that can actually exclude a page.
  '"webFreshness" is how recent the pages have to be, when needsWeb is true: "pd" for the last day, '
  + '"pw" the last week, "pm" the last month, "py" the last year. Use it when an older page would be '
  + "WRONG rather than merely less interesting: a price, a standing, a score, a version, a rule that "
  + "was amended, anything still unfolding. Leave it null everywhere else, including for most "
  + "questions about the past, where a narrow window would hide the source that actually explains "
  + "it. When in doubt, null: an old page you can judge beats no page at all.",
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
  if (!then && !say) return null;
  return {
    needsWeb: parsed.needsWeb === true,
    say,
    // 🔴 THE FALLBACK IS "reply", NOT "study". The expensive mistake is teaching somebody who did
    // not ask to be taught, and a model that skipped the field has told us nothing about which
    // this is.
    then: then ?? "reply",
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
  };
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
      ? { needsWeb: false, say: salvaged, then: "reply", topic: null, visuals: [], webFreshness: null, webQuery: null, webResults: null }
      : null;
  }
  return { needsWeb: false, say: prose, then: "reply", topic: null, visuals: [], webFreshness: null, webQuery: null, webResults: null };
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
