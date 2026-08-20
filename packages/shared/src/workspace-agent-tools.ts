/** Canonical workspace capability names. Web and iOS keep platform-native
 * executors, but the advertised capability set must remain identical. */
export const WORKSPACE_AGENT_TOOL_NAMES = [
  "search_library",
  "read_library_note",
  "create_library_note",
  "create_slide_deck",
  "append_library_note",
  "create_library_folder",
  "rename_library_note",
  "move_library_note",
  "list_study_decks",
  "read_study_deck",
  "list_study_artifacts",
  "read_study_artifact",
  "add_flashcards",
  "add_practice_test",
  "add_mindmap",
  "list_calendar_events",
  "add_calendar_event",
  // Editing and removing. The chat could create in all three places but change
  // nothing, so a student who asked it to move an exam or fix a card's wording
  // was told to go and do it by hand — in the one surface meant to be where
  // everything gets done.
  "update_calendar_event",
  "delete_calendar_event",
  "replace_library_note",
  "delete_library_note",
  "edit_flashcard",
  "delete_flashcard",
  "rename_study_deck",
  "delete_study_deck",
  "delete_study_artifact",
] as const;

export type WorkspaceAgentToolName = (typeof WORKSPACE_AGENT_TOOL_NAMES)[number];

/**
 * The workspace-control extension (owner 2026-08-05: "chat is the control
 * layer; Library, Study, and Calendar are views"). Web ships these first;
 * the phone's executor catches up in its own release because its tools run
 * through the cloudLibrary/cloudStudy/cloudCalendar wrappers and need their
 * own build. Until then the CORE list above stays the cross-platform
 * contract and this list is what the web chat actually advertises.
 */
export const WEB_EXTRA_AGENT_TOOL_NAMES = [
  "get_workspace_overview",
  "get_library_tree",
  "rename_library_folder",
  "move_library_folder",
  "delete_library_folder",
  "get_study_overview",
  "move_study_deck",
  "move_study_artifact",
  "find_calendar_issues",
  // Phase 2 item 2. The planner READS and proposes; move_library_source is the
  // one write it needed that did not already exist — a note could be moved by
  // the chat, but the original file it came from could not, and four syllabi
  // sitting at the Library root are source rows, not notes.
  "plan_library_migration",
  "move_library_source",
  // 🔴 A RECORDING WAS INVISIBLE TO THE CHAT. A student asked Nemesis to write
  // notes from a lecture it had just recorded and transcribed; with no tool for
  // it, the model searched the Library — where transcripts have never lived —
  // found nothing, and told them the transcript "appears to have been lost".
  // It was not. It was on chat_recording_artifacts the whole time, 34,250
  // characters of it, alongside finished notes.
  //
  // A missing capability does not read as a missing capability from inside the
  // model. It reads as missing DATA, and the model reports it as loss.
  "list_recordings",
  "read_recording_transcript",
] as const;

export const WEB_WORKSPACE_AGENT_TOOL_NAMES = [
  ...WORKSPACE_AGENT_TOOL_NAMES,
  ...WEB_EXTRA_AGENT_TOOL_NAMES,
] as const;

export type WebWorkspaceAgentToolName = (typeof WEB_WORKSPACE_AGENT_TOOL_NAMES)[number];

