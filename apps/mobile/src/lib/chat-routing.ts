import { isStudyCreationPreferenceReply } from "@nemesis/shared";

/**
 * Zero-cost request routing for Nemesis chat — the phone's copy of
 * apps/web/lib/workspace/chat-routing.ts (cloud-first pivot, phone chat §6).
 * Keep this in sync with the web original; the two must classify identically
 * so a thread shared between phone and web behaves the same either side.
 *
 * The client makes this decision deterministically instead of spending a model
 * call on classification. The server remains the authority on plan eligibility:
 * `reasoningEffort: "high"` may upgrade Pro/Max to the premium model, while
 * lighter plans retain DeepSeek Flash with thinking enabled.
 *
 * 🔴 WHAT THIS FILE CARRIES THAT WEB SPLITS ACROSS THREE (owner 2026-08-20,
 * "the deepseek brain should be instructed through prompt instructions on when
 * to search or use its tools like in the webapp"). Web keeps workspace-intent
 * detection in its own module (apps/web/lib/workspace/workspace-intent.ts) and
 * the model-asks-itself web pre-flight in another (chat-web-need.ts). On the
 * phone the workspace-intent half lives HERE, inline, in the section marked
 * below, and the web pre-flight lives in api/chat.ts beside the search call.
 * That is a file-layout divergence, not a behaviour one: the regexes, the
 * ordering and the exported names are the web module's, so a future sync is a
 * move rather than a rewrite. It is inline because this pass was scoped to
 * three files and adding a fourth would have collided with work in flight.
 *
 * 🔴 DO NOT "SYNC" THIS FILE BY COPYING WEB OVER IT. Four search triggers that
 * web keeps in chat-web-search.ts::shouldSearchWeb are INLINED here instead
 * (CHANGING_FACT_PATTERN, LIVE_SPORTS_PATTERN, EMERGING_ENTITY_PATTERN and the
 * bare-URL test), and two request shapes exist only here
 * (DIRECT_ARTIFACT_REQUEST, BARE_ARTIFACT_REQUEST). A verbatim overwrite
 * deletes all six silently. Merge, never replace.
 */

export type ChatRoute = "conversation" | "learning" | "current" | "research";
export type ChatModelAlias = "deepseek-chat" | "deepseek-reasoner";

export interface ChatRouteDecision {
  route: ChatRoute;
  model: ChatModelAlias;
  searchWeb: boolean;
  reasoningEffort?: "high";
  /** Set when the student asked Nemesis to SAVE something into their own
   *  workspace. Load-bearing, not a label: the write happens through a tool call,
   *  tool calls only ride the non-thinking model, and this flag is what stops the
   *  effort dial from quietly switching the tools off (chat-effort.ts). */
  savesToWorkspace?: boolean;
  /** Set when the student is asking ABOUT their own workspace — their calendar,
   *  Library, or Study state — or asking for it to be reorganized. As
   *  load-bearing as savesToWorkspace, for the same reason: these turns are
   *  answered THROUGH tools, so they must ride the tools-capable model and the
   *  effort dial must not strip them. This flag also stops sendChat's web
   *  re-promotion and its paid web search: "what's my schedule tomorrow" is a
   *  database read, not a news question (see detectsWorkspaceIntent below). */
  workspaceIntent?: boolean;
  /** Deliberate small talk or a question about Nemesis itself. Conversation is also the fallback
   * route for unmatched text, so this flag is what prevents a known casual turn from being
   * re-promoted by the independent web heuristics or the paid web-need pre-flight. */
  casual?: boolean;
}
const RESEARCH_PATTERN = /\b(deep research|research report|literature review|systematic review|compare (?:the )?(?:evidence|sources|studies)|primary sources?|scholarly sources?|peer[- ]reviewed|with citations?|cite (?:your|the) sources?|evidence for and against|state of the art|write (?:a )?report)\b/i;
// `what (?:has )?changed` is web's (chat-routing.ts:41) and was simply missing
// from the phone's copy — "what changed in the syllabus" is a live question on
// both surfaces or on neither.
const CURRENT_PATTERN = /\b(latest|current|currently|today|tonight|yesterday|tomorrow|news|price|weather|score|schedule|standings|release|version|update|recent|live|what (?:has )?changed|who (?:is|won|leads|runs|owns))\b/i;
const EXPLICIT_WEB_PATTERN = /\b(search(?: the)? web|web search|look(?:\s+(?:it|this|that))?\s+up|browse|online|internet)\b/i;
// 🔴 THE EXCLUSION IS LOAD-BEARING — A QUESTION ABOUT NEMESIS ITSELF IS NOT A
// CHANGING-WORLD FACT (owner 2026-08-20, ported from web chat-web-search.ts:13,
// where the same words already carry the same guard). Without it, "who are you"
// and "who is this" matched here, and this pattern is tested in the
// current-events branch BELOW — which sits ABOVE the casual branch. So the one
// question only Nemesis can answer bought a paid web search, went out on the
// tool-less reasoner, and came back describing an unrelated person of that
// name. CASUAL_PATTERN never got a chance to fire. Keep the useful "who is X"
// search gate; exclude only the self-referential forms.
const CHANGING_FACT_PATTERN = /\bwho\s+(?:(?:is|are)\s+(?!you\b|u\b|ya\b|this\b|nemesis\b)|won|leads|runs|owns)|\b(?:president|prime minister|ceo|champion|winner)\b/i;
const LIVE_SPORTS_PATTERN = /\b(world cup|super bowl|olympics?|playoffs?|finals?|tournament|match|game|who won|score|standings)\b/i;
const EMERGING_ENTITY_PATTERN = /\b(?:what|who)\s+(?:is|are)\s+(?:the\s+)?[\p{L}\p{N}._-]+(?:\s+[\p{L}\p{N}._-]+){0,4}\s+(?:agent|ai|app|company|framework|library|model|platform|plugin|product|project|service|software|tool)\b/iu;
const LEARNING_PATTERN = /\b(explain|teach|learn|study|solve|derive|prove|analy[sz]e|compare|contrast|why|how|calculate|debug|interpret|summari[sz]e|quiz|flashcards?|practice|step[- ]by[- ]step|concept|theorem|case|argument|equation|code)\b/i;
const CASUAL_PATTERN = /^(?:hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening)|who are you|what can you do)[!.?\s]*$/i;
const RECENT_YEAR_PATTERN = /\b202[4-9]\b/;

