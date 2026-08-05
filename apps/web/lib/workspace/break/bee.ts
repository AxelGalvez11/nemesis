// Seven-letter honeycomb word hunt (Break page). Rules match the classic
// format: words are 4+ letters, must use the center letter, may repeat
// letters, and a pangram (all seven letters) scores a bonus. Each puzzle
// carries its own curated answer list — like the original, the list is
// editorial, so the reject message says "not in this puzzle's list" rather
// than pretending to be a full dictionary.

export interface BeePuzzle {
  /** The required letter. */
  center: string;
  /** The six surrounding letters. */
  outer: string[];
  /** Every accepted word, lowercase, including at least one pangram. */
  words: string[];
}

export function beeLetters(puzzle: Pick<BeePuzzle, "center" | "outer">): string[] {
  return [puzzle.center, ...puzzle.outer];
}

export function isPangram(word: string, letters: readonly string[]): boolean {
  const used = new Set(word.toLowerCase().split(""));
  return letters.every((letter) => used.has(letter));
}

/** 4-letter words score 1; longer words score their length; pangrams add 7. */
export function beeWordScore(word: string, letters: readonly string[]): number {
  const base = word.length === 4 ? 1 : word.length;
  return base + (isPangram(word, letters) ? 7 : 0);
}

export type BeeVerdict = "ok" | "too-short" | "missing-center" | "bad-letter" | "not-in-list" | "already-found";

export function checkBeeWord(puzzle: BeePuzzle, found: readonly string[], raw: string): BeeVerdict {
  const word = raw.toLowerCase();
  const letters = new Set(beeLetters(puzzle));
  if (word.length < 4) return "too-short";
  if (!word.includes(puzzle.center)) return "missing-center";
  if (word.split("").some((letter) => !letters.has(letter))) return "bad-letter";
  if (found.includes(word)) return "already-found";
  if (!puzzle.words.includes(word)) return "not-in-list";
  return "ok";
}

export function beeScore(puzzle: BeePuzzle, found: readonly string[]): number {
  const letters = beeLetters(puzzle);
  return found.reduce((total, word) => total + beeWordScore(word, letters), 0);
}

export function beeMaxScore(puzzle: BeePuzzle): number {
  return beeScore(puzzle, puzzle.words);
}

/** Rank ladder as percentages of the puzzle's own maximum, so every puzzle
 *  ends at the same summit regardless of how many words it holds. */
export const BEE_RANKS = [
  { label: "Beginner", pct: 0 },
  { label: "Good Start", pct: 2 },
  { label: "Moving Up", pct: 5 },
  { label: "Good", pct: 8 },
  { label: "Solid", pct: 15 },
  { label: "Nice", pct: 25 },
  { label: "Great", pct: 40 },
  { label: "Amazing", pct: 50 },
  { label: "Genius", pct: 70 },
] as const;

export function beeRank(score: number, maxScore: number): { index: number; label: string } {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  let index = 0;
  BEE_RANKS.forEach((rank, rankIndex) => {
    if (pct >= rank.pct) index = rankIndex;
  });
  return { index, label: BEE_RANKS[index]!.label };
}

/** Points still needed to reach the next rank, or null at the top. */
export function beePointsToNextRank(score: number, maxScore: number): number | null {
  const { index } = beeRank(score, maxScore);
  const next = BEE_RANKS[index + 1];
  if (!next) return null;
  return Math.max(1, Math.ceil((next.pct / 100) * maxScore) - score);
}

/** Mechanical validation for the hand-curated bank — the test suite runs
 *  this over every puzzle so an authoring slip cannot ship. */
export function validateBeePuzzle(puzzle: BeePuzzle): string[] {
  const problems: string[] = [];
  const letters = beeLetters(puzzle);
  if (puzzle.outer.length !== 6) problems.push("needs exactly 6 outer letters");
  if (new Set(letters).size !== 7) problems.push("letters must be 7 unique");
  if (letters.some((letter) => !/^[a-z]$/.test(letter))) problems.push("letters must be lowercase a-z");
  if (new Set(puzzle.words).size !== puzzle.words.length) problems.push("duplicate words");
  if (!puzzle.words.some((word) => isPangram(word, letters))) problems.push("no pangram");
  if (puzzle.words.length < 18) problems.push(`only ${puzzle.words.length} words (want 18+)`);
  const letterSet = new Set(letters);
  for (const word of puzzle.words) {
    if (word !== word.toLowerCase()) problems.push(`${word}: not lowercase`);
    if (word.length < 4) problems.push(`${word}: shorter than 4`);
    if (!word.includes(puzzle.center)) problems.push(`${word}: missing center letter`);
    if (word.split("").some((letter) => !letterSet.has(letter))) problems.push(`${word}: uses a letter outside the puzzle`);
  }
  return problems;
}
