// What a canvas is called when it was never a document.
//
// 🔴🔴🔴 OWNER, 2026-08-26: *"the canvas doesn't rename itself properly. based on the chat's
// content."* Measured before this file existed, and the answer was worse than "badly": a canvas
// born from a conversation was NEVER named. There were exactly two automatic namers in the whole
// product and neither of them can see a conversation.
//
//     mergeSourceIntoCanvas   canvas-store.ts    names it after the first ATTACHED DOCUMENT
//     begin(topic)            the session        names it after a topic string nothing passes
//
// `renameCanvas` has two callers, the sidebar row and the Library row, and both are a learner
// typing. So a canvas opened at /learn and talked to for an hour showed "New canvas" in its header
// and "Untitled canvas" in the Library, for ever.
//
// 🔴🔴 IT DOES NOT UNDO #870, IT EXTENDS ITS RULE. That PR ("a document is named by its title")
// answered a different report from the same day, and its rule is written into
// `mergeSourceIntoCanvas`: *"The first source names the canvas; later ones never rename it, and
// neither ever overwrites a title the learner typed."* This adds a THIRD namer under the same rule.
// Whoever names it first wins, and nothing renames afterwards. A canvas with a document attached is
// already named by the time a first exchange lands, so a document keeps its title exactly as #870
// decided.
//
// 🔴 A LEARNER'S OWN TITLE IS SAFE BY CONSTRUCTION, NOT BY REMEMBERING. `canvasNeedsName` is true
// only for a BLANK title, and `renameCanvas` refuses an empty name (*"An empty name is a cancelled
// rename"*). So a title a person typed can never be blank, can never be eligible, and no branch has
// to be careful about it. The caller checks again inside its own state updater, so a name arriving
// while the model is thinking also wins.
//
// 🔴 FIELD-AGNOSTIC (CLAUDE.md), AND THE PROMPT IS WHERE THAT IS EASY TO LOSE. The project memory
// records the trap by name: *"keyword scoping hides in prompts"* — a prompt can smuggle in a
// keyword list the code does not have. So the instruction below names no subject, no discipline and
// no example topic. It describes the SHAPE of a good name and tells the model to use the person's
// own words, which reads identically for a statute, a bearing load and a nursing protocol.
//
// 🔴 THE SHAPE TESTS ARE #870's, REUSED RATHER THAN REWRITTEN. `documentTitle` already rejects a
// row of cells, a rule, and a paragraph pretending to be a title, and `TITLE_MAX` is already the
// length at which something stops being a title and becomes a different kind of string. A model
// that answers with a sentence is refused by the same code that refuses a table header, so the
// canvas cannot end up with two ideas about what a title is.

import { postChatCompletion, type WireMsg } from "@/lib/workspace/chat-api";

import type { CanvasMoment } from "./canvas-moment";
import { documentTitle, TITLE_MAX } from "./document-title";

/** One exchange, flattened for the prompt. */
export interface CanvasExchange {
  /** What the learner said. */
  asked: string;
  /** What Nemesis said back, or "" for a turn that answered by doing rather than by speaking. */
  replied: string;
}

/**
 * The moment kinds that are somebody TALKING.
 *
 * 🔴 A `response` MOMENT MUST NEVER NAME THE CANVAS, which is why this is a list rather than "any
 * moment with text on it". An answer to a recall question is a demonstration, and naming the canvas
 * after one would put a learner's attempt at an answer in the sidebar. `canvas-moment.ts` already
 * stores no text on those, so this is belt as well as braces, and it stays correct if that changes.
 */
const SPOKEN: readonly CanvasMoment["kind"][] = ["assistant", "user"];

/**
 * Whether this canvas is still waiting to be called something.
 *
 * 🔴 BLANK IS THE WHOLE TEST, AND IT IS ENOUGH. See the header: nothing else can produce a blank
 * title, so blank means "no one has named this yet" and non-blank means "someone did" without the
 * canvas having to record WHO. A `titleSource` field would be a second representation of a fact the
 * title already carries, free to disagree with it.
 */
export function canvasNeedsName(canvas: { title: string }): boolean {
  return canvas.title.trim().length === 0;
}