// ── does this turn need the student's OWN workspace? ────────────────────────
// 🔴 PORTED VERBATIM from apps/web/lib/workspace/workspace-intent.ts (owner
// 2026-08-05, the calendar incident). Inline here rather than in its own module
// for the reason given in this file's header. Every comment below is web's and
// records a failure observed in production — rewrite them if the behaviour
// changes, never delete them to shorten this file.
//
// Why it exists: whether a turn carries the workspace tools used to be decided
// by what it was NOT — anything matching the news/current-events words went to
// the reasoner, and the reasoner cannot carry tools (chat-effort.ts:toolsAllowed).
// "Organize my schedule", "what's due today", "give me an update on my calendar"
// all contain current-events words, so the exact phrasings that most need the
// tools were the ones guaranteed to lose them — and the no-tools prompt then told
// the model, in writing, that it cannot see the calendar at all. The student read
// that as "Nemesis can't see my events."
//
// Bias, stated on purpose: LEAN TOWARD MATCHING. A false positive costs the turn
// the thinking model — it still answers well on deepseek-chat, with the student's
// real data attached. A false negative recreates the incident above. The one
// thing the noun list must never contain is a subject term: "my notes" is
// workspace for a law student and a machinist alike; "my immune system" belongs
// to no product surface and must not fire.

/** Things that live in the student's workspace, in the words students use.
 *
 *  🔴 Mind the plural. `classes?` means "classe" plus an optional "s" — it never
 *  matches the singular "class", so "my class on Tuesday is cancelled" carried
 *  no workspace intent at all until 2026-08-05. Found in production. Anything
 *  whose plural adds "es" needs `word(?:es)?`, not `wordes?`.
 *  Product surfaces and academic containers only — never subject matter.
 *  "sources" is deliberately absent: "peer-reviewed sources" belongs to the
 *  research route, and a miss here is harmless (the conversation fallback
 *  rides the tools-capable model anyway). */
const WORKSPACE_NOUN =
  "(?:calendars?|schedules?|planner|agenda|timetable|deadlines?|due dates?|exams?|quiz(?:zes)?|tests?|class(?:es)?|lectures?|assignments?|labs?|rotations?|library|notes?|folders?|files?|uploads?|recordings?|decks?|flash\\s?cards?|cards?|mind\\s?maps?|slides?|study (?:page|list|sets?|material|plan|workload|queue)|workload|workspace|courses?|semester|term)";

/** "my <workspace thing>" within one clause. `our` covers group-project talk. */
const MY_WORKSPACE_RE = new RegExp(`\\b(?:my|our)\\b[^.?!\\n]{0,40}\\b${WORKSPACE_NOUN}\\b`, "i");

/** A tidying or moving verb aimed at a workspace container ("clean up the
 *  library", "move this deck into Pharmacology", "reorganize everything").
 *  The noun may be theirs or bare — "the library" after "organize" is never
 *  the one in Alexandria. */
const ORGANIZE_RE = new RegExp(
  `\\b(?:organi[sz]e|re-?organi[sz]e|clean(?:\\s?up)?|tidy(?:\\s?up)?|sort(?:\\s?out)?|rearrange|restructure|re-?file|consolidate|merge|de-?clutter|archive|move|rename|put)\\b[^.?!\\n]{0,60}\\b(?:${WORKSPACE_NOUN}|everything)\\b`,
  "i",
);

/** "what's due", "anything due Friday", "what do I have this week". These carry
 *  no possessive and no product noun, and they are pure calendar questions. */
