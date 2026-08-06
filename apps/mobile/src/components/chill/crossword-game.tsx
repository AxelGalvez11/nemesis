// Mini and Crossword — one board for both, exactly as on the web (they differ
// only in the puzzle bank they draw from and the day-state namespace they save
// under). Grid construction, the across/down slots, the solved check and the
// wrong-cell check all come from @nemesis/shared.
//
// The web board is driven by a physical keyboard: letters type, space flips
// direction, Tab walks to the next clue, arrows move the cursor. A phone has
// none of that, so the same four moves are controls you can reach with a thumb —
// a letter pad under the grid, the clue banner itself flips direction, and ‹ ›
// step between clues. Everything else, including the paper-white grid and the
// blue/yellow highlight, is the web board.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import {
  buildCrossword,
  cellKey,
  isFilled,
  isSolved,
  wrongCells,
  type CrosswordDirection,
  type CrosswordEntries,
  type CrosswordSlot,
  type MiniPuzzle,
} from "@nemesis/shared";

import { ChillPill } from "@/components/chill/chill-ui";
import { useChillDayState } from "@/components/chill/use-chill-day";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Paper and highlight colours, fixed in both appearances — a crossword is read
// as newsprint, and the blue/yellow pair IS how "this clue" and "this square"
// are told apart.
const PAPER = {
  page: "#ffffff",
  ink: "#111111",
  wrong: "#d13b3b",
  slot: "#a7d8ff",
  cursor: "#ffd93b",
} as const;

const KEY_ROWS = ["qwertyuiop".split(""), "asdfghjkl".split(""), "zxcvbnm".split("")];

interface MiniState {
  entries: CrosswordEntries;
  seconds: number;
}