/**
 * The first thing said on this canvas, and the answer to it.
 *
 * 🔴 THE FIRST, NOT THE LATEST, AND THAT IS THE "SETTLES EARLY" HALF OF THE RULE. Naming from the
 * newest turn would rename the canvas every time the conversation moved on, and a sidebar row that
 * renames itself under somebody's cursor is a worse bug than one that says "New canvas".
 *
 * 🔴 A TURN THAT ANSWERED BY DOING STILL COUNTS. A `study` turn starts a lesson instead of speaking,
 * so it records the ask with no reply; refusing to name from it would leave every canvas that opens
 * with a lesson unnamed, which is the exact defect this file exists to end.
 */
export function firstExchange(moments: readonly CanvasMoment[]): CanvasExchange | null {
  return firstUntriedExchange(moments, new Set())?.exchange ?? null;
}

/**
 * The earliest spoken exchange this canvas has NOT yet asked the model about.
 *
 * 🔴🔴 "FIRST" USED TO MEAN THE LITERAL FIRST, AND THAT PINNED EVERY CANVAS THAT OPENED WITH A
 * GREETING. Measured in production, 2026-08-31: thirteen of the owner's twenty-five unnamed
 * canvases began with "hi" or "hello" - and four of those went on to hold real conversations,
 * two to six turns long, that could never name them, because the namer re-read the greeting on
 * every pass and the model (correctly) refused it every time. The refusal channel worked; the
 * walk did not move past it.
 *
 * So the caller now remembers which exchanges were REFUSED (by moment id) and this walks to the
 * earliest one it has not tried. "Settles early" survives intact: the first exchange the model
 * accepts still wins, nothing ever renames a named canvas, and a canvas that is nothing but
 * greetings still ends up honestly unnamed.
 */
export function firstUntriedExchange(
  moments: readonly CanvasMoment[],
  tried: ReadonlySet<string>,
): { key: string; exchange: CanvasExchange } | null {
  for (const moment of moments) {
    if (!SPOKEN.includes(moment.kind)) continue;
    const asked = (moment.userText ?? "").trim();
    if (!asked) continue;
    if (tried.has(moment.id)) continue;
    return { exchange: { asked, replied: (moment.assistantText ?? "").trim() }, key: moment.id };
  }
  return null;
}

/**
 * The word an older prompt let the model answer with when an exchange was too thin to name.
 *
 * 🔴🔴 THE PROMPT NO LONGER OFFERS IT - OWNER REVERSAL, 2026-08-31: *"But ChatGPT when I say hi
 * it will name it to 'greeting'."* His reference names every conversation, thin or not (his own
 * ChatGPT list carries one literally titled "Greeting exchange"), so a greeting now gets called
 * what it is instead of leaving the row untitled. The note this replaces argued "Greeting and
 * introduction" was dishonest about a canvas with no subject yet; the owner looked at the result
 * of that honesty - a sidebar full of "New canvas" - and chose the reference's behaviour.
 *
 * The constant stays because `readCanvasName` still treats a model that says it anyway as a
 * refusal rather than as a name - belt for models that remember the old contract.
 */
const NO_NAME = "none";

/** How much of a reply the namer reads. The first paragraph settles the subject; the rest is detail
 *  the name will not carry, and it is paid for on every canvas that gets named. */
const REPLY_LIMIT = 700;

/**
 * The instruction.
 *
 * 🔴 NO SUBJECT, NO DISCIPLINE, NO EXAMPLE TOPIC. See the header. Every rule below is about the
 * SHAPE of a name or about whose words to use, so nothing here steers toward one field.
 *
 * 🔴 NO EM DASH, AND THE RULE IS RESTATED WITHOUT PRINTING ONE. Standing owner rule, 2026-08-25, and
 * `no-em-dashes.test.ts` records what went wrong the first time: the prohibition was in the packet
 * beside forty-nine live examples, one of them inside the sentence doing the forbidding.
 */
const NAMER_SYSTEM = [
  "You name a workspace after the conversation inside it.",
  "",
  "You are given the first thing a person asked and the answer they were given. Reply with the name and nothing else.",
  "",
  "Rules:",
  "- Two to six words. Never a sentence, never a question, never a heading with a colon in it.",
  "- Name what the conversation is ABOUT, not what the person did with it. A name that would fit any other conversation has failed.",
  "- Use the person's own words for the subject wherever they gave you one. Do not translate their vocabulary into more formal words.",
  "- Plain text. No quotation marks, no full stop at the end, no emoji, no markdown.",
  "- Never use an em dash. Use a comma, a colon, or a new sentence instead.",
  "- If they have only greeted you or made small talk and have not yet said what they want to work on, name the exchange for what it is, in one or two plain words, the way a greeting is simply a greeting.",
].join("\n");

