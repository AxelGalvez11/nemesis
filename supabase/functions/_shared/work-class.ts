// MIRROR of packages/shared/src/work-class.ts — that copy is canonical and
// carries the reasoning; this one exists because edge functions cannot import
// across the workspace root (only `supabase/` is bundled at deploy).
//
// 🔴 THE TWO ARE HELD TOGETHER BY A TEST, NOT BY DISCIPLINE. work-class.drift.
// test.ts runs every acceptance prompt plus the ceiling cases through both
// implementations and fails if any answer disagrees. Editing one without the
// other turns that test red rather than shipping two different opinions about
// how hard a student's question is.
// How hard is this turn? — PURE, deterministic, and SERVER-OWNED.
//
// 🔴 THIS REPLACES A CONTROL THAT NO LONGER EXISTS. Nemesis used to carry an
// Instant/Medium/High pill in the composer; the owner removed it from the phone
// (#369) and from the web (2026-07-31) because "thats not necessary for the
// app". The MACHINERY was left behind on both surfaces, pinned to Medium — and
// `applyChatEffort(decision, "medium")` STRIPS the one branch that ever set
// `reasoningEffort: "high"`. So no production request has carried High since the
// dial was removed, on either surface, and the gateway's premium lane was
// computed from a field nobody sends. Audited 2026-08-06.
//
// The replacement is not a smaller dial. It is the server deciding, because the
// student should not have to know that a model tier exists, and because a client
// that can pick the expensive model is a client that can spend the owner's money
// by editing a JSON body.
//
// ── the three classes ───────────────────────────────────────────────────────
//   simple    small talk, identity, a straightforward lookup or action
//             → the fast model, thinking OFF
//   standard  explanations, learning questions, ordinary research
//             → the fast model, thinking ON
//   complex   planning across a whole collection, reconciling two accounts of
//             the same thing, genuinely hard synthesis
//             → the premium model IF the plan reaches it, otherwise standard
//
// ── field-agnostic by construction ──────────────────────────────────────────
// Nemesis serves law, nursing, mechanical engineering, history and the trades.
// Every marker below is a CLOSED-CLASS FUNCTION WORD — a relation ("compare",
// "conflicting"), a quantifier ("every", "entire"), or an instruction verb
// ("explain", "derive"). None of them names a subject. A list of subject nouns
// would classify a pharmacology question as hard and an identical structural
// question about contract law as easy, which is the failure mode this codebase
// has hit before (see the retired CHANGING_FACT_PATTERN, and `autoDepth`, which
// still carries "contraindicat" and "meta-analysis" and is NOT reused here).
//
// ── why the default is standard ─────────────────────────────────────────────
// Enumerating "ordinary" is impossible; enumerating "trivial" and "hard" is
// tractable. So `standard` is what you get when nothing fires, and the two ends
// each need a positive signal. A missed signal costs one tier, never the answer.

/** What the work is worth spending on. Ordered: simple < standard < complex. */
export type WorkClass = "simple" | "standard" | "complex";

/**
 * Why this class was chosen. Machine-readable and SAFE TO LOG — every value is
 * a fixed slug naming the SIGNAL, never a word the student typed.
 */
export type WorkReason =
  /** The request pins a tool. Thinking mode refuses a forced tool_choice. */
  | "forced_tool"
  /** Tools ride, but this client cannot echo reasoning back on a tool round. */
  | "no_reasoning_echo"
  /** A greeting, a thank-you, or a question about Nemesis itself. */
  | "greeting"
  /** Short, direct, and asking for no working-out. */
  | "brief_request"
  /** Asks to relate, reconcile, or find the difference between two things. */
  | "reconciliation"
  /** Ranges over a whole collection AND asks for more than one outcome. */
  | "multi_constraint"
  /** Long enough that the question carries several parts. */
  | "extended_request"
  /** Nothing fired. */
  | "default";

export interface WorkClassification {
  workClass: WorkClass;
  reason: WorkReason;
}

/**
 * Everything the classifier is allowed to look at.
 *
 * 🔴 NOTHING HERE COMES FROM THE CLIENT'S OPINION. There is no effort field, no
 * model name, and no "this is hard" flag. The prompt is the student's own words;
 * the two ceilings are facts about the request's SHAPE that the gateway reads
 * for itself.
 */
export interface WorkSignals {
  /** What the student typed, with any attached file's text removed. */
  prompt: string;
  /** A file rode this turn. Kept separate because a bare upload has no prompt. */
  hasAttachment?: boolean;
  /** The body pins a specific tool (`tool_choice`). */
  forcesTool?: boolean;
  /** `tools` ride, and the client did not declare that it echoes reasoning. */
  toolsWithoutReasoningEcho?: boolean;
}

// ── markers ─────────────────────────────────────────────────────────────────

/** Opens or closes a conversation, or asks what Nemesis is. Whole-message. */
const GREETING =
  /^(?:hi|hello|hey|yo|thanks|thank you|ty|cheers|good (?:morning|afternoon|evening|night)|who are you|what are you|what can you do|who made you|what model are you)[!.?\s]*$/i;

