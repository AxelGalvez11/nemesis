import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { phaseLabel, type ThinkingPhase } from "@/lib/thinking-phase";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

/**
 * ChatGPT-style live activity preview: one quiet, shimmering phrase and a
 * tabular timer. Raw reasoning remains available after the answer in
 * ThoughtTrail; showing a second scrolling transcript while the model worked
 * made the phone feel busier and slower than the web app.
 */
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
  const label = phaseLabel(phase) || "Thinking";
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(Date.now());
  const shimmer = useSharedValue(1);

  useEffect(() => {
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(0.38, { duration: 720, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="text" style={styles.row} testID={testID}>
      <Animated.Text
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(120)}
        key={label}
        numberOfLines={1}
        style={[styles.phrase, shimmerStyle]}
        testID="chat-thinking-phrase"
      >
        {label}
      </Animated.Text>
      <Text style={styles.timer} testID="chat-thinking-timer">
        {seconds}s
      </Text>
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
      ...type.small,
      color: c.textHint,
      flexShrink: 1,
    },
    timer: {
      ...type.micro,
      color: c.textHint,
      fontVariant: ["tabular-nums"],
    },
  });
