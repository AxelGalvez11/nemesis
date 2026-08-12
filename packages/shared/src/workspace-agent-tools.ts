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
  // 🔴 THE OUTSIDE WORLD, AS A TOOL. Every other name on this list reaches
  // something of the student's own; the live web was the one source the model
  // could not choose, because a keyword list chose it before the turn started
  // and pasted the results in. That asymmetry WAS the routing bug: private
  // sources were selected by a model that can read a question, and the public
  // one by a regex that cannot. Sits with its siblings so the model weighs
  // "their material or the world?" as a single decision.
  "search_web",
] as const;

export const WEB_WORKSPACE_AGENT_TOOL_NAMES = [
  ...WORKSPACE_AGENT_TOOL_NAMES,
  ...WEB_EXTRA_AGENT_TOOL_NAMES,
] as const;

export type WebWorkspaceAgentToolName = (typeof WEB_WORKSPACE_AGENT_TOOL_NAMES)[number];