const EMPTY: MiniState = { entries: {}, seconds: 0 };

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CrosswordGame({
  puzzle,
  puzzleKey,
  storageKey = "mini",
  onPlayAnother,
}: {
  puzzle: MiniPuzzle;
  puzzleKey: string;
  /** Day-state namespace — the Mini and the bigger Crossword save separately. */
  storageKey?: "mini" | "crossword";
  onPlayAnother: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const model = useMemo(() => buildCrossword(puzzle), [puzzle]);
  const [saved, update] = useChillDayState<MiniState>(storageKey, puzzleKey, EMPTY);
  const firstOpen = model.cells.flat().find((cell) => !cell.block)!;
  const [cursor, setCursor] = useState<{ row: number; col: number }>({ row: firstOpen.row, col: firstOpen.col });
  const [direction, setDirection] = useState<CrosswordDirection>("across");
  const [marked, setMarked] = useState<string[]>([]);
  const [revealArmed, setRevealArmed] = useState(false);

  const solved = isSolved(model, saved.entries);
  const filled = isFilled(model, saved.entries);

  // Rounded down to a whole number of columns so the 1px rules between squares
  // stay even — a fractional cell width reads as a broken grid.
  const board = Math.floor(Math.min(width - space(8), 380) / model.size.cols) * model.size.cols;
  const cell = board / model.size.cols;

  // Fresh entries for the callbacks without re-binding them on every keystroke.
  const savedRef = useRef(saved);
  savedRef.current = saved;

  useEffect(() => {
    if (solved) return;
    const timer = setInterval(() => update((previous) => ({ ...previous, seconds: previous.seconds + 1 })), 1000);
    return () => clearInterval(timer);
  }, [solved, update]);

  const activeSlot: CrosswordSlot | null = useMemo(() => {
    const direct = model.slots.find(
      (slot) =>
        slot.direction === direction && slot.cells.some((entry) => entry.row === cursor.row && entry.col === cursor.col),
    );
    if (direct) return direct;
    return model.slots.find((slot) => slot.cells.some((entry) => entry.row === cursor.row && entry.col === cursor.col)) ?? null;
  }, [model, cursor, direction]);

  const inActiveSlot = (row: number, col: number): boolean =>
    activeSlot?.cells.some((entry) => entry.row === row && entry.col === col) ?? false;

  const moveWithin = useCallback(
    (offset: number) => {
      if (!activeSlot) return;
      const index = activeSlot.cells.findIndex((entry) => entry.row === cursor.row && entry.col === cursor.col);
      const next = activeSlot.cells[index + offset];
      if (next) setCursor({ row: next.row, col: next.col });
    },
    [activeSlot, cursor],
  );

  const jumpToSlot = useCallback((slot: CrosswordSlot, preferEmpty = true) => {
    setDirection(slot.direction);
    const target = preferEmpty
      ? slot.cells.find((entry) => !(cellKey(entry.row, entry.col) in savedRef.current.entries))
      : null;
    const entry = target ?? slot.cells[0]!;
    setCursor({ row: entry.row, col: entry.col });
  }, []);

  const nextSlot = useCallback(
    (delta: 1 | -1) => {
      if (!activeSlot) return;
      const ordered = [
        ...model.slots.filter((slot) => slot.direction === "across"),
        ...model.slots.filter((slot) => slot.direction === "down"),
      ];
      const index = ordered.findIndex((slot) => slot === activeSlot);
      jumpToSlot(ordered[(index + delta + ordered.length) % ordered.length]!);
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

  const reveal = () => {
    // Two taps, because this ends the puzzle. The armed state times out so a
    // stray first tap cannot sit waiting to fire much later.
    if (!revealArmed) {
      setRevealArmed(true);
      setTimeout(() => setRevealArmed(false), 3000);
      return;
    }
    setRevealArmed(false);
    update((previous) => {
      const entries: CrosswordEntries = { ...previous.entries };
      model.cells.flat().forEach((entry) => {
        if (!entry.block) entries[cellKey(entry.row, entry.col)] = entry.answer;
      });
      return { ...previous, entries };
    });
  };

  const clueLists: { direction: CrosswordDirection; slots: CrosswordSlot[] }[] = [
    { direction: "across", slots: model.slots.filter((slot) => slot.direction === "across") },
    { direction: "down", slots: model.slots.filter((slot) => slot.direction === "down") },
  ];

  return (
    <View style={styles.wrap} testID="mini-board">
      <View style={styles.toolbar}>
        <Text style={styles.clock} testID="mini-clock">
          {formatClock(saved.seconds)}
        </Text>
        {solved ? (
          <>
            <Text style={styles.solved}>Solved — nice and quick.</Text>
            <ChillPill label="Play another" onPress={onPlayAnother} testID="mini-play-another" />
          </>
        ) : (
          <>
            <ChillPill label="Check" onPress={() => setMarked(wrongCells(model, saved.entries))} testID="mini-check" />
            <ChillPill label={revealArmed ? "Reveal — sure?" : "Reveal"} onPress={reveal} testID="mini-reveal" />
          </>
        )}
      </View>
      {!solved && filled ? <Text style={styles.hint}>Something&apos;s off — keep at it.</Text> : null}

      {activeSlot ? (
        <View style={styles.clueBar}>
          <Pressable
            onPress={() => nextSlot(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous clue"
            style={styles.clueStep}
            testID="mini-prev-clue"
          >
            <Text style={styles.clueStepText}>‹</Text>
          </Pressable>
          <Pressable
            style={styles.clueTextWrap}
            onPress={() => setDirection((now) => (now === "across" ? "down" : "across"))}
            accessibilityRole="button"
            accessibilityLabel={`${activeSlot.number} ${activeSlot.direction}: ${activeSlot.clue}. Tap to switch direction.`}
            testID="mini-clue"
          >
            <Text style={styles.clueNumber}>
              {activeSlot.number}
              {activeSlot.direction === "across" ? "A" : "D"}
            </Text>
            <Text style={styles.clueText} numberOfLines={2}>
              {activeSlot.clue}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => nextSlot(1)}
            accessibilityRole="button"
            accessibilityLabel="Next clue"
            style={styles.clueStep}
            testID="mini-next-clue"
          >
            <Text style={styles.clueStepText}>›</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.grid, { width: board, height: (board / model.size.cols) * model.size.rows }]}>
        {model.cells.flat().map((entry) => {
          const key = cellKey(entry.row, entry.col);
          if (entry.block) return <View key={key} style={[styles.block, { width: cell, height: cell }]} />;
          const isCursor = cursor.row === entry.row && cursor.col === entry.col;
          const value = saved.entries[key] ?? "";
          return (
            <Pressable
              key={key}
              onPress={() => {
                if (isCursor) setDirection((now) => (now === "across" ? "down" : "across"));
                setCursor({ row: entry.row, col: entry.col });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Row ${entry.row + 1} column ${entry.col + 1}${value ? `, ${value}` : ", empty"}`}
              testID={`mini-cell-${key}`}
              style={[
                styles.cell,
                { width: cell, height: cell },
                inActiveSlot(entry.row, entry.col) && !isCursor ? { backgroundColor: PAPER.slot } : null,
                isCursor ? { backgroundColor: PAPER.cursor } : null,
              ]}
            >
              {entry.number !== null ? (
                <Text style={[styles.cellNumber, { fontSize: Math.max(8, Math.round(cell * 0.22)) }]}>{entry.number}</Text>
              ) : null}
              <Text
                style={[
                  styles.cellText,
                  { fontSize: Math.round(cell * 0.5) },
                  marked.includes(key) ? styles.cellWrong : null,
                ]}
              >
                {value}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {solved ? null : (
        <View style={styles.keyboard}>
          {KEY_ROWS.map((keys, rowIndex) => (
            <View key={rowIndex} style={styles.keyRow}>
              {keys.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setLetter(key.toUpperCase())}
                  accessibilityRole="button"
                  accessibilityLabel={key}
                  testID={`mini-key-${key}`}
                  style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                >
                  <Text style={styles.keyText}>{key}</Text>
                </Pressable>
              ))}
              {rowIndex === 2 ? (
                <Pressable
                  onPress={erase}
                  accessibilityRole="button"
                  accessibilityLabel="Delete"
                  testID="mini-key-back"
                  style={({ pressed }) => [styles.key, styles.keyWide, pressed && styles.keyPressed]}
                >
                  <Text style={styles.keyText}>⌫</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <View style={styles.clues}>
        {clueLists.map((list) => (
          <View key={list.direction} style={styles.clueColumn}>
            <Text style={styles.clueHeading}>{list.direction.toUpperCase()}</Text>
            {list.slots.map((slot) => (
              <Pressable
                key={`${slot.direction}-${slot.number}`}
                onPress={() => jumpToSlot(slot, false)}
                accessibilityRole="button"
                style={[styles.clueRow, activeSlot === slot && styles.clueRowActive]}
              >
                <Text style={styles.clueRowNumber}>{slot.number}</Text>
                <Text style={styles.clueRowText}>{slot.clue}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space(3), width: "100%" },
    toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), flexWrap: "wrap" },
    clock: { ...type.small, color: c.text2, fontVariant: ["tabular-nums"] },
    solved: { ...type.small, fontWeight: "600", color: c.good },
    hint: { ...type.micro, color: c.text2 },

    clueBar: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      borderRadius: radius.md,
      backgroundColor: PAPER.slot,
      minHeight: 44,
    },
    clueStep: { paddingHorizontal: space(3), paddingVertical: space(2) },
    clueStepText: { fontSize: 22, lineHeight: 24, fontWeight: "700", color: PAPER.ink },
    clueTextWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(1.5) },
    clueNumber: { ...type.small, fontWeight: "700", color: PAPER.ink },
    clueText: { ...type.small, color: PAPER.ink, flex: 1 },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      borderWidth: 2,
      borderColor: PAPER.ink,
      backgroundColor: PAPER.ink,
      borderRadius: radius.sm,
      overflow: "hidden",
    },
    block: { backgroundColor: PAPER.ink },
    cell: {
      alignItems: "center",
      justifyContent: "flex-end",
      backgroundColor: PAPER.page,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: PAPER.ink,
      paddingBottom: 1,
    },
    cellNumber: { position: "absolute", left: 2, top: 0, color: PAPER.ink, fontWeight: "400" },
    cellText: { fontWeight: "600", color: PAPER.ink },
    cellWrong: { color: PAPER.wrong },

    keyboard: { width: "100%", gap: space(1.5), alignItems: "center" },
    keyRow: { flexDirection: "row", gap: space(1.5), justifyContent: "center", width: "100%" },
    key: { flex: 1, maxWidth: 40, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: c.glass },
    keyWide: { maxWidth: 56 },
    keyPressed: { opacity: 0.6 },
    keyText: { ...type.small, fontWeight: "600", color: c.text, textTransform: "uppercase" },

    clues: { width: "100%", gap: space(4) },
    clueColumn: { gap: space(0.5) },
    clueHeading: {
      ...type.micro,
      fontWeight: "700",
      letterSpacing: 1,
      color: c.text2,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      paddingBottom: space(1),
      marginBottom: space(1),
    },
    clueRow: { flexDirection: "row", gap: space(2), paddingHorizontal: space(2), paddingVertical: space(1), borderRadius: radius.sm },
    clueRowActive: { backgroundColor: c.glass },
    clueRowNumber: { ...type.small, fontWeight: "700", color: c.text, width: 18, textAlign: "right" },
    clueRowText: { ...type.small, color: c.text2, flex: 1 },
  });
