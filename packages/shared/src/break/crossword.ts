// Mini crossword model (Break page). A puzzle is authored as its FILLED
// solution grid ('#' = block) plus clue text; numbering, slots, and the
// answer for every slot all DERIVE from the grid with the standard crossword
// numbering rule. Deriving instead of double-entering means the bank cannot
// contradict itself — the tests only have to check that clues exist.

export interface MiniPuzzle {
  id: string;
  /** Solution rows, uppercase letters and '#' blocks, all the same length. */
  rows: string[];
  clues: {
    across: Record<number, string>;
    down: Record<number, string>;
  };
}

export type CrosswordDirection = "across" | "down";

export interface CrosswordCell {
  row: number;
  col: number;
  block: boolean;
  /** Standard crossword number, when this cell starts a slot. */
  number: number | null;
  /** Solution letter, "" for blocks. */
  answer: string;
}

export interface CrosswordSlot {
  direction: CrosswordDirection;
  number: number;
  cells: { row: number; col: number }[];
  answer: string;
  clue: string;
}

export interface CrosswordModel {
  size: { rows: number; cols: number };
  cells: CrosswordCell[][];
  slots: CrosswordSlot[];
}

const MIN_SLOT_LENGTH = 2;

export function buildCrossword(puzzle: MiniPuzzle): CrosswordModel {
  const height = puzzle.rows.length;
  const width = puzzle.rows[0]?.length ?? 0;
  const letterAt = (row: number, col: number): string => puzzle.rows[row]?.[col] ?? "#";
  const isCell = (row: number, col: number): boolean =>
    row >= 0 && row < height && col >= 0 && col < width && letterAt(row, col) !== "#";

  const cells: CrosswordCell[][] = puzzle.rows.map((rowText, row) =>
    rowText.split("").map((letter, col) => ({
      row,
      col,
      block: letter === "#",
      number: null,
      answer: letter === "#" ? "" : letter.toUpperCase(),
    })),
  );

  const slots: CrosswordSlot[] = [];
  let nextNumber = 1;

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isCell(row, col)) continue;
      const startsAcross = !isCell(row, col - 1) && isCell(row, col + 1);
      const startsDown = !isCell(row - 1, col) && isCell(row + 1, col);
      if (!startsAcross && !startsDown) continue;
      const number = nextNumber;
      nextNumber += 1;
      cells[row]![col]!.number = number;
      if (startsAcross) {
        const slotCells: { row: number; col: number }[] = [];
        for (let cursor = col; isCell(row, cursor); cursor += 1) slotCells.push({ row, col: cursor });
        slots.push({
          direction: "across",
          number,
          cells: slotCells,
          answer: slotCells.map((cell) => letterAt(cell.row, cell.col).toUpperCase()).join(""),
          clue: puzzle.clues.across[number] ?? "",
        });
      }
      if (startsDown) {
        const slotCells: { row: number; col: number }[] = [];
        for (let cursor = row; isCell(cursor, col); cursor += 1) slotCells.push({ row: cursor, col });
        slots.push({
          direction: "down",
          number,
          cells: slotCells,
          answer: slotCells.map((cell) => letterAt(cell.row, cell.col).toUpperCase()).join(""),
          clue: puzzle.clues.down[number] ?? "",
        });
      }
    }
  }

  return { size: { rows: height, cols: width }, cells, slots };
}

export const cellKey = (row: number, col: number): string => `${row}-${col}`;

/** Player entries: cellKey → single uppercase letter. */
export type CrosswordEntries = Record<string, string>;

export function slotAt(model: CrosswordModel, row: number, col: number, direction: CrosswordDirection): CrosswordSlot | null {
  return (
    model.slots.find(
      (slot) => slot.direction === direction && slot.cells.some((cell) => cell.row === row && cell.col === col),
    ) ?? null
  );
}

export function isFilled(model: CrosswordModel, entries: CrosswordEntries): boolean {
  return model.cells.every((rowCells) =>
    rowCells.every((cell) => cell.block || (entries[cellKey(cell.row, cell.col)] ?? "").length === 1),
  );
}

export function isSolved(model: CrosswordModel, entries: CrosswordEntries): boolean {
  return model.cells.every((rowCells) =>
    rowCells.every((cell) => cell.block || entries[cellKey(cell.row, cell.col)] === cell.answer),
  );
}

/** Cells the player got wrong (filled but not matching) — for Check. */
export function wrongCells(model: CrosswordModel, entries: CrosswordEntries): string[] {
  const wrong: string[] = [];
  model.cells.forEach((rowCells) =>
    rowCells.forEach((cell) => {
      if (cell.block) return;
      const entry = entries[cellKey(cell.row, cell.col)];
      if (entry && entry !== cell.answer) wrong.push(cellKey(cell.row, cell.col));
    }),
  );
  return wrong;
}

/** Bank validation, run over every authored puzzle by the tests. */
export function validateMini(puzzle: MiniPuzzle): string[] {
  const problems: string[] = [];
  const width = puzzle.rows[0]?.length ?? 0;
  if (puzzle.rows.length < 4) problems.push("grid too small");
  if (puzzle.rows.some((row) => row.length !== width)) problems.push("rows are ragged");
  if (puzzle.rows.some((row) => !/^[A-Z#]+$/.test(row))) problems.push("rows must be A-Z or #");

  const model = buildCrossword(puzzle);
  if (!model.slots.some((slot) => slot.direction === "across")) problems.push("no across slots");
  if (!model.slots.some((slot) => slot.direction === "down")) problems.push("no down slots");
  for (const slot of model.slots) {
    if (slot.answer.length < MIN_SLOT_LENGTH) problems.push(`${slot.number}-${slot.direction}: too short`);
    if (!slot.clue.trim()) problems.push(`${slot.number}-${slot.direction} (${slot.answer}): missing clue`);
  }
  const slotKeys = new Set(model.slots.map((slot) => `${slot.direction}:${slot.number}`));
  for (const [direction, clues] of [["across", puzzle.clues.across], ["down", puzzle.clues.down]] as const) {
    for (const number of Object.keys(clues)) {
      if (!slotKeys.has(`${direction}:${number}`)) problems.push(`clue ${number}-${direction} matches no slot`);
    }
  }
  // Every letter must be checked (crossed by both directions) — the standard
  // for dense minis; unchecked squares make guessing unfair.
  const covered = new Map<string, number>();
  for (const slot of model.slots) {
    for (const cell of slot.cells) covered.set(cellKey(cell.row, cell.col), (covered.get(cellKey(cell.row, cell.col)) ?? 0) + 1);
  }
  model.cells.forEach((rowCells) =>
    rowCells.forEach((cell) => {
      if (cell.block) return;
      if ((covered.get(cellKey(cell.row, cell.col)) ?? 0) < 2) problems.push(`uncrossed square at ${cell.row},${cell.col}`);
    }),
  );
  return problems;
}
