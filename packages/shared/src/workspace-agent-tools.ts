/**
 * Every capability the chat can reach in the student's workspace.
 *
 * 🔴 THIS LIST WAS 39 TOOLS AND IS NOW 5, BECAUSE 34 OF THEM POINTED AT SURFACES THE PRODUCT NO
 * LONGER HAS. The two-surface retirement took Study and Sessions away, and Library came back
 * meaning something different: its objects are CANVASES now, and a Folder organises canvases rather
 * than files (docs/canvas-v1-acceptance.md §L). The nav is four rows — New canvas, Library,
 * Calendar, Stats — and nothing in it is a file tree or a deck list.
 *
 * So `search_library`, `get_library_tree`, `create_library_note`, the folder create/rename/move/
 * delete set, `plan_library_migration` and `move_library_source` manipulated a file tree no learner
 * can see. `add_flashcards`, `add_practice_test`, `add_mindmap`, the deck and artifact list/read/
 * rename/move/delete set and `get_study_overview` wrote to a page that does not exist — and the
 * prompt was still telling the model *"the student is looking for it on their Study page"*.
 * `create_slide_deck` filed into /slides, which has no nav row. `list_recordings` and
 * `read_recording_transcript` read `chat_recording_artifacts`, the OLD recording table: a Canvas
 * recording becomes a canvas source directly and never lands there.
 *
 * 🔴 THE DATA LAYER IS NOT GONE, AND THE DIFFERENCE MATTERS. `/library/classic`, `/study`,
 * `/api/library/*`, the browser extension's `?import=coursework` deep link and the graph's
 * `?note=` links all still work: they are ROUTES and APIs, and nothing here was ever between them
 * and the pages. What was deleted is the layer that let a CHAT TURN reach them, which is what had
 * no destination left.
 *
 * Web and iOS keep platform-native executors, and what both can do is this.
 */
export const WORKSPACE_AGENT_TOOL_NAMES = [
  "list_calendar_events",
  "add_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
] as const;

export type WorkspaceAgentToolName = (typeof WORKSPACE_AGENT_TOOL_NAMES)[number];

/**
 * The one capability web has and the phone does not, yet.
 *
 * 🔴 A SPLIT OF ONE IS STILL WORTH KEEPING, BECAUSE THE ALTERNATIVE IS A LIE THE COMPILER CATCHES.
 * `find_calendar_issues` reads the calendar for what a person would notice and Nemesis can check —
 * a clash, a duplicate, an exam with nothing scheduled before it. It rests on
 * `calendar-conflicts.ts` and `calendar-model.ts`, and the phone has neither: no recurrence
 * expansion, no date-key parsing, nothing to expand a weekly class into its real meetings against.
 *
 * Collapsing the two lists would advertise it on a surface with no executor behind it, which
 * `HANDLERS: Record<AgentToolName, ToolHandler>` refuses to compile — the guard doing its job. So
 * this stays a list of one until the phone has a calendar model, and then it is empty and both
 * constants below say the same thing on their own.
 */
export const WEB_EXTRA_AGENT_TOOL_NAMES = [
  "find_calendar_issues",
  // The examiner pair (owner 2026-08-31: "DeepSeek should know what to do based
  // on the given prompts and on its given tool set... what the best path for
  // this user is"). Results live IN THE CONVERSATION — a made test arrives as a
  // card in the reply, which is why re-adding these does not revive the retired
  // Study destination above: nothing is filed onto a page nobody can reach.
  // Web-only until the phone has the sitting UI to open a paper from chat.
  "get_study_record",
  "make_practice_test",
] as const;

export const WEB_WORKSPACE_AGENT_TOOL_NAMES = [
  ...WORKSPACE_AGENT_TOOL_NAMES,
  ...WEB_EXTRA_AGENT_TOOL_NAMES,
] as const;

export type WebWorkspaceAgentToolName = (typeof WEB_WORKSPACE_AGENT_TOOL_NAMES)[number];

export const WORKSPACE_TOOL_DESCRIPTIONS: Record<WebWorkspaceAgentToolName, string> = {
  list_calendar_events:
    "List the student's calendar events, COMPLETE for the window it reports: every event in range, past or "
    + "future, all of them, with recurring classes expanded into their real meeting dates (those rows carry "
    + "recurring: true and share their series' one id). Default window is the next 30 days; pass "
    + "start_date/end_date for any range, a whole semester, last month, a single day. Use this whenever the "
    + "answer depends on their schedule, deadlines, exams, classes, or available study time.",
  add_calendar_event:
    "Add an event to the student's calendar. Do not read the event back to them afterwards; the calendar is "
    + "where they will see it.",
  update_calendar_event:
    "Change an existing calendar event. Pass only the fields that should change; anything omitted is left "
    + "alone. Needs the event's id from list_calendar_events.",
  delete_calendar_event:
    "Remove an event from the student's calendar. Needs the event's id from list_calendar_events.",
  find_calendar_issues:
    "Audit the calendar before reorganizing it. Reports, separately: exact_duplicates (same title, same "
    + "date), probable_duplicates (near-identical titles on one date), conflicting_versions (the same exam or "
    + "assignment on two different dates: the sources disagree about when it is), and overlaps (two different "
    + "events at the same time, NOT duplicates). Repeating classes are expanded into the dates they actually "
    + "meet first, so a one-off event landing on top of one meeting is found; a problem that repeats every week "
    + "is reported once with a `repeats` count. Defaults to every record the student has, and `coverage` says "
    + "exactly which dates that turned out to be, repeat that rather than implying years you have no records "
    + "for came back clean. Never resolve a conflicting version without the student choosing which date wins.",
  get_study_record:
    "Read this student's study record before deciding what they need: every deck with its card and due counts, "
    + "every practice test with its scores, and — most useful of all — each recently missed question with the "
    + "student's own one-tap diagnosis of the miss (didn't know / forgot / mixed two things up / couldn't apply / "
    + "misread). Use it whenever the conversation turns to how studying is going, what to review next, or whether "
    + "they are ready — and always before making a practice test, so the paper is aimed at THIS student.",
  make_practice_test:
    "Write a practice test for this student, delivered as a card in this conversation they can sit immediately. "
    + "YOU decide that a test is the right move and what it should be aimed at; pass `record` as plain sentences "
    + "carrying what you know of this student — from the conversation and from get_study_record: scores, their "
    + "own miss diagnoses, what they just struggled with or asked for — and the paper's composition is decided "
    + "from that record. `source` is a deck name, a note title, or \"everything\" (all decks and notes, with "
    + "previously missed questions brought back for re-asking — the spaced-review move). After it is made, say "
    + "one sentence pointing at the card; never read the questions out.",
};

/**
 * The placeholder a catalog builder substitutes before the schema goes on the wire.
 *
 * 🔴 A PLACEHOLDER RATHER THAN AN IMPORT, so this file states the contract without pulling in
 * either app's copy of the item-writing rules — and `toolDescription` below is the only way to read
 * a description, so a tool cannot reach the model still carrying the literal token.
 */
export const EXAM_RULES_PLACEHOLDER = "${EXAM_ITEM_RULES_SHORT}";

/** One tool's description, with the app's own exam rules folded in. */
export function toolDescription(name: WebWorkspaceAgentToolName, examRules: string): string {
  return WORKSPACE_TOOL_DESCRIPTIONS[name].split(EXAM_RULES_PLACEHOLDER).join(examRules);
}
