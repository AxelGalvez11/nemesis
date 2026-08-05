"use client";

// Seven-letter honeycomb word hunt: type or click letters, Enter submits.
// The rank ladder climbs toward Genius as a share of the puzzle's own
// maximum score, so short and long puzzles feel the same.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBreakDayState } from "@/components/workspace/break/use-break-day";
import { Button } from "@/components/ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  BEE_RANKS,
  beeLetters,
  beeMaxScore,
  beePointsToNextRank,
  beeRank,
  beeScore,
  beeWordScore,
  checkBeeWord,
  isPangram,
  type BeePuzzle,
} from "@/lib/workspace/break/bee";
import { hashSeed, seededShuffle } from "@/lib/workspace/break/daily";
import { cn } from "@/lib/utils";

const HONEY = "#f2c94c";

const VERDICT_COPY: Record<string, string> = {
  "too-short": "Too short — 4 letters minimum",
  "missing-center": "Must use the center letter",
  "bad-letter": "Only today's 7 letters",
  "not-in-list": "Not in this puzzle's list",
  "already-found": "Already found",
};

interface BeeState {
  found: string[];
}

export function BeeGame({
  puzzle,
  dateKey,
  puzzleKey,
  onPlayAnother,
}: {
  puzzle: BeePuzzle;
  dateKey: string;
  puzzleKey: string;
  onPlayAnother: () => void;
}) {
  const [saved, update] = useBreakDayState<BeeState>("bee", dateKey, { found: [] }, puzzleKey);
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  // Feedback: a floating "+N" on accepted words, a shake on rejects (the
  // word clears when the shake finishes, like the original), and the newest
  // chip pops into the found list.
  const [toast, setToast] = useState<{ id: number; text: string; pangram: boolean } | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [lastFound, setLastFound] = useState<string | null>(null);
  // Refs mirror volatile state so fast (or scripted) typing can't submit
  // against a stale closure.
  const typedRef = useRef(typed);
  typedRef.current = typed;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const letters = beeLetters(puzzle);
  const outerOrder = useMemo(
    () => seededShuffle(puzzle.outer, hashSeed(`${dateKey}:${shuffleSeed}`)),
    [puzzle.outer, dateKey, shuffleSeed],
  );

  const score = beeScore(puzzle, saved.found);
  const maxScore = beeMaxScore(puzzle);
  const rank = beeRank(score, maxScore);
  const toNext = beePointsToNextRank(score, maxScore);

  const say = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((now) => (now === text ? null : now)), 1600);
  };

  const submit = useCallback(() => {
    const word = typedRef.current.toLowerCase();
    if (!word || rejecting) return;
    const found = savedRef.current.found;
    const verdict = checkBeeWord(puzzle, found, word);
    if (verdict !== "ok") {
      say(VERDICT_COPY[verdict] ?? verdict);
      setRejecting(true);
      setShakeNonce((nonce) => nonce + 1);
      return;
    }
    const points = beeWordScore(word, letters);
    const pangram = isPangram(word, letters);
    setToast({ id: shakeNonce * 7919 + found.length, text: `+${points}`, pangram });
    setLastFound(word);
    setTyped("");
    typedRef.current = "";
    update((previous) => ({ found: [...previous.found, word] }));
  }, [letters, puzzle, rejecting, shakeNonce, update]);

  const press = useCallback(
    (key: string) => {
      if (key === "enter") submit();
      else if (key === "back") setTyped((now) => now.slice(0, -1));
      else if (/^[a-z]$/.test(key)) {
        setTyped((now) => {
          const next = now.length < 19 ? now + key : now;
          typedRef.current = next;
          return next;
        });
      }
    },
    [submit],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "Enter") press("enter");
      else if (event.key === "Backspace") press("back");
      else if (/^[a-zA-Z]$/.test(event.key)) press(event.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  const foundNewestFirst = useMemo(() => [...saved.found].reverse(), [saved.found]);

  // Hex cells: center + 6 around it, laid out on a fixed 3-column honeycomb.
  const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";
  const cells: { letter: string; center: boolean; style: React.CSSProperties }[] = [
    { letter: puzzle.center, center: true, style: { left: "50%", top: "50%" } },
    { letter: outerOrder[0]!, center: false, style: { left: "50%", top: "16%" } },
    { letter: outerOrder[1]!, center: false, style: { left: "79%", top: "33%" } },
    { letter: outerOrder[2]!, center: false, style: { left: "79%", top: "67%" } },
    { letter: outerOrder[3]!, center: false, style: { left: "50%", top: "84%" } },
    { letter: outerOrder[4]!, center: false, style: { left: "21%", top: "67%" } },
    { letter: outerOrder[5]!, center: false, style: { left: "21%", top: "33%" } },
  ];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]" data-testid="bee-board">
      <div className="flex flex-col items-center gap-4">
        <div className="h-5 text-sm font-medium text-muted-foreground" aria-live="polite" data-testid="bee-notice">
          {notice ?? ""}
        </div>
        <div className="relative flex h-9 items-center text-2xl font-semibold tracking-wide">
          {toast && (
            <span
              key={toast.id}
              onAnimationEnd={() => setToast(null)}
              data-testid="bee-toast"
              className={cn(
                "break-rise pointer-events-none absolute -top-7 left-1/2 whitespace-nowrap text-sm font-bold",
                toast.pangram && "rounded-full px-2.5 py-0.5 text-black",
              )}
              style={toast.pangram ? { background: HONEY } : undefined}
            >
              {toast.pangram ? `Pangram! ${toast.text}` : toast.text}
            </span>
          )}
          <span
            key={`typed-${shakeNonce}`}
            className={cn("flex items-center", rejecting && "break-row-shake opacity-60")}
            onAnimationEnd={() => {
              setRejecting(false);
              setTyped("");
            }}
          >
            {typed ? (
              <span className="uppercase">
                {typed.split("").map((letter, index) => (
                  <span key={index} className={cn(letter === puzzle.center && "text-[#b58900]", !letters.includes(letter) && "opacity-40")}>
                    {letter}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-base text-muted-foreground">Type or click</span>
            )}
            <span className="ml-0.5 inline-block h-7 w-px animate-pulse bg-(--theme-primary)" />
          </span>
        </div>

        <div className="relative h-64 w-64">
          {cells.map((cell) => (
            <button
              key={cell.letter + (cell.center ? "-center" : "")}
              type="button"
              data-testid={cell.center ? "bee-center" : undefined}
              onClick={() => press(cell.letter)}
              className={cn(
                "absolute flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-xl font-bold uppercase transition-transform active:scale-90",
                cell.center ? "text-black" : "bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)]",
              )}
              style={{ ...cell.style, clipPath: HEX_CLIP, background: cell.center ? HONEY : undefined }}
            >
              {cell.letter}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button variant="outline" size="sm" className="rounded-full px-4" onClick={() => press("back")}>
            Delete
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label="Shuffle letters"
            onClick={() => setShuffleSeed((seed) => seed + 1)}
          >
            <Codicon name="refresh" size={14} />
          </Button>
          <Button variant="outline" size="sm" className="rounded-full px-4" onClick={() => press("enter")} data-testid="bee-enter">
            Enter
          </Button>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2" data-testid="bee-rank">
          <span className="text-sm font-semibold">{rank.label}</span>
          <div className="flex flex-1 items-center gap-1">
            {BEE_RANKS.map((step, index) => (
              <span
                key={step.label}
                className={cn(
                  "size-1.5 rounded-full transition-all duration-500",
                  index <= rank.index ? "scale-110" : "bg-[color-mix(in_srgb,var(--ui-base)_18%,transparent)]",
                )}
                style={index <= rank.index ? { background: HONEY } : undefined}
              />
            ))}
          </div>
          <span
            className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-black"
            style={{ background: HONEY }}
          >
            {score}
          </span>
        </div>
        {toNext !== null && (
          <p className="text-xs text-muted-foreground">
            {toNext} more point{toNext === 1 ? "" : "s"} to {BEE_RANKS[rank.index + 1]!.label}.
          </p>
        )}
        <div className="rounded-xl border border-(--ui-stroke-tertiary) p-3">
          <p className="pb-2 text-sm">
            You have found <span className="font-semibold">{saved.found.length}</span> word{saved.found.length === 1 ? "" : "s"}
          </p>
          <ul className="flex max-h-72 flex-wrap content-start gap-1.5 overflow-y-auto" data-testid="bee-found">
            {foundNewestFirst.map((word) => (
              <li
                key={word}
                className={cn(
                  "rounded-full border border-(--ui-stroke-tertiary) px-2 py-0.5 text-xs capitalize",
                  isPangram(word, letters) && "border-transparent font-semibold text-black",
                  word === lastFound && "break-chip-in",
                )}
                style={isPangram(word, letters) ? { background: HONEY } : undefined}
              >
                {word}
              </li>
            ))}
          </ul>
        </div>
        {/* Honeycomb has no win/lose banner — you can always find more
            words — so unlike the other seven games this is always
            available rather than gated on a "finished" state. */}
        <Button variant="outline" size="sm" className="self-start rounded-full px-4" onClick={onPlayAnother} data-testid="bee-play-another">
          Play another
        </Button>
        <p className="text-xs text-muted-foreground">
          Words use only today's letters, need the center letter, and are 4+ letters. Find every letter at once for a pangram bonus.
        </p>
      </aside>
    </div>
  );
}
