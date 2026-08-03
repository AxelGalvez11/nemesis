// What the thinking strip says while a turn is in flight (owner 2026-08-03:
// "the thinking preview took forever and it wasnt dynamic"). Two live sources:
// the reasoner's streamed thoughts (tail phrase) and the agent's tool rounds
// (a plain verb about the student's own workspace). Pure module so both can
// be tested without dragging the chat wire code into node:test.

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

/** The last legible line of the model's running thoughts, trimmed to strip
 *  width. Streams arrive mid-sentence, so the tail is often a fragment —
 *  that is fine, it updates every few hundred milliseconds and reads as
 *  live progress, which is the whole point. */
export function reasoningPhrase(reasoning: string): string | null {
  const lines = reasoning.split(/\n+/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!.replace(/^[-*#>\s]+/, "").replace(/\*\*/g, "").trim();
    if (line.length < 4) continue;
    return line.length <= 90 ? line : `…${line.slice(-90).trimStart()}`;
  }
  return null;
}