const DUE_ASK_RE =
  /\b(?:what(?:'s| is| else is)?|anything|something)\b[^.?!\n]{0,30}\bdue\b|\bdue\s+(?:today|tonight|tomorrow|this week|next week|soon)\b|\bdo i have\b[^.?!\n]{0,40}\b(?:due|today|tonight|tomorrow|this week|next week|coming up)\b/i;

/** A browse verb aimed at a workspace noun with no possessive: "show me recent
 *  lectures", "list my decks" (also caught above), "pull up the syllabus notes",
 *  "show me everything this semester". Without this rule, "show me recent
 *  lectures" lost its tools to the news-word "recent" — the owner's own
 *  acceptance case. The verb keeps "the French Revolution" out: bare nouns
 *  without a browse verb never fire here. */
const BROWSE_RE = new RegExp(
  `\\b(?:show me|list|pull up|open|browse|look at|go through|check|review|which|what)\\b[^.?!\\n]{0,40}\\b(?:${WORKSPACE_NOUN}|everything)\\b`,
  "i",
);

/** "What should I study?" — asking the workspace to PICK, which needs the due
 *  counts and the exam dates, not a tutor.
 *
 *  Owner 2026-08-05, acceptance test 7: "Show me what I need to study." carried
 *  no possessive, no organize verb and no "due", and bare `study` is a subject
 *  verb rather than a product noun — so nothing here fired, LEARNING_PATTERN
 *  then matched the word "study", and the turn went to the reasoner with ZERO
 *  tools. Nemesis answered with immunology lecture text instead of what was due.
 *
 *  The shape is the whole point, and it is why this is not simply the word
 *  "study" added to WORKSPACE_NOUN. It must match "what should I study" and miss
 *  "teach me X", "explain X", "help me study for exam 2" and "what's the best
 *  way to study organic chemistry" — those are tutoring, they belong on the
 *  thinking model, and stealing them would make Nemesis worse at its main job. */
const STUDY_PLAN_RE =
  /\bwhat\b[^.?!\n]{0,40}\bI\b[^.?!\n]{0,25}\b(?:study|studying|review|revise|revising|work on|focus on|catch up on|behind on|prioriti[sz]e)\b|\bshow me what I\b[^.?!\n]{0,25}\b(?:study|review)\b/i;

/** "Get me ready for Exam 2" / "help me prepare for the OSCE" — planning against
 *  a real dated thing in their workspace, so it needs the calendar and the deck
 *  state before it can say anything useful.
 *
 *  Included deliberately: the owner's original brief named "get me ready for
 *  Exam 2" as a target workflow, and it matched nothing. If it turns out to feel
 *  more like tutoring than planning in daily use, delete this rule alone — the
 *  nine phrasings the owner listed are all carried by STUDY_PLAN_RE and
 *  DUE_ASK_RE above, and none of them depend on this one. */
const PREPARE_RE = new RegExp(
  `\\b(?:get me ready|getting me ready|prep(?:are)? me|help me prep(?:are)?|ready me)\\b[^.?!\\n]{0,30}\\bfor\\b[^.?!\\n]{0,30}\\b${WORKSPACE_NOUN}\\b`,
  "i",
);

/** Things a student asks Nemesis to CREATE. Wider than WORKSPACE_NOUN because
 *  the creation verb in front of it is doing most of the work: "what is the
 *  event horizon" is a physics question, but "add an event" never is. These
 *  extras are only ever consulted with a creation verb attached. */
const CREATABLE_NOUN = `(?:${WORKSPACE_NOUN}|events?|reminders?|appointments?|meetings?|sessions?|entr(?:y|ies))`;

/**
 * "Add an exam on 15 September", "create a note about today's lecture",
 * "schedule a lab for Friday" — asking Nemesis to PUT SOMETHING IN the
 * workspace.
 *
 * 🔴 FOUND IN PRODUCTION 2026-08-05, during the Phase 2 acceptance pass. Every
 * rule above matches a request to READ, ORGANISE or CHOOSE. Nothing matched a
 * request to CREATE unless the student happened to say "my" — so "Add an exam
 * called … on 2026-09-15 from 13:30 to 14:30." went to deepseek-reasoner with
 * ZERO tools, and Nemesis replied:
 *
 *   "I can't add events to your calendar from this environment — I have no
 *    access to it right now, and nothing has been scheduled."
 *
 * That is the calendar incident this whole block exists to prevent, word for
 * word, reached through the one verb nobody tested. "Create a note about
 * today's lecture" and "Schedule a lab on Friday at 2pm" failed the same way.
 *
 * The noun anchor is what keeps this honest: the verb must be aimed at
 * something the workspace actually holds. "Make a table comparing two designs"
 * and "create a mnemonic for the cranial nerves" are writing, not filing, and
 * they stay on the thinking model.
 */
const CREATE_RE = new RegExp(
  `\\b(?:add|create|schedule|book|set up|start|make|save|log|put|jot down|write down)\\b[^.?!\\n]{0,60}\\b${CREATABLE_NOUN}\\b`,
  "i",
);

/**
 * True when answering well requires reading (or changing) this student's own
 * workspace. Pure and total — safe to call on every keystroke of routing.
 */
export function detectsWorkspaceIntent(text: string): boolean {
  const compact = text.trim();
  if (!compact) return false;
  return (
    MY_WORKSPACE_RE.test(compact) ||
    ORGANIZE_RE.test(compact) ||
    CREATE_RE.test(compact) ||
    DUE_ASK_RE.test(compact) ||
    BROWSE_RE.test(compact) ||
    STUDY_PLAN_RE.test(compact) ||
    PREPARE_RE.test(compact)
  );
}

// ── save requests ───────────────────────────────────────────────────────────
// A message that asks Nemesis to SAVE or CREATE something in the student's own
// workspace — a flashcard deck, a practice test, a mind map, a Library note. These
// MUST leave on the tools-capable model: the write is performed by a tool call,
// and tool calls only ride the non-thinking model (deepseek-chat, see
// chat-effort.ts:toolsAllowed). Route a save to the reasoner and it answers in
// prose and saves nothing — which is exactly why "make me flashcards on beta
// blockers" (LEARNING_PATTERN matches "flashcards") used to do nothing.
//
// Two shapes are matched, deliberately narrow so ordinary learning questions
// never trip it:
//   1. A creation verb next to an UNAMBIGUOUS study artifact ("make flashcards",
//      "build a mind map", "create a practice test"). Those nouns never mean
//      anything but the artifact, so a nearby verb is enough. "write" is NOT a
//      save verb — "write a literature review" / "write a test for this
//      function" must stay on their normal routes.
//   2. An explicit "into my workspace" phrase for the AMBIGUOUS targets:
//      "add these to my deck", "save this as a note", "put my exam on my
//      calendar". "note"/"schedule"/"test" alone are ordinary words, so they
//      only count when anchored to the student's own deck/library/notes/calendar.
const SAVE_ARTIFACT =
  /\b(?:flash\s?cards?|mind\s?maps?|practice tests?|mock exams?|question banks?|study sets?|decks?|slides?|slide decks?|presentations?|study notes?|class notes?|lecture notes?|study guides?)\b/i;
const SAVE_VERB = /\b(?:make|create|build|generate|add|save|put together|whip up|draft|prep(?:are)?|turn\s+(?:this|that|these|it)\s+into|give me|set up)\b/i;
const SAVE_TO_WORKSPACE = /\b(?:to|in|into|on)\s+my\s+(?:deck|library|notes?|calendar|study(?:\s+(?:deck|list))?)\b|\bon my calendar\b|\bas a (?:library )?note\b|\b(?:add|put|save|schedule)\b[^.?!]{0,40}\bcalendar\b/i;
const DIRECT_ARTIFACT_REQUEST =
  /\b(?:i (?:need|want)|give me|please (?:make|create|prepare)|can you (?:make|create|prepare))\b[^.?!]{0,80}\b(?:flash\s?cards?|mind\s?maps?|practice tests?|mock exams?|question banks?|slides?|slide decks?|presentations?|study notes?|study guides?)\b/i;
const BARE_ARTIFACT_REQUEST =
  /^(?:please\s+)?(?:\d+\s+)?(?:flash\s?cards?|mind\s?maps?|practice tests?|mock exams?|question banks?|slides?|slide decks?|presentations?|study notes?|class notes?|lecture notes?|study guides?)\b/i;
const CREATE_ASSESSMENT =
  /\b(?:make|create|build|generate|draft|whip up|put together|give me|set up)\s+(?:me\s+)?(?:an?|another|some|\d+)?\s*(?:new\s+)?(?:practice\s+|mock\s+)?(?:tests?|quiz(?:zes)?|exams?|question\s+banks?)\b/i;
const CODE_TEST =
  /\b(?:unit|integration|e2e|end-to-end|regression|snapshot)\s+tests?\b|\btests?\s+(?:for|of)\s+(?:this|that|the|my)\s+(?:function|method|class|component|module|code|file|endpoint)\b|\btest\s+(?:suite|case|file|harness)s?\b/i;

// ── accepting an offer the app itself made ───────────────────────────────────
// 🔴 PORTED FROM WEB (chat-routing.ts:97-145) — it was missing here entirely,
// and its absence was a live bug on the phone, not a cosmetic gap.
//
// The lecture-intake skill ends every deck upload with "Want me to turn this
// into notes, flashcards, a practice test, or all three?" — and the student
// then replies with one word. "flashcards" carries no save verb, so the rules
// above cannot see it; LEARNING_PATTERN matches `flashcards?` and sends the
// turn to the reasoner, which has no tools. Observed live on web 2026-07-27:
// the model wrote "[Calling tool: add_flashcards ...]" as PROSE, invented a
// deck that does not exist, and reported 14 cards saved. Nothing was written.
// (BARE_ARTIFACT_REQUEST above happens to catch a bare "flashcards" on the
// phone, but never "notes", "all three", "both" or a plain "yes" — which is
// most of what students actually type back.)
//
// The words alone can never decide this — "notes" and "all three" are not save
// requests in isolation. The offer is the missing half, so both sides must
// agree: the previous assistant turn ended by offering to build something, AND
// this reply is a short acceptance.
const OFFER_VERB = /\b(?:want me to|would you like me to|do you want me to|shall i|should i|i can)\b/i;
// `calendar`/`events`/`dates` are here because syllabus-intake's offer is "Want
// me to add these to your calendar?". Without them the offer went unrecognised,
// and a bare "yes" only kept its tools by falling through to the conversation
// route — which quietly breaks the moment the effort dial is on High, since
// that strips tools from everything except a decision flagged savesToWorkspace.
const OFFER_TARGET = /\b(?:notes?|flash\s?cards?|cards?|practice tests?|tests?|quiz(?:zes)?|mind\s?maps?|study guides?|deck|slides?|summary|outline|calendar|events?|dates|schedule)\b/i;
const ACCEPTANCE = /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please|do it|go ahead|sounds good|all (?:three|of them|of it|of the above)|both|everything)\b/i;
/** A reply longer than this is the student saying something new, not "yes". */
const ACCEPTANCE_MAX_CHARS = 80;
/** Openers that make a short artifact-word reply a QUESTION about the artifact
 *  ("explain how flashcards help memory") rather than a request to build one. */
const NOT_AN_ACCEPTANCE = /^(?:what|why|how|when|where|who|which|is|are|does|can|could|would|explain|tell|describe|define|compare)\b/i;
/** Opens a question ABOUT something rather than a request FOR it. Deliberately
 *  excludes "can/could/would you", which are how students phrase a polite ask. */
const ASKS_ABOUT = /^(?:what|why|how|when|where|who|which)\b/i;

/** Did the assistant's previous turn end by offering to CREATE something? Only
 *  the last line counts — that is where an offer lands, and a mid-answer
 *  mention of flashcards is not an offer. */
export function offersToCreate(assistantText: string): boolean {
  const lastLine = assistantText.trim().split("\n").map((line) => line.trim()).filter(Boolean).pop() ?? "";
  if (!lastLine.endsWith("?")) return false;
  return OFFER_VERB.test(lastLine) && OFFER_TARGET.test(lastLine);
}

/** Is this reply a short "yes, build it"? Checked only against a real offer. */
export function acceptsOffer(text: string): boolean {
  const compact = text.trim();
  if (!compact || compact.length > ACCEPTANCE_MAX_CHARS || compact.includes("?")) return false;
  // "do it" and "ok" start with words NOT_AN_ACCEPTANCE would otherwise reject.
  if (ACCEPTANCE.test(compact)) return true;
  if (NOT_AN_ACCEPTANCE.test(compact)) return false;
  return OFFER_TARGET.test(compact);
}

/** Does this message ask to persist something in the student's workspace? Pure
 *  and exported so the routing tests can pin the real phrasings students use.
 *
 *  `priorAssistantText` is optional so every existing call site is unchanged;
 *  pass it wherever the conversation is available, because it is the only thing
 *  that can classify a bare "all three" or a plain "yes". */
export function detectsSaveRequest(text: string, priorAssistantText = ""): boolean {
  const compact = text.trim();
  // "How do I make good flashcards?" is a question ABOUT the artifact, not a
  // request FOR one, but it carries both a save verb and a save noun. Asking
  // words only ever open a question; a request uses "can you", "could you" or
  // a bare imperative, none of which start this way.
  if (ASKS_ABOUT.test(compact)) return false;
  if (isStudyCreationPreferenceReply(compact, priorAssistantText)) return true;
  if (SAVE_VERB.test(compact) && SAVE_ARTIFACT.test(compact)) return true;
  if (CREATE_ASSESSMENT.test(compact) && !CODE_TEST.test(compact)) return true;
  if (DIRECT_ARTIFACT_REQUEST.test(compact)) return true;
  if (BARE_ARTIFACT_REQUEST.test(compact)) return true;
  if (SAVE_TO_WORKSPACE.test(compact)) return true;
  return offersToCreate(priorAssistantText) && acceptsOffer(compact);
}

/**
 * A turn whose only content is an attachment — the student typed nothing, so
 * there is no question to classify.
 *
 * Still a learning turn on the thinking model, because that is what reads a
 * lecture well. But never a web-search turn: the only text that could have
 * asked for one is the file itself, and a slide citing a recent year is not a
 * student asking for today's news.
 *
 * Ported from web (chat-routing.ts:176). On the phone this used to fall through
 * to the final `conversation` fallback, so a silent upload was answered by the
 * cheapest lane instead of the one that can actually read a deck.
 */
export const ATTACHMENT_ONLY_DECISION: ChatRouteDecision = { model: "deepseek-reasoner", route: "learning", searchWeb: false };

export function classifyChatRequest(text: string, priorAssistantText = ""): ChatRouteDecision {
  const compact = text.trim();
  // A save request wins over every reasoner route below so its tools can fire.
  // Web is kept when the topic needs it (deepseek-chat can still search), and
  // route "conversation" is never emitted for a save, so the web re-promotion in
  // api/chat.ts (which only upgrades "conversation" to the reasoner) cannot
  // quietly undo this.
  if (detectsSaveRequest(compact, priorAssistantText)) {
    // 🔴 RECENT_YEAR_PATTERN is deliberately NOT consulted here, and it used to
    // be (owner 2026-08-20 parity pass). In a save request a year is part of a
    // DATE — "add Aug 3 2026 exam to my calendar" — not a request for current
    // information, and every calendar save carries one. Web measured this live
    // 2026-07-27: that phrasing bought a paid search it had no use for. The
    // other four triggers below STAY, unlike web's, because the phone reaches a
    // save with no second heuristic layer behind it (the model web-need
    // pre-flight in api/chat.ts skips saves, exactly as web's does).
    const wantsWeb =
      RESEARCH_PATTERN.test(compact) ||
      CURRENT_PATTERN.test(compact) ||
      CHANGING_FACT_PATTERN.test(compact) ||
      LIVE_SPORTS_PATTERN.test(compact) ||
      EMERGING_ENTITY_PATTERN.test(compact) ||
      EXPLICIT_WEB_PATTERN.test(compact) ||
      /https?:\/\//i.test(compact);
    return wantsWeb
      ? { model: "deepseek-chat", route: "current", savesToWorkspace: true, searchWeb: true }
      : { model: "deepseek-chat", route: "learning", savesToWorkspace: true, searchWeb: false };
  }
  // An explicit deep-research request keeps the research pipeline — a student
  // asking for a literature review wants sources and synthesis, not their own
  // folders, even when the sentence brushes a workspace word.
  if (RESEARCH_PATTERN.test(compact)) {
    return { route: "research", model: "deepseek-reasoner", searchWeb: true, reasoningEffort: "high" };
  }
  // A question about the student's OWN workspace outranks the remaining
  // reasoner routes, exactly like a save does — the answer comes from tools,
  // and tools only ride deepseek-chat. This check must sit ABOVE the
  // current-events branch: "organize my schedule", "what's due today",
  // "update my calendar" all contain CURRENT_PATTERN words, and before this
  // guard existed those exact phrasings were the ones guaranteed to lose
  // their tools and be told "you cannot see the calendar" (the 2026-08-05
  // calendar incident, which the phone still had open until 2026-08-20).
  if (detectsWorkspaceIntent(compact)) {
    const wantsWeb = EXPLICIT_WEB_PATTERN.test(compact);
    return { model: "deepseek-chat", route: wantsWeb ? "current" : "conversation", searchWeb: wantsWeb, workspaceIntent: true };
  }
  if (
    CURRENT_PATTERN.test(compact) ||
    CHANGING_FACT_PATTERN.test(compact) ||
    LIVE_SPORTS_PATTERN.test(compact) ||
    EMERGING_ENTITY_PATTERN.test(compact) ||
    EXPLICIT_WEB_PATTERN.test(compact) ||
    RECENT_YEAR_PATTERN.test(compact) ||
    /https?:\/\//i.test(compact)
  ) {
    return { route: "current", model: "deepseek-reasoner", searchWeb: true };
  }
  if (CASUAL_PATTERN.test(compact)) {
    return { casual: true, route: "conversation", model: "deepseek-chat", searchWeb: false };
  }
  if (LEARNING_PATTERN.test(compact) || compact.length >= 120) {
    return { route: "learning", model: "deepseek-reasoner", searchWeb: false };
  }
  return { route: "conversation", model: "deepseek-chat", searchWeb: false };
}

/**
 * Time-sensitive searches need an explicit date. Without it, providers can rank
 * an old winner or schedule above today's result.
 *
 * 🔴 THIS USED TO BE A ROUTE TEST, AND THAT WAS THE PHONE DECIDING IN CODE WHAT
 * WEB DECIDES BY THE QUESTION (owner 2026-08-20). api/chat.ts carried a private
 * `withFreshDateAnchor` and stapled the date on whenever the ROUTE was
 * "current" — so "summarise https://example.com/paper" (a URL, hence the current
 * route) searched for that URL plus "current as of 2026-08-20", and a turn the
 * model's own web pre-flight promoted got the same treatment for no reason. Web
 * gates on the WORDS instead (buildFreshSearchQuery, chat-web-search.ts:33), so
 * only a question that is actually about a moving target is anchored. Same name
 * as web's on purpose: a future sync is a move, not a rewrite.
 *
 * `now` is a parameter so a test can pin the date without touching the clock.
 */
export function buildFreshSearchQuery(query: string, now = new Date()): string {
  if (!CURRENT_PATTERN.test(query) && !CHANGING_FACT_PATTERN.test(query) && !LIVE_SPORTS_PATTERN.test(query)) return query;
  return `${query.trim()} current as of ${now.toISOString().slice(0, 10)}`;
}

/**
 * The route for one turn, once the composer's Deep research toggle is taken into
 * account. `research` is the forced research decision when that toggle is on, and
 * null when it isn't.
 *
 * A SAVE REQUEST BEATS THE TOGGLE. Deep research runs on the reasoner, which
 * carries no tools — so "make me flashcards on beta blockers" with the toggle left
 * on would produce an essay and save nothing, and the student would have no way to
 * tell why. Deep research is a persistent toggle they may have flipped days ago;
 * "make me flashcards" is what they typed just now, so the fresher, more specific
 * instruction wins. The research route is still honoured for every turn that
 * isn't asking us to write something into their account.
 *
 * A WORKSPACE READ DOES *NOT* BEAT IT, and that asymmetry is on purpose
 * (considered and rejected 2026-08-20). A save is impossible on the reasoner —
 * no tools, no write, nothing to show for the turn. A workspace question on the
 * research route still gets answered, just without reading their folders, and
 * detectsWorkspaceIntent deliberately leans toward matching, so letting it win
 * here would silently cancel Deep research for "write me a literature review
 * from my notes on X". Web settles the same tie the same way: RESEARCH_PATTERN
 * is tested ABOVE detectsWorkspaceIntent in classifyChatRequest.
 *
 * Pure and separate from the caller so this precedence has a test rather than
 * living as one condition inside a 40-line send function.
 */
export function routeForTurn(
  text: string,
  research: ChatRouteDecision | null,
  priorAssistantText = "",
): ChatRouteDecision {
  if (research && !detectsSaveRequest(text, priorAssistantText)) return research;
  return classifyChatRequest(text, priorAssistantText);
}

/**
 * The extra line a WORKSPACE turn carries, on top of its route instruction. The
 * retrieved brain packet (buildWireMessages) holds the data; this holds the rule.
 *
 * 🔴 THIS STRING DIVERGES FROM WEB'S IN EXACTLY TWO PLACES, BOTH BECAUSE THE
 * PHONE DOES NOT CARRY WHAT WEB'S SENTENCE ASSUMES (owner 2026-08-20 for the
 * first, owner 2026-08-21 for the second). Everything outside those two spots is
 * web's byte for byte, so the two surfaces cannot drift into two different rules.
 *
 * (1) THE TOOL NAMES IN THE BRACKET ARE THE PHONE'S, NOT WEB'S. Web's string
 * names get_library_tree and get_study_overview. Neither tool exists in
 * apps/mobile/src/lib/agent-tools.ts — the phone advertises 26 tools where web
 * advertises 39 — and a prompt that promises a capability the turn never carried
 * is an instruction to fabricate one, which is the precise failure web's
 * CHAT_NO_TOOLS_PROMPT was written to prevent. When the phone gains the missing
 * read tools, this bracket becomes web's and the divergence disappears.
 *
 * (2) THE ATTACHED-BACKGROUND SENTENCE IS THE PHONE'S TOO, AND IT HAS NOW BEEN
 * WRONG TWICE IN OPPOSITE DIRECTIONS (owner 2026-08-21). Web attaches a compact
 * workspace snapshot as its own system message every workspace turn
 * (apps/web/lib/workspace/chat-api.ts: loadWorkspaceOverview -> workspaceSnapshot
 * -> the "Live snapshot of this student's workspace" message), so on web "start
 * from the attached snapshot for orientation" and "The snapshot's lists are
 * samples" describe a document genuinely in the conversation. Until 2026-08-21
 * this string was web's byte for byte, naming a snapshot the phone does not
 * build. That much was real.
 *
 * 🔴 THE FIX FOR IT WAS WRONG, AND HOW IT WENT WRONG IS THE PART WORTH KEEPING.
 * It replaced web's clause with "nothing about their workspace is attached up
 * front", on the strength of ONE PIECE OF EVIDENCE: a grep of the phone for the
 * word "snapshot", which returned nothing. Absence of web's WORD was read as
 * absence of the THING. It is not there under that name. It is there under
 * another one, and the trail is three files long:
 *   api/chat.ts:603  shouldRecallBrain(userText) ? recallBrain(userText) : null
 *   api/chat.ts:638  formatBrainContext(brain, userText)  (packages/shared)
 *   lib/chat-thread.ts:258  that text goes out as its OWN system message (:261),
 *                           "Background retrieved automatically from this
 *                           student's workspace."
 * formatBrainContext fills it with the student's semantically matching Library
 * notes, their one-hop linked notes, knowledge-graph relationships, Calendar
 * events and repeatedly-missed Study cards. So the phone DOES attach workspace
 * background up front, on essentially every workspace turn, and the sentence
 * telling the model otherwise was inviting it to disbelieve real material of the
 * student's sitting in its own context.
 *
 * NEVER GREP FOR THE OTHER SURFACE'S VOCABULARY AND CONCLUDE FROM A ZERO. Ported
 * subsystems get renamed on the way across; web says "snapshot", the phone says
 * "brain"/"recall"/"background". Follow the call chain from the send path
 * instead, which is what the three lines above are recorded here for.
 *
 * WHAT THE TWO SURFACES ACTUALLY SEND, AND WHY THE WORDS STILL DIFFER: BOTH send
 * the semantic recall (web passes the same brainContext into its own
 * buildWireMessages). Web sends a LISTING ON TOP OF IT — chat-api.ts:313 says so
 * in the message itself, "the counts are complete, the lists are samples", which
 * is a known whole sampled down. The phone sends the recall ALONE: whatever
 * matched this question, capped (6 notes, 5 linked, 8 events, 6 cards) and empty
 * whenever nothing matched, the text is a bare acknowledgement, or the backend
 * degrades. Both are partial; they are partial in different ways, and only web's
 * carries counts at all, so one sentence cannot serve both without lying on one
 * of them. Hence the divergence stays, now describing the recall.
 *
 * TRIED AND REJECTED: building a snapshot on the phone so web's words become
 * true. That is a feature (a new workspace-overview loader, a new per-turn read,
 * a new cost on every workspace turn), not a fix for a false sentence, and it was
 * out of scope for this pass. The honest remedy is the one paragraph (1) already
 * took — say what this surface actually sends.
 *
 * TRIED AND REJECTED: dropping the clause and letting the tools sentence stand
 * alone. It removes the false claim, but it also removes the "do not mistake a
 * partial view for the whole picture" warning at the exact spot the student's
 * real notes enter the context — and that warning is the whole reason this
 * string exists. It is kept, now pointed at BOTH the recall and the tool results.
 * WHEN THE PHONE GAINS A SNAPSHOT BUILDER, restore web's two clauses verbatim
 * and this half of the divergence disappears with them.
 */
export const WORKSPACE_INSTRUCTION =
  "This turn is about the student's own workspace. Ground every claim in what the tools return THIS turn — any workspace " +
  "background attached to this turn is a semantic recall, only the notes, links, events, and cards that matched this " +
  "question, so read before stating contents, counts, or dates. It samples what matched and may be empty, and tool " +
  "results are partial by default: for anything about 'everything', a full semester, or a reorganization, read the complete state first " +
  "(search_library, list_calendar_events with the real range, list_study_decks and list_study_artifacts). When you change things, say plainly what " +
  "changed and what you left alone; when something is ambiguous or risky, ask before acting.";

/**
 * The extra line a SAVE turn carries, on top of its route instruction.
 *
 * Routing the turn correctly only buys the tools; it does not make the model
 * reach for them. Owner 2026-07-28 asked that "anytime user asked for
 * flashcards or tests it should automatically create in the study page", and a
 * model handed both a tool and a blank page will often just write the artifact
 * out — which is what a student sees as "it went into the chat instead".
 *
 * Only sent when the tools are actually attached: a turn that promises to save
 * and cannot is worse than one that never offered.
 *
 * VERBATIM from web (chat-routing.ts:246-249) — every tool it names
 * (add_practice_test, add_flashcards, create_library_note) exists on the phone,
 * so there is nothing here to adapt and nothing to let drift.
 */
export const SAVE_INSTRUCTION =
  "This turn asks you to CREATE something in the student's workspace. The app has already collected any required deck format or test settings in the conversation; follow those exact choices. Do it with the tools — add_practice_test for a test or quiz, add_flashcards for cards, create_library_note for notes — and do it in this turn, not after asking permission. For flashcards, set each card_type to basic, cloze, or reversed as requested. " +
  "Never write the flashcards or the test questions out in your reply as a substitute for saving them: the student is looking for it on their Study page, and a copy in the chat is not there. " +
  "Once it is saved, say in one short line what you made and where it went.";

/**
 * The one-line framing for a turn, chosen by its route and by the shape of the
 * evidence it carries. Joined into the head system message beside
 * CHAT_SYSTEM_PROMPT (chat-thread.ts:buildWireMessages) and into the notebook
 * one (notebook-model.ts:buildNotebookWireMessages).
 *
 * 🔴 "research" AND "current" USED TO ASK FOR RAW ADDRESSES, AND THAT WAS THE
 * LAST LIVE HALF OF THE OWNER'S "the responses still return url strings"
 * (owner 2026-08-21). They read "cite URLs beside supported claims" and "cite
 * relevant URLs". Those are the two routes a searching turn actually takes
 * (classifyChatRequest emits "current" for every web trigger and "research" for
 * a deep-research ask), so on exactly the turns that carry live results the
 * model was handed BOTH instructions in one request: the base prompt and the
 * evidence block said "cite them by their bracketed number, like [1]. Never
 * write a raw URL in the prose" (chat-thread.ts:150 and :448, both already
 * fixed), and this function said the opposite three lines later. A model
 * resolving that tie picks the more concrete instruction, and "cite URLs" is
 * the more concrete one — which is why the fix upstream did not stop the raw
 * links reaching the screen. Both sentences now use chat-thread.ts's exact
 * words, so there is ONE form of words across the whole request.
 *
 * TRIED AND REJECTED: dropping the citation clause from these two lines
 * entirely and letting the base prompt carry the rule alone. Shorter, and it
 * removes the contradiction just as well — but the route line is the only
 * framing a notebook turn gets past its own system prompt, and a route named
 * "research" that says nothing about citing reads as permission not to. Saying
 * the same thing twice is the cheaper failure.
 *
 * 🔴 WEB HAS THIS EXACT CONTRADICTION STILL OPEN, at
 * apps/web/lib/workspace/chat-routing.ts:254 and :256, word for word. It is
 * deliberately NOT fixed here: web is the reference surface and is not this
 * lane's to edit, and it is reported to the owner instead. SO DO NOT "SYNC"
 * THESE TWO LINES FROM WEB — copying web over them re-introduces the bug the
 * owner reported twice. When web is fixed, the two match again on their own.
 *
 * 🔴 THE CITATION FORM IS A PROPERTY OF THE TURN'S EVIDENCE, NOT OF THE ROUTE
 * (owner 2026-08-21). The bracket fix above was written for chat and then leaked
 * into notebooks, because both callers share this function and only chat's
 * evidence is numbered. What each caller actually carries:
 *
 *   chat (chat-thread.ts:buildWireMessages) — live web results, formatted by
 *   formatWebSearchContext as "result 1", "result 2"… and rendered by
 *   <MessageBody sources={…}>, which rewrites an in-range [1] into a tappable
 *   chip (components/MessageBody.tsx, canvas/citation-markers.ts). Numbers
 *   resolve, so numbers are the right ask.
 *
 *   notebooks (notebook-model.ts:buildNotebookWireMessages) — the student's own
 *   attached sources, headed "### Source: <name>" by buildSourceContext and
 *   never numbered; grounded mode attaches no web results at all; and
 *   app/notebook.tsx renders through <MessageBody> with NO sources prop, so
 *   citationsToMarkdown is called with a count of 0, every marker is
 *   out-of-range, and a "[1]" is left on screen as literal dangling text
 *   pointing at nothing. Names resolve there; numbers cannot.
 *
 * So the second parameter states how THIS turn's evidence is addressed, and the
 * caller — which is the only thing that knows what it attached and how it will
 * be drawn — says it. Both wordings still end with "Never write a raw URL in the
 * prose": notebooks pass no sources prop, so MessageBody's bare-URL demotion is
 * off there too and an address in the prose stays a raw underlined address.
 *
 * TRIED AND REJECTED: special-casing the notebook caller inside this function
 * (an `isNotebook` flag, or a "notebook" pseudo-route). It reads as a caller
 * exception rather than a fact about the evidence, and it would be wrong the day
 * a notebook turn does carry numbered results, or the day another surface
 * without a sources prop reuses this function.
 *
 * TRIED AND REJECTED: making the parameter required, so neither call site can
 * be silently wrong. chat-thread.ts is held open by another lane this pass and
 * could not be edited to pass it, so the default is chat's form — the form this
 * function has always emitted, which keeps that caller's behaviour byte-identical.
 * Make it required the moment chat-thread.ts is free.
 */

/** How the evidence attached to THIS turn can be pointed at in the answer.
 *  - "numbered-web-results": live search results supplied as a numbered list AND
 *    a renderer holding that same list, so "[1]" resolves (chat).
 *  - "named-sources": evidence identified only by name, with no number and no
 *    citation-resolving renderer, so a bracketed number would dangle (notebooks). */
export type TurnEvidenceForm = "numbered-web-results" | "named-sources";

export function routeInstruction(
  route: ChatRoute,
  evidence: TurnEvidenceForm = "numbered-web-results",
): string {
  const numbered = evidence === "numbered-web-results";
  switch (route) {
    case "research":
      return numbered
        ? "Treat this as research: synthesize the strongest supplied evidence, cite them by their bracketed number, like [1], beside supported claims, distinguish consensus from disagreement, and state important limitations. Never write a raw URL in the prose."
        : "Treat this as research: synthesize the strongest supplied evidence, name the source behind each supported claim, distinguish consensus from disagreement, and state important limitations. Never write a raw URL in the prose.";
    case "current":
      return numbered
        ? "Treat this as time-sensitive: rely on the supplied live results, cite them by their bracketed number, like [1], and say plainly when a current claim could not be verified. Never write a raw URL in the prose."
        : "Treat this as time-sensitive: rely on the supplied sources, name the source behind each current claim, and say plainly when they do not settle it. Never write a raw URL in the prose.";
    case "learning":
      return "Teach for durable understanding: answer directly, show the reasoning at the learner's level, surface likely misconceptions, and use equations, examples, or code only when useful.";
    case "conversation":
      return "Respond directly and naturally. Keep simple questions concise, but do not omit details the user needs.";
  }
}
