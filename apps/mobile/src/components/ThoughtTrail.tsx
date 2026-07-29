import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { ChevronIcon } from "./icons";
import type { MessageThinking } from "@/lib/chat-thread";
import { thoughtDuration } from "@/lib/thought-trail";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// "Thought for 12s" — the row above a finished answer that opens up what the
// model actually worked through (owner 2026-07-24: the thinking preview should be
// "modern like chatgpt or claude uses").
//
// WHAT WAS MISSING, after looking at what those two actually do. Both stream a
// live status while the model works AND leave a collapsed row afterwards that you
// can open. We already had the live half and it is good — a real phase line plus a
// glimpse of the reasoning as it arrives (ThinkingLine). What we did not have was
// anything AFTERWARDS: the reasoning was discarded the instant the first answer
// word landed, so the whole thing vanished for anyone who looked away, and there
// was no way to ask "why did it say that?". A student reading an answer they do
// not trust is exactly the person who needs it.
//
// So this is deliberately the SECOND half only, not a redesign of the first. The
// live line stays as it is.
//
// COLLAPSED BY DEFAULT, always. Reasoning is long, repetitive and often circles
// back on itself; opening it by default would bury the answer under it. Closed, it
// is one quiet line that also tells you how long the turn took — which is the
// other thing both apps put there.
//
// NOTHING HERE IS WRITTEN BY US. The text is the model's own reasoning verbatim,
// which is the only honest version of this feature: a summary of a thought is a
// new claim, and this app's rule is that we do not manufacture those. A turn with
// thinking switched off (Instant) has no trail at all, and that is the normal
// quiet case rather than a failure.

export function ThoughtTrail({ thinking, testID }: { thinking: MessageThinking; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  const text = thinking.text.trim();
  const expandable = text.length > 0;

  return (
    <View style={styles.wrap} testID={testID}>
      <Pressable
        disabled={!expandable}
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        accessibilityRole={expandable ? "button" : "text"}
        accessibilityState={expandable ? { expanded: open } : undefined}
        accessibilityLabel={
          expandable
            ? open
              ? "Hide what it worked through"
              : "Show what it worked through"
            : thinking.ms > 0
              ? `Thought for ${thoughtDuration(thinking.ms)}`
              : "Thought complete"
        }
        style={styles.row}
        testID="chat-thought-trail-toggle"
      >
        <Text style={styles.label}>
          {thinking.ms > 0 ? `Thought for ${thoughtDuration(thinking.ms)}` : "What it worked through"}
        </Text>
        {/* The chevron is the app's right-pointing one, rotated — a quarter turn
            down when open is the convention every disclosure row here uses. */}
        {expandable ? (
          <View style={open ? styles.chevronOpen : styles.chevron}>
            <ChevronIcon size={15} color={c.textHint} />
          </View>
        ) : null}
      </Pressable>
      {open && expandable ? (
        <Animated.View entering={FadeIn.duration(140)} style={styles.body}>
          {/* Plain Text, not markdown: raw reasoning is full of half-finished
              lists and stray asterisks, and rendering it as markdown turns that
              into headings and bullets that were never meant. Selectable so a
              student can copy a line they want to check. */}
          <Text style={styles.thought} selectable testID="chat-thought-trail-text">
            {text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: space(1) },
    row: { flexDirection: "row", alignItems: "center", gap: space(1.5), paddingVertical: space(1) },
    // textHint, not text3: text3 is byte-identical to the body colour, so this
    // would have read as loud as the answer above it.
    label: { ...type.micro, color: c.textHint },
    chevron: { transform: [{ rotate: "0deg" }] },
    chevronOpen: { transform: [{ rotate: "90deg" }] },
    // Indented behind a rule, the way a quotation is set — this is the model
    // talking to itself, and it must never be mistaken for part of the answer.
    body: {
      // 2px and the same inset as the live block's rule (ThinkingLine), so the
      // reasoning appears to stay behind one continuous line as the turn settles
      // from streaming into this collapsed row, rather than two components
      // handing over.
      borderLeftWidth: 2,
      borderLeftColor: c.line,
      paddingLeft: space(2.5),
      paddingVertical: space(1),
      borderRadius: radius.sm,
    },
    // Monospace, matching the live ticker for the same reason it is monospace
    // there: this is raw working-out, not prose, and the fixed width stops
    // half-finished fragments from reflowing as the eye moves down them.
    thought: {
      ...type.micro,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: type.micro.fontSize - 0.5,
      color: c.textHint,
      lineHeight: type.micro.lineHeight + 3,
    },
  });
