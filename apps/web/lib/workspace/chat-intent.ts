// What the student meant, decided by the model rather than by a regex.
//
// 🔴🔴 THIS FILE REPLACES FOUR HAND-BUILT LANGUAGE UNDERSTANDERS. `chat-routing.ts` carried
// RESEARCH_PATTERN, CURRENT_PATTERN, EXPLICIT_WEB_PATTERN, LEARNING_PATTERN, CASUAL_PATTERN,
// SAVE_ARTIFACT, SAVE_VERB, SAVE_TO_WORKSPACE, CREATE_ASSESSMENT, CODE_TEST, OFFER_VERB,
// OFFER_TARGET and ACCEPTANCE. `workspace-intent.ts` carried a vocabulary of workspace nouns and
// six more regexes built on top of it. `chat-skills.ts` picked which expertise packet the model
// received by matching a regex per skill. `chat-web-search.ts` decided whether to spend money on a
// search from a list of English words. Between them they were roughly 700 lines of miniature
// natural-language parser sitting in FRONT of a language model.
//
// 🔴 EVERY ONE OF THEM WAS BUILT THE SAME WAY, AND THE COMMENTS SAY SO. A real phrasing failed in
// production, a rule was added for it, a neighbouring phrasing then collided, an exception was
// added for that. `wordes?` never matching the singular "class". "make me flashcards" losing its
// tools because LEARNING_PATTERN matched the word "flashcards" first. "Add an exam on 15
// September" answering "I can't add events to your calendar" because every rule matched a request
// to READ and none matched a request to CREATE. Those were all real, all found by a student rather
// than by a test, and each fix made the next collision likelier. The maintenance cycle is the
// defect; the individual rules were mostly fine.
//
// 🔴 THE SPLIT: THE MODEL DECIDES WHAT THINGS MEAN, THE CODE DECIDES WHAT IS TRUE AND WHAT IS
// ALLOWED. Nothing here weakens a deterministic invariant, and none of them route through this
// file:
//   · which model can carry tools (chat-effort.ts) — a fact about our stream, not about the ask
//   · whether a document is attached, and where it already lives (chat-api.ts)
//   · whether OUR OWN previous turn asked a preference question (study-creation-preferences.ts)
//   · a visible unanswered question + a composer submission IS an answer (composer-intent.ts)
//   · auth, plan eligibility, rate limits, budgets, tool availability, confirmation gates
// The software already knows all of that. It does not know whether "I have no clue, bruh" means
// the student is stuck, and that is the question this file forwards.
//
// 🔴 THIS IS THE SAME ARCHITECTURE `lib/learn/turn-router.ts` ALREADY PROVED ON THE CANVAS. That
// file deleted `learning-intent.ts` for the identical reason and has been the front door since
// 2026-08-18. Two surfaces of one product should not read a sentence two different ways.
//
// ── 🔴 WHY THIS COSTS NOTHING EXTRA ──────────────────────────────────────────────────────────
//
// The obvious objection is latency: classification used to be free and synchronous, and now it is
// a model call in front of every turn. But the turn ALREADY paid for one — `chat-web-need.ts` sent
// a separate pre-flight asking "does this need the web?" on every turn the keyword lists could not
// decide, which was most of them. That call is gone, absorbed here. One call now answers the web
// question AND the route AND the workspace question AND which expertise to attach, where before it
// answered a single yes/no and four regex piles guessed the rest.
//
// 🔴 FAILURE IS A WORKING TURN, NEVER A BROKEN ONE. A timeout, a refusal, a network error or prose
// where JSON was asked for all resolve to DEFAULT_INTENT below: an ordinary conversational turn on
// the tools-capable model. The student gets an answer. They do not get a spinner, and they do not
// get "I can't see your calendar".

import { extractJson } from "@/lib/learn/canvas-parse";
import type { WireMsg } from "@/lib/workspace/chat-api";
import { CHAT_SKILLS, type ChatSkill } from "@/lib/workspace/chat-skills";

/**
 * What kind of turn this is.
 *
 * 🔴 THE SAME FOUR NAMES `ChatRoute` ALREADY HAD, deliberately. This is a change of who decides,
 * not a redesign of what can be decided — every one of these already drives a real difference in
 * what the turn does (which model, whether sources are fetched, which instruction rides along), and
 * inventing a fifth would give the model a word with no behaviour behind it.
 */
