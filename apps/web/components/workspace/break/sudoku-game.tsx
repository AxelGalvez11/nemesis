"use client";

// Daily sudoku. The board is generated on the spot from the date seed (a
// solver proves uniqueness at generation time — see lib sudoku.ts), so there
// is no bank to run dry. Classic paper colors on the grid in both themes:
// white squares, black givens, blue entries.

import { useEffect, useMemo, useState } from "react";

import { useBreakDayState } from "@/components/workspace/break/use-break-day";
import { Button } from "@/components/ui/button";
import { hashSeed } from "@/lib/workspace/break/daily";
import { generateSudoku, isSudokuSolved, sudokuConflicts } from "@/lib/workspace/break/sudoku";
import { cn } from "@/lib/utils";

interface SudokuState {
  entries: Record<string, number>;
  notes: Record<string, number[]>;
  seconds: number;
  /** Set once on solve so the hub can show status without regenerating. */
  done?: boolean;
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function SudokuGame({ dateKey }: { dateKey: string }) {
  const { puzzle, solution } = useMemo(() => generateSudoku(hashSeed(`sudoku:${dateKey}`), 38), [dateKey]);
  const [saved, update] = useBreakDayState<SudokuState>("sudoku", dateKey, { entries: {}, notes: {}, seconds: 0 });
  const [cursor, setCursor] = useState(() => puzzle.findIndex((value) => value === 0));
  const [notesMode, setNotesMode] = useState(false);
  const [checked, setChecked] = useState<number[]>([]);

  const merged = useMemo(() => {
    return puzzle.map((value, index) => (value !== 0 ? value : (saved.entries[String(index)] ?? 0)));
  }, [puzzle, saved.entries]);
  const conflicts = useMemo(() => sudokuConflicts(merged), [merged]);
  const solved = useMemo(() => isSudokuSolved(merged, solution), [merged, solution]);

  useEffect(() => {
    if (solved) {
      update((previous) => (previous.done ? previous : { ...previous, done: true }));
      return;
    }
    const timer = window.setInterval(() => update((previous) => ({ ...previous, seconds: previous.seconds + 1 })), 1000);
    return () => window.clearInterval(timer);
  }, [solved, update]);

  const setCell = (index: number, value: number) => {
    if (solved || puzzle[index] !== 0) return;
    setChecked([]);
    update((previous) => {
      const key = String(index);
      if (notesMode && value !== 0) {
        const notes = new Set(previous.notes[key] ?? []);
        if (notes.has(value)) notes.delete(value);
        else notes.add(value);
        return { ...previous, notes: { ...previous.notes, [key]: [...notes].sort() } };
      }
      const entries = { ...previous.entries };
      const notes = { ...previous.notes };
      if (value === 0) delete entries[key];
      else entries[key] = value;
      delete notes[key];
      return { ...previous, entries, notes };
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (/^[1-9]$/.test(event.key)) setCell(cursor, Number(event.key));
      else if (event.key === "Backspace" || event.key === "0") setCell(cursor, 0);
      else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -9 : 9;
        setCursor((now) => {
          const next = now + delta;
          return next >= 0 && next < 81 ? next : now;
        });
      } else if (event.key.toLowerCase() === "n") {
        setNotesMode((now) => !now);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // setCell is stable enough for this scope: its deps are state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, notesMode, solved, puzzle, update]);

  const cursorValue = merged[cursor] ?? 0;
  const remaining = (value: number) => 9 - merged.filter((cell) => cell === value).length;

  return (
    <div className="mx-auto w-full max-w-md" data-testid="sudoku-board">
      <div className="flex items-center justify-center gap-3 pb-3 text-sm text-muted-foreground">
        <span data-testid="sudoku-clock">{formatClock(saved.seconds)}</span>
        {solved ? (
          <span className="break-banner-in font-medium text-emerald-600">Solved — sharp work.</span>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              aria-pressed={notesMode}
              onClick={() => setNotesMode((now) => !now)}
            >
              Notes {notesMode ? "on" : "off"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setChecked(merged.flatMap((value, index) => (value !== 0 && puzzle[index] === 0 && value !== solution[index] ? [index] : [])))}
            >
              Check
            </Button>
          </>
        )}
      </div>

      <div
        className={cn("mx-auto grid aspect-square w-full max-w-[26rem] grid-cols-9 overflow-hidden rounded-sm border-2 border-black bg-white", solved && "break-banner-in")}
      >
        {merged.map((value, index) => {
          const row = Math.floor(index / 9);
          const col = index % 9;
          const given = puzzle[index] !== 0;
          const isCursor = index === cursor;
          const samePeer = row === Math.floor(cursor / 9) || col === cursor % 9 ||
            (Math.floor(row / 3) === Math.floor(Math.floor(cursor / 9) / 3) && Math.floor(col / 3) === Math.floor((cursor % 9) / 3));
          const sameValue = value !== 0 && cursorValue !== 0 && value === cursorValue && !isCursor;
          const wrong = checked.includes(index) || conflicts.has(index);
          return (
            <button
              key={index}
              type="button"
              data-testid={`sudoku-cell-${index}`}
              onClick={() => setCursor(index)}
              className={cn(
                "relative flex items-center justify-center text-lg text-black",
                "border-r border-b border-neutral-300",
                col % 3 === 2 && col !== 8 && "border-r-2 border-r-black",
                row % 3 === 2 && row !== 8 && "border-b-2 border-b-black",
                col === 8 && "border-r-0",
                row === 8 && "border-b-0",
                samePeer && !isCursor && "bg-[#eef3fa]",
                sameValue && "bg-[#d5e5f6]",
                isCursor && "bg-[#a7d8ff]",
                given ? "font-bold" : "font-medium text-[#2b5bb7]",
                wrong && "text-red-600",
              )}
            >
              {value !== 0
                ? value
                : (saved.notes[String(index)]?.length ?? 0) > 0 && (
                    <span className="grid w-full grid-cols-3 px-0.5 text-[8px] leading-3 text-neutral-500">
                      {Array.from({ length: 9 }, (_, note) => (
                        <span key={note}>{saved.notes[String(index)]?.includes(note + 1) ? note + 1 : ""}</span>
                      ))}
                    </span>
                  )}
            </button>
          );
        })}
      </div>

      {!solved && (
        <div className="flex justify-center gap-1.5 pt-4">
          {Array.from({ length: 9 }, (_, digit) => digit + 1).map((digit) => (
            <button
              key={digit}
              type="button"
              data-testid={`sudoku-pad-${digit}`}
              onClick={() => setCell(cursor, digit)}
              disabled={remaining(digit) <= 0}
              className="flex h-11 flex-1 basis-0 flex-col items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--ui-base)_9%,transparent)] text-base font-semibold disabled:opacity-30"
            >
              {digit}
              <span className="text-[9px] font-normal text-muted-foreground">{Math.max(0, remaining(digit))}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCell(cursor, 0)}
            className="flex h-11 flex-1 basis-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--ui-base)_9%,transparent)] text-xs font-semibold"
          >
            Erase
          </button>
        </div>
      )}
    </div>
  );
}
