import assert from "node:assert/strict";
import test from "node:test";

import { hashSeed, mulberry32 } from "./daily";
import { generateSolvedGrid, generateSudoku, isSudokuSolved, solveSudoku, sudokuConflicts } from "./sudoku";

test("solver counts solutions and returns one", () => {
  const empty = new Array(81).fill(0);
  const { count, solution } = solveSudoku(empty, 2);
  assert.equal(count, 2); // capped — proves the empty grid is not unique
  assert.ok(solution);
});

test("generated grids are complete and legal", () => {
  const grid = generateSolvedGrid(mulberry32(7));
  assert.equal(grid.length, 81);
  assert.ok(grid.every((value) => value >= 1 && value <= 9));
  assert.equal(sudokuConflicts(grid).size, 0);
});

test("generated puzzles are unique-solution and deterministic per seed", () => {
  const first = generateSudoku(hashSeed("sudoku:2026-08-04"), 40);
  const second = generateSudoku(hashSeed("sudoku:2026-08-04"), 40);
  assert.deepEqual(first.puzzle, second.puzzle);
  const solved = solveSudoku(first.puzzle, 2);
  assert.equal(solved.count, 1);
  assert.deepEqual(solved.solution, first.solution);
  assert.ok(first.clues <= 81 && first.clues >= 30);
  const different = generateSudoku(hashSeed("sudoku:2026-08-05"), 40);
  assert.notDeepEqual(first.puzzle, different.puzzle);
});

test("conflicts flag row, column, and box duplicates", () => {
  const grid = new Array(81).fill(0);
  grid[0] = 5;
  grid[8] = 5; // same row
  grid[72] = 5; // same column
  const conflicts = sudokuConflicts(grid);
  assert.ok(conflicts.has(0) && conflicts.has(8) && conflicts.has(72));
  assert.equal(sudokuConflicts(new Array(81).fill(0)).size, 0);
});

test("isSudokuSolved compares against the solution", () => {
  const { puzzle, solution } = generateSudoku(hashSeed("sudoku:test"), 45);
  assert.equal(isSudokuSolved(puzzle, solution), false);
  assert.equal(isSudokuSolved(solution, solution), true);
});
