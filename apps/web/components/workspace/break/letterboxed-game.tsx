"use client";

// Letter-square word game: chain words around the box using all 12 letters.
// Words are checked against the shared Break dictionary; every banked board
// carries a proven two-word solution, revealed once you finish (or give up).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBreakDayState } from "@/components/workspace/break/use-break-day";
import { Button } from "@/components/ui/button";
import { breakLexicon } from "@/lib/workspace/break/break-lexicon";
import {
  checkLetterBoxWord,
  letterBoxLetters,
  letterBoxSolved,
  lettersUsed,
  sideOfLetter,
  type LetterBoxPuzzle,
} from "@/lib/workspace/break/letterboxed";
import { cn } from "@/lib/utils";

const CORAL = "#fc716b";

const VERDICT_COPY: Record<string, string> = {
  "too-short": "Words need 3+ letters",
  "bad-letter": "Only today's 12 letters",
  "same-side": "Consecutive letters can't share a side",
  "bad-chain": "Must start with the last word's final letter",
  "not-a-word": "Not in the dictionary",
  "already-used": "Already played",
};

interface LetterBoxState {
  words: string[];
  gaveUp?: boolean;
}

/** Letter anchor positions on a 300x300 board (3 per side, clockwise). */
function letterPosition(puzzle: LetterBoxPuzzle, letter: string): { x: number; y: number } {
  const side = sideOfLetter(puzzle, letter);
  const slot = puzzle.sides[side]!.indexOf(letter);
  const offsets = [75, 150, 225];
  if (side === 0) return { x: offsets[slot]!, y: 30 };
  if (side === 1) return { x: 270, y: offsets[slot]! };
  if (side === 2) return { x: offsets[slot]!, y: 270 };
  return { x: 30, y: offsets[slot]! };
}

