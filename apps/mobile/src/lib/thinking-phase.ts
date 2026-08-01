// The chat "thinking preview": the short line the student reads between
// hitting send and the answer appearing.
//
// Every phrase here describes something the turn is ACTUALLY doing — the route
// decision, a real web search with its real query, the real number of sources
// that came back. Nothing is invented, and nothing costs an extra model call.
//
// That constraint comes from experience on the desktop build: making the line
// read like a first-person plan ("I'll compare X and Y…") needs a second LLM
// writing that sentence, because our engine's raw reasoning opens by restating
// the question rather than by planning. That was judged not worth paying for —
// double billing plus a second or two of latency on every single turn — while
// the status line driven by real activity was the part that worked well. So
// this file maps real pipeline stages to plain-English phrases, and stops
// there.

export type ThinkingPhase =
  | { kind: "routing" }
  | { kind: "searching"; query: string }
  | { kind: "reading"; sources: number }
  | { kind: "recalling"; notes: number }
  | { kind: "thinking"; deep: boolean }
  /** A workspace tool is running: the chat is reading or writing the student's own
   *  Library or Study page. `tools` holds the tool names the model asked for, in
   *  the order it asked. Real work with a real duration — without a phase here the
   *  line would sit on "Putting this together" while a deck is being written, and a
   *  save of thirty cards takes long enough for that to read as hung. */
  | { kind: "acting"; tools: string[] }
  /** The student's photograph is being uploaded and read, before the turn that
   *  asks about it has even been sent. Strictly it is not a model turn — but it
   *  is the same wait, in the same place on screen, and the owner asked for the
   *  same line rather than a second kind of pending label (2026-07-31). */
  | { kind: "reading-photo" }
  | { kind: "writing" };

/** Plain-English phrase per workspace tool. Keys are the tool names in
 *  api/agentTools.ts — a name with no entry here falls back to the generic line
 *  below rather than showing the student a function name. */
const TOOL_PHRASE: Record<string, string> = {
  add_flashcards: "Making your flashcards",
  add_mindmap: "Drawing your mind map",
  add_practice_test: "Writing your practice test",
  append_library_note: "Adding to your note",
  create_library_folder: "Making a folder in your library",
  create_library_note: "Writing a note in your library",
  create_slide_deck: "Building slides in your library",
  add_calendar_event: "Adding that to your calendar",
  list_calendar_events: "Checking your calendar",
  list_study_artifacts: "Checking your tests and mind maps",
  list_study_decks: "Checking your decks",
  move_library_note: "Filing that note",
  read_library_note: "Reading your note",
  read_study_deck: "Reading your flashcards",
  read_study_artifact: "Reading your study material",
  rename_library_note: "Renaming that note",
  search_library: "Looking through your library",
  // Changing and removing. These say what is happening in the plainest words
  // available, because this line is the ONLY warning a student gets before a
  // delete lands — there is no confirmation step inside a chat turn.
  update_calendar_event: "Updating that calendar event",
  delete_calendar_event: "Removing that from your calendar",
  replace_library_note: "Rewriting your note",
  delete_library_note: "Moving that note to your trash",
  edit_flashcard: "Editing that flashcard",
  delete_flashcard: "Deleting that flashcard",
  rename_study_deck: "Renaming that deck",
  delete_study_deck: "Deleting that deck",
  delete_study_artifact: "Deleting that study material",
};

/** How much of the student's own question to echo back inside the search line
 *  before trimming — long enough to recognise, short enough for one line. */
const QUERY_MAX = 42;

/** Collapse a question to a single tidy line for display inside a phrase. */
export function shortQuery(query: string, max: number = QUERY_MAX): string {
  const flat = query.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  // Prefer breaking at a word boundary so the echo doesn't cut mid-word.
  const clipped = flat.slice(0, max);
  const lastSpace = clipped.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${body.replace(/[,;:.\s]+$/, "")}…`;
}

/** The line to show for a phase. An empty string means show nothing — the
 *  answer itself has started, so the preview has done its job. */
export function phaseLabel(phase: ThinkingPhase): string {
  switch (phase.kind) {
    case "routing":
      return "Working out how to answer";
    case "searching":
      return phase.query.trim() ? `Searching the web for “${shortQuery(phase.query)}”` : "Searching the web";
    case "reading":
      // Zero is a real outcome (the search found nothing usable) and saying so
      // beats a cheerful lie about reading sources that don't exist.
      if (phase.sources <= 0) return "No sources came back — answering from what I know";
      return phase.sources === 1 ? "Reading 1 source" : `Reading ${phase.sources} sources`;
    case "recalling":
      // Same honesty rule as "reading": finding nothing in the student's Library
      // is a normal outcome on a topic they have not taken notes on, and the line
      // should say so rather than imply notes were consulted.
      if (phase.notes <= 0) return "";
      return phase.notes === 1 ? "Reading 1 note from your Library" : `Reading ${phase.notes} notes from your Library`;
    case "thinking":
      return phase.deep ? "Thinking it through" : "Putting this together";
    case "acting": {
      // One tool: name what it is doing. Several at once: don't stack three
      // phrases into a line that no longer fits, and don't pick one arbitrarily
      // and imply it is the only thing happening.
      const [first, ...rest] = phase.tools;
      if (!first) return "Working in your workspace";
      const phrase = TOOL_PHRASE[first];
      if (!phrase) return "Working in your workspace";
      return rest.length > 0 ? "Working in your workspace" : phrase;
    }
    case "reading-photo":
      return "Reading your photo";
    case "writing":
      return "";
  }
}

/** The settled line shown once a turn finishes, mirroring the desktop's
 *  "Thought for Xs". Sub-second turns get nothing — a "Thought for 0s" badge
 *  reads worse than no badge. */
export function settledLabel(elapsedMs: number): string {
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 1) return "";
  return seconds === 1 ? "Thought for 1s" : `Thought for ${seconds}s`;
}
