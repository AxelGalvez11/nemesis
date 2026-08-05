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
 *  Product surfaces and academic containers only — never subject matter.
 *  "sources" is deliberately absent: "peer-reviewed sources" belongs to the
 *  research route, and a miss here is harmless (the conversation fallback
 *  rides the tools-capable model anyway). */
const WORKSPACE_NOUN =
  "(?:calendars?|schedules?|planner|agenda|timetable|deadlines?|due dates?|exams?|quiz(?:zes)?|tests?|classes?|lectures?|assignments?|labs?|rotations?|library|notes?|folders?|files?|uploads?|recordings?|decks?|flash\\s?cards?|cards?|mind\\s?maps?|slides?|study (?:page|list|sets?|material|plan)|workspace|courses?|semester|term)";

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

/**
 * True when answering well requires reading (or changing) this student's own
 * workspace. Pure and total — safe to call on every keystroke of routing.
 */
export function detectsWorkspaceIntent(text: string): boolean {
  const compact = text.trim();
  if (!compact) return false;
  return MY_WORKSPACE_RE.test(compact) || ORGANIZE_RE.test(compact) || DUE_ASK_RE.test(compact) || BROWSE_RE.test(compact);
}
