// Letting the MODEL decide when a question needs the live web.
//
// WHY THIS EXISTS. Until now the decision was made entirely by keyword regexes
// (chat-web-search.ts:shouldSearchWeb, chat-routing.ts) — a fixed list of words
// like "latest", "current", "news", "price". Two problems with that, and the
// owner named the second one (2026-08-04: "it should know when to lookup the
// internet"):
//
//  1. A WORD LIST NEVER GENERALISES. It is English-only, so a student asking in
//     Spanish or Mandarin never gets a search; and it is blind to the shape of
//     the question, so "has the EU signed off on that rule yet" contains no
//     listed word and silently answers from stale training data.
//  2. The model already knows. A frontier model can tell that a question turns
//     on something that changes, or on a source it cannot have memorised. It
//     was simply never asked.
//
// So the regexes stay as a FAST PATH — when they fire, the answer is obviously
// yes and we skip straight to searching, costing nothing. When they do not
// fire, one very small model call gets asked, and its answer decides.
//
// 🔴 WHY THIS IS NOT A TOOL. The obvious design is to hand the model a
// `search_web` tool and let it call it. It cannot: toolsAllowed() in
// chat-effort.ts turns tools OFF for every reasoner and high-effort turn,
// because our stream does not retain the reasoning content those turns must
// echo back on a tool round. Those are exactly the turns that carry hard
// questions. A tool would therefore be available only on the turns least
// likely to need it. Asking before the turn works everywhere.
//
// FAILURE IS "NO SEARCH", NEVER "NO ANSWER". A slow, refused, or unparseable
// pre-flight resolves to false and the turn proceeds unsearched — the student
// gets a normal answer rather than a spinner.

/** How long the pre-flight gets before the turn goes ahead without it. A
 *  question the student is waiting on must not be held up by an optimisation:
 *  the whole call is a handful of tokens and normally lands well inside this. */
export const WEB_NEED_TIMEOUT_MS = 2_500;

/**
 * Below this many characters, do not spend a call asking.
 *
 * By LENGTH rather than by matching greetings, because a greeting list is the
 * same mistake one layer down — "gracias", "ありがとう" and "ok thanks" all have
 * to be free. Anything genuinely answerable from the web is longer than this.
 */
const MIN_ASK_CHARS = 12;

export interface WebNeedContext {
  /** What the student typed, attachments already stripped. */
  ask: string;
  /** The keyword fast path already said yes — nothing left to decide. */
  regexSaidYes: boolean;
  /** This turn carries files. The document IS the context; a syllabus that
   *  mentions a recent year is not a request for today's news. */
  hasAttachments: boolean;
  /** A save request ("put this on my calendar"). Its route already settled the
   *  web question, and a date in a save is a date, not current events. */
  savesToWorkspace: boolean;
}

/**
 * Whether it is worth asking the model at all.
 *
 * Pure and exported so the skip rules can be tested without a network — the
 * expensive half is the call, and the cheap half is the one with the edge
 * cases in it.
 */
export function shouldAskModelAboutWeb(context: WebNeedContext): boolean {
  if (context.regexSaidYes) return false;
  if (context.hasAttachments) return false;
  if (context.savesToWorkspace) return false;
  return context.ask.trim().length >= MIN_ASK_CHARS;
}

/**
 * The pre-flight prompt.
 *
 * Written around WHAT MAKES AN ANSWER GO STALE rather than around topics, so it
 * reads the same for a law student asking about a ruling and an engineering
 * student asking about a standard. It asks for one word so the reply is cheap
 * and unambiguous.
 */
export const WEB_NEED_PROMPT =
  "You decide whether answering the student's message needs a live web search. " +
  "Answer YES when a correct answer depends on something that changes over time or that you could not have memorised: recent or ongoing events, " +
  "current prices, standings, releases, versions, laws, guidelines or schedules, anything the student says is new or has changed, a specific named " +
  "source they want you to read, or any URL. " +
  "Answer NO when the answer is settled knowledge, an explanation, a definition, a calculation, a translation, help with their own text, or ordinary " +
  "conversation. When it is genuinely borderline, answer NO — a stale answer the student can question beats a slow one. " +
  "Reply with exactly one word: YES or NO.";

/**
 * Read the pre-flight's reply.
 *
 * Deliberately strict about YES and lenient about everything else: a model that
 * ignores the format and writes a sentence must not accidentally buy a search,
 * so only a reply that STARTS with yes counts. Anything else — a refusal, an
 * explanation, an empty body, a timeout — is no.
 */
export function readWebNeedReply(text: string | null): boolean {
  if (!text) return false;
  return /^\s*(?:\*\*)?yes\b/i.test(text.trim());
}