/**
 * Asks to RELATE two things — the clearest signal that an answer has to hold
 * both in view at once and say how they sit together. This is the shape behind
 * "Compare what my professor taught with the current guideline", and equally
 * behind "does the holding still match the statute" or "does my professor's
 * beam formula still match the current code".
 *
 * `conflict`/`inconsisten`/`contradic` are here rather than in a planning list
 * because resolving a clash IS a reconciliation: two accounts, one answer.
 */
const RELATIONAL =
  /\b(?:compare[sd]?|comparison|contrast(?:ed|s)?|versus|vs\.?|differ(?:s|ed|ence|ences|ing)?|reconcile[sd]?|conflict(?:s|ed|ing)?|inconsisten\w*|contradict\w*|discrepanc\w*|disagree(?:s|d|ment|ments)?|mismatch\w*|align(?:s|ed|ment)? with|(?:still|actually) (?:match(?:es)?|hold(?:s)?|appl(?:y|ies)|current|accurate|correct|true|valid|right))\b|\bdifference between\b|\bbetween\b[^.?!]{1,60}\band\b/i;

/** Ranges over a whole collection rather than one item. */
const SCOPE =
  /\b(?:all|every|each|entire|whole|across|everything|throughout|semester|term|quarter)\b/i;

/**
 * Asks for working-out. Used ONLY to stop a short message being demoted — it
 * never promotes on its own, so a generous list costs nothing.
 */
const DEPTH =
  /\b(?:explain|explanation|why|how|teach|walk me through|derive|prove|proof|analy[sz]e|analysis|interpret|justify|critique|evaluate|assess|plan|design|troubleshoot|debug|solve|summari[sz]e|outline|break down|reason(?:ing)?|implication\w*|trade[- ]?offs?)\b/i;

/** Splits a message into the things it asks for. */
const CLAUSE_SPLIT = /\s*(?:\band\b|\bthen\b|\balso\b|[;,]|\n)\s*/i;

/**
 * Points at the student's OWN material rather than at the world. First-person
 * possessives are the whole signal — "my calendar", "my deck", "the lecture I
 * uploaded" — and they work identically for a moot-court bundle and a torque
 * spec.
 */
const SELF_SCOPED = /\b(?:my|mine|i|me|our)\b/i;

/** Opens with an instruction to DO something rather than a question. */
const IMPERATIVE_ACTION =
  /^(?:please\s+)?(?:make|create|build|generate|add|save|put|set|open|show|give|delete|remove|rename|move|schedule|mark|start|stop|find|list)\b/i;

/**
 * A message shorter than this MAY be a lookup — but only together with the two
 * markers above.
 *
 * 🔴 LENGTH ALONE WAS NOT ENOUGH, and the case that showed it is "Has the court
 * ruled on this yet?" — five words, no working-out asked for, and about the
 * outside world rather than the student's folders. Demoting on brevity sent it
 * out with thinking off. The owner's "simple" bucket is small talk, *workspace*
 * reads and *actions*; none of those is "a short question about the world", so
 * the demotion now asks for the possessive or the imperative that makes it one.
 */
const BRIEF_WORDS = 8;
/** A message this long is carrying several parts whatever its wording. */
const EXTENDED_WORDS = 45;

/**
 * A relation alone is not synthesis.
 *
 * 🔴 MEASURED, NOT GUESSED. Running the acceptance set through an earlier draft
 * promoted "What is the difference between a tort and a crime?" and "Compare
 * negligence and strict liability" to the premium model. Those are textbook
 * teaching questions — two terms the student named in passing — and paying
 * flagship rates for them is how a routing change turns into a bill.
 *
 * Every one of the owner's own complex examples relates the student's OWN
 * material to something else: "what MY professor taught" against the current
 * guideline, "MY lecture's formula" against the code, "MY notes" against the
 * textbook. That is the difference between comparing two definitions and
 * reconciling two accounts of one thing. A relation stated at length counts too
 * — "compare the 2026 guidance with the 2024 guidance and explain where they
 * diverge" is real work with no possessive in it.
 *
 * A miss here is not silent: a turn that ends up reading two sources anyway is
 * logged as an escalation candidate (see below).
 */
const RELATIONAL_WORDS = 12;

// ── attachments ─────────────────────────────────────────────────────────────

/**
 * The header the web client puts above each attached file's text.
 *
 * 🔴 THE GATEWAY MUST STRIP THIS BEFORE CLASSIFYING. Attachment text is pasted
 * INTO the user message, so a lecture deck reads as though the student typed
 * 40,000 words — which would promote every single upload to the premium model
 * on the extended-request rule alone. Web already learned this once, when one
 * slide reading "Smith et al., 2024" bought a paid web search on every upload
 * (see promptWithoutAttachments in chat-routing.ts, whose marker this matches).
 */
export const ATTACHMENT_MARKER = "### Attachment: ";

/** The student's own words, with any attached file's text removed. */
export function promptOnly(wireText: string): string {
  if (wireText.trimStart().startsWith(ATTACHMENT_MARKER)) return "";
  const marker = wireText.indexOf(`\n\n${ATTACHMENT_MARKER}`);
  return (marker === -1 ? wireText : wireText.slice(0, marker)).trim();
}

