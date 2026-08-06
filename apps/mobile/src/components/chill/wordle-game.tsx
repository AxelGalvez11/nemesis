// Word Guess — the phone's board for the daily five-letter word. Straight port
// of apps/web/components/workspace/break/wordle-game.tsx; all the judging,
// validation and status rules come from @nemesis/shared, so the two apps agree
// on the same answer and the same verdict for the same day.
//
// Two deliberate differences from the web board:
//  - There is no physical keyboard to listen to, so the on-screen keyboard is
//    the only input. The web's window keydown handler (and the focus trap it
//    needed) has no phone equivalent and is simply gone.
//  - The flip is a rotateX on a native-driven Animated value rather than a CSS
//    class. Same choreography — a per-column stagger, then the keyboard learns
//    its colours once the last tile has turned.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

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

import { GameBar, useNotice } from "@/components/chill/chill-ui";
import { useChillDayState } from "@/components/chill/use-chill-day";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The judge colours ARE the game's language — fixed, not themed, with white
// text so they read on either appearance. Same three values as the web.
const JUDGE_COLORS: Record<LetterState, string> = {
  correct: "#6aaa64",
  present: "#c9b458",
  absent: "#787c7e",
};

const KEY_ROWS = ["qwertyuiop".split(""), "asdfghjkl".split(""), ["enter", ..."zxcvbnm".split(""), "back"]];

const FLIP_STAGGER = 280;
const FLIP_DURATION = 380;
const REVEAL_TOTAL = FLIP_STAGGER * (WORD_LENGTH - 1) + FLIP_DURATION;

interface WordleState {
  guesses: string[];
}

const EMPTY: WordleState = { guesses: [] };

