"use client";

// Daily five-letter word game. Fixed judge colors (they ARE the game's
// language) with white text — readable on both themes; everything else uses
// the app's tokens. Feedback matches the classic feel: typed letters pop,
// submitted rows flip tile-by-tile, invalid guesses shake, a win bounces,
// and the keyboard learns its colors only after the reveal finishes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBreakDayState } from "@/components/workspace/break/use-break-day";
import { Button } from "@/components/ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  guessProblem,
  keyboardStates,
  MAX_GUESSES,
  scoreGuess,
  WORD_LENGTH,
  wordleAllowedSet,
  wordleStatus,
  type LetterState,
} from "@nemesis/shared";
import { cn } from "@/lib/utils";

const JUDGE_COLORS: Record<LetterState, string> = {
  correct: "#6aaa64",
  present: "#c9b458",
  absent: "#787c7e",
};

const KEY_ROWS = ["qwertyuiop".split(""), "asdfghjkl".split(""), ["enter", ..."zxcvbnm".split(""), "back"]];

/** Reveal choreography (ms) — flip stagger per column, then the keyboard
 *  and any win bounce land after the last tile has turned. */
const FLIP_STAGGER = 280;
const REVEAL_TOTAL = FLIP_STAGGER * (WORD_LENGTH - 1) + 380;

interface WordleState {
  guesses: string[];
}

