// The create panel's tiles, and the two questions it asks of a board.
//
// Owner, 2026-09-06: *"panel with buttons to create artifacts with ability to choose which sources
// to make from like in notebook llm"*, and, interrupting the go-ahead: *"I need tests to be
// clickable button like in notebookllm you understand?"* NotebookLM's Studio is a two-column grid
// of tiles (Audio Overview, Slide Deck, Video Overview, Mind Map, Reports, Flashcards, Quiz,
// Infographic, Data Table; each 161x56, radius 12, measured in his Chrome on 2026-09-05). These are
// the ones a learner here can actually receive: every kind below has a maker on the board already
// (lib/board/board-deliverables.ts, lib/board/board-check.ts). Audio, video and infographic have no
// maker and are not offered; a tile that made nothing would read as broken.
//
// 🔴🔴 TEST IS A TILE. The August contract's §38 said a test was *"a phrase to the composer, not a
// control"*; the owner reversed that for this panel on 2026-09-06 (memory: test-button-is-back).
// Asking in words still works; the tile is added, not swapped in.
//
// 🔴 THE WORDS ARE THE LEARNER'S, NOT THE MAKER'S. `KIND_LABELS` (board-deliverables.ts) names the
// file a maker hands back: "Note", "Slides", "Spreadsheet". A tile names what you are asking for:
// a study guide, a presentation, a data table. Both are right about different things, and the
// card that arrives wears the file's name as it always has.

import type { BoardMakeKind } from "./board-deliverables";
import type { BoardCard, BoardSource } from "./board-model";

export interface StudioTile {
  readonly kind: BoardMakeKind;
  readonly label: string;
  /** The tooltip: one sentence on what arrives. */
  readonly hint: string;
  /** The button at the foot of the form, in the learner's words. */
  readonly make: string;
  /** The example inside the box. NotebookLM shows a real sentence there, not "describe your topic". */
  readonly example: string;
  /** How the "how many" choice is said to the maker. Absent on kinds where length is not a dial. */
  readonly fewer?: string;
  readonly more?: string;
  /** Asks how hard it should be: only the two kinds a learner is scored by. */
  readonly graded?: true;
}

/**
 * 🔴🔴 EVERY EXAMPLE HERE IS FIELD-AGNOSTIC ON PURPOSE (CLAUDE.md, the standing rule). A placeholder
 * is the most persuasive copy in a form: whatever it names is what people think the product is for.
 * "Put the diagnostic criteria on the front" would quietly tell a law student this was not built
 * for them. Definitions, examples, chapters, seminars and rows work in every discipline.
 */
export const STUDIO_TILES: readonly StudioTile[] = [
  {
    kind: "flashcards",
    label: "Flashcards",
    hint: "Cards to drill, made from the ticked sources",
    make: "Make flashcards",
    example: "Put the definitions on the front and an example on the back.",
    fewer: "Keep it to about ten cards.",
    more: "Make as many cards as the material supports.",
    graded: true,
  },
  {
    kind: "check",
    label: "Test",
    hint: "Questions to answer on the canvas, marked as you go",
    make: "Make the test",
    example: "Focus on the numbers and the exceptions.",
    fewer: "Keep it to about five questions.",
    more: "Write a long test.",
    graded: true,
  },
  // 🔴🔴 THE MIND MAP IS A TILE AND NOTHING ELSE MAKES ONE. Owner, 2026-09-07: *"Yes, build a mind
  // map ... make it similar to Notebook LM"*, *"I would reserve the mind maps for the sidebar"* and,
  // asked whether the inline one in a chat answer should stay, *"only a [tile] makes them"*. It
  // opens in the reading panel, which is where NotebookLM's opens too (§12).
  {
    kind: "mindmap",
    label: "Mind map",
    hint: "The shape of the material, one branch at a time",
    make: "Lay out the mind map",
    example: "Start from the treatment options rather than the whole topic.",
    fewer: "Keep it to the big ideas.",
    more: "Go as deep as the material supports.",
  },
  { kind: "note", label: "Study guide", hint: "A written guide to the material", make: "Make the study guide", example: "Cover chapter 3 only, and keep the worked examples." },
  { kind: "slides", label: "Presentation", hint: "A slide deck", make: "Make the presentation", example: "Ten slides for a seminar, one idea per slide.", fewer: "Keep it short.", more: "Go into detail." },
  { kind: "document", label: "Document", hint: "A Word document", make: "Make the document", example: "A handout a classmate could read without me there.", fewer: "Keep it short.", more: "Go into detail." },
  { kind: "sheet", label: "Data table", hint: "A spreadsheet of the facts, side by side", make: "Make the table", example: "One row per item, with a column for each thing being compared." },
];

/** The three lengths and the three levels, as the plain sentences the maker actually reads. */
export const STUDIO_LENGTHS = ["fewer", "standard", "more"] as const;
export const STUDIO_LEVELS = ["easy", "medium", "hard"] as const;
export type StudioLength = (typeof STUDIO_LENGTHS)[number];
export type StudioLevel = (typeof STUDIO_LEVELS)[number];

const LEVEL_WORDS: Record<StudioLevel, string> = {
  easy: "Keep it straightforward.",
  medium: "",
  hard: "Make it demanding.",
};

/**
 * What the learner asked for, as one instruction for the maker.
 *
 * 🔴 THE DIALS ARE WORDS, NOT A SECOND CHANNEL. Every maker on this board takes exactly one free
 * sentence (`makeBoardDeliverable(uid, canvas, kind, topic)`), which is the same channel that has
 * always carried "make me flashcards on chapter 3" typed into the composer. Adding a count field
 * would mean a second way to say the same thing, and two ways to say one thing is how they come to
 * disagree. What the form does is put the sentence together for you.
 */
export function studioInstruction(tile: StudioTile, answers: { topic?: string; length?: StudioLength; level?: StudioLevel }): string {
  const parts: string[] = [];
  const topic = answers.topic?.trim();
  if (topic) parts.push(topic);
  if (answers.length === "fewer" && tile.fewer) parts.push(tile.fewer);
  if (answers.length === "more" && tile.more) parts.push(tile.more);
  if (tile.graded && answers.level && LEVEL_WORDS[answers.level]) parts.push(LEVEL_WORDS[answers.level]);
  return parts.join(" ").trim();
}

/** The ticked sources that have finished reading: what a tile makes from and a question answers from. */
export function tickedReadySources(sources: readonly BoardSource[], selectedSourceIds: readonly string[]): BoardSource[] {
  return sources.filter((source) => source.status === "ready" && selectedSourceIds.includes(source.id));
}

/**
 * Is there anything on this board a thing could be made from? A document that finished reading,
 * or an answer Nemesis gave. The same question `hasSomethingToTest` asks in board-provider.tsx
 * before a test is written; asked here so a tile is quiet rather than a card that says "nothing
 * here yet".
 */
export function boardHasMaterial(cards: readonly BoardCard[], sources: readonly BoardSource[]): boolean {
  if (sources.some((source) => source.status === "ready")) return true;
  return cards.some((card) => card.messages.some((message) => message.role === "assistant" && !message.isError && message.content.trim().length > 0));
}
