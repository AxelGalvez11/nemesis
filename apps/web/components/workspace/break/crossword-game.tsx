"use client";

// Mini crossword. The grid keeps real-crossword colors in both themes (white
// squares, black blocks, yellow selected cell, blue active word); the clue
// rail uses app tokens. Keyboard-first: type to fill, Backspace erases,
// arrows move, Space/click toggles direction, Tab jumps to the next clue.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBreakDayState } from "@/components/workspace/break/use-break-day";
import { Button } from "@/components/ui/button";
import {
  buildCrossword,
  cellKey,
  isFilled,
  isSolved,
  wrongCells,
  type CrosswordEntries,
  type CrosswordSlot,
  type Direction,
  type MiniPuzzle,
} from "@/lib/workspace/break/crossword";
import { cn } from "@/lib/utils";

interface MiniState {
  entries: CrosswordEntries;
  seconds: number;
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CrosswordGame({
  puzzle,
  dateKey,
  storageKey = "mini",
  wide = false,
}: {
  puzzle: MiniPuzzle;
  dateKey: string;
  /** Day-state namespace — the Mini and the bigger Crossword save separately. */
  storageKey?: "mini" | "crossword";
  wide?: boolean;
}) {
  const model = useMemo(() => buildCrossword(puzzle), [puzzle]);
  const [saved, update] = useBreakDayState<MiniState>(storageKey, dateKey, { entries: {}, seconds: 0 });
  const firstOpen = model.cells.flat().find((cell) => !cell.block)!;
  const [cursor, setCursor] = useState<{ row: number; col: number }>({ row: firstOpen.row, col: firstOpen.col });
  const [direction, setDirection] = useState<Direction>("across");
  const [marked, setMarked] = useState<string[]>([]);
  const [revealArmed, setRevealArmed] = useState(false);

  const solved = isSolved(model, saved.entries);
  const filled = isFilled(model, saved.entries);

  // The clock ticks while mounted and unsolved; persisted so reopening keeps it.
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (solved) return;
    tickRef.current = window.setInterval(() => {
      update((previous) => ({ ...previous, seconds: previous.seconds + 1 }));
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [solved, update]);

  const activeSlot: CrosswordSlot | null = useMemo(() => {
    const direct = model.slots.find(
      (slot) => slot.direction === direction && slot.cells.some((cell) => cell.row === cursor.row && cell.col === cursor.col),
    );
    if (direct) return direct;
    return (
      model.slots.find((slot) => slot.cells.some((cell) => cell.row === cursor.row && cell.col === cursor.col)) ?? null
    );
  }, [model, cursor, direction]);

  const inActiveSlot = (row: number, col: number): boolean =>
    activeSlot?.cells.some((cell) => cell.row === row && cell.col === col) ?? false;

  const moveWithin = useCallback(
    (offset: number) => {
      if (!activeSlot) return;
      const index = activeSlot.cells.findIndex((cell) => cell.row === cursor.row && cell.col === cursor.col);
      const next = activeSlot.cells[index + offset];
      if (next) setCursor({ row: next.row, col: next.col });
    },
    [activeSlot, cursor],
  );

  // Callbacks need fresh entries without re-binding on every keystroke.
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const jumpToSlot = useCallback((slot: CrosswordSlot, preferEmpty = true) => {
    setDirection(slot.direction);
    const target = preferEmpty ? slot.cells.find((cell) => !(cellKey(cell.row, cell.col) in savedRef.current.entries)) : null;
    const cell = target ?? slot.cells[0]!;
    setCursor({ row: cell.row, col: cell.col });
  }, []);

  const nextSlot = useCallback(
    (delta: 1 | -1) => {
      if (!activeSlot) return;
      const ordered = [...model.slots.filter((slot) => slot.direction === "across"), ...model.slots.filter((slot) => slot.direction === "down")];
      const index = ordered.findIndex((slot) => slot === activeSlot);
      const next = ordered[(index + delta + ordered.length) % ordered.length]!;
      jumpToSlot(next);
    },
    [activeSlot, jumpToSlot, model.slots],
  );

  const setLetter = useCallback(
    (letter: string) => {
      if (solved) return;
      const key = cellKey(cursor.row, cursor.col);
      setMarked((now) => now.filter((entry) => entry !== key));
      update((previous) => ({ ...previous, entries: { ...previous.entries, [key]: letter } }));
      moveWithin(1);
    },
    [cursor, moveWithin, solved, update],
  );

  const erase = useCallback(() => {
    if (solved) return;
    const key = cellKey(cursor.row, cursor.col);
    if (savedRef.current.entries[key]) {
      update((previous) => {
        const entries = { ...previous.entries };
        delete entries[key];
        return { ...previous, entries };
      });
    } else {
      moveWithin(-1);
    }
  }, [cursor, moveWithin, solved, update]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (/^[a-zA-Z]$/.test(event.key)) {
        setLetter(event.key.toUpperCase());
      } else if (event.key === "Backspace") {
        erase();
      } else if (event.key === " ") {
        event.preventDefault();
        setDirection((now) => (now === "across" ? "down" : "across"));
      } else if (event.key === "Tab") {
        event.preventDefault();
        nextSlot(event.shiftKey ? -1 : 1);
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const wantsAcross = event.key === "ArrowLeft" || event.key === "ArrowRight";
        if ((wantsAcross && direction !== "across") || (!wantsAcross && direction !== "down")) {
          setDirection(wantsAcross ? "across" : "down");
          return;
        }
        const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        const move = (row: number, col: number) => {
          let r = row;
          let c = col;
          do {
            if (wantsAcross) c += step;
            else r += step;
            if (r < 0 || r >= model.size.rows || c < 0 || c >= model.size.cols) return null;
          } while (model.cells[r]![c]!.block);
          return { row: r, col: c };
        };
        const next = move(cursor.row, cursor.col);
        if (next) setCursor(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cursor, direction, erase, model, nextSlot, setLetter]);

  const check = () => setMarked(wrongCells(model, saved.entries));
  const reveal = () => {
    if (!revealArmed) {
      setRevealArmed(true);
      window.setTimeout(() => setRevealArmed(false), 3000);
      return;
    }
    setRevealArmed(false);
    update((previous) => {
      const entries: CrosswordEntries = { ...previous.entries };
      model.cells.flat().forEach((cell) => {
        if (!cell.block) entries[cellKey(cell.row, cell.col)] = cell.answer;
      });
      return { ...previous, entries };
    });
  };

  const clueLists: { direction: Direction; slots: CrosswordSlot[] }[] = [
    { direction: "across", slots: model.slots.filter((slot) => slot.direction === "across") },
    { direction: "down", slots: model.slots.filter((slot) => slot.direction === "down") },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl" data-testid="mini-board">
      <div className="flex items-center justify-center gap-3 pb-3 text-sm text-muted-foreground">
        <span data-testid="mini-clock">{formatClock(saved.seconds)}</span>
        {solved ? (
          <span className="font-medium text-emerald-600">Solved — nice and quick.</span>
        ) : (
          <>
            <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={check}>
              Check
            </Button>
            <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={reveal} data-testid="mini-reveal">
              {revealArmed ? "Reveal — sure?" : "Reveal"}
            </Button>
            {filled && <span className="text-xs">Something's off — keep at it.</span>}
          </>
        )}
      </div>

      <div className={cn("grid gap-6", wide ? "lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]")}>
        <div className={cn("mx-auto w-full", wide ? "max-w-[26rem]" : "max-w-[22rem]")}>
          {activeSlot && (
            <div className="mb-2 flex min-h-10 items-center gap-2 rounded-md bg-[#a7d8ff] px-3 py-1.5 text-sm text-black">
              <span className="font-bold">
                {activeSlot.number}
                {activeSlot.direction === "across" ? "A" : "D"}
              </span>
              <span>{activeSlot.clue}</span>
            </div>
          )}
          <div
            className="grid aspect-square w-full gap-px overflow-hidden rounded-sm border-2 border-black bg-black"
            style={{ gridTemplateColumns: `repeat(${model.size.cols}, 1fr)` }}
          >
            {model.cells.flat().map((cell) => {
              const key = cellKey(cell.row, cell.col);
              if (cell.block) return <div key={key} className="bg-black" />;
              const isCursor = cursor.row === cell.row && cursor.col === cell.col;
              const entry = saved.entries[key] ?? "";
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`mini-cell-${key}`}
                  onClick={() => {
                    if (isCursor) setDirection((now) => (now === "across" ? "down" : "across"));
                    setCursor({ row: cell.row, col: cell.col });
                  }}
                  className={cn(
                    "relative flex items-end justify-center bg-white pb-0.5 text-xl font-semibold text-black",
                    inActiveSlot(cell.row, cell.col) && !isCursor && "bg-[#a7d8ff]",
                    isCursor && "bg-[#ffd93b]",
                    marked.includes(key) && "text-red-600",
                  )}
                >
                  {cell.number !== null && (
                    <span className="absolute left-0.5 top-0 text-[9px] font-normal leading-3">{cell.number}</span>
                  )}
                  {entry}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {clueLists.map((list) => (
            <section key={list.direction}>
              <h3 className="border-b border-(--ui-stroke-tertiary) pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {list.direction}
              </h3>
              <ul className="pt-1">
                {list.slots.map((slot) => (
                  <li key={`${slot.direction}-${slot.number}`}>
                    <button
                      type="button"
                      onClick={() => jumpToSlot(slot, false)}
                      className={cn(
                        "flex w-full gap-2 rounded-sm px-2 py-1 text-left text-sm",
                        activeSlot === slot && "bg-[color-mix(in_srgb,#7ba3e0_25%,transparent)]",
                      )}
                    >
                      <span className="w-4 shrink-0 text-right font-bold">{slot.number}</span>
                      <span>{slot.clue}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