export type ChatMode = "conversation" | "learning" | "current" | "research";

/**
 * What this turn needs from the student's own workspace — their Library, Calendar and Study state.
 *
 * 🔴 THREE VALUES BECAUSE THE CONSEQUENCES ARE GENUINELY THREE. "none" costs nothing. "read"
 * attaches the orientation snapshot and forces the tools-capable model. "write" does both and adds
 * the instruction that stops the model writing a deck into the chat instead of saving it. Merging
 * read and write would either buy a snapshot for every save or drop the save instruction from
 * every read.
 */
export type WorkspaceUse = "none" | "read" | "write";

export interface ChatIntent {
  mode: ChatMode;
  /** Does answering this well need live sources off the web. */
  needsWeb: boolean;
  /**
   * What to actually search for, when `needsWeb`.
   *
   * 🔴 THIS REPLACES `buildFreshSearchQuery`, which appended "current as of <date>" whenever a
   * keyword list thought the question was time-sensitive. The model is already reading the
   * question to decide whether to search at all; asking it what to type into the search box is
   * free, and it can put the year in when the year matters instead of when a word matched.
   */
  webQuery: string | null;
  workspace: WorkspaceUse;
  /**
   * Which expertise packets to attach, by id.
   *
   * 🔴 UNVALIDATED HERE ON PURPOSE. A model naming a skill that does not exist is not an error
   * worth failing a turn over — `selectChatSkills` drops unknown ids, and dropping one costs the
   * turn some craft rather than its answer.
   */
  skills: readonly string[];
  /** The subject, when the turn has one. Null for a greeting or a remark. */
  topic: string | null;
}

/**
 * What every unreadable, timed-out or failed decision becomes.
 *
 * 🔴 CONVERSATION ON THE TOOLS-CAPABLE MODEL, WHICH IS THE CHEAP FAILURE IN BOTH DIRECTIONS. The
 * old classifier's fallback was the same route for the same reason. Landing here costs a hard
 * question its thinking model, which reads as a slightly shallower answer. The alternative —
 * defaulting to the reasoner — costs a workspace turn every one of its tools, which reads as
 * "Nemesis can't see my calendar", and that is the single worst failure this surface has ever
 * shipped.
 */
export const DEFAULT_INTENT: ChatIntent = {
  mode: "conversation",
  needsWeb: false,
  skills: [],
  topic: null,
  webQuery: null,
  workspace: "none",
};

/**
 * How long the decision gets before the turn goes ahead without it.
 *
 * Inherited from the web pre-flight this replaces, and left there rather than raised: the packet is
 * small, the reply is a few dozen tokens, and a student waiting on an answer must not be held up by
 * a routing decision. Past this we take DEFAULT_INTENT and answer.
 */
export const INTENT_TIMEOUT_MS = 3_000;

/** How many past exchanges ride in the packet. Enough for "yeah do that" to resolve. */
export const INTENT_HISTORY_TURNS = 6;

/** Facts about this turn that the software knows and the model cannot see for itself. */
export interface IntentContext {
  /** Today, as the student's browser sees it. Passed in so the packet stays pure. */
  today: string;
  /** Names of the files riding on this turn. Empty when none. */
  attachments: readonly string[];
  /** The conversation so far, oldest first. */
  history: readonly IntentExchange[];
  /**
   * Our own previous turn asked a preference question and is waiting on the answer.
   *
   * 🔴 APPLICATION STATE, NOT LANGUAGE. `studyCreationKindFromPreferencePrompt` matches the exact
   * prefix of a question NEMESIS ITSELF wrote, so this is the software remembering what it asked —
   * the same category as composer-intent's unanswered question. It stays deterministic and is
   * reported to the model as a fact.
   */
  awaitingStudyPreference: "flashcards" | "test" | null;
}

export interface IntentExchange {
  said: string;
  replied: string;
}

/**
 * The vocabulary the model chooses from, built from the skill catalog itself.
 *
 * 🔴 GENERATED, NEVER HAND-WRITTEN. A hand-maintained list in a prompt is the same defect one layer
 * up: add a skill, forget the prompt, and the model can never pick it. `when` is a required field
 * on every skill for exactly this reason, and a test holds it.
 */