/**
 * WHAT EACH TOOL IS FOR, WRITTEN TO THE MODEL.
 *
 * 🔴🔴 THESE ARE NOT DOCUMENTATION. `tool_choice` is never sent (DeepSeek's thinking mode rejects a
 * forced choice — docs/research/deepseek-tool-calling-fix-2026-07.md), so the model decides for
 * itself which tool to reach for and how to fill it in. The phone's own catalog said it outright:
 * *"the descriptions below are the only steering there is."* They are prompt, not comment.
 *
 * 🔴 AND THEY LIVED IN TWO FILES, WHICH IS WHY THEY ARE HERE NOW. The names above have always been
 * shared, under a comment promising that "the advertised capability set must remain identical". The
 * steering was not: web and phone each kept their own copy, and 17 of the 25 shared tools described
 * themselves differently. Not stylistic differences — each side was missing rules the other had:
 *
 *   · `add_practice_test` — the phone carried the exam item-writing rules AND the warning that the
 *     app re-seats options after saving, so naming "option B" in an explanation becomes wrong. The
 *     web carried neither, and the web is where most tests get made.
 *   · `list_study_decks` — the phone said never to show the internal `Folder::Deck` storage form to
 *     a student. The web did not, so on the web the model could print `Pharmacology::Cardiology` at
 *     somebody as though it were a name they had chosen.
 *   · `list_calendar_events` — the web explained the full window, recurring expansion, and
 *     start_date/end_date. The phone said "upcoming", so on the phone the model did not know it
 *     could ask for last month or a whole semester.
 *   · `create_library_note` — the web knew how to cite an attached file as [n](?source=<id>) and to
 *     write detailed lecture notes; the phone did not. The phone remembered to tell the student
 *     where the note went; the web did not.
 *   · `add_flashcards` — the phone carried the minimum-information principle. The web left it to a
 *     conditional skill packet that rides on at most two turns in any case.
 *
 * Nothing caught it, because nothing could: two files, each with its own passing tests. The same
 * shape as the library `position` field, the routing classifier, and the writing voice.
 *
 * Each entry below is the MERGE — every substantive rule either side had. Where the two differed
 * only in a surface noun ("Study page" / "Study screen" / "Calendar tab"), the wording is neutral,
 * because that is the one difference that is genuinely per-platform and must not become a third
 * thing to keep in step.
 */
