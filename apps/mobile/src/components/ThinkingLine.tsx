import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
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
import { EMPTY_TRAIL, pushStep, trailSummary, type StepTrail } from "@/lib/reasoning-steps";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// The block the student reads while an answer is being worked out.
//
// Owner 2026-07-29, comparing it to ChatGPT: a pulsing status badge, an
// "Analyzed X steps" tally, a live token stream in monospace, and a rule down
// the left edge separating the model's muttering from its actual answer.
//
//   │ ● Searching the web                      3 steps · 12s
//   │ …so bradykinin builds up and sensitises the cough reflex
//
// WHAT CHANGED, and why each part is the way it is:
//
// THE STEPS ACCUMULATE NOW. Each phase used to cross-fade over the last, so a
// turn that searched, read and then reasoned showed only "reasoning" by the end
// — the work vanished as it happened. lib/reasoning-steps.ts keeps the trail and
// the tally; the badge names what is happening NOW and the count says how much
// came before it.
//
// THE PULSE IS A SHARED VALUE, NOT A TIMER. The old dot toggled opacity from a
// setInterval, which is a React re-render every 620ms for one dot, and it
// stutters whenever JS is busy — which, during a stream, is always. Reanimated
// drives this on the UI thread, so it stays smooth while the transcript works.
//
// THE TICKER IS MONOSPACE. It is the model's raw working-out rather than prose,
// and a proportional font makes a fragment that changes four times a second
// reflow on every change. Fixed-width characters make the same text sit still.
//
// 🔴 THE HEIGHT IS FIXED AND MUST STAY FIXED. The transcript measures every row
// to size its scroll padding, so a block that grew mid-stream would shove the
// conversation under the reader. That is also why this half does NOT expand:
// progressive disclosure lives in ThoughtTrail, which takes over once the answer
// lands and the height is free to change. The two are styled the same on purpose
// — same rule, same monospace, same muted tone — so it reads as one block
// settling rather than two components swapping.
//
// Turns without reasoning — Instant mode runs with thinking off — pass an empty
// string and keep the badge alone. That is the normal quiet case, not a failure.

/** Two lines of ticker, reserved whether or not they are filled. See the height
 *  note above: this number existing is what keeps the transcript still. */
const REASONING_BLOCK_HEIGHT = type.micro.lineHeight * 2;

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

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
  const [trail, setTrail] = useState<StepTrail>(EMPTY_TRAIL);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  // pushStep returns the SAME object when the label has not changed, so this
  // setState is a no-op on the vast majority of renders (React bails out on an
  // identical reference) even though the label arrives constantly.
  useEffect(() => {
    if (label) setTrail((current) => pushStep(current, label));
  }, [label]);

  if (!label) return null;
  const thought = reasoning?.trim() ?? "";
  const summary = trailSummary(trail.count, seconds);

  return (
    <View style={styles.wrap} testID={testID}>
      {/* The rule. A plain View rather than a border on the wrapper so it spans
          the block's full height including the reserved ticker rows, which a
          border would also do — but this way the inset is one number to change. */}
      <View style={styles.rule} />
      <View style={styles.content}>
        <View style={styles.row}>
          <PulsingDot color={c.accent} />
          {/* Keyed on the label so a step change cross-fades rather than snapping
              — the text is short, and a hard swap reads as a glitch. */}
          <Animated.View key={label} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.labelWrap}>
            <Text style={styles.label} numberOfLines={2}>
              {label}
            </Text>
          </Animated.View>
          {summary ? (
            <Text style={styles.summary} testID="chat-thinking-summary">
              {summary}
            </Text>
          ) : null}
        </View>
        {thought ? (
          // No entering/exiting animation on the text itself: it changes every few
          // hundred milliseconds, and a fade per change is permanent motion under
          // the reader's eye rather than a transition. The soft look comes from
          // the tone and the monospace, not from animating it.
          <Text style={styles.reasoning} numberOfLines={2} testID="chat-thinking-reasoning">
            {thought}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The breathing dot — the only motion in the row, so the block reads as live
 * without a spinner's jitter.
 *
 * Driven by a Reanimated shared value on the UI thread. The previous version ran
 * a setInterval and called setState, which re-rendered this component twice a
 * second forever and lost its rhythm whenever the JS thread was busy parsing
 * stream chunks — i.e. exactly while it was on screen.
 */
function PulsingDot({ color }: { color: string }) {
  const styles = useThemedStyles(createStyles);
  const pulse = useSharedValue(1);

  useEffect(() => {
    // Asymmetric on purpose: a linear in-and-out reads mechanical. `true`
    // reverses each repeat so it breathes rather than restarting.
    pulse.value = withRepeat(withTiming(0.3, { duration: 620, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { flexDirection: "row", gap: space(2.5), paddingVertical: space(1) },
    // Muted, not invisible: it has to read as a boundary at a glance without
    // competing with the answer beneath it.
    rule: { width: 2, borderRadius: 1, backgroundColor: c.line },
    content: { flex: 1, gap: space(0.5) },
    row: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(1) },
    dot: { width: 7, height: 7, borderRadius: 3.5 },
    labelWrap: { flexShrink: 1 },
    label: { ...type.small, color: c.text2 },
    // textHint, NOT text3 — text3 is byte-identical to the body colour on this
    // palette, so it would read as full-strength text pretending to be a hint.
    // Same correction ThoughtTrail carries.
    summary: { ...type.micro, color: c.textHint, marginLeft: "auto" },
    reasoning: {
      ...type.micro,
      fontFamily: MONO,
      // Monospace sits smaller than the same nominal size in the UI face, so it
      // is nudged up to keep the two lines optically even with the label above.
      fontSize: type.micro.fontSize - 0.5,
      color: c.textHint,
      height: REASONING_BLOCK_HEIGHT,
    },
  });