export function skillMenu(catalog: readonly ChatSkill[] = CHAT_SKILLS): string {
  return catalog.map((skill) => `  ${skill.id} — ${skill.when}`).join("\n");
}

const INTENT_SYSTEM = [
  "You read one message a student sent to Nemesis, an academic operating system, and decide what "
  + "kind of turn it is. You do not answer the message. Another model call does that, using what "
  + "you decide here.",

  "Nemesis works in every field: law, engineering, history, nursing, computer science, a trade. "
  + "Never assume the student's discipline. Decide from what the message is DOING, not from its "
  + "subject matter.",

  "Read the conversation, not just the last line. \"yeah do that\", \"all three\", \"the second "
  + "one\", \"why?\" mean whatever the turn before them set up. A one-word answer to an offer "
  + "Nemesis made is a request for the thing that was offered.",
].join("\n\n");

/**
 * The decision contract.
 *
 * 🔴 IT DESCRIBES CONSEQUENCES, NOT LABELS. A model choosing "workspace": "write" needs to know
 * that choosing it is what makes the save actually happen, and that choosing "learning" for the
 * same message means the deck gets typed into the chat and lost. The old classifier's comments
 * explained that to future engineers; the model was never told.
 */
export function intentContract(catalog: readonly ChatSkill[] = CHAT_SKILLS): string {
  return [
    "Answer with a single JSON object and nothing else:",
    "",
    '{"mode": "...", "workspace": "...", "needsWeb": true|false, "webQuery": "..."|null, '
    + '"skills": ["..."], "topic": "..."|null}',
    "",
    '"mode" is what kind of answer this turn wants:',
    '  "conversation" — small talk, a remark, a complaint, a question about Nemesis itself, or a '
    + "short question that just wants answering.",
    '  "learning" — the student wants to understand, practise, or be walked through something. '
    + "This is the ordinary case for real academic work, and it is the one that buys the deeper "
    + "thinking model. Choose it whenever the answer is worth thinking about, including when the "
    + "student expressed it as frustration rather than as a question.",
    '  "current" — the answer turns on something happening now or recently.',
    '  "research" — the student asked for sources, a literature review, evidence weighed, or a '
    + "report with citations. The most expensive mode; do not choose it for an ordinary question "
    + "that merely has an answer somewhere.",
    "",
    '"workspace" is what this turn needs from the student\'s OWN files, calendar and study decks:',
    '  "none" — nothing. Most turns.',
    '  "read" — answering means looking at what they have: what is due, what is in their Library, '
    + "what they should study next, what a folder holds, how their semester is laid out.",
    '  "write" — they asked Nemesis to CREATE or CHANGE something of theirs: save flashcards, '
    + "build a practice test, write a note into their Library, put a date on their calendar, move "
    + "or rename or tidy something.",
    "",
    // 🔴 THE ONE CONSEQUENCE THE MODEL CANNOT INFER, AND THE MOST EXPENSIVE MISTAKE ON THIS SURFACE.
    // Getting this wrong does not produce a worse answer, it produces a confident lie: the model
    // says it saved a deck, and nothing was saved. It happened in production more than once.
    'Getting "workspace" wrong is the worst mistake available here. Only a "read" or "write" turn '
    + "is given the tools that touch the student's data. Without them Nemesis cannot save a deck "
    + "and cannot see a calendar, and it will write the deck into the chat or say it has no access "
    + "— both of which the student experiences as the product being broken. When a turn plausibly "
    + 'needs their own data, say so: "read" costs almost nothing and being wrong the other way '
    + "costs the whole turn.",
    "",
    '"needsWeb" is true when a correct answer depends on something that changes or that you could '
    + "not have memorised: recent or ongoing events, current prices, standings, releases, versions, "
    + "laws, guidelines, schedules, anything the student says is new or has changed, or a specific "
    + "source they want read. It is false for settled knowledge, explanations, definitions, "
    + "calculations, translations, help with their own text, and anything answerable from material "
    + "they attached. Searching costs money and time, so when it is genuinely borderline, say false.",
    "",
    '"webQuery" is what to type into a search engine, when needsWeb is true. Write it as a search, '
    + "not as a sentence, and put a date or year in it yourself when recency is the point. Null "
    + "when needsWeb is false.",
    "",
    '"skills" names the expertise Nemesis should be given for this turn, by id. Pick only what this '
    + "message actually calls for. Most turns need none, and an unnecessary packet makes the answer "
    + "worse rather than better. Choose from exactly these ids:",
    skillMenu(catalog),
    "",
    '"topic" is the subject of the turn, or null when it has none.',
  ].join("\n");
}

