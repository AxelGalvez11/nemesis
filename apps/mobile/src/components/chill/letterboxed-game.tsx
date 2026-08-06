// Letter Box — port of apps/web/components/workspace/break/letterboxed-game.tsx.
// The square, the chords between letters and the rules (consecutive letters
// never share a side; each word starts on the last word's final letter) all
// come from @nemesis/shared, so the phone judges a word exactly as the web does.
//
// The web lays this out in two columns with the word list beside the square.
// A phone has one column, so the list sits under the square — the same order
// the web collapses to on a narrow screen.

import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Line, Rect, Text as SvgText, G } from "react-native-svg";

import {
  breakLexicon,
  checkLetterBoxWord,
  letterBoxLetters,
  letterBoxSolved,
  lettersUsed,
  sideOfLetter,
  type LetterBoxPuzzle,
} from "@nemesis/shared";

import { ChillPill, useNotice } from "@/components/chill/chill-ui";
import { useChillDayState } from "@/components/chill/use-chill-day";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

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

const EMPTY: LetterBoxState = { words: [] };

/** Letter anchor positions on the 300×300 board (3 per side, clockwise) —
 *  the same geometry the web draws, so the square reads identically. */
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
  puzzleKey,
  onPlayAnother,
}: {
  puzzle: LetterBoxPuzzle;
  puzzleKey: string;
  onPlayAnother: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const [saved, update] = useChillDayState<LetterBoxState>("letterboxed", puzzleKey, EMPTY);
  const [typed, setTyped] = useState("");
  const [notice, say] = useNotice();
  const dictionary = useMemo(() => breakLexicon(), []);

  const letters = letterBoxLetters(puzzle);
  const used = lettersUsed(puzzle, saved.words);
  const solved = letterBoxSolved(puzzle, saved.words);
  const chainStart = saved.words.at(-1)?.at(-1) ?? null;
  const board = Math.min(width - space(8), 330);

  const submit = useCallback(() => {
    if (!typed || solved) return;
    const verdict = checkLetterBoxWord(puzzle, saved.words, typed, dictionary);
    if (verdict !== "ok") {
      say(VERDICT_COPY[verdict] ?? verdict);
      return;
    }
    update((previous) => ({ ...previous, words: [...previous.words, typed.toLowerCase()] }));
    setTyped("");
  }, [dictionary, puzzle, saved.words, say, solved, typed, update]);

  const press = useCallback(
    (letter: string) => {
      if (solved) return;
      setTyped((now) => {
        let base = now;
        // The chain letter is fixed — the first tap of a new word seeds it.
        if (!base && chainStart) {
          if (letter === chainStart) return chainStart;
          base = chainStart;
        }
        const previous = base.at(-1);
        if (previous && sideOfLetter(puzzle, previous) === sideOfLetter(puzzle, letter)) return now;
        return base + letter;
      });
    },
    [chainStart, puzzle, solved],
  );

  const playedSegments = saved.words.flatMap((word) =>
    word
      .split("")
      .slice(0, -1)
      .map((letter, index) => ({ from: letterPosition(puzzle, letter), to: letterPosition(puzzle, word[index + 1]!) })),
  );
  const typingSegments = typed
    .split("")
    .slice(0, -1)
    .map((letter, index) => ({ from: letterPosition(puzzle, letter), to: letterPosition(puzzle, typed[index + 1]!) }));

  return (
    <View style={styles.wrap} testID="letterboxed-board">
      <Text style={styles.notice} numberOfLines={2} accessibilityLiveRegion="polite" testID="letterboxed-notice">
        {notice ?? (solved ? `Solved in ${saved.words.length} word${saved.words.length === 1 ? "" : "s"}!` : "")}
      </Text>

      <Text style={styles.typed} numberOfLines={1}>
        {chainStart && !solved && !typed ? <Text style={styles.typedChain}>{chainStart.toUpperCase()}</Text> : null}
        {typed.toUpperCase()}
      </Text>

      {/* A THEMED panel, not a white slab: the square is empty by design, and
          on the app's black a white one was a glaring void (the web file's own
          note). The paper-white grids are earned by Sudoku and the crosswords,
          which put content on them. */}
      <Svg width={board} height={board} viewBox="0 0 300 300">
        <Rect x={30} y={30} width={240} height={240} stroke={c.text} strokeWidth={2} fill={c.glass} />
        {playedSegments.map((segment, index) => (
          <Line
            key={`p${index}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            stroke={CORAL}
            strokeOpacity={0.25}
            strokeWidth={2}
          />
        ))}
        {typingSegments.map((segment, index) => (
          <Line
            key={`t${index}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            stroke={CORAL}
            strokeWidth={2.5}
            strokeDasharray="5 4"
          />
        ))}
        {letters.map((letter) => {
          const position = letterPosition(puzzle, letter);
          const side = sideOfLetter(puzzle, letter);
          const label = side === 0 ? { x: 0, y: -18 } : side === 1 ? { x: 18, y: 0 } : side === 2 ? { x: 0, y: 20 } : { x: -18, y: 0 };
          return (
            <G key={letter} onPress={() => press(letter)}>
              {/* An invisible disc carries the tap: the drawn dot is 7 units
                  across, which is a few real pixels on a phone. */}
              <Circle cx={position.x} cy={position.y} r={22} fill="transparent" />
              <Circle
                cx={position.x}
                cy={position.y}
                r={7}
                stroke={c.text}
                strokeWidth={2}
                fill={used.has(letter) ? CORAL : c.raised}
              />
              <SvgText
                x={position.x + label.x}
                y={position.y + label.y}
                textAnchor="middle"
                alignmentBaseline="middle"
                fontSize={16}
                fontWeight="700"
                fill={c.text}
              >
                {letter.toUpperCase()}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      <View style={styles.controls}>
        <ChillPill label="Delete" onPress={() => setTyped((now) => now.slice(0, -1))} disabled={solved} testID="letterboxed-delete" />
        <ChillPill
          label="Restart"
          onPress={() => {
            setTyped("");
            update((previous) => ({ ...previous, words: [] }));
          }}
          testID="letterboxed-restart"
        />
        <ChillPill label="Enter" tone="loud" onPress={submit} disabled={solved} testID="letterboxed-enter" />
      </View>

      <View style={styles.aside}>
        <Text style={styles.count}>
          <Text style={styles.countStrong}>{used.size}</Text> of 12 letters used · try to finish in{" "}
          <Text style={styles.countStrong}>2 words</Text>
        </Text>

        <View style={styles.words} testID="letterboxed-words">
          {saved.words.map((word, index) => (
            <View key={`${word}-${index}`} style={styles.wordChip}>
              <Text style={styles.wordText}>{word.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        {solved ? (
          <View style={styles.solvedBlock}>
            <Text style={styles.hint}>
              Our two-word answer: <Text style={styles.countStrong}>{puzzle.solution[0]?.toUpperCase()}</Text> →{" "}
              <Text style={styles.countStrong}>{puzzle.solution[1]?.toUpperCase()}</Text>
            </Text>
            <ChillPill label="Play another" onPress={onPlayAnother} testID="letterboxed-play-another" />
          </View>
        ) : (
          <ChillPill
            label="Show the answer"
            onPress={() => {
              update((previous) => ({ ...previous, gaveUp: true, words: [...puzzle.solution] }));
              setTyped("");
            }}
            testID="letterboxed-give-up"
          />
        )}

        <Text style={styles.hint}>
          Each word starts with the previous word&apos;s last letter. Letters can repeat; consecutive letters never share
          a side.
        </Text>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space(3), width: "100%" },
    notice: { ...type.small, color: c.text2, textAlign: "center", minHeight: 22 },
    typed: { ...type.h2, letterSpacing: 3, color: c.text, minHeight: 30, textAlign: "center" },
    typedChain: { color: c.textHint },

    controls: { flexDirection: "row", gap: space(2), justifyContent: "center", flexWrap: "wrap" },

    aside: { width: "100%", gap: space(2.5) },
    count: { ...type.small, color: c.text2 },
    countStrong: { fontWeight: "700", color: c.text },
    words: { flexDirection: "row", flexWrap: "wrap", gap: space(1.5) },
    wordChip: {
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line2,
      paddingHorizontal: space(2.5),
      paddingVertical: space(1),
    },
    wordText: { ...type.micro, letterSpacing: 1, color: c.text },
    solvedBlock: { gap: space(2), alignItems: "flex-start" },
    hint: { ...type.micro, color: c.text2 },
  });
