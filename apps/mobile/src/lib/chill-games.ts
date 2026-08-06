// The eight games, and which puzzle each one gets on a given day.
//
// Pure, and deliberately separate from the screen: the hub needs the same
// per-day selection an open game uses, and the two disagreeing would mean the
// card's progress line describes a different puzzle from the one that opens.
// Same reason the web keeps puzzlesForDay out of its components' state.

import {
  BEE_PUZZLES,
  CONNECTIONS_PUZZLES,
  LETTERBOX_PUZZLES,
  MIDI_PUZZLES,
  MINI_PUZZLES,
  WORDLE_ANSWERS,
  dailyIndex,
  extraKey,
  extraWalkIndex,
} from "@nemesis/shared";

export type ChillGameId = "wordle" | "bee" | "connections" | "mini" | "crossword" | "sudoku" | "letterboxed" | "tiles";

export interface ChillGameCard {
  id: ChillGameId;
  name: string;
  tagline: string;
  /** The bright block behind the card's glyph — the web's BREAK_ACCENTS. */
  accent: string;
}

/** Same eight, same order, same words as the web hub. */
export const CHILL_GAMES: ChillGameCard[] = [
  { id: "wordle", name: "Word Guess", tagline: "Six tries to find the five-letter word.", accent: "#6aaa64" },
  { id: "bee", name: "Honeycomb", tagline: "How many words can 7 letters make?", accent: "#f7da21" },
  { id: "connections", name: "Groups", tagline: "Create four groups of four.", accent: "#b4a8ff" },
  { id: "mini", name: "Mini", tagline: "A crossword you can finish before class.", accent: "#6f9bf0" },
  { id: "crossword", name: "Crossword", tagline: "The Mini's bigger sibling.", accent: "#3d6edb" },
  { id: "sudoku", name: "Sudoku", tagline: "One rule, nine digits, no guessing.", accent: "#fb9b00" },
  { id: "letterboxed", name: "Letter Box", tagline: "Loop the square using all 12 letters.", accent: "#fc716b" },
  { id: "tiles", name: "Tiles", tagline: "Match layers, keep the chain alive.", accent: "#48bfad" },
];

/**
 * Every bank-picked puzzle for one calendar day at puzzle number `n`
 * (0 = the daily). Byte-for-byte the web's puzzlesForDay, because the two must
 * agree: extraKey(dateKey, 0) is the plain dateKey, so n=0 reproduces the
 * selection the daily has always had.
 */
export function chillPuzzlesForDay(dateKey: string, n: number) {
  const puzzleKey = extraKey(dateKey, n);
  return {
    dateKey,
    puzzleKey,
    n,
    wordleAnswer: WORDLE_ANSWERS[extraWalkIndex(dateKey, n, WORDLE_ANSWERS.length)]!,
    bee: BEE_PUZZLES[dailyIndex(puzzleKey, "bee", BEE_PUZZLES.length)]!,
    connections: CONNECTIONS_PUZZLES[dailyIndex(puzzleKey, "connections", CONNECTIONS_PUZZLES.length)]!,
    mini: MINI_PUZZLES[dailyIndex(puzzleKey, "mini", MINI_PUZZLES.length)]!,
    midi: MIDI_PUZZLES[dailyIndex(puzzleKey, "crossword", MIDI_PUZZLES.length)]!,
    letterbox: LETTERBOX_PUZZLES[dailyIndex(puzzleKey, "letterboxed", LETTERBOX_PUZZLES.length)]!,
  };
}

export type ChillPuzzles = ReturnType<typeof chillPuzzlesForDay>;
