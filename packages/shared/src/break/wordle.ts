// Guess-the-word rules for the Break page's daily word game. Pure logic —
// the component only renders what these functions decide.

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export type LetterState = "correct" | "present" | "absent";
export type WordleStatus = "playing" | "won" | "lost";

/** Classic two-pass scoring. The second pass consumes remaining answer
 *  letters left-to-right so duplicate letters behave the way players expect:
 *  guessing "GEESE" against "THOSE" marks exactly one E (the one in the
 *  right position) and greys the extras. */
export function scoreGuess(guess: string, answer: string): LetterState[] {
  const guessLetters = guess.toLowerCase().split("");
  const answerLetters = answer.toLowerCase().split("");
  const states: LetterState[] = new Array(guessLetters.length).fill("absent");
  const remaining = new Map<string, number>();

  guessLetters.forEach((letter, index) => {
    if (letter === answerLetters[index]) {
      states[index] = "correct";
    } else {
      const other = answerLetters[index];
      if (other) remaining.set(other, (remaining.get(other) ?? 0) + 1);
    }
  });

  guessLetters.forEach((letter, index) => {
    if (states[index] === "correct") return;
    const left = remaining.get(letter) ?? 0;
    if (left > 0) {
      states[index] = "present";
      remaining.set(letter, left - 1);
    }
  });

  return states;
}

const STATE_RANK: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };

/** Best-known state per letter, for painting the keyboard. A letter that was
 *  ever green stays green even if a later guess placed it wrong. */
export function keyboardStates(guesses: readonly string[], answer: string): Record<string, LetterState> {
  const states: Record<string, LetterState> = {};
  for (const guess of guesses) {
    const score = scoreGuess(guess, answer);
    guess.toLowerCase().split("").forEach((letter, index) => {
      const next = score[index]!;
      const current = states[letter];
      if (!current || STATE_RANK[next] > STATE_RANK[current]) states[letter] = next;
    });
  }
  return states;
}

export function wordleStatus(guesses: readonly string[], answer: string): WordleStatus {
  if (guesses.some((guess) => guess.toLowerCase() === answer.toLowerCase())) return "won";
  return guesses.length >= MAX_GUESSES ? "lost" : "playing";
}

/** A guess is playable when it's 5 ascii letters and in the accepted list.
 *  The list check lives here (not scattered in the component) so tests pin
 *  the exact contract. */
export function guessProblem(guess: string, allowed: ReadonlySet<string>): string | null {
  const word = guess.toLowerCase();
  if (word.length !== WORD_LENGTH) return "Not enough letters";
  if (!/^[a-z]+$/.test(word)) return "Letters only";
  if (!allowed.has(word)) return "Not in word list";
  return null;
}
