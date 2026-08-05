// Does this message need the student's OWN workspace — their calendar, Library,
// or Study state — to answer or act?
//
// Why this exists (owner 2026-08-05, the calendar incident): whether a turn
// carries the workspace tools used to be decided by what it was NOT — anything
// matching the news/current-events words went to the reasoner, and the reasoner
// cannot carry tools (chat-effort.ts:toolsAllowed). "Organize my schedule",
// "what's due today", "give me an update on my calendar" all contain
// current-events words, so the exact phrasings that most need the tools were
// the ones guaranteed to lose them — and the no-tools prompt then told the
// model, in writing, that it cannot see the calendar at all. The student read
// that as "Nemesis can't see my events."
//
// So workspace intent is now detected FIRST, positively, and it wins the route
// (chat-routing.ts consults this before the current-events check; chat-effort
// keeps the tools on whatever the effort dial says).
//
// Bias, stated on purpose: LEAN TOWARD MATCHING. A false positive costs the
// turn the thinking model — it still answers well on deepseek-chat, with the
// student's real data attached. A false negative recreates the incident above.
// The one thing the noun list must never contain is a subject term: "my notes"
// is workspace for a law student and a machinist alike; "my immune system"
// belongs to no product surface and must not fire.

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
 *  thinking model, and stealing them would make Nemesis worse at its main job.
 *  The negative cases are pinned in workspace-intent.test.ts. */
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
 * That is the calendar incident this whole module exists to prevent, word for
 * word, reached through the one verb nobody tested. "Create a note about
 * today's lecture" and "Schedule a lab on Friday at 2pm" failed the same way.
 *
 * The noun anchor is what keeps this honest: the verb must be aimed at
 * something the workspace actually holds. "Make a table comparing ACE
 * inhibitors and ARBs" and "create a mnemonic for the cranial nerves" are
 * writing, not filing, and they stay on the thinking model. Those negatives are
 * pinned in workspace-intent.test.ts.
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
