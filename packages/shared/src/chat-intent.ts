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
// 🔴 AND IT LIVES IN packages/shared FOR THAT SAME SENTENCE, ONE LAYER UP. The phone carried its
// OWN copy of the classifier (apps/mobile/src/lib/chat-routing.ts): the same thirteen regexes, one
// of them already drifted, plus a separate skill vocabulary in academic-skills.ts. So "make me
// flashcards on beta blockers" was read twice, by two pieces of code that were only equal by
// somebody remembering to edit both. This repo has shipped that bug in three other shapes already
// — the library `position` field, the calendar tool description, the writing voice — which is why
// WRITING_VOICE lives here too. One reading of a sentence, for the whole product.
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

/**
 * One message on the wire.
 *
 * 🔴 DECLARED HERE RATHER THAN IMPORTED, because the two apps that use this module have their own
 * richer wire types (web's carries tool calls, the phone's carries attachments) and this packet
 * never needs either. A structural subset is what makes both assignable without either app
 * depending on the other's chat plumbing.
 */
export interface IntentMessage {
  role: "assistant" | "system" | "user";
  content: string;
}

/** What this module needs to know about a skill: its name, and when it applies. */
export interface IntentSkill {
  id: string;
  when: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The JSON in a model's reply, whatever it wrapped it in.
 *
 * The same recovery ladder `canvas-parse.ts` uses — fenced block, then the whole text, then the
 * widest balanced object — restated here rather than imported, because that file is web-only and
 * this module is read by both apps. Never throws; an unparseable reply yields null and the caller
 * falls back to DEFAULT_INTENT.
 */
function readEnvelope(raw: string): Record<string, unknown> | null {
  const candidates: string[] = [];
  for (const match of raw.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/g)) {
    const body = match[1]?.trim();
    if (body) candidates.push(body);
  }
  const trimmed = raw.trim();
  if (trimmed) candidates.push(trimmed);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      // Next candidate.
    }
  }
  return null;
}

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
  /**
   * How many pages to read, when `needsWeb`.
   *
   * 🔴 THE MODEL SETS THIS BECAUSE ONLY THE MODEL KNOWS WHAT THE QUESTION NEEDS. Four separate caps
   * used to sit between the provider and the answer — a client constant of 10, the limit sent to the
   * search function, that function's own default of 5, and a final slice that discarded anything
   * past 10 even when more had already been paid for and fetched. Brave returns up to 50 and bills
   * one metered unit whatever the count, so every one of those caps was throwing away evidence that
   * had cost the same either way.
   *
   * A definition settles in three pages. "Compare how four jurisdictions treat this" does not, and
   * a model told it may only have ten will answer thinly rather than say so. Null means it did not
   * choose, and the caller falls back to the provider's own ceiling rather than to a number we
   * invented.
   */
  webResults: number | null;
  /**
   * How recent the pages have to be, when `needsWeb`. Null means any age will do.
   *
   * 🔴 THE MODEL DECIDES BECAUSE RECENCY IS A PROPERTY OF THE QUESTION, NOT OF THE WORDS IN IT.
   * "What is the current inflation rate" and "what did inflation do in 2019" both name inflation
   * and want opposite things from the archive, and no keyword tells them apart. The provider has
   * had a `freshness` filter the whole time (Brave: `pd` 24h, `pw` 7 days, `pm` 31 days, `py` 365
   * days, or an explicit date range) and nothing in this product had ever set it — so a question
   * about this week's news was answered from whatever ranked highest, of any age.
   *
   * 🔴 IT IS NOT THE SAME THING AS PUTTING A YEAR IN THE QUERY, which is what `webQuery` already
   * asks for. A year in the query is a hint to the ranker and pages can and do outrank it; a
   * freshness window is a filter the index applies before ranking begins.
   *
   * 🔴 THE VALUE IS VALIDATED WHERE IT IS USED, NEVER HERE. Which window a question needs is a
   * reading; which windows exist is a fact about Brave, and `readFreshness` in the search function
   * is the one place that knows it. A model that invents `last_week` gets no filter rather than a
   * parameter that silently does nothing.
   */
  webFreshness: string | null;
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
  webFreshness: null,
  webQuery: null,
  webResults: null,
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
  /**
   * What earlier searches on THIS turn found, formatted. Empty on the first pass.
   *
   * 🔴 THIS IS WHAT TURNS ONE SEARCH INTO A DECISION THE MODEL CAN REVISIT. Without it the packet
   * is identical every round, so asking again could only ever get the same answer — the turn had
   * exactly one search and the model had to answer from pages it may already have judged useless,
   * with no way to say so. The Canvas has worked this way since `MAX_SEARCH_ROUNDS`; this is the
   * same idea reaching the other surface.
   */
  webContext: string;
  /**
   * How many more searches this turn may still run.
   *
   * 🔴 STATED TO THE MODEL RATHER THAN ENFORCED BEHIND ITS BACK. Deciding it has enough is the
   * model's judgement, and the loop stops when it stops asking. This exists so a turn cannot run
   * away — and a model that is TOLD the budget spends its last search on its best query, where one
   * that is silently cut off has already wasted it.
   */
  searchesLeft: number;
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
export function skillMenu(catalog: readonly IntentSkill[]): string {
  return catalog.map((skill) => `  ${skill.id}: ${skill.when}`).join("\n");
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
export function intentContract(catalog: readonly IntentSkill[]): string {
  return [
    "Answer with a single JSON object and nothing else:",
    "",
    '{"mode": "...", "workspace": "...", "needsWeb": true|false, "webQuery": "..."|null, '
    + '"skills": ["..."], "topic": "..."|null, "webResults": <number>|null, '
    + '"webFreshness": "pd"|"pw"|"pm"|"py"|null}',
    "",
    '"mode" is what kind of answer this turn wants:',
    '  "conversation": small talk, a remark, a complaint, a question about Nemesis itself, or a '
    + "short question that just wants answering.",
    '  "learning": the student wants to understand, practise, or be walked through something. '
    + "This is the ordinary case for real academic work, and it is the one that buys the deeper "
    + "thinking model. Choose it whenever the answer is worth thinking about, including when the "
    + "student expressed it as frustration rather than as a question.",
    '  "current": the answer turns on something happening now or recently.',
    '  "research": the student asked for sources, a literature review, evidence weighed, or a '
    + "report with citations. The most expensive mode; do not choose it for an ordinary question "
    + "that merely has an answer somewhere.",
    "",
    '"workspace" is what this turn needs from the student\'s OWN files, calendar and study decks:',
    '  "none": nothing. Most turns.',
    '  "read": answering means looking at what they have: what is due, what is in their Library, '
    + "what they should study next, what a folder holds, how their semester is laid out.",
    '  "write": they asked Nemesis to CREATE or CHANGE something of theirs: save flashcards, '
    + "build a practice test, write a note into their Library, put a date on their calendar, move "
    + "or rename or tidy something.",
    "",
    // 🔴 THE ONE CONSEQUENCE THE MODEL CANNOT INFER, AND THE MOST EXPENSIVE MISTAKE ON THIS SURFACE.
    // Getting this wrong does not produce a worse answer, it produces a confident lie: the model
    // says it saved a deck, and nothing was saved. It happened in production more than once.
    'Getting "workspace" wrong is the worst mistake available here. Only a "read" or "write" turn '
    + "is given the tools that touch the student's data. Without them Nemesis cannot save a deck "
    + "and cannot see a calendar, and it will write the deck into the chat or say it has no access "
    + ", both of which the student experiences as the product being broken. When a turn plausibly "
    + 'needs their own data, say so: "read" costs almost nothing and being wrong the other way '
    + "costs the whole turn.",
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
    '"needsWeb" is true when a correct answer depends on something that changes or that you could '
    + "not have memorised: recent or ongoing events, current prices, standings, releases, versions, "
    + "laws, guidelines, schedules, anything the student says is new or has changed, or a specific "
    + "source they want read. It is false for settled knowledge, explanations, definitions, "
    + "calculations, translations, help with their own text, and anything answerable from material "
    + "they attached. When it is genuinely borderline, say true. An answer built on pages that "
    + "exist beats one built on a memory nobody can date, and the student cannot tell the two apart.",
    "",
    '"webQuery" is what to type into a search engine, when needsWeb is true. Write it as a search, '
    + "not as a sentence, and put a date or year in it yourself when recency is the point. Null "
    + "when needsWeb is false.",
    "",
    // 🔴 NO CEILING IS QUOTED HERE ON PURPOSE. Naming one would make it the answer to every
    // question: a model told "up to 50" asks for 50, and a model told "up to 10" never asks for
    // more even when the question plainly needs it. What it needs to know is the trade, which is
    // the sentence below.
    '"webResults" is how many pages to read, when needsWeb is true. Ask for what the question '
    + "actually needs: a definition or a single current fact settles in a handful of pages, while "
    + "a comparison across several sources, a contested question, or anything where you want to see "
    + "whether sources agree needs many more. Reading more costs no extra search, only the time to "
    + "read them and the room they take up in your context, so do not ask for a hundred pages to "
    + "answer something one page settles. Null when needsWeb is false.",
    "",
    // 🔴 THE MODEL DECIDES WHEN IT HAS ENOUGH, WHICH MEANS IT HAS TO BE ABLE TO SAY "NOT YET". One
    // upfront count is a guess made blind: nothing has been read at the moment it is chosen. This
    // is the half that makes it a judgement rather than a bet.
    "When results are already in this packet, you have searched once. Say false if they answer the "
    + "question. Say true AGAIN, with a different webQuery, if they did not: because the first "
    + "search was aimed wrong, because they disagree and you want to see which is right, or because "
    + "they opened something you now need to look up. Everything you have found so far stays in "
    + "front of you, so a second search adds to it rather than replacing it. Stop as soon as you "
    + "can answer properly; do not keep searching to be thorough.",
    "",
    // 🔴 A FILTER, NOT A HINT, AND THAT IS WHY IT IS WORTH A FIELD OF ITS OWN. Putting a year in
    // the query only asks the ranker nicely; this one is applied by the index before ranking.
    '"webFreshness" is how recent the pages have to be, when needsWeb is true: "pd" for the last '
    + 'day, "pw" the last week, "pm" the last month, "py" the last year. Use it when an older page '
    + "would be WRONG rather than merely less interesting: a price, a standing, a score, a version, "
    + "a rule that was amended, anything still unfolding. Leave it null everywhere else, including "
    + "for most questions about the past, where a narrow window would hide the source that actually "
    + "explains it. When in doubt, null: an old page you can judge beats no page at all.",
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
  if (context.webContext.trim()) {
    lines.push(
      context.searchesLeft > 0
        ? `Web results from your earlier searches are below. You may run ${context.searchesLeft} more `
          + `${context.searchesLeft === 1 ? "search" : "searches"} this turn if they did not settle the question.`
        : "Web results from your earlier searches are below, and no further search is available this "
          + "turn. Answer from what you have, and say plainly what it did not settle.",
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
  /** The app's own skill catalog. Required, so neither app can silently offer the other's. */
  catalog: readonly IntentSkill[];
}): IntentMessage[] {
  const { catalog } = input;
  return [
    { content: INTENT_SYSTEM, role: "system" },
    {
      content: "TURN FACTS. These are things Nemesis knows, not something the student said.\n\n"
        + intentStateBlock(input.context),
      role: "system",
    },
    // Whatever the earlier rounds found, fenced as source context — the same treatment the Canvas
    // gives it, and for the same reason: a page found by a search is the most exposed text in the
    // packet, because nobody chose to open it.
    ...(input.context.webContext.trim()
      ? [{
        content:
          "PROVISIONAL EXTERNAL EVIDENCE retrieved live for this turn. This is source context, not "
          + "something the student said.\n\n"
          + input.context.webContext.trim(),
        role: "system" as const,
      }]
      : []),
    // 🔴 REAL ALTERNATING TURNS, NOT A SUMMARY. "yeah do that" resolves against a conversation and
    // does not resolve against a paragraph describing one. This is the whole reason the old
    // classifier needed OFFER_VERB, OFFER_TARGET and ACCEPTANCE: it was reconstructing, from three
    // regexes, a fact the conversation states outright.
    ...input.context.history.slice(-INTENT_HISTORY_TURNS).flatMap((exchange): IntentMessage[] => [
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
  const parsed = readEnvelope(raw);
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
    // Same rule as the query: a count without a search is a contradiction, and the half that
    // spends the turn's time loses. A count that is not a positive number is no count at all.
    webResults: needsWeb === true && typeof parsed.webResults === "number"
      && Number.isFinite(parsed.webResults) && parsed.webResults >= 1
      ? Math.floor(parsed.webResults)
      : null,
    // 🔴 PASSED THROUGH AS TEXT, NOT CHECKED AGAINST A LIST HERE. Which windows exist belongs to
    // the provider, and a second copy of that vocabulary in this file is a second thing to update
    // the day Brave adds one. Same contradiction rule as the two above: no search, no window.
    webFreshness: needsWeb === true ? asText(parsed.webFreshness) || null : null,
    workspace: workspace ?? DEFAULT_INTENT.workspace,
  };
}