export const WORKSPACE_TOOL_DESCRIPTIONS: Record<WebWorkspaceAgentToolName, string> = {
  search_library:
    "Search the student's Library notes by title and text. Returns matching notes' path, title, and a "
    + "snippet.",
  read_library_note:
    "Read one Library note's full text by its path (get the path from search_library).",
  create_library_note:
    "Create a new Library note for the student. Write the body yourself in markdown. If no folder was "
    + "requested, OMIT folder: it is then filed under the student's own course automatically. Only pass folder "
    + "when they named one. When the note draws on web sources, cite inline: end the claim with a link whose "
    + "text is just a number, like [1](https://the-source-url), numbering sources in order. When the note is "
    + "drawn from an ATTACHED FILE stored as a Library source (the attachment header gives its id), cite it the "
    + "same numbered way as [n](?source=<that id>): every section that comes from the file should carry its "
    + "pill. The Library renders these as small source pills and builds the note's Sources section from them "
    + "automatically, so never write a manual Sources list of your own. When a student asks for notes on an "
    + "uploaded lecture, write DETAILED notes: cover every section of the lecture in its own order, "
    + "definitions, mechanisms, examples, anything it stresses, not a thin summary. Tell the student you "
    + "created it and where it is.",
  create_slide_deck:
    "Create and save a structured slide deck in the student's Library. You MUST use this when the student "
    + "asks for slides or a presentation. If no folder was requested, OMIT folder: it is then filed under the "
    + "student's own course automatically. Only pass folder when they named one. Tell the student the saved "
    + "path.",
  append_library_note:
    "Add markdown to the END of an existing Library note, keeping everything already in it. Use this to add "
    + "to a note rather than rewriting one. Get the path from search_library. Cite web sources inline as "
    + "numbered links like [1](https://the-source-url); an attached file stored as a Library source cites as "
    + "[n](?source=<its id from the attachment header>). The Library turns them into source pills and a Sources "
    + "section.",
  create_library_folder:
    "Create an empty folder in the student's Library.",
  rename_library_note:
    "Rename one Library note. Get its path from search_library. The note stays in its current folder.",
  move_library_note:
    "Move one Library note into another folder. Get its path from search_library. Use an empty folder string "
    + "for the top level.",
  list_study_decks:
    "List the student's flashcard decks with card counts. Each deck gives `name`, its `folder` if it is in "
    + "one, and `full_name`. Pass `full_name` to other tools; when writing to the student say the name and the "
    + "folder in words (their Cardiology deck in Pharmacology) and NEVER show the 'Folder::Deck' form: that is "
    + "storage, not something they typed.",
  read_study_deck:
    "Read the cards in one Study deck: text plus real scheduling state (due_at, lapses, interval, "
    + "repetitions) so you can tutor from, compare, summarize, prioritize, or improve the student's actual "
    + "material. Call list_study_decks first when the deck name is uncertain.",
  list_study_artifacts:
    "List the student's saved Study tests and mind maps with their ids, titles, folders, and status. Use "
    + "read_study_artifact for one item's content.",
  read_study_artifact:
    "Read one saved Study test or mind map by the id returned from list_study_artifacts.",
  add_flashcards:
    "Add flashcards to a deck, creating the deck if it does not exist. Every flashcard the student asked for "
    + "must be SAVED with this tool, never printed only in chat. Give deck_name as a plain name: a NEW deck is "
    + "filed under the student's own course automatically when the material clearly matches one. Apply the "
    + "minimum-information principle: one retrievable fact or relationship per card, a precise prompt, a "
    + "concise self-contained answer, no duplicate prompts, and no answer leaked in the question. Tell the "
    + "student how many cards you added and to which deck.",
  add_practice_test:
    "Save a multiple-choice practice test to the student's Study page. Every test the student asked for must "
    + "be SAVED with this tool, never printed only in chat. Write the questions yourself from the material: do "
    + "not ask another tool to generate them. Tell the student you saved it. ${EXAM_ITEM_RULES_SHORT} That last "
    + "rule matters here specifically: the app re-seats the options after saving, so naming 'option B' in an "
    + "explanation would become wrong.",
  add_mindmap:
    "Save a mind map to the student's Study page. Provide a markdown outline you write yourself. Tell the "
    + "student you saved it.",
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
  replace_library_note:
    "Replace a Library note's whole body with new text. Use append_library_note to add to the end instead. "
    + "Needs the note's id from search_library or read_library_note. Cite web sources inline as numbered links "
    + "like [1](https://the-source-url); an attached file stored as a Library source cites as [n](?source=<its "
    + "id from the attachment header>). The Library turns them into source pills and a Sources section; never "
    + "write a manual Sources list of your own.",
  delete_library_note:
    "Move a Library note to the student's trash. It stops appearing in their Library but is recoverable. "
    + "Needs the note's id from search_library.",
  edit_flashcard:
    "Change the front or back of one flashcard. Pass only the side that changes. Needs the card's id from "
    + "read_study_deck.",
  delete_flashcard:
    "Delete one flashcard. This cannot be undone. Needs the card's id from read_study_deck.",
  rename_study_deck:
    "Rename a Study deck. Give the deck's current full name and just the new NAME: the deck stays in its "
    + "current folder (use move_study_deck to change folders) and its cards are untouched.",
  delete_study_deck:
    "Delete a Study deck. Only works on a deck with no cards left in it: a deck that still holds cards has to "
    + "be removed by the student from Study, because deleting it would destroy their review history.",
  delete_study_artifact:
    "Delete a practice test or mind map. This cannot be undone. Needs the id from list_study_artifacts.",
  get_workspace_overview:
    "One compact snapshot of this student's whole workspace for orientation: their courses, the next few "
    + "weeks of deadlines, upcoming exams, the Library's folder shape, decks with cards due, and anything "
    + "sitting in Inbox. Counts are real, but lists are SAMPLES — before acting on completeness (reorganizing, "
    + "reconciling, anything about 'everything'), read the full state with get_library_tree, "
    + "list_calendar_events, or get_study_overview.",
  get_library_tree:
    "See the Library's real structure without needing a search term. Omit folder: the whole tree — every "
    + "folder with its note counts, plus every note sitting loose at the root, by name. With folder: that "
    + "folder's subfolders and every note inside it (title and path). Pass folder as an empty string to expand "
    + "the ROOT on its own. Use this before reorganizing, so moves are grounded in what actually exists.",
  rename_library_folder:
    "Rename a Library folder in place. Every note and stored file inside follows automatically, and the "
    + "folder's own page keeps working. Give just the new name — use move_library_folder to change where it "
    + "lives.",
  move_library_folder:
    "Move a whole Library folder — notes, subfolders, and stored files — into another folder. Use an empty "
    + "string for the top level.",
  delete_library_folder:
    "Move a Library folder AND everything inside it to the student's trash. Recoverable, but the largest "
    + "single action here — the student has to confirm on a card first.",
  get_study_overview:
    "The whole Study picture with real counts: every deck with its cards, cards due right now, and struggling "
    + "cards (missed twice or more), rolled up per folder too. Use it for 'what should I study' and before "
    + "reorganizing decks.",
  move_study_deck:
    "Move a Study deck into a folder (empty string = top level). The deck, its cards, and their review "
    + "history are untouched — only its place in the Study tree changes.",
  move_study_artifact:
    "Move a saved practice test or mind map into a different Study folder (empty string = top level).",
  find_calendar_issues:
    "Audit the calendar before reorganizing it. Reports, separately: exact_duplicates (same title, same "
    + "date), probable_duplicates (near-identical titles on one date), conflicting_versions (the same exam or "
    + "assignment on two different dates — the sources disagree about when it is), and overlaps (two different "
    + "events at the same time — NOT duplicates). Repeating classes are expanded into the dates they actually "
    + "meet first, so a one-off event landing on top of one meeting is found; a problem that repeats every week "
    + "is reported once with a `repeats` count. Defaults to every record the student has, and `coverage` says "
    + "exactly which dates that turned out to be — repeat that rather than implying years you have no records "
    + "for came back clean. Never resolve a conflicting version without the student choosing which date wins.",
  plan_library_migration:
    "Work out how the student's OLD Library content would be filed under their courses, and CHANGE NOTHING. "
    + "Covers the legacy Nemesis/… folders, anything loose at the Library root (their syllabi live there), and "
    + "items still waiting in Inbox. Returns `moves` (each with where it is, where it would go, and why), "
    + "`leave_alone` (nothing in it names a course clearly enough — leave these for the student to look at, do "
    + "NOT guess), and `blocked` (a real match whose destination name is already taken). Show the student the "
    + "plan and let them decide; carry out the moves with move_library_note and move_library_source. Safe to "
    + "call again at any time — it reads where things are now, so anything already filed simply stops "
    + "appearing.",
  move_library_source:
    "Move an ORIGINAL uploaded file (a PDF, a slide deck, a syllabus) into a course folder. Use the source id "
    + "from plan_library_migration. This moves the file, never its notes — move those with move_library_note.",
  list_recordings:
    "List the student's recorded lectures — newest first — with each one's id, title, when it was recorded, "
    + "how long it ran, whether its notes have been written, and where those notes were filed in the Library. A "
    + "recording's TRANSCRIPT is never a Library note, so search_library will never find one: use this, then "
    + "read_recording_transcript. Use this whenever the student refers to a lecture they recorded, asks for "
    + "notes from a recording, or asks what happened to one.",
  read_recording_transcript:
    "Read what was actually said in one recorded lecture, by its id from list_recordings. Long lectures are "
    + "returned in CHUNKS: the reply says how many characters exist in total and whether more remain, so call "
    + "again with a larger offset to keep reading. Prefer the finished notes when they exist (list_recordings "
    + "gives their Library path) and use this when the student wants the exact words, a part the notes skipped, "
    + "or notes rewritten from scratch.",
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
