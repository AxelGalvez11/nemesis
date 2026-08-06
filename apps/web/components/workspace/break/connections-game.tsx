"use client";

// Group-the-sixteen daily. Fixed pastel group tones with dark text (the
// difficulty colors are the game's vocabulary, same in both themes); chrome
// uses app tokens. State = submitted guesses only; solved groups, mistakes,
// and the endgame all derive.

import { useMemo, useState } from "react";

import { useBreakDayState } from "@/components/workspace/break/use-break-day";
import { Button } from "@/components/ui/button";
import {
  allConnectionsItems,
  CONNECTIONS_LIVES,
  connectionsStatus,
  evaluateGuess,
  hashSeed,
  mistakesUsed,
  remainingItems,
  seededShuffle,
  solvedGroups,
  type ConnectionsPuzzle,
} from "@nemesis/shared";
import { cn } from "@/lib/utils";

const GROUP_TONES = ["#f5d76b", "#a8c66c", "#a9c1ef", "#c39bd3"];

interface ConnectionsState {
  guesses: string[][];
}

export function ConnectionsGame({
  puzzle,
  dateKey,
  puzzleKey,
  onPlayAnother,
}: {
  puzzle: ConnectionsPuzzle;
  dateKey: string;
  puzzleKey: string;
  onPlayAnother: () => void;
}) {
  const [saved, update] = useBreakDayState<ConnectionsState>("connections", dateKey, { guesses: [] }, puzzleKey);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  // A wrong four hops then shakes before the selection lets go — the pause
  // is what makes the mistake legible.
  const [wrongShake, setWrongShake] = useState<string[] | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);

  const boardOrder = useMemo(
    () => seededShuffle(allConnectionsItems(puzzle), hashSeed(`connections:${dateKey}:${shuffleSeed}`)),
    [puzzle, dateKey, shuffleSeed],
  );

  const solved = solvedGroups(puzzle, saved.guesses);
  const mistakes = mistakesUsed(puzzle, saved.guesses);
  const status = connectionsStatus(puzzle, saved.guesses);
  const remaining = remainingItems(puzzle, saved.guesses, boardOrder);

  const say = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((now) => (now === text ? null : now)), 2000);
  };

  const toggle = (item: string) => {
    if (status !== "playing") return;
    setSelected((now) =>
      now.includes(item) ? now.filter((entry) => entry !== item) : now.length < 4 ? [...now, item] : now,
    );
  };

  const submit = () => {
    if (selected.length !== 4 || status !== "playing" || wrongShake) return;
    const result = evaluateGuess(puzzle, saved.guesses, selected);
    if (result.kind === "duplicate") {
      say("Already guessed");
      return;
    }
    update((previous) => ({ guesses: [...previous.guesses, [...selected]] }));
    if (result.kind === "solved") {
      setSelected([]);
      return;
    }
    if (result.kind === "one-away") say("One away…");
    setWrongShake([...selected]);
    setShakeNonce((nonce) => nonce + 1);
  };

  // On a loss, reveal what the player missed, in puzzle order.
  const revealed = status === "lost" ? puzzle.groups.map((_, index) => index).filter((index) => !solved.includes(index)) : [];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4" data-testid="connections-board">
      <div className="h-5 text-sm font-medium text-muted-foreground" aria-live="polite" data-testid="connections-notice">
        {notice ??
          (status === "won"
            ? "Solved — four for four."
            : status === "lost"
              ? "Out of tries. Tomorrow's grid awaits."
              : "Create four groups of four!")}
      </div>

      <div className="flex w-full flex-col gap-2">
        {solved.map((groupIndex) => (
          <div
            key={`solved-${groupIndex}`}
            className="break-bar-in flex flex-col items-center rounded-lg py-3 text-black"
            style={{ background: GROUP_TONES[groupIndex] }}
            data-testid={`connections-solved-${groupIndex}`}
          >
            <span className="text-sm font-bold uppercase tracking-wide">{puzzle.groups[groupIndex]!.title}</span>
            <span className="text-sm">{puzzle.groups[groupIndex]!.items.join(", ")}</span>
          </div>
        ))}

        {status !== "lost" && remaining.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {remaining.map((item) => {
              const picked = selected.includes(item);
              const shakeIndex = wrongShake?.indexOf(item) ?? -1;
              return (
                <button
                  key={shakeIndex >= 0 ? `${item}-${shakeNonce}` : item}
                  type="button"
                  onClick={() => toggle(item)}
                  data-testid="connections-tile"
                  onAnimationEnd={(event) => {
                    if (event.animationName === "break-shake") {
                      setSelected([]);
                      setWrongShake(null);
                    }
                  }}
                  className={cn(
                    "flex min-h-16 items-center justify-center break-words rounded-lg px-1 py-2 text-center text-[13px] font-bold uppercase leading-tight transition-colors",
                    picked ? "bg-[#55544a] text-white" : "bg-[color-mix(in_srgb,var(--ui-base)_8%,transparent)]",
                    shakeIndex >= 0 && "break-hop-shake",
                  )}
                  style={shakeIndex >= 0 ? ({ "--break-delay": `${shakeIndex * 90}ms` } as React.CSSProperties) : undefined}
                >
                  {item}
                </button>
              );
            })}
          </div>
        )}

        {revealed.map((groupIndex) => (
          <div
            key={`revealed-${groupIndex}`}
            className="break-bar-in flex flex-col items-center rounded-lg py-3 text-black opacity-90"
            style={{ background: GROUP_TONES[groupIndex] }}
          >
            <span className="text-sm font-bold uppercase tracking-wide">{puzzle.groups[groupIndex]!.title}</span>
            <span className="text-sm">{puzzle.groups[groupIndex]!.items.join(", ")}</span>
          </div>
        ))}
      </div>

      {status === "playing" && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="connections-mistakes">
            Mistakes remaining:
            {Array.from({ length: CONNECTIONS_LIVES }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "size-3 rounded-full transition-all duration-500",
                  index < CONNECTIONS_LIVES - mistakes
                    ? "bg-(--ui-base)"
                    : "scale-50 bg-[color-mix(in_srgb,var(--ui-base)_15%,transparent)]",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full px-4" onClick={() => setShuffleSeed((seed) => seed + 1)}>
              Shuffle
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              disabled={selected.length === 0}
              onClick={() => setSelected([])}
            >
              Deselect all
            </Button>
            <Button
              size="sm"
              className="rounded-full px-4"
              disabled={selected.length !== 4}
              onClick={submit}
              data-testid="connections-submit"
            >
              Submit
            </Button>
          </div>
        </>
      )}

      {status !== "playing" && (
        <Button variant="outline" size="sm" className="rounded-full px-4" onClick={onPlayAnother} data-testid="connections-play-another">
          Play another
        </Button>
      )}
    </div>
  );
}
