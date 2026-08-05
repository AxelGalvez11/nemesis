// Letter-square word game (Break page). Twelve letters sit on the four
// sides of a square; words chain (each starts with the previous word's last
// letter), consecutive letters must come from DIFFERENT sides, and the goal
// is to use all twelve letters — the banked boards all have a two-word
// solution, so par is always 2.

export interface LetterBoxPuzzle {
  /** Four sides, three lowercase letters each, in display order. */
  sides: string[];
  /** A known two-word solution — proof the board is fair (shown after). */
  solution: [string, string];
}

export function letterBoxLetters(puzzle: LetterBoxPuzzle): string[] {
  return puzzle.sides.flatMap((side) => side.split(""));
}

export function sideOfLetter(puzzle: LetterBoxPuzzle, letter: string): number {
  return puzzle.sides.findIndex((side) => side.includes(letter));
}

export type LetterBoxVerdict = "ok" | "too-short" | "bad-letter" | "same-side" | "bad-chain" | "not-a-word" | "already-used";

export function checkLetterBoxWord(
  puzzle: LetterBoxPuzzle,
  played: readonly string[],
  raw: string,
  dictionary: ReadonlySet<string>,
): LetterBoxVerdict {
  const word = raw.toLowerCase();
  if (word.length < 3) return "too-short";
  const previous = played.at(-1);
  if (previous && word[0] !== previous.at(-1)) return "bad-chain";
  let lastSide = -1;
  for (const letter of word) {
    const side = sideOfLetter(puzzle, letter);
    if (side === -1) return "bad-letter";
    if (side === lastSide) return "same-side";
    lastSide = side;
  }
  if (played.includes(word)) return "already-used";
  if (!dictionary.has(word)) return "not-a-word";
  return "ok";
}

export function lettersUsed(puzzle: LetterBoxPuzzle, played: readonly string[]): Set<string> {
  const used = new Set<string>();
  for (const word of played) for (const letter of word) used.add(letter);
  return used;
}

export function letterBoxSolved(puzzle: LetterBoxPuzzle, played: readonly string[]): boolean {
  const used = lettersUsed(puzzle, played);
  return letterBoxLetters(puzzle).every((letter) => used.has(letter));
}

/** Bank validation, run by the tests: shape, no duplicate letters, and the
 *  claimed solution actually plays out under the game's own rules. */
export function validateLetterBoxPuzzle(puzzle: LetterBoxPuzzle, dictionary: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (puzzle.sides.length !== 4) problems.push("needs 4 sides");
  if (puzzle.sides.some((side) => side.length !== 3)) problems.push("each side needs 3 letters");
  const letters = letterBoxLetters(puzzle);
  if (new Set(letters).size !== 12) problems.push("letters must be 12 unique");
  if (letters.some((letter) => !/^[a-z]$/.test(letter))) problems.push("letters must be lowercase a-z");
  const [first, second] = puzzle.solution;
  if (checkLetterBoxWord(puzzle, [], first, dictionary) !== "ok") problems.push(`solution word 1 "${first}" doesn't play`);
  if (checkLetterBoxWord(puzzle, [first], second, dictionary) !== "ok") problems.push(`solution word 2 "${second}" doesn't play`);
  if (!letterBoxSolved(puzzle, [first, second])) problems.push("solution doesn't cover all 12 letters");
  return problems;
}