/** The state block: facts, written as facts rather than as instructions. */
export function intentStateBlock(context: IntentContext): string {
  const lines: string[] = [];
  if (context.today) lines.push(`Today is ${context.today}.`);
  lines.push(
    context.attachments.length > 0
      ? `The student attached ${context.attachments.length} file${context.attachments.length === 1 ? "" : "s"}: `
        + `${context.attachments.join(", ")}. The contents are not shown to you, only the names.`
      : "No files attached to this turn.",
  );
  // 🔴 STATED, NOT ACTED ON. The software knows it asked; whether this reply ANSWERS it is a
  // reading of the reply, which is the model's job. The old code assumed any non-cancelling reply
  // was an answer, which meant a student who changed the subject had their new question filed as
  // a continuation of the old save.
  if (context.awaitingStudyPreference) {
    lines.push(
      `Nemesis's own previous turn asked this student a question about how to build their `
      + `${context.awaitingStudyPreference}, and is waiting for the answer. If this message answers `
      + `it, the turn is still that same request to build something.`,
    );
  }
  return lines.join("\n");
}

/**
 * The packet. Pure, so what the model is asked can be checked without a model in the loop.
 */
export function intentMessages(input: {
  ask: string;
  context: IntentContext;
  catalog?: readonly ChatSkill[];
}): WireMsg[] {
  const catalog = input.catalog ?? CHAT_SKILLS;
  return [
    { content: INTENT_SYSTEM, role: "system" },
    {
      content: "TURN FACTS. These are things Nemesis knows, not something the student said.\n\n"
        + intentStateBlock(input.context),
      role: "system",
    },
    // 🔴 REAL ALTERNATING TURNS, NOT A SUMMARY. "yeah do that" resolves against a conversation and
    // does not resolve against a paragraph describing one. This is the whole reason the old
    // classifier needed OFFER_VERB, OFFER_TARGET and ACCEPTANCE: it was reconstructing, from three
    // regexes, a fact the conversation states outright.
    ...input.context.history.slice(-INTENT_HISTORY_TURNS).flatMap((exchange): WireMsg[] => [
      { content: exchange.said, role: "user" },
      ...(exchange.replied.trim() ? [{ content: exchange.replied, role: "assistant" as const }] : []),
    ]),
    { content: `${input.ask}\n\n---\n${intentContract(catalog)}`, role: "user" },
  ];
}

function asMode(value: unknown): ChatMode | null {
  return value === "conversation" || value === "learning" || value === "current" || value === "research"
    ? value
    : null;
}

function asWorkspace(value: unknown): WorkspaceUse | null {
  return value === "none" || value === "read" || value === "write" ? value : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

/**
 * Read the model's decision, or null when there is nothing usable in it.
 *
 * 🔴 A PARTIAL DECISION IS STILL A DECISION. A reply that names a workspace write but forgets
 * `mode` has told us the one thing that matters most, and throwing it away for a missing field
 * would lose the save. Each field falls back independently to its DEFAULT_INTENT value; only a
 * reply with no recognisable field at all is null.
 */
export function readChatIntent(raw: string): ChatIntent | null {
  const parsed = extractJson(raw);
  if (!parsed) return null;
  const mode = asMode(parsed.mode);
  const workspace = asWorkspace(parsed.workspace);
  const skills = asIds(parsed.skills);
  const needsWeb = typeof parsed.needsWeb === "boolean" ? parsed.needsWeb : null;
  if (mode === null && workspace === null && needsWeb === null && skills.length === 0) return null;
  return {
    mode: mode ?? DEFAULT_INTENT.mode,
    needsWeb: needsWeb ?? DEFAULT_INTENT.needsWeb,
    skills,
    topic: asText(parsed.topic) || null,
    // 🔴 A QUERY WITHOUT A SEARCH IS DROPPED, not treated as a request for one. The model saying
    // "no search needed" and then filling in a query is a contradiction, and the half that costs
    // money is the half that loses.
    webQuery: needsWeb === true ? asText(parsed.webQuery) || null : null,
    workspace: workspace ?? DEFAULT_INTENT.workspace,
  };
}
