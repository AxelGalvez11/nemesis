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
] as const;

export type WorkspaceAgentToolName = (typeof WORKSPACE_AGENT_TOOL_NAMES)[number];