export function LetterBoxedGame({
  puzzle,
  dateKey,
  puzzleKey,
  onPlayAnother,
}: {
  puzzle: LetterBoxPuzzle;
  dateKey: string;
  puzzleKey: string;
  onPlayAnother: () => void;
}) {
  const [saved, update] = useBreakDayState<LetterBoxState>("letterboxed", dateKey, { words: [] }, puzzleKey);
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);
  const dictionary = useMemo(() => breakLexicon(), []);

  const letters = letterBoxLetters(puzzle);
  const used = lettersUsed(puzzle, saved.words);
  const solved = letterBoxSolved(puzzle, saved.words);
  const chainStart = saved.words.at(-1)?.at(-1) ?? null;

  // Refs mirror the volatile state so key handlers never act on a stale
  // closure — input faster than a render frame (or scripted) stays correct.
  const typedRef = useRef(typed);
  typedRef.current = typed;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const say = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((now) => (now === text ? null : now)), 2000);
  };

  const submit = useCallback(() => {
    const word = typedRef.current;
    const words = savedRef.current.words;
    if (!word || letterBoxSolved(puzzle, words)) return;
    const verdict = checkLetterBoxWord(puzzle, words, word, dictionary);
    if (verdict !== "ok") {
      say(VERDICT_COPY[verdict] ?? verdict);
      setShakeNonce((nonce) => nonce + 1);
      return;
    }
    update((previous) => ({ ...previous, words: [...previous.words, word.toLowerCase()] }));
    setTyped("");
    typedRef.current = "";
  }, [dictionary, puzzle, update]);

  const press = useCallback(
    (key: string) => {
      if (letterBoxSolved(puzzle, savedRef.current.words)) return;
      if (key === "enter") submit();
      else if (key === "back") setTyped((now) => now.slice(0, -1));
      else if (/^[a-z]$/.test(key) && letters.includes(key)) {
        setTyped((now) => {
          let base = now;
          const chain = savedRef.current.words.at(-1)?.at(-1) ?? null;
          if (!base && chain) {
            // The chain letter is fixed — typing anything seeds it first.
            if (key === chain) return chain;
            base = chain;
          }
          const previous = base.at(-1);
          if (previous && sideOfLetter(puzzle, previous) === sideOfLetter(puzzle, key)) return now;
          const next = base + key;
          typedRef.current = next;
          return next;
        });
      }
    },
    [letters, puzzle, submit],
  );

  // Keys this game acts on are consumed: a <button> the player clicked
  // earlier (a letter on the square, the header's New puzzle) still holds
  // focus, and a native button fires on Enter's DEFAULT action — so
  // submitting a word would also re-trigger whatever was last tapped.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "Enter") press("enter");
      else if (event.key === "Backspace") press("back");
      else if (/^[a-zA-Z]$/.test(event.key)) press(event.key.toLowerCase());
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  // Chords: segments for played words (faint) and the word being typed (bold).
  const playedSegments = saved.words.flatMap((word) =>
    word.split("").slice(0, -1).map((letter, index) => ({
      from: letterPosition(puzzle, letter),
      to: letterPosition(puzzle, word[index + 1]!),
    })),
  );
  const typingSegments = typed
    .split("")
    .slice(0, -1)
    .map((letter, index) => ({
      from: letterPosition(puzzle, letter),
      to: letterPosition(puzzle, typed[index + 1]!),
    }));

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]" data-testid="letterboxed-board">
      <div className="flex flex-col items-center gap-3">
        <div className="h-5 text-sm font-medium text-muted-foreground" aria-live="polite" data-testid="letterboxed-notice">
          {notice ?? (solved ? `Solved in ${saved.words.length} word${saved.words.length === 1 ? "" : "s"}!` : "")}
        </div>
        <div
          key={`typed-${shakeNonce}`}
          className={cn("flex h-8 items-center text-xl font-semibold uppercase tracking-widest", shakeNonce > 0 && notice && "break-row-shake")}
        >
          {chainStart && !solved && <span className="opacity-50">{typed ? "" : chainStart}</span>}
          {typed}
          {!solved && <span className="ml-0.5 inline-block h-6 w-px animate-pulse" style={{ background: CORAL }} />}
        </div>

        {/* The square is a THEMED panel, not a white slab. Sudoku and the
            crosswords earn their paper-white grids by putting content on
            them; this one is empty by design, so on the app's default black
            it was just a glaring void. Tokens keep it right on both themes. */}
        <svg viewBox="0 0 300 300" className="w-full max-w-[19rem]">
          <rect
            x={30}
            y={30}
            width={240}
            height={240}
            stroke="var(--ui-text-primary)"
            strokeWidth={2}
            style={{ fill: "color-mix(in srgb, var(--ui-base) 6%, transparent)" }}
          />
          {playedSegments.map((segment, index) => (
            <line key={`p${index}`} x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y} stroke={CORAL} strokeOpacity={0.25} strokeWidth={2} />
          ))}
          {typingSegments.map((segment, index) => (
            <line key={`t${index}`} x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y} stroke={CORAL} strokeWidth={2.5} strokeDasharray="5 4" />
          ))}
          {letters.map((letter) => {
            const position = letterPosition(puzzle, letter);
            const side = sideOfLetter(puzzle, letter);
            const labelOffset = side === 0 ? { x: 0, y: -16 } : side === 1 ? { x: 16, y: 0 } : side === 2 ? { x: 0, y: 20 } : { x: -16, y: 0 };
            return (
              <g key={letter} onClick={() => press(letter)} className="cursor-pointer select-none">
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={7}
                  stroke="var(--ui-text-primary)"
                  strokeWidth={2}
                  style={{ fill: used.has(letter) ? CORAL : "color-mix(in srgb, var(--ui-base) 18%, transparent)" }}
                />
                <text
                  x={position.x + labelOffset.x}
                  y={position.y + labelOffset.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground text-[15px] font-bold uppercase"
                >
                  {letter}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="rounded-full px-4" onClick={() => press("back")} disabled={solved}>
            Delete
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={() => {
              setTyped("");
              update((previous) => ({ ...previous, words: [] }));
            }}
          >
            Restart
          </Button>
          <Button variant="outline" size="sm" className="rounded-full px-4" onClick={() => press("enter")} disabled={solved} data-testid="letterboxed-enter">
            Enter
          </Button>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <p className="text-sm">
          <span className="font-semibold">{used.size}</span> of 12 letters used · try to finish in <span className="font-semibold">2 words</span>
        </p>
        <ul className="flex flex-wrap items-center gap-1.5 text-sm" data-testid="letterboxed-words">
          {saved.words.map((word, index) => (
            <li key={`${word}-${index}`} className="break-chip-in rounded-full border border-(--ui-stroke-tertiary) px-2.5 py-0.5 uppercase tracking-wide">
              {word}
            </li>
          ))}
        </ul>
        {solved ? (
          <div className="flex flex-col items-start gap-2">
            <p className="break-banner-in text-sm text-muted-foreground">
              Our two-word answer: <span className="font-semibold uppercase">{puzzle.solution[0]}</span> →{" "}
              <span className="font-semibold uppercase">{puzzle.solution[1]}</span>
            </p>
            <Button variant="outline" size="sm" className="rounded-full px-4" onClick={onPlayAnother} data-testid="letterboxed-play-another">
              Play another
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => {
              update((previous) => ({ ...previous, gaveUp: true, words: [...puzzle.solution] }));
              setTyped("");
            }}
          >
            Show the answer (ends the day's game)
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          Each word starts with the previous word's last letter. Letters can repeat; consecutive letters never share a side.
        </p>
      </aside>
    </div>
  );
}
