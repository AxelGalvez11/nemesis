// What the thinking strip says while a turn is in flight: a curated verb per
// tool round ("Searching the web", "Making flashcards"), nothing else. The
// strip used to also surface the reasoner's own streamed text, but that tail
// echoes raw search snippets ("Result 1: …") and the owner called it verbose
// noise (2026-08-04) — so the model's thoughts are never shown, only what is
// being DONE to the student's workspace. Pure module for node:test.

import type { AgentToolCall } from "@/lib/workspace/agent-tools";

/** Field-agnostic verbs only — these describe what is being done to the
 *  student's workspace, never the subject being studied. */
const TOOL_ACTIVITY: Record<string, string> = {
  add_calendar_event: "Updating your calendar",
  add_flashcards: "Making flashcards",
  add_mindmap: "Drawing a mind map",
  add_practice_test: "Writing a practice test",
  append_library_note: "Writing a note",
  create_library_folder: "Organizing your library",
  create_library_note: "Writing a note",
  create_slide_deck: "Building slides",
  delete_calendar_event: "Updating your calendar",
  delete_flashcard: "Tidying your flashcards",
  delete_library_note: "Updating your library",
  edit_flashcard: "Tidying your flashcards",
  list_calendar_events: "Checking your calendar",
  list_study_artifacts: "Looking through your study sets",
  list_study_decks: "Looking through your study sets",
  move_library_note: "Organizing your library",
  read_library_note: "Reading your notes",
  find_figure: "Looking for a picture in your lectures",
  read_study_artifact: "Looking through your study sets",
  read_study_deck: "Looking through your study sets",
  rename_library_note: "Organizing your library",
  rename_study_deck: "Organizing your study sets",
  replace_library_note: "Writing a note",
  search_library: "Searching your library",
  update_calendar_event: "Updating your calendar",
};

/** One label for a round of tool calls. The first call names the round; a
 *  turn calling several tools at once still reads as one activity rather
 *  than a marquee. */
export function activityLabel(calls: ReadonlyArray<Pick<AgentToolCall, "name">>): string {
  const first = calls[0];
  if (!first) return "Working on it";
  return TOOL_ACTIVITY[first.name] ?? "Working on it";
}