export function WordleGame({
  answer,
  dateKey,
  puzzleKey,
  onPlayAnother,
}: {
  answer: string;
  dateKey: string;
  /** Storage/seed identity for the puzzle in play — the plain dateKey for
   *  the daily (n=0), extraKey(dateKey, n) for an extra. */
  puzzleKey: string;
  onPlayAnother: () => void;
}) {
  const [saved, update] = useBreakDayState<WordleState>("wordle", dateKey, { guesses: [] }, puzzleKey);
  const [current, setCurrent] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);
  // Which row is mid-flip (submitted this session), and whether that flip is
  // still running — the keyboard and the end message lag it on purpose.
  //
  // `revealing` is a BOOLEAN, not "how many guesses the keyboard may know
  // about". A counter was the original design and it silently broke every
  // session after the first: saved guesses arrive from localStorage in an
  // effect (never during render), so a counter seeded from `saved` mounts at
  // 0 and nothing ever bumped it for a restored game — the keyboard stayed
  // colourless and the win/loss line never printed for the rest of that
  // puzzle. "Hide one row, and only while a flip I started is running" needs
  // no catch-up: a restored game has no flip, so it shows everything.
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const [revealing, setRevealing] = useState(false);
  const revealTimer = useRef<number | null>(null);
  const allowed = useMemo(() => wordleAllowedSet(), []);

  // Refs mirror volatile state so the key handlers survive input faster
  // than a render frame (scripted or very fast typing).
  const currentRef = useRef(current);
  currentRef.current = current;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const status = wordleStatus(saved.guesses, answer);
  const revealed = !revealing;
  // The keyboard learns the newest guess only after its tiles have finished
  // turning; every other guess (including everything restored from storage)
  // is fair game immediately.
  const judgedGuesses = useMemo(
    () => (revealing ? saved.guesses.slice(0, -1) : saved.guesses),
    [revealing, saved.guesses],
  );
  const keyStates = useMemo(() => keyboardStates(judgedGuesses, answer), [judgedGuesses, answer]);

  useEffect(() => () => {
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
  }, []);

  const say = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((now) => (now === text ? null : now)), 1800);
  };

  const submit = useCallback(() => {
    const guesses = savedRef.current.guesses;
    if (wordleStatus(guesses, answer) !== "playing") return;
    const word = currentRef.current;
    const problem = guessProblem(word, allowed);
    if (problem) {
      say(problem);
      setShakeNonce((nonce) => nonce + 1);
      return;
    }
    const rowIndex = guesses.length;
    setRevealRow(rowIndex);
    setRevealing(true);
    update((previous) => ({ guesses: [...previous.guesses, word.toLowerCase()] }));
    setCurrent("");
    currentRef.current = "";
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => setRevealing(false), REVEAL_TOTAL);
  }, [allowed, answer, update]);

  const type = useCallback(
    (key: string) => {
      if (wordleStatus(savedRef.current.guesses, answer) !== "playing") return;
      if (key === "enter") {
        submit();
      } else if (key === "back") {
        setCurrent((now) => now.slice(0, -1));
      } else if (/^[a-z]$/.test(key)) {
        setCurrent((now) => {
          const next = now.length < WORD_LENGTH ? now + key : now;
          currentRef.current = next;
          return next;
        });
      }
    },
    [answer, submit],
  );

  // While a game is open the board OWNS the keyboard: any key it acts on is
  // consumed with preventDefault. Without that, a button the player clicked
  // earlier (the header's New puzzle / How to play, or an on-screen letter)
  // still holds focus, and a native <button> activates on Enter's DEFAULT
  // action — so pressing Enter to submit a guess also re-fired that button,
  // silently throwing the player onto a new puzzle mid-word.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "Enter") type("enter");
      else if (event.key === "Backspace") type("back");
      else if (/^[a-zA-Z]$/.test(event.key)) type(event.key.toLowerCase());
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [type]);

  const rows = Array.from({ length: MAX_GUESSES }, (_, index) => {
    if (index < saved.guesses.length) return { kind: "judged" as const, word: saved.guesses[index]! };
    if (index === saved.guesses.length && status === "playing") return { kind: "typing" as const, word: current };
    return { kind: "empty" as const, word: "" };
  });

  const endMessage =
    status === "won"
      ? `Solved in ${saved.guesses.length}/${MAX_GUESSES} — nice break.`
      : status === "lost"
        ? `It was ${answer.toUpperCase()}. Another word is waiting.`
        : "";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3" data-testid="wordle-board">
      <div className="h-5 text-sm font-medium text-muted-foreground" aria-live="polite" data-testid="wordle-notice">
        {notice ?? (revealed ? endMessage : "")}
      </div>
      {/* Gated on `status`, not `revealed`: a reopened win/loss has no flip
          to wait for, so this must not depend on one having happened. */}
      {status !== "playing" && (
        <Button variant="outline" size="sm" className="rounded-full px-4" onClick={onPlayAnother} data-testid="wordle-play-another">
          Play another
        </Button>
      )}

      <div className="grid grid-rows-6 gap-1.5">
        {rows.map((row, rowIndex) => {
          const judged = row.kind === "judged" ? scoreGuess(row.word, answer) : null;
          const flipping = judged && rowIndex === revealRow;
          const winning = flipping && status === "won" && row.word.toLowerCase() === answer.toLowerCase();
          return (
            <div
              key={row.kind === "typing" ? `typing-${shakeNonce}` : rowIndex}
              className={cn("grid grid-cols-5 gap-1.5", row.kind === "typing" && shakeNonce > 0 && "break-row-shake")}
            >
              {Array.from({ length: WORD_LENGTH }, (_, col) => {
                const letter = row.word[col] ?? "";
                const state = judged?.[col];
                return (
                  <div
                    key={row.kind === "typing" ? `${col}-${letter || "empty"}` : col}
                    className={cn(
                      "flex size-13 items-center justify-center rounded-sm text-2xl font-bold uppercase",
                      state ? "text-white" : "border-2 border-(--ui-stroke-tertiary)",
                      !state && letter && "break-tile-pop border-(--ui-base)/40",
                      flipping && !winning && "break-tile-flip",
                      winning && "break-tile-flip-win",
                    )}
                    style={{
                      ...(state ? { background: JUDGE_COLORS[state] } : undefined),
                      ...(flipping
                        ? ({
                            "--break-delay": `${col * FLIP_STAGGER}ms`,
                            "--break-bounce-delay": `${REVEAL_TOTAL + col * 90}ms`,
                          } as React.CSSProperties)
                        : undefined),
                    }}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex w-full flex-col items-center gap-1.5">
        {KEY_ROWS.map((keys, rowIndex) => (
          <div key={rowIndex} className="flex w-full justify-center gap-1.5">
            {keys.map((key) => {
              const judged = key.length === 1 ? keyStates[key] : undefined;
              const wide = key === "enter" || key === "back";
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`wordle-key-${key}`}
                  // Never let a tapped key keep focus: a focused key would
                  // re-fire on the next Space/Enter meant for the board.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => type(key)}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-md text-sm font-semibold uppercase transition-colors duration-300 active:scale-95",
                    wide ? "px-3 text-xs" : "flex-1 basis-0",
                    judged ? "text-white" : "bg-[color-mix(in_srgb,var(--ui-base)_9%,transparent)]",
                  )}
                  style={{ maxWidth: wide ? undefined : "2.6rem", background: judged ? JUDGE_COLORS[judged] : undefined }}
                >
                  {key === "back" ? <Codicon name="clear-all" size={16} /> : key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
