import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { phaseLabel, type ThinkingPhase } from "@/lib/thinking-phase";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// The line the student reads while an answer is being worked out, replacing
// the anonymous three dots. It says what is genuinely happening right now —
// the phrases come from lib/thinking-phase.ts, which maps real pipeline stages
// and refuses to invent anything — plus a running clock, so a slow turn looks
// busy rather than stuck.

export function ThinkingLine({ phase, testID }: { phase: ThinkingPhase; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const label = phaseLabel(phase);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!label) return null;

  return (
    <View style={styles.row} testID={testID}>
      <Dot color={c.accent} />
      {/* Keyed on the label so a phase change cross-fades rather than snapping
          — the text is short, and a hard swap reads as a glitch. */}
      <Animated.View key={label} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.labelWrap}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
      </Animated.View>
      {seconds >= 2 ? <Text style={styles.clock}>{seconds}s</Text> : null}
    </View>
  );
}

/** A slow breathing dot — the only motion in the row, so the line reads as
 *  live without the jitter of a spinner. */
function Dot({ color }: { color: string }) {
  const styles = useThemedStyles(createStyles);
  const [bright, setBright] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setBright((on) => !on), 620);
    return () => clearInterval(timer);
  }, []);
  return <View style={[styles.dot, { backgroundColor: color, opacity: bright ? 1 : 0.35 }]} />;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(1.5) },
    dot: { width: 7, height: 7, borderRadius: 3.5 },
    labelWrap: { flexShrink: 1 },
    label: { ...type.small, color: c.text2 },
    clock: { ...type.micro, color: c.text3, marginLeft: "auto" },
  });
