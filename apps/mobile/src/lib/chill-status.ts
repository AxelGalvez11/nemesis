// The one-line progress label under each hub card — "3/6 used", "In progress",
// "Solved in 4". Port of cardStatus in apps/web/components/workspace/break/
// break-workspace.tsx.
//
// Pure: it is handed the day store and today's puzzles and returns a string, so
// the wording can be pinned by tests instead of being read off a screenshot.
// Like the web, it describes the DAILY puzzle (n=0) even when a game has been
// advanced to an extra — the hub is the day's front page.

import {
  beeMaxScore,
  beeRank,
  beeScore,
  boardCleared,
  buildCrossword,
  connectionsStatus,
  isSolved,
  letterBoxSolved,
  tileEmpty,
  wordleStatus,
  type CrosswordEntries,
  type MiniPuzzle,
  type Tile,
} from "@nemesis/shared";

import { readChillEntry, type ChillStore } from "./chill-day";
import type { ChillGameId, ChillPuzzles } from "./chill-games";

function crosswordStatus(store: ChillStore, game: "mini" | "crossword", puzzle: MiniPuzzle, dateKey: string): string | null {
  const saved = readChillEntry<{ entries: CrosswordEntries; seconds: number }>(store, game, dateKey);
  if (!saved || Object.keys(saved.entries).length === 0) return null;
  if (isSolved(buildCrossword(puzzle), saved.entries)) {
    return `Solved in ${Math.floor(saved.seconds / 60)}:${String(saved.seconds % 60).padStart(2, "0")}`;
  }
  return "In progress";
}

export function chillCardStatus(store: ChillStore, game: ChillGameId, puzzles: ChillPuzzles): string | null {
  const { dateKey } = puzzles;

  if (game === "wordle") {
    const saved = readChillEntry<{ guesses: string[] }>(store, "wordle", dateKey);
    if (!saved?.guesses.length) return null;
    const status = wordleStatus(saved.guesses, puzzles.wordleAnswer);
    if (status === "won") return `Solved in ${saved.guesses.length}/6`;
    return status === "lost" ? "Out of guesses" : `${saved.guesses.length}/6 used`;
  }

  if (game === "bee") {
    const saved = readChillEntry<{ found: string[] }>(store, "bee", dateKey);
    if (!saved?.found.length) return null;
    const rank = beeRank(beeScore(puzzles.bee, saved.found), beeMaxScore(puzzles.bee));
    return `${rank.label} · ${saved.found.length} word${saved.found.length === 1 ? "" : "s"}`;
  }

  if (game === "connections") {
    const saved = readChillEntry<{ guesses: string[][] }>(store, "connections", dateKey);
    if (!saved?.guesses.length) return null;
    const status = connectionsStatus(puzzles.connections, saved.guesses);
    if (status === "won") return "Solved";
    return status === "lost" ? "Out of tries" : "In progress";
  }

  if (game === "mini") return crosswordStatus(store, "mini", puzzles.mini, dateKey);
  if (game === "crossword") return crosswordStatus(store, "crossword", puzzles.midi, dateKey);

  if (game === "sudoku") {
    const saved = readChillEntry<{ entries: Record<string, number>; done?: boolean }>(store, "sudoku", dateKey);
    if (!saved || Object.keys(saved.entries).length === 0) return null;
    return saved.done ? "Solved" : "In progress";
  }

  if (game === "letterboxed") {
    const saved = readChillEntry<{ words: string[] }>(store, "letterboxed", dateKey);
    if (!saved?.words.length) return null;
    if (letterBoxSolved(puzzles.letterbox, saved.words)) return `Solved in ${saved.words.length}`;
    return "In progress";
  }

  const saved = readChillEntry<{ tiles: Tile[]; best: number }>(store, "tiles", dateKey);
  if (!saved) return null;
  if (boardCleared(saved.tiles)) return `Cleared · best chain ${saved.best}`;
  // "Started" means a LAYER has gone, not a whole tile: most matches strip one
  // layer off two tiles and empty neither, so a tile-count test leaves the card
  // looking untouched through a long opening run.
  const started = saved.tiles.some((tile) => tile.some((value) => value === -1));
  return started ? `${saved.tiles.filter((tile) => !tileEmpty(tile)).length} tiles left` : null;
}