/** The exchange, as the model reads it. */
export function namingMessages(exchange: CanvasExchange): WireMsg[] {
  const body = [
    `They asked: ${exchange.asked}`,
    exchange.replied ? `The answer began: ${exchange.replied.slice(0, REPLY_LIMIT)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    { content: NAMER_SYSTEM, role: "system" },
    { content: body, role: "user" },
  ];
}

/**
 * Read the model's answer as a name, or refuse it.
 *
 * 🔴 "" MEANS THE CANVAS STAYS UNNAMED, AND THAT IS A REAL OUTCOME RATHER THAN AN ERROR. "New
 * canvas" is true about a canvas nobody has named. A name assembled out of a refusal, a markdown
 * fence or a sentence would be a lie in the sidebar for the life of the canvas.
 */
export function readCanvasName(raw: string | null | undefined): string {
  const clean = (raw ?? "")
    .trim()
    // A model that wrapped its one line in a fence or in quotes still meant the line.
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/, "")
    .trim();
  if (!clean) return "";
  if (clean.toLowerCase() === NO_NAME) return "";
  // 🔴🔴 LENGTH IS CHECKED BEFORE THE SHAPE TESTS, AND THE ORDER IS THE DECISION. `looksLikeTitle`
  // deliberately allows three times `TITLE_MAX` and then TRUNCATES, which is right for a real
  // document whose own title ran long: keeping its first words is better than losing it. It is
  // wrong here. A model asked for six words that answers in a sentence has not written a long
  // title, and truncating that produces a fragment which READS like a title while saying nothing,
  // sitting in the sidebar for the life of the canvas. So an over-long answer is refused outright.
  if (clean.length > TITLE_MAX) return "";
  // 🔴 THE SAME SHAPE TESTS EVERY OTHER TITLE ON THIS CANVAS PASSES, and the same function: a row of
  // cells, a rule, a string with no words in it. See the header, and #870.
  return documentTitle(clean);
}

/** The one model call, injectable so the decision above can be executed in a test rather than
 *  asserted about. Mirrors `run-research.ts`'s `io`, and for the same reason. */
export type NamerComplete = (messages: WireMsg[]) => Promise<string | null>;

/** A name is a few words. The cap is generous enough for a model that opens with a space and tight
 *  enough that a model which decides to write an essay is cut off rather than paid for. */
const NAME_MAX_TOKENS = 64;

const liveNamer =
  (uid: string): NamerComplete =>
  async (messages) => (await postChatCompletion(uid, messages, { maxTokens: NAME_MAX_TOKENS })).text;

/**
 * What one naming attempt came to.
 *
 * 🔴 REFUSED AND FAILED ARE DIFFERENT FACTS AND THE CALLER NEEDS BOTH. Refused means the model
 * read the exchange and said there is nothing to name (a greeting): asking again about the SAME
 * exchange is waste, so the caller retires it and moves on when a later one exists. Failed means
 * the answer never arrived (network, a rate limit): the exchange is still perfectly nameable, so
 * the caller leaves it in place and tries again on the next turn. The old single "" return wore
 * both faces, which is why one dropped call left a canvas untitled for the rest of its life.
 */
export type NamingOutcome =
  | { kind: "named"; name: string }
  | { kind: "refused" }
  | { kind: "failed" };

/**
 * Name a canvas from one exchange.
 *
 * 🔴 IT NEVER THROWS AND NEVER REPORTS. This runs unasked, behind a conversation the learner is
 * having, and a canvas that could not be named is not something that happened TO them. Putting
 * "I couldn't name this canvas" in the error strip would interrupt a lesson to report a
 * cosmetic miss.
 */
export async function nameCanvasFromExchange(
  uid: string,
  exchange: CanvasExchange,
  complete: NamerComplete = liveNamer(uid),
): Promise<NamingOutcome> {
  try {
    const raw = await complete(namingMessages(exchange));
    if (raw === null) return { kind: "failed" };
    const name = readCanvasName(raw);
    return name ? { kind: "named", name } : { kind: "refused" };
  } catch {
    return { kind: "failed" };
  }
}
