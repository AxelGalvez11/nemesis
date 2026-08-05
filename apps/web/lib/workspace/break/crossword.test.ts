import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCrossword,
  cellKey,
  isFilled,
  isSolved,
  slotAt,
  validateMini,
  wrongCells,
  type CrosswordEntries,
  type MiniPuzzle,
} from "./crossword";
import { MIDI_PUZZLES } from "./crossword-midis";
import { MINI_PUZZLES } from "./crossword-puzzles";

// Dense 5x5 where every row AND column is a word (machine-verified fill).
const DENSE: MiniPuzzle = {
  id: "fixture-dense",
  rows: ["CHESS", "REACH", "ULTRA", "SLEEK", "HONEY"],
  clues: {
    across: { 1: "Board game", 6: "Stretch", 7: "Extreme prefix", 8: "Shiny", 9: "Bee product" },
    down: { 1: "Crush", 2: "Greeting", 3: "Consumed", 4: "Mountain rubble", 5: "Unsteady" },
  },
};

test("numbering follows the standard rule", () => {
  const model = buildCrossword(DENSE);
  assert.equal(model.slots.length, 10);
  const acrossNumbers = model.slots.filter((slot) => slot.direction === "across").map((slot) => slot.number);
  assert.deepEqual(acrossNumbers, [1, 6, 7, 8, 9]);
  const downNumbers = model.slots.filter((slot) => slot.direction === "down").map((slot) => slot.number);
  assert.deepEqual(downNumbers, [1, 2, 3, 4, 5]);
  assert.equal(model.cells[1]![0]!.number, 6);
});

test("slot answers derive from the grid", () => {
  const model = buildCrossword(DENSE);
  const oneAcross = model.slots.find((slot) => slot.direction === "across" && slot.number === 1)!;
  assert.equal(oneAcross.answer, "CHESS");
  const oneDown = model.slots.find((slot) => slot.direction === "down" && slot.number === 1)!;
  assert.equal(oneDown.answer, "CRUSH");
  const fourDown = model.slots.find((slot) => slot.direction === "down" && slot.number === 4)!;
  assert.equal(fourDown.answer, "SCREE");
});

test("blocks shorten slots, skip numbering, and still validate", () => {
  const blocked = MINI_PUZZLES.find((puzzle) => puzzle.id === "mini-ship")!;
  const model = buildCrossword(blocked);
  assert.equal(model.cells[0]![0]!.block, true);
  const oneAcross = model.slots.find((slot) => slot.direction === "across" && slot.number === 1)!;
  assert.equal(oneAcross.answer, "SHIP");
  const fiveDown = model.slots.find((slot) => slot.direction === "down" && slot.number === 5)!;
  assert.equal(fiveDown.answer, "PLOT"); // 5 numbers PIANO across AND PLOT down
});

test("fill and solve checks", () => {
  const model = buildCrossword(DENSE);
  const solved: CrosswordEntries = {};
  model.cells.flat().forEach((cell) => {
    if (!cell.block) solved[cellKey(cell.row, cell.col)] = cell.answer;
  });
  assert.equal(isFilled(model, solved), true);
  assert.equal(isSolved(model, solved), true);
  const nearly = { ...solved, [cellKey(0, 0)]: "X" };
  assert.equal(isFilled(model, nearly), true);
  assert.equal(isSolved(model, nearly), false);
  assert.deepEqual(wrongCells(model, nearly), [cellKey(0, 0)]);
  assert.equal(isFilled(model, {}), false);
});

test("slotAt finds the slot covering a cell", () => {
  const model = buildCrossword(DENSE);
  assert.equal(slotAt(model, 2, 2, "across")!.number, 7);
  assert.equal(slotAt(model, 2, 2, "down")!.number, 3);
});

test("validation passes the fixture and flags missing clues", () => {
  assert.deepEqual(validateMini(DENSE), []);
  const missing = validateMini({ id: "x", rows: ["AB", "CD"], clues: { across: { 1: "ab" }, down: {} } });
  assert.ok(missing.some((problem) => problem.includes("missing clue")));
  assert.ok(missing.some((problem) => problem.includes("grid too small")));
});

test("every banked mini validates clean", () => {
  for (const puzzle of MINI_PUZZLES) {
    assert.deepEqual(validateMini(puzzle), [], `${puzzle.id} has problems`);
  }
  assert.equal(new Set(MINI_PUZZLES.map((puzzle) => puzzle.id)).size, MINI_PUZZLES.length);
  assert.ok(MINI_PUZZLES.length >= 10);
});

test("every banked 7x7 crossword validates clean", () => {
  for (const puzzle of MIDI_PUZZLES) {
    assert.deepEqual(validateMini(puzzle), [], `${puzzle.id} has problems`);
    assert.equal(buildCrossword(puzzle).size.cols, 7, `${puzzle.id} is not 7 wide`);
  }
  assert.equal(new Set(MIDI_PUZZLES.map((puzzle) => puzzle.id)).size, MIDI_PUZZLES.length);
  assert.ok(MIDI_PUZZLES.length >= 4);
});