export function WordleGame({
  answer,
  puzzleKey,
  onPlayAnother,
}: {
  answer: string;
  /** Save + seed identity for the puzzle in play: the plain dateKey for the
   *  daily, extraKey(dateKey, n) for extra n. */
  puzzleKey: string;
  onPlayAnother: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [saved, update] = useChillDayState<WordleState>("wordle", puzzleKey, EMPTY);
  const [current, setCurrent] = useState("");
  const [notice, say] = useNotice();
  const [shakeNonce, setShakeNonce] = useState(0);
  // Which row is mid-flip, and whether a flip THIS session is still running.
  // A boolean, not a counter: a game restored from disk has no flip to wait
  // for, and a counter seeded at zero would hide its keyboard colours forever
  // (the exact bug the web file records).
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const [revealing, setRevealing] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowed = useMemo(() => wordleAllowedSet(), []);

  const status = wordleStatus(saved.guesses, answer);
  const judgedGuesses = useMemo(
    () => (revealing ? saved.guesses.slice(0, -1) : saved.guesses),
    [revealing, saved.guesses],
  );
  const keyStates = useMemo(() => keyboardStates(judgedGuesses, answer), [judgedGuesses, answer]);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );

  const type_ = useCallback(
    (key: string) => {
      if (wordleStatus(saved.guesses, answer) !== "playing") return;
      if (key === "back") {
        setCurrent((now) => now.slice(0, -1));
        return;
      }
      if (key !== "enter") {
        setCurrent((now) => (now.length < WORD_LENGTH ? now + key : now));
        return;
      }
      const problem = guessProblem(current, allowed);
      if (problem) {
        say(problem);
        setShakeNonce((nonce) => nonce + 1);
        return;
      }
      setRevealRow(saved.guesses.length);
      setRevealing(true);
      update((previous) => ({ guesses: [...previous.guesses, current.toLowerCase()] }));
      setCurrent("");
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => setRevealing(false), REVEAL_TOTAL);
    },
    [allowed, answer, current, saved.guesses, say, update],
  );

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
    <View style={styles.wrap} testID="wordle-board">
      <GameBar
        notice={notice}
        endMessage={revealing ? "" : endMessage}
        finished={status !== "playing"}
        onPlayAnother={onPlayAnother}
        testID="wordle-notice"
      />

      <View style={styles.grid}>
        {rows.map((row, rowIndex) => {
          const judged = row.kind === "judged" ? scoreGuess(row.word, answer) : null;
          const flipping = judged !== null && rowIndex === revealRow;
          return (
            <ShakeRow key={rowIndex} nonce={row.kind === "typing" ? shakeNonce : 0}>
              {Array.from({ length: WORD_LENGTH }, (_, col) => (
                <Tile
                  key={col}
                  letter={row.word[col] ?? ""}
                  state={judged?.[col]}
                  flipDelay={flipping ? col * FLIP_STAGGER : null}
                />
              ))}
            </ShakeRow>
          );
        })}
      </View>

      <View style={styles.keyboard}>
        {KEY_ROWS.map((keys, rowIndex) => (
          <View key={rowIndex} style={styles.keyRow}>
            {keys.map((key) => {
              const judged = key.length === 1 ? keyStates[key] : undefined;
              const wide = key === "enter" || key === "back";
              return (
                <Pressable
                  key={key}
                  onPress={() => type_(key)}
                  accessibilityRole="button"
                  accessibilityLabel={key === "back" ? "Delete" : key === "enter" ? "Enter" : key}
                  testID={`wordle-key-${key}`}
                  style={({ pressed }) => [
                    styles.key,
                    wide ? styles.keyWide : styles.keyLetter,
                    judged ? { backgroundColor: JUDGE_COLORS[judged] } : null,
                    pressed && styles.keyPressed,
                  ]}
                >
                  <Text style={[styles.keyText, wide && styles.keyTextWide, judged ? styles.keyTextJudged : null]}>
                    {key === "back" ? "⌫" : key === "enter" ? "enter" : key}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/** One board square. Owns its own flip so a row can stagger its five tiles
 *  without the board re-rendering five times. */
function Tile({ letter, state, flipDelay }: { letter: string; state?: LetterState; flipDelay: number | null }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const flip = useRef(new Animated.Value(flipDelay === null ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (flipDelay === null) return;
    flip.setValue(0);
    Animated.timing(flip, {
      toValue: 1,
      duration: FLIP_DURATION,
      delay: flipDelay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [flip, flipDelay]);

  // A typed letter pops in; deleting one does not animate.
  useEffect(() => {
    if (state || !letter) return;
    pop.setValue(0.82);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }).start();
  }, [letter, pop, state]);

  const rotateX = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["0deg", "90deg", "0deg"] });
  // The face only takes its judged colour at the halfway point of the turn, so
  // the answer is not readable through the first half of the flip.
  const revealed = flipDelay === null ? 1 : flip;
  const faceOpacity = typeof revealed === "number" ? 1 : revealed.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] });

  return (
    <View style={styles.tileSlot}>
      {state ? <Animated.View style={[StyleSheet.absoluteFill, styles.tileFace, { backgroundColor: JUDGE_COLORS[state], opacity: faceOpacity, transform: [{ rotateX }] }]} /> : null}
      <Animated.View
        style={[
          styles.tile,
          state ? styles.tileJudged : null,
          !state && letter ? { borderColor: c.line2 } : null,
          { transform: [{ rotateX }, { scale: pop }] },
        ]}
      >
        <Text style={[styles.tileText, state ? styles.tileTextJudged : null]}>{letter.toUpperCase()}</Text>
      </Animated.View>
    </View>
  );
}

/** Shakes its children whenever `nonce` changes to a new non-zero value —
 *  the "that isn't a word" feedback. */
function ShakeRow({ nonce, children }: { nonce: number; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  const shake = useRef(new Animated.Value(0)).current;
  const seen = useRef(nonce);

  useEffect(() => {
    if (nonce === seen.current) return;
    seen.current = nonce;
    if (nonce === 0) return;
    Animated.sequence(
      [-8, 8, -6, 6, 0].map((to) =>
        Animated.timing(shake, { toValue: to, duration: 55, easing: Easing.linear, useNativeDriver: true }),
      ),
    ).start();
  }, [nonce, shake]);

  return <Animated.View style={[styles.row, { transform: [{ translateX: shake }] }]}>{children}</Animated.View>;
}

const TILE = 52;

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space(3), width: "100%" },
    grid: { gap: space(1.5) },
    row: { flexDirection: "row", gap: space(1.5) },

    tileSlot: { width: TILE, height: TILE },
    tileFace: { borderRadius: radius.sm },
    tile: {
      width: TILE,
      height: TILE,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.sm,
      borderWidth: 2,
      borderColor: c.lineMuted,
      backgroundColor: "transparent",
    },
    tileJudged: { borderWidth: 0, backgroundColor: "transparent" },
    tileText: { fontSize: 26, lineHeight: 32, fontWeight: "700", color: c.text },
    tileTextJudged: { color: "#ffffff" },

    keyboard: { width: "100%", gap: space(1.5), alignItems: "center" },
    keyRow: { flexDirection: "row", gap: space(1.5), justifyContent: "center", width: "100%" },
    key: {
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: c.glass,
    },
    keyLetter: { flex: 1, maxWidth: 42 },
    keyWide: { paddingHorizontal: space(2.5) },
    keyPressed: { opacity: 0.6 },
    keyText: { ...type.small, fontWeight: "600", color: c.text, textTransform: "uppercase" },
    keyTextWide: { ...type.micro, fontWeight: "600" },
    keyTextJudged: { color: "#ffffff" },
  });
