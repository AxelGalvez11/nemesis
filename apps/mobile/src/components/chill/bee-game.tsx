// Honeycomb — port of apps/web/components/workspace/break/bee-game.tsx. Word
// checking, scoring, pangram detection and the rank ladder all come from
// @nemesis/shared, so a word worth 7 points on the laptop is worth 7 here.
//
// The web clips its hex buttons with a CSS polygon, which React Native has no
// equivalent for, so the comb is drawn as SVG polygons instead — same pointy-top
// shape, same seven positions, same interlock.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Polygon, Text as SvgText, G } from "react-native-svg";

import {
  BEE_RANKS,
  beeLetters,
  beeMaxScore,
  beePointsToNextRank,
  beeRank,
  beeScore,
  beeWordScore,
  checkBeeWord,
  hashSeed,
  isPangram,
  seededShuffle,
  type BeePuzzle,
} from "@nemesis/shared";

import { ChillPill, useNotice } from "@/components/chill/chill-ui";
import { useChillDayState } from "@/components/chill/use-chill-day";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

const HONEY = "#f2c94c";
const CENTER_INK = "#b58900";

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

const EMPTY: BeeState = { found: [] };

/** The comb, on a 256×256 canvas: centre plus six, interlocked. */
const HEX = 40;
const CELL_POSITIONS = [
  { x: 128, y: 128 },
  { x: 128, y: 41 },
  { x: 202, y: 84 },
  { x: 202, y: 172 },
  { x: 128, y: 215 },
  { x: 54, y: 172 },
  { x: 54, y: 84 },
] as const;

