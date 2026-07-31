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
