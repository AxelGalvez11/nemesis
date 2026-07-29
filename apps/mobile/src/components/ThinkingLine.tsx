import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { ChevronIcon } from "./icons";
import { phaseLabel, type ThinkingPhase } from "@/lib/thinking-phase";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The live reasoning block, built to the pattern ChatGPT uses (owner 2026-07-29,
// with the spec written out).
//
//   ● Thinking… (8s) · 3 steps                                    ⌄
//   │ …so bradykinin builds up and sensitises the cough reflex
//   │ which is why the cough is dry rather than productive▌
//
// THE ACCORDION IS OPEN WHILE IT THINKS AND CLOSES ITSELF WHEN THE ANSWER
// STARTS. That is the whole shape of the pattern and it is what the previous
// version got wrong: it showed a fixed two-line ticker that never opened and
// never closed, so the thinking was permanently half-visible instead of
// deliberately visible and then deliberately out of the way.
//
// The old comment justified that fixed height by saying the transcript measures
// every row to size its scroll padding, so a growing block would shove the
// conversation. That reasoning does not survive contact with where this actually
// sits: it is the LAST row of the list while a turn streams, with nothing beneath
// it to shove. The height is bounded anyway (MAX_STREAM_HEIGHT) and the block
// collapses the moment the answer arrives, so it can never push a finished answer
// off screen.
//
// WHAT THE STUDENT SEES IS THE TAIL, not the top. Reasoning is written forwards,
// so the interesting end is the bottom — a plain fixed-height View would pin the
// opening words and hide everything since. The inner ScrollView is held at its
// end on every content change, which is what makes it read as a stream rather
// than a paragraph that stopped.
//
// NOTHING HERE IS WRITTEN BY US. The text is the model's own reasoning verbatim;
// a summary of a thought is a new claim and this app does not manufacture those.
// Instant mode runs with thinking off, passes an empty string, and gets no block
// at all — the normal quiet case, not a failure.

/** How tall the open stream may get before it scrolls inside itself. Roughly six
 *  lines: enough to read as live working-out, short enough that a long think
 *  never buries the composer. */
const MAX_STREAM_HEIGHT = 132;

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

export function ThinkingLine({
  phase,
  reasoning,
  answerStarted = false,
  testID,
}: {
  phase: ThinkingPhase;
  /** The FULL accumulated reasoning so far, already throttled by the caller —
   *  the raw stream arrives ~80x/sec and must never drive a render directly. */
  reasoning?: string;
  /** True once the first word of the actual answer has arrived. Closes the
   *  accordion, exactly as ChatGPT's does. */
  answerStarted?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const label = phaseLabel(phase);
  const [seconds, setSeconds] = useState(0);
  // Open while thinking. `pinned` records a DELIBERATE tap so the auto-collapse
  // cannot overrule a student who opened it on purpose — the "pin it open" half
  // of progressive disclosure.
  const [open, setOpen] = useState(true);
  const [pinned, setPinned] = useState(false);
  const startedAt = useRef(Date.now());
  const streamRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-collapse the moment the answer begins — unless the student pinned it.
  useEffect(() => {
    if (answerStarted && !pinned) setOpen(false);
  }, [answerStarted, pinned]);

  if (!label) return null;
  const thought = reasoning?.trim() ?? "";
  const badge = answerStarted ? `Thought for ${seconds}s` : seconds >= 1 ? `Thinking… ${seconds}s` : "Thinking…";

  return (
    <View style={styles.wrap} testID={testID}>
      <Pressable
        onPress={() => {
          setPinned(true);
          setOpen((v) => !v);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? "Hide what it is working through" : "Show what it is working through"}
        style={styles.row}
        testID="chat-thinking-toggle"
      >
        {/* THE SUMMARY PHRASE LEADS (owner 2026-07-29: "just show a summary
            phrase of what the model is doing or going to do before the dynamic
            status badges"). It is phaseLabel — a real pipeline stage, never a
            sentence we invented. That distinction is the whole reason this slot
            is safe to fill: the plan-writer version of it, where a second model
            is paid to compose a first-person "here's what I'll do", was
            considered and rejected as a vanity feature that costs a call and
            1-2s on the critical path of every turn. This says what is actually
            happening, for free.

            The step COUNT that used to sit here is gone at the owner's word. */}
        <Text style={styles.phrase} numberOfLines={1} testID="chat-thinking-phrase">
          {label}
        </Text>
        {/* The badge, after the phrase: state and elapsed time, pulsing while
            live and still once the answer starts. */}
        <View style={styles.badge}>
          {answerStarted ? <View style={styles.dotIdle} /> : <PulsingDot color={c.accent} />}
          <Text style={styles.badgeText} numberOfLines={1} testID="chat-thinking-badge">
            {badge}
          </Text>
        </View>
        <View style={open ? styles.chevronOpen : styles.chevron}>
          <ChevronIcon size={14} color={c.textHint} />
        </View>
      </Pressable>
      {open && thought ? (
        <Animated.View entering={FadeIn.duration(140)} style={styles.body}>
          <ScrollView
            ref={streamRef}
            style={styles.stream}
            // Held at the end so the newest words stay in view — the difference
            // between a stream and a paragraph that stopped.
            onContentSizeChange={() => streamRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            // The transcript owns the gesture; this inner list only scrolls
            // itself when the student drags it directly.
            nestedScrollEnabled
          >
            {/* Plain Text, never markdown: raw reasoning is full of half-finished
                lists and stray asterisks, and rendering it as markdown turns
                those into headings and bullets that were never meant. */}
            <Text style={styles.thought} selectable testID="chat-thinking-reasoning">
              {thought}
              {answerStarted ? null : <Caret color={c.accent} />}
            </Text>
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * The breathing dot beside the heading — the only motion in the row, so it reads
 * as live without a spinner's jitter.
 *
 * A Reanimated shared value on the UI thread. The previous version toggled
 * opacity from a setInterval, which re-rendered twice a second forever and lost
 * its rhythm whenever the JS thread was busy parsing stream chunks — i.e.
 * exactly while it was on screen.
 */
function PulsingDot({ color }: { color: string }) {
  const styles = useThemedStyles(createStyles);
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.3, { duration: 620, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** The block cursor at the end of the stream. Inline inside the Text so it sits
 *  after the last character rather than on its own line. */
function Caret({ color }: { color: string }) {
  const blink = useSharedValue(1);
  useEffect(() => {
    blink.value = withRepeat(withTiming(0.1, { duration: 520, easing: Easing.linear }), -1, true);
  }, [blink]);
  const style = useAnimatedStyle(() => ({ opacity: blink.value }));
  return <Animated.Text style={[{ color }, style]}>▌</Animated.Text>;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: space(1) },
    row: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(1) },
    dot: { width: 7, height: 7, borderRadius: 3.5 },
    // Settled: the same footprint, no motion, so the row does not shift by a
    // pixel when the pulse stops.
    dotIdle: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.line },
    // The phrase is the loudest thing in the row — it is the one part a student
    // reads on purpose. flexShrink so a long stage name gives way to the badge
    // rather than pushing it off the row.
    phrase: { ...type.micro, color: c.text2, fontWeight: "600", flexShrink: 1 },
    badge: { flexDirection: "row", alignItems: "center", gap: space(1.5), marginLeft: "auto" },
    // textHint, NOT text3 — text3 is byte-identical to the body colour on this
    // palette, so it would read as full-strength text pretending to be a hint.
    badgeText: { ...type.micro, color: c.textHint },
    chevron: { transform: [{ rotate: "0deg" }] },
    chevronOpen: { transform: [{ rotate: "90deg" }] },
    // Set behind a rule the way a quotation is — this is the model talking to
    // itself, and it must never be mistaken for part of the answer. Matched to
    // ThoughtTrail's so the block appears to settle rather than swap.
    body: {
      borderLeftWidth: 2,
      borderLeftColor: c.line,
      paddingLeft: space(2.5),
      paddingVertical: space(1),
      borderRadius: radius.sm,
    },
    stream: { maxHeight: MAX_STREAM_HEIGHT },
    thought: {
      ...type.micro,
      fontFamily: MONO,
      // Monospace sits smaller than the same nominal size in the UI face.
      fontSize: type.micro.fontSize - 0.5,
      color: c.textHint,
      lineHeight: type.micro.lineHeight + 2,
    },
  });
