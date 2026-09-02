import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { phaseLabel, type ThinkingPhase } from "@/lib/thinking-phase";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

/**
 * ChatGPT-style live activity preview: one quiet phrase with a bright band
 * travelling through it. Raw reasoning remains available after the answer in
 * ThoughtTrail; showing a second scrolling transcript while the model worked
 * made the phone feel busier and slower than the web app.
 *
 * Owner 2026-08-01, three changes to this row:
 *
 *  - "the thinking previews should be the same size as the other text" — the
 *    phrase was `type.small`, a size below the message text it sat above, which
 *    made the wait read as a footnote about the answer rather than as the
 *    answer's own first line. It is `type.body` now, the same as the transcript.
 *
 *  - "it should pulse from left to right" — the old animation faded the WHOLE
 *    phrase in and out together, which reads as blinking, not as work in
 *    progress. See SweepChar for how the band is done and why it is done that
 *    way rather than with a gradient mask.
 *
 *  - "it should not show the number it took to think until the end" — the live
 *    "12s" counter is gone, along with the one-second interval that drove it.
 *    THE NUMBER IS NOT LOST: the finished turn already prints "Thought for 12s"
 *    twice over, from `settledLabel(thoughtMs)` above the answer and from
 *    ThoughtTrail's collapsed row. Both of those measure with
 *    `turnStartedAtRef`, so nothing downstream depended on this timer — worth
 *    stating, because deleting a clock that something else was quietly reading
 *    is exactly how a duration silently becomes zero.
 */

/** One full left-to-right pass. Slow enough to read as travel rather than
 *  flicker, quick enough that a short wait still shows one. */
const SWEEP_MS = 1500;
/** How wide the bright band is, as a fraction of the phrase. Under about a
 *  quarter it degenerates into a single lit letter. */
const BAND = 0.34;
/** The band starts fully off the left and finishes fully off the right, so the
 *  phrase is never caught mid-lit at the moment the loop restarts. */
const TRAVEL_FROM = -BAND;
const TRAVEL_TO = 1 + BAND;

/**
 * One character of the phrase, lit as the band passes over it.
 *
 * PER-CHARACTER COLOUR, NOT A GRADIENT MASK, and the choice is about how each
 * one FAILS rather than how it looks. The obvious build is MaskedView over an
 * animated gradient — the app already ships MaskedView (BottomFadeBlur) — but a
 * mask that doesn't composite takes the text with it, and this row is the only
 * thing on screen while the model works. A nested <Text> whose colour won't
 * animate is still a legible phrase in the dim colour. Same reason the note
 * toolbar stopped using InputAccessoryView: prefer the failure you can read.
 *
 * NESTED Text, not a row of Views: children of a <Text> flow through the text
 * engine, so kerning, spacing and the single-line clamp behave exactly as they
 * do for an ordinary string. Laid out as flex items, a long phrase would break
 * between letters instead of between words.
 */
function SweepChar({
  char,
  position,
  progress,
  dim,
  bright,
}: {
  char: string;
  /** Where this character sits in the phrase, 0 (first) to 1 (last). */
  position: number;
  progress: SharedValue<number>;
  dim: string;
  bright: string;
}) {
  const animated = useAnimatedStyle(() => {
    const centre = TRAVEL_FROM + progress.value * (TRAVEL_TO - TRAVEL_FROM);
    const lit = Math.max(0, 1 - Math.abs(position - centre) / BAND);
    return { color: interpolateColor(lit, [0, 1], [dim, bright]) };
  });
  return <Animated.Text style={animated}>{char}</Animated.Text>;
}

export function ThinkingLine({
  phase,
  testID,
}: {
  phase: ThinkingPhase;
  /** Kept out of the live row intentionally; the caller stores it for the
   * finished answer's expandable ThoughtTrail. */
  reasoning?: string;
  answerStarted?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const label = phaseLabel(phase) || "Thinking";
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
      // No reverse: a band that walks back the way it came reads as a scanner,
      // and the owner asked for left to right.
      false,
    );
  }, [progress]);

  // Recomputed only when the phrase itself changes — a phase can hold for many
  // seconds, and splitting a string on every frame would be pure waste.
  const chars = useMemo(() => Array.from(label), [label]);
  const last = Math.max(1, chars.length - 1);

  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="text" style={styles.row} testID={testID}>
      <Animated.Text
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(120)}
        // Keyed on the phrase so a phase change remounts the characters rather
        // than reconciling one phrase's letters into another's by index.
        key={label}
        numberOfLines={1}
        style={styles.phrase}
        testID="chat-thinking-phrase"
        // The split is a visual effect; a screen reader should hear the phrase.
        accessibilityLabel={label}
      >
        {chars.map((char, index) => (
          <SweepChar
            key={index}
            char={char}
            position={index / last}
            progress={progress}
            dim={c.text2}
            bright={c.text}
          />
        ))}
      </Animated.Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      minHeight: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      paddingVertical: space(1),
    },
    phrase: {
      // 17pt in #8F8F8F (measured, IMG_6542/6550: "Thinking" — c.text2 in light mode is
      // exactly that hex). type.label rather than type.body: the reference's "Thinking" sits
      // a half-size up from the 16pt prose it precedes, matching a row label's size instead —
      // superseding the 2026-08-01 "same size as the transcript" call now that this is a
      // measured one-to-one target rather than an in-house choice. The colour here is the
      // floor the characters animate away from and back to; each one overrides it while the
      // band is on it.
      ...type.label,
      color: c.text2,
      flexShrink: 1,
    },
  });
