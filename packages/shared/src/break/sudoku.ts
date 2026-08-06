// Sudoku engine (Break page). Every board is GENERATED, not banked: a
// seeded solver fills a full grid, then digs symmetric holes while a
// counting solver proves the puzzle still has exactly one solution. The
// same date seed produces the same board for everyone, offline.

import { mulberry32 } from "./daily.ts";

export const SUDOKU_SIZE = 81;

/** Count solutions up to `limit` (2 is enough to prove non-uniqueness).
 *  Returns the first solution found so generation gets it for free. */
export function solveSudoku(grid: readonly number[], limit = 2): { count: number; solution: number[] | null } {
  const cells = [...grid];
  let count = 0;
  let solution: number[] | null = null;

  const rowMask = new Array(9).fill(0);
  const colMask = new Array(9).fill(0);
  const boxMask = new Array(9).fill(0);
  const boxOf = (index: number) => Math.floor(index / 27) * 3 + Math.floor((index % 9) / 3);
  for (let index = 0; index < SUDOKU_SIZE; index += 1) {
    const value = cells[index]!;
    if (value === 0) continue;
    const bit = 1 << value;
    const row = Math.floor(index / 9);
    const col = index % 9;
    if (rowMask[row]! & bit || colMask[col]! & bit || boxMask[boxOf(index)]! & bit) return { count: 0, solution: null };
    rowMask[row] |= bit;
    colMask[col] |= bit;
    boxMask[boxOf(index)] |= bit;
  }

  const search = (): boolean => {
    // Most-constrained empty cell first keeps the tree tiny.
    let best = -1;
    let bestOptions = 10;
    for (let index = 0; index < SUDOKU_SIZE; index += 1) {
      if (cells[index] !== 0) continue;
      const used = rowMask[Math.floor(index / 9)]! | colMask[index % 9]! | boxMask[boxOf(index)]!;
      let options = 0;
      for (let value = 1; value <= 9; value += 1) if (!(used & (1 << value))) options += 1;
      if (options === 0) return false;
      if (options < bestOptions) {
        bestOptions = options;
        best = index;
        if (options === 1) break;
      }
    }
    if (best === -1) {
      count += 1;
      if (!solution) solution = [...cells];
      return count >= limit;
    }
    const row = Math.floor(best / 9);
    const col = best % 9;
    const box = boxOf(best);
    for (let value = 1; value <= 9; value += 1) {
      const bit = 1 << value;
      if ((rowMask[row]! | colMask[col]! | boxMask[box]!) & bit) continue;
      cells[best] = value;
      rowMask[row] |= bit;
      colMask[col] |= bit;
      boxMask[box] |= bit;
      const done = search();
      cells[best] = 0;
      rowMask[row] &= ~bit;
      colMask[col] &= ~bit;
      boxMask[box] &= ~bit;
      if (done) return true;
    }
    return false;
  };

  search();
  return { count, solution };
}

/** A full valid grid from a seeded randomized fill. */
export function generateSolvedGrid(random: () => number): number[] {
  const cells = new Array(SUDOKU_SIZE).fill(0);
  const boxOf = (index: number) => Math.floor(index / 27) * 3 + Math.floor((index % 9) / 3);
  const rowMask = new Array(9).fill(0);
  const colMask = new Array(9).fill(0);
  const boxMask = new Array(9).fill(0);
  const fill = (index: number): boolean => {
    if (index === SUDOKU_SIZE) return true;
    const row = Math.floor(index / 9);
    const col = index % 9;
    const box = boxOf(index);
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let swap = values.length - 1; swap > 0; swap -= 1) {
      const pick = Math.floor(random() * (swap + 1));
      [values[swap], values[pick]] = [values[pick]!, values[swap]!];
    }
    for (const value of values) {
      const bit = 1 << value;
      if ((rowMask[row]! | colMask[col]! | boxMask[box]!) & bit) continue;
      cells[index] = value;
      rowMask[row] |= bit;
      colMask[col] |= bit;
      boxMask[box] |= bit;
      if (fill(index + 1)) return true;
      cells[index] = 0;
      rowMask[row] &= ~bit;
      colMask[col] &= ~bit;
      boxMask[box] &= ~bit;
    }
    return false;
  };
  fill(0);
  return cells;
}

export interface SudokuPuzzle {
  /** 81 cells, 0 = empty. */
  puzzle: number[];
  solution: number[];
  clues: number;
}

/** Dig symmetric holes while a second solution stays impossible. `target`
 *  is a floor, not a promise — digging stops when nothing more can go. */
export function generateSudoku(seed: number, target = 36): SudokuPuzzle {
  const random = mulberry32(seed);
  const solution = generateSolvedGrid(random);
  const puzzle = [...solution];
  const order = Array.from({ length: SUDOKU_SIZE }, (_, index) => index);
  for (let swap = order.length - 1; swap > 0; swap -= 1) {
    const pick = Math.floor(random() * (swap + 1));
    [order[swap], order[pick]] = [order[pick]!, order[swap]!];
  }
  let clues = SUDOKU_SIZE;
  for (const index of order) {
    if (clues <= target) break;
    const twin = SUDOKU_SIZE - 1 - index;
    const saved = puzzle[index]!;
    const savedTwin = puzzle[twin]!;
    if (saved === 0) continue;
    puzzle[index] = 0;
    let removed = 1;
    if (twin !== index && savedTwin !== 0) {
      puzzle[twin] = 0;
      removed += 1;
    }
    if (solveSudoku(puzzle, 2).count !== 1) {
      puzzle[index] = saved;
      if (twin !== index) puzzle[twin] = savedTwin;
    } else {
      clues -= removed;
    }
  }
  return { puzzle, solution, clues };
}

/** Cell indexes whose value collides with another filled cell — for the
 *  "show conflicts" feedback (never reveals the answer, only the rules). */
export function sudokuConflicts(cells: readonly number[]): Set<number> {
  const conflicts = new Set<number>();
  const groups: number[][] = [];
  for (let row = 0; row < 9; row += 1) groups.push(Array.from({ length: 9 }, (_, col) => row * 9 + col));
  for (let col = 0; col < 9; col += 1) groups.push(Array.from({ length: 9 }, (_, row) => row * 9 + col));
  for (let box = 0; box < 9; box += 1) {
    const start = Math.floor(box / 3) * 27 + (box % 3) * 3;
    groups.push([0, 1, 2, 9, 10, 11, 18, 19, 20].map((offset) => start + offset));
  }
  for (const group of groups) {
    const seen = new Map<number, number[]>();
    for (const index of group) {
      const value = cells[index]!;
      if (value === 0) continue;
      seen.set(value, [...(seen.get(value) ?? []), index]);
    }
    for (const indexes of seen.values()) {
      if (indexes.length > 1) indexes.forEach((index) => conflicts.add(index));
    }
  }
  return conflicts;
}

export function isSudokuSolved(cells: readonly number[], solution: readonly number[]): boolean {
  return cells.every((value, index) => value === solution[index]);
}