/** Did a file ride this turn? */
export function carriesAttachment(wireText: string): boolean {
  return wireText.includes(ATTACHMENT_MARKER);
}

// ── the decision ────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** How many distinct things the message asks for. */
function clauseCount(text: string): number {
  return text.split(CLAUSE_SPLIT).filter((part) => part.trim().length > 2).length;
}

/**
 * Classify one turn.
 *
 * 🔴 READ ONLY THE PROMPT, NEVER THE TURN'S PROGRESS. A turn makes several
 * requests — one per tool round — and this must return the same class for all
 * of them. Promoting on round three (say, once a Library read and a web search
 * have both come back) would move the conversation to a different model
 * mid-turn, carrying `reasoning_content` that the FIRST model produced. Whether
 * a provider accepts another model's reasoning is not documented and we have not
 * tested it, and "thinking mode does not support this tool_choice" is what
 * guessing at this API costs. Tool progress is still WATCHED — see
 * `escalationCandidate` — it just does not steer.
 */
export function classifyWork(signals: WorkSignals): WorkClassification {
  // ── ceilings ──────────────────────────────────────────────────────────────
  // Both of these are about what the REQUEST can survive, so they outrank
  // everything the words say. A hard question does not become answerable by
  // being sent in a shape the provider rejects.

  // DeepSeek's thinking mode answers a pinned tool with a 400 in so many words:
  // "Thinking mode does not support this tool_choice". Nothing reaching the
  // valve sends one today (the `ask` function talks to DeepSeek directly), which
  // is exactly why this is worth pinning now — the moment the SERVER can switch
  // thinking on, a future caller with a forced tool becomes a live 400.
  if (signals.forcesTool) return { reason: "forced_tool", workClass: "simple" };

  // A thinking turn must echo the model's `reasoning_content` back on every tool
  // round. Web does; the phone does not, and phone builds already installed will
  // keep not doing it long after this gateway deploys. Switching thinking on
  // underneath them would break tool rounds in a shipped build — so a client
  // that has not said it echoes gets thinking OFF whenever tools ride.
  if (signals.toolsWithoutReasoningEcho) return { reason: "no_reasoning_echo", workClass: "simple" };

  const prompt = signals.prompt.trim();

  // A bare upload: nothing was typed, so there are no words to read. Reading a
  // document is standard work, not small talk — the emptiness is the student
  // having nothing to add, not having nothing to ask.
  if (!prompt) return { reason: signals.hasAttachment ? "default" : "brief_request", workClass: signals.hasAttachment ? "standard" : "simple" };

  if (GREETING.test(prompt)) return { reason: "greeting", workClass: "simple" };

  const words = wordCount(prompt);
  const relational = RELATIONAL.test(prompt);
  const depth = DEPTH.test(prompt);

  // ── promote ───────────────────────────────────────────────────────────────
  if (relational && (SELF_SCOPED.test(prompt) || words >= RELATIONAL_WORDS)) {
    return { reason: "reconciliation", workClass: "complex" };
  }
  if (SCOPE.test(prompt) && clauseCount(prompt) >= 2) return { reason: "multi_constraint", workClass: "complex" };
  if (words >= EXTENDED_WORDS) return { reason: "extended_request", workClass: "complex" };

  // ── demote ────────────────────────────────────────────────────────────────
  // Short, asking for no working-out, and pointed at the student's own material
  // or telling Nemesis to do one thing. "What is on my calendar today?" lands
  // here, and so does "make me flashcards on tort law". "Explain this concept
  // from my lecture" is just as short and does not, because it asked to be shown
  // the reasoning — and "has the court ruled on this yet?" does not either,
  // because it is about the world.
  if (words <= BRIEF_WORDS && !depth && (SELF_SCOPED.test(prompt) || IMPERATIVE_ACTION.test(prompt))) {
    return { reason: "brief_request", workClass: "simple" };
  }

  return { reason: "default", workClass: "standard" };
}

// ── watching for what we chose not to act on ────────────────────────────────

/**
 * Tool names that READ a source, by our own naming convention rather than by a
 * hand-kept catalogue of the 40 workspace tools — a list that would be wrong the
 * first time somebody adds a tool and forgets this file.
 */
const READS_A_SOURCE = /^(?:search|get|list|read|find)_/;

/**
 * Did this turn end up drawing on two or more sources — the "multiple internal
 * sources" and "Library-plus-web comparison" shapes — WITHOUT the prompt having
 * been classified complex?
 *
 * This deliberately changes nothing. It is the evidence for whether prompt-only
 * classification is missing the hard turns, logged as a slug and a count so the
 * question can be answered from production instead of argued about. If it fires
 * often, the answer is a better prompt signal, or a verified mid-turn switch —
 * not a quiet promotion bolted on here.
 */
export function escalationCandidate(toolNames: readonly string[], chosen: WorkClass): boolean {
  if (chosen === "complex") return false;
  const distinct = new Set(toolNames.filter((name) => READS_A_SOURCE.test(name)));
  return distinct.size >= 2;
}
