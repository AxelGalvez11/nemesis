// Sudoku — port of apps/web/components/workspace/break/sudoku-game.tsx. The
// board is generated from the day's seed by @nemesis/shared (a solver proves
// the puzzle has exactly one answer), so there is no bank to run dry and the
// phone and the laptop generate the identical grid for the same day.
//
// Classic paper colours on the grid in BOTH appearances — white squares, black
// givens, blue entries — because that palette is how a sudoku is read. Same
// call the web board makes; the rest of the screen stays on the app's tokens.
//
// The phone has no arrow keys, so the web's keyboard navigation is replaced by
// tapping a square and then a digit on the pad, which is how every phone
// sudoku works anyway.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { generateSudoku, hashSeed, isSudokuSolved, sudokuConflicts } from "@nemesis/shared";

import { ChillPill } from "@/components/chill/chill-ui";
import { useChillDayState } from "@/components/chill/use-chill-day";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Paper, not theme: the grid reads the same on a dark phone at night.
const PAPER = {
  page: "#ffffff",
  rule: "#d4d4d4",
  frame: "#111111",
  given: "#111111",
  entry: "#2b5bb7",
  wrong: "#d13b3b",
  note: "#8a8a8a",
  peer: "#eef3fa",
  match: "#d5e5f6",
  cursor: "#a7d8ff",
} as const;

interface SudokuState {
  entries: Record<string, number>;
  notes: Record<string, number[]>;
  seconds: number;
  /** Set once on solve so the hub can say "Solved" without regenerating. */
  done?: boolean;
}

