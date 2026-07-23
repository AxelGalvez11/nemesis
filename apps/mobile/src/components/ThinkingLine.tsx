import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { phaseLabel, type ThinkingPhase } from "@/lib/thinking-phase";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// The block the student reads while an answer is being worked out, replacing
// the anonymous three dots. Two parts, both honest:
//
//   Thinking it through                                   12s
//   …so bradykinin builds up and sensitises the cough reflex
//
// The top line is the STAGE — routing, searching, reading, thinking — and comes
// from lib/thinking-phase.ts, which maps real pipeline steps and refuses to
// invent any. The second line is the model's OWN working-out as it streams
// (lib/reasoning-preview.ts picks the readable fragment). A deep turn produces
// that reasoning for several seconds before its first written word, which is
// exactly the stretch that used to sit on a frozen label.
//
// Turns without reasoning — Instant mode runs with thinking switched off — pass
// an empty string and simply keep the stage line on its own. That is the normal
// quiet case, not a failure.

/** Two lines of the preview text, reserved whether or not they're filled.
 *  The transcript measures every row to size its scroll padding, so a line that
 *  grew from one row to two mid-stream would shove the conversation around. */
const REASONING_BLOCK_HEIGHT = type.micro.lineHeight * 2;

export function ThinkingLine({
  phase,
  reasoning,
  testID,
}: {
  phase: ThinkingPhase;
  /** The already-trimmed line to show — NOT the raw stream. The caller buffers
   *  the stream and computes this a few times a second (see chat.tsx); the
   *  reasoning arrives far too fast to render chunk by chunk. */
  reasoning?: string;
  testID?: string;
}) {
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
  const thought = reasoning?.trim() ?? "";

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.row}>
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
      {thought ? (
        // No entering/exiting animation here on purpose: this text changes every
        // few hundred milliseconds, and a fade per change would be permanent
        // motion under the reader's eye rather than a transition.
        <Text style={styles.reasoning} numberOfLines={2} testID="chat-thinking-reasoning">
          {thought}
        </Text>
      ) : null}
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
    wrap: { gap: space(0.5) },
    row: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(1.5) },
    dot: { width: 7, height: 7, borderRadius: 3.5 },
    labelWrap: { flexShrink: 1 },
    label: { ...type.small, color: c.text2 },
    clock: { ...type.micro, color: c.text3, marginLeft: "auto" },
    // Dimmer than the stage line and indented to clear the dot: this is the
    // model muttering to itself, not the answer, and it should never compete
    // with the prose that follows.
    reasoning: {
      ...type.micro,
      color: c.text3,
      height: REASONING_BLOCK_HEIGHT,
      marginLeft: 7 + space(2),
    },
  });