function hexPoints(cx: number, cy: number): string {
  return [
    [cx, cy - HEX],
    [cx + HEX, cy - HEX / 2],
    [cx + HEX, cy + HEX / 2],
    [cx, cy + HEX],
    [cx - HEX, cy + HEX / 2],
    [cx - HEX, cy - HEX / 2],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
}

export function BeeGame({
  puzzle,
  puzzleKey,
  onPlayAnother,
}: {
  puzzle: BeePuzzle;
  puzzleKey: string;
  onPlayAnother: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const [saved, update] = useChillDayState<BeeState>("bee", puzzleKey, EMPTY);
  const [typed, setTyped] = useState("");
  const [notice, say] = useNotice();
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [toast, setToast] = useState<{ id: number; text: string; pangram: boolean } | null>(null);

  const letters = beeLetters(puzzle);
  const outerOrder = useMemo(
    () => seededShuffle(puzzle.outer, hashSeed(`${puzzleKey}:${shuffleSeed}`)),
    [puzzle.outer, puzzleKey, shuffleSeed],
  );

  const score = beeScore(puzzle, saved.found);
  const maxScore = beeMaxScore(puzzle);
  const rank = beeRank(score, maxScore);
  const toNext = beePointsToNextRank(score, maxScore);
  const comb = Math.min(width - space(8), 300);

  const submit = useCallback(() => {
    const word = typed.toLowerCase();
    if (!word) return;
    const verdict = checkBeeWord(puzzle, saved.found, word);
    if (verdict !== "ok") {
      say(VERDICT_COPY[verdict] ?? verdict);
      setTyped("");
      return;
    }
    setToast({ id: saved.found.length, text: `+${beeWordScore(word, letters)}`, pangram: isPangram(word, letters) });
    setTyped("");
    update((previous) => ({ found: [...previous.found, word] }));
  }, [letters, puzzle, saved.found, say, typed, update]);

  const press = useCallback((letter: string) => {
    setTyped((now) => (now.length < 19 ? now + letter : now));
  }, []);

  const foundNewestFirst = useMemo(() => [...saved.found].reverse(), [saved.found]);

  return (
    <View style={styles.wrap} testID="bee-board">
      <Text style={styles.notice} numberOfLines={2} accessibilityLiveRegion="polite" testID="bee-notice">
        {notice ?? ""}
      </Text>

      <View style={styles.typedRow}>
        {toast ? <ScoreToast key={toast.id} text={toast.text} pangram={toast.pangram} onDone={() => setToast(null)} /> : null}
        {typed ? (
          <Text style={styles.typed}>
            {typed.split("").map((letter, index) => (
              <Text
                key={index}
                style={[letter === puzzle.center ? styles.typedCenter : null, letters.includes(letter) ? null : styles.typedStray]}
              >
                {letter.toUpperCase()}
              </Text>
            ))}
          </Text>
        ) : (
          <Text style={styles.typedHint}>Tap the letters</Text>
        )}
      </View>

      <Svg width={comb} height={comb} viewBox="0 0 256 256">
        {CELL_POSITIONS.map((position, index) => {
          const center = index === 0;
          const letter = center ? puzzle.center : outerOrder[index - 1]!;
          return (
            <G key={`${letter}-${index}`} onPress={() => press(letter)}>
              <Polygon points={hexPoints(position.x, position.y)} fill={center ? HONEY : c.glass} />
              <SvgText
                x={position.x}
                y={position.y}
                textAnchor="middle"
                alignmentBaseline="middle"
                fontSize={26}
                fontWeight="700"
                fill={center ? "#000000" : c.text}
              >
                {letter.toUpperCase()}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      <View style={styles.controls}>
        <ChillPill label="Delete" onPress={() => setTyped((now) => now.slice(0, -1))} testID="bee-delete" />
        <ChillPill label="Shuffle" onPress={() => setShuffleSeed((seed) => seed + 1)} testID="bee-shuffle" />
        <ChillPill label="Enter" tone="loud" onPress={submit} testID="bee-enter" />
      </View>

      <View style={styles.aside}>
        <View style={styles.rankRow} testID="bee-rank">
          <Text style={styles.rankLabel}>{rank.label}</Text>
          <View style={styles.rankDots}>
            {BEE_RANKS.map((step, index) => (
              <View key={step.label} style={[styles.rankDot, index <= rank.index ? styles.rankDotOn : null]} />
            ))}
          </View>
          <View style={styles.scoreBubble}>
            <Text style={styles.scoreText}>{score}</Text>
          </View>
        </View>

        {toNext !== null ? (
          <Text style={styles.hint}>
            {toNext} more point{toNext === 1 ? "" : "s"} to {BEE_RANKS[rank.index + 1]!.label}.
          </Text>
        ) : null}

        <View style={styles.foundPanel}>
          <Text style={styles.foundCount}>
            You have found <Text style={styles.foundStrong}>{saved.found.length}</Text> word
            {saved.found.length === 1 ? "" : "s"}
          </Text>
          <ScrollView style={styles.foundScroll} contentContainerStyle={styles.foundList} testID="bee-found">
            {foundNewestFirst.map((word) => {
              const pangram = isPangram(word, letters);
              return (
                <View key={word} style={[styles.wordChip, pangram ? styles.wordChipPangram : null]}>
                  <Text style={[styles.wordText, pangram ? styles.wordTextPangram : null]}>{word}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Honeycomb has no win or lose state — there are always more words —
            so unlike the other seven games this is always offered rather than
            gated on a finished puzzle. */}
        <ChillPill label="Play another" onPress={onPlayAnother} testID="bee-play-another" />

        <Text style={styles.hint}>
          Words use only today&apos;s letters, need the centre letter, and are 4+ letters. Use every letter at once for a
          pangram bonus.
        </Text>
      </View>
    </View>
  );
}

/** The floating "+N" an accepted word earns. Rises and fades, then reports
 *  back so the parent can drop it — a toast that lingers would stack. */
function ScoreToast({ text, pangram, onDone }: { text: string; pangram: boolean; onDone: () => void }) {
  const styles = useThemedStyles(createStyles);
  const rise = useRef(new Animated.Value(0)).current;
  // The parent remounts this on every accepted word (it is keyed by the find
  // count), so the animation belongs to the mount, not to a changing prop.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const animation = Animated.timing(rise, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) done.current();
    });
    return () => animation.stop();
  }, [rise]);

  return (
    <Animated.View
      pointerEvents="none"
      testID="bee-toast"
      style={[
        styles.toast,
        pangram ? styles.toastPangram : null,
        {
          opacity: rise.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) }],
        },
      ]}
    >
      <Text style={[styles.toastText, pangram ? styles.toastTextPangram : null]}>
        {pangram ? `Pangram! ${text}` : text}
      </Text>
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space(3), width: "100%" },
    notice: { ...type.small, color: c.text2, textAlign: "center", minHeight: 22 },

    typedRow: { height: 36, alignItems: "center", justifyContent: "center" },
    typed: { ...type.h2, letterSpacing: 2, color: c.text },
    typedCenter: { color: CENTER_INK },
    typedStray: { color: c.textHint },
    typedHint: { ...type.small, color: c.textHint },

    toast: { position: "absolute", top: -22, alignSelf: "center" },
    toastPangram: { backgroundColor: HONEY, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(0.5) },
    toastText: { ...type.small, fontWeight: "700", color: c.text },
    toastTextPangram: { color: "#000000" },

    controls: { flexDirection: "row", gap: space(2), justifyContent: "center" },

    aside: { width: "100%", gap: space(2.5) },
    rankRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
    rankLabel: { ...type.small, fontWeight: "700", color: c.text },
    rankDots: { flex: 1, flexDirection: "row", alignItems: "center", gap: space(1) },
    rankDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.lineMuted },
    rankDotOn: { backgroundColor: HONEY },
    scoreBubble: { width: 28, height: 28, borderRadius: 14, backgroundColor: HONEY, alignItems: "center", justifyContent: "center" },
    scoreText: { ...type.micro, fontWeight: "700", color: "#000000" },

    foundPanel: { borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, padding: space(3) },
    foundCount: { ...type.small, color: c.text2, paddingBottom: space(2) },
    foundStrong: { fontWeight: "700", color: c.text },
    foundScroll: { maxHeight: 220 },
    foundList: { flexDirection: "row", flexWrap: "wrap", gap: space(1.5) },
    wordChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: c.line2, paddingHorizontal: space(2), paddingVertical: space(0.5) },
    wordChipPangram: { backgroundColor: HONEY, borderColor: HONEY },
    wordText: { ...type.micro, color: c.text, textTransform: "capitalize" },
    wordTextPangram: { color: "#000000", fontWeight: "700" },

    hint: { ...type.micro, color: c.text2 },
  });