const EMPTY: SudokuState = { entries: {}, notes: {}, seconds: 0 };

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function SudokuGame({ puzzleKey, onPlayAnother }: { puzzleKey: string; onPlayAnother: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const { puzzle, solution } = useMemo(() => generateSudoku(hashSeed(`sudoku:${puzzleKey}`), 38), [puzzleKey]);
  const [saved, update] = useChillDayState<SudokuState>("sudoku", puzzleKey, EMPTY);
  const [cursor, setCursor] = useState(() => puzzle.findIndex((value) => value === 0));
  const [notesMode, setNotesMode] = useState(false);
  const [checked, setChecked] = useState<number[]>([]);

  // 9 cells across, so the board is rounded DOWN to a multiple of 9 — a
  // fractional cell width leaves hairline gaps between the rules on a phone's
  // pixel grid, which reads as a broken border rather than a thin one.
  const board = Math.floor(Math.min(width - space(8), 420) / 9) * 9;
  const cell = board / 9;

  const merged = useMemo(
    () => puzzle.map((value, index) => (value !== 0 ? value : (saved.entries[String(index)] ?? 0))),
    [puzzle, saved.entries],
  );
  const conflicts = useMemo(() => sudokuConflicts(merged), [merged]);
  const solved = useMemo(() => isSudokuSolved(merged, solution), [merged, solution]);

  useEffect(() => {
    if (solved) {
      update((previous) => (previous.done ? previous : { ...previous, done: true }));
      return;
    }
    const timer = setInterval(() => update((previous) => ({ ...previous, seconds: previous.seconds + 1 })), 1000);
    return () => clearInterval(timer);
  }, [solved, update]);

  const setCell = useCallback(
    (index: number, value: number) => {
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
    },
    [notesMode, puzzle, solved, update],
  );

  const cursorRow = Math.floor(cursor / 9);
  const cursorCol = cursor % 9;
  const cursorValue = merged[cursor] ?? 0;
  const remaining = (value: number) => 9 - merged.filter((entry) => entry === value).length;

  return (
    <View style={styles.wrap} testID="sudoku-board">
      <View style={styles.toolbar}>
        <Text style={styles.clock} testID="sudoku-clock">
          {formatClock(saved.seconds)}
        </Text>
        {solved ? (
          <>
            <Text style={styles.solved}>Solved — sharp work.</Text>
            <ChillPill label="Play another" onPress={onPlayAnother} testID="sudoku-play-another" />
          </>
        ) : (
          <>
            <ChillPill
              label={`Notes ${notesMode ? "on" : "off"}`}
              tone={notesMode ? "loud" : "quiet"}
              onPress={() => setNotesMode((now) => !now)}
              testID="sudoku-notes"
            />
            <ChillPill
              label="Check"
              onPress={() =>
                setChecked(
                  merged.flatMap((value, index) =>
                    value !== 0 && puzzle[index] === 0 && value !== solution[index] ? [index] : [],
                  ),
                )
              }
              testID="sudoku-check"
            />
          </>
        )}
      </View>

      <View style={[styles.grid, { width: board, height: board }]}>
        {merged.map((value, index) => {
          const row = Math.floor(index / 9);
          const col = index % 9;
          const given = puzzle[index] !== 0;
          const isCursor = index === cursor;
          const peer =
            row === cursorRow ||
            col === cursorCol ||
            (Math.floor(row / 3) === Math.floor(cursorRow / 3) && Math.floor(col / 3) === Math.floor(cursorCol / 3));
          const sameValue = value !== 0 && cursorValue !== 0 && value === cursorValue && !isCursor;
          const wrong = checked.includes(index) || conflicts.has(index);
          const notes = saved.notes[String(index)] ?? [];
          return (
            <Pressable
              key={index}
              onPress={() => setCursor(index)}
              accessibilityRole="button"
              accessibilityLabel={`Row ${row + 1} column ${col + 1}${value ? `, ${value}` : ", empty"}`}
              testID={`sudoku-cell-${index}`}
              style={[
                styles.cell,
                { width: cell, height: cell },
                // Thick rules every third line are what make the boxes legible.
                col % 3 === 2 && col !== 8 ? styles.cellBoxRight : null,
                row % 3 === 2 && row !== 8 ? styles.cellBoxBottom : null,
                col === 8 ? styles.cellLastCol : null,
                row === 8 ? styles.cellLastRow : null,
                peer && !isCursor ? { backgroundColor: PAPER.peer } : null,
                sameValue ? { backgroundColor: PAPER.match } : null,
                isCursor ? { backgroundColor: PAPER.cursor } : null,
              ]}
            >
              {value !== 0 ? (
                <Text
                  style={[
                    styles.cellText,
                    { fontSize: Math.round(cell * 0.52) },
                    given ? styles.cellGiven : styles.cellEntry,
                    wrong ? styles.cellWrong : null,
                  ]}
                >
                  {value}
                </Text>
              ) : notes.length > 0 ? (
                <View style={styles.notes}>
                  {Array.from({ length: 9 }, (_, note) => (
                    <Text key={note} style={[styles.noteText, { width: cell / 3, fontSize: Math.round(cell * 0.22) }]}>
                      {notes.includes(note + 1) ? note + 1 : " "}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {solved ? null : (
        <View style={styles.pad}>
          {Array.from({ length: 9 }, (_, index) => index + 1).map((digit) => {
            const left = Math.max(0, remaining(digit));
            return (
              <Pressable
                key={digit}
                onPress={() => setCell(cursor, digit)}
                disabled={left <= 0}
                accessibilityRole="button"
                accessibilityLabel={`${digit}, ${left} left`}
                accessibilityState={{ disabled: left <= 0 }}
                testID={`sudoku-pad-${digit}`}
                style={({ pressed }) => [styles.padKey, left <= 0 && styles.padKeySpent, pressed && left > 0 && styles.padKeyPressed]}
              >
                <Text style={styles.padDigit}>{digit}</Text>
                <Text style={styles.padLeft}>{left}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setCell(cursor, 0)}
            accessibilityRole="button"
            accessibilityLabel="Erase"
            testID="sudoku-erase"
            style={({ pressed }) => [styles.padKey, styles.padErase, pressed && styles.padKeyPressed]}
          >
            <Text style={styles.padEraseText}>Erase</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space(3), width: "100%" },
    toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), flexWrap: "wrap" },
    clock: { ...type.small, color: c.text2, fontVariant: ["tabular-nums"] },
    solved: { ...type.small, fontWeight: "600", color: c.good },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      borderWidth: 2,
      borderColor: PAPER.frame,
      backgroundColor: PAPER.page,
      borderRadius: radius.sm,
      overflow: "hidden",
    },
    cell: {
      alignItems: "center",
      justifyContent: "center",
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: PAPER.rule,
    },
    cellBoxRight: { borderRightWidth: 2, borderRightColor: PAPER.frame },
    cellBoxBottom: { borderBottomWidth: 2, borderBottomColor: PAPER.frame },
    cellLastCol: { borderRightWidth: 0 },
    cellLastRow: { borderBottomWidth: 0 },
    cellText: { textAlign: "center" },
    cellGiven: { color: PAPER.given, fontWeight: "700" },
    cellEntry: { color: PAPER.entry, fontWeight: "500" },
    cellWrong: { color: PAPER.wrong },

    notes: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center" },
    noteText: { color: PAPER.note, textAlign: "center" },

    pad: { flexDirection: "row", gap: space(1.5), width: "100%", justifyContent: "center" },
    padKey: {
      flex: 1,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: c.glass,
    },
    padKeyPressed: { opacity: 0.6 },
    // A digit with none left is spent, not broken: the key sits back rather
    // than fading its number away.
    padKeySpent: { backgroundColor: "transparent" },
    padDigit: { ...type.small, fontWeight: "700", color: c.text },
    padLeft: { fontSize: 9.5, lineHeight: 12, color: c.textHint },
    padErase: { flex: 1.3 },
    padEraseText: { ...type.micro, fontWeight: "600", color: c.text2 },
  });
