import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GlassSurface } from "./GlassSurface";
import { CHAT_EFFORT_LABEL, CHAT_EFFORTS, type ChatEffort } from "@/lib/chat-effort";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The composer's INTELLIGENCE dial — Instant / Medium / High (owner
// 2026-07-22). It briefly lived as three rows inside the "+" mini menu and the
// owner moved it straight back out: "it should have its own pill box for
// 'instant, medium, high'". So the current level is always readable on the
// composer row without opening anything, and changing it is one tap rather
// than two.
//
// Split in two the same way StudyModeMenu is, and for the same reason: the
// PILL renders inside the composer card, but the MENU has to render at the
// chat screen's root. A menu absolutely positioned inside the composer would
// either paint under the message list or, once pushed outside its parent's
// bounds, stop receiving taps on Android.
//
// Just the three words — no hint lines under them (owner: "do not use
// explanations for them just those words"). Web's copy of this picker does
// carry a one-line hint per level; lib/chat-effort.ts deliberately ships no
// HINT map on the phone so there's nothing here to render.

/** The pill's height — the composer's round buttons are 36, and matching that
 *  keeps the control row on one optical baseline. Exported so a caller doing
 *  its own layout maths reads it from here rather than guessing. */
export const EFFORT_PILL_HEIGHT = 36;

export function EffortPill({
  effort,
  open,
  onToggle,
}: {
  effort: ChatEffort;
  open: boolean;
  onToggle: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Intelligence: ${CHAT_EFFORT_LABEL[effort]}`}
      testID="composer-effort-pill"
    >
      <GlassSurface style={[styles.pill, open && styles.pillOpen]} fallbackColor={c.glassPanel}>
        <Text style={styles.pillLabel} numberOfLines={1}>{CHAT_EFFORT_LABEL[effort]}</Text>
      </GlassSurface>
    </Pressable>
  );
}

/**
 * The dropdown. Rendered at the chat screen's ROOT (see the file header), and
 * anchored ABOVE the composer the same way ComposerPlusMenu is — the caller
 * passes the distance from the bottom edge to just above the composer card.
 * Always mounted so the close fade plays; a transparent tap-catcher dismisses
 * it without blurring the page behind it, matching every other menu here.
 */
export function EffortPopup({
  visible,
  effort,
  bottomOffset,
  onSelect,
  onClose,
}: {
  visible: boolean;
  effort: ChatEffort;
  /** Distance from the screen's bottom edge to just above the composer card. */
  bottomOffset: number;
  onSelect: (effort: ChatEffort) => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 140,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID="composer-effort-menu">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View style={[styles.menuWrap, { bottom: bottomOffset, opacity: progress, transform: [{ translateY }] }]}>
        <GlassSurface style={styles.menu} fallbackColor={c.glassPanel} opaque>
          {CHAT_EFFORTS.map((level, index) => {
            const isActive = level === effort;
            return (
              <Pressable
                key={level}
                testID={`composer-effort-${level}`}
                onPress={() => {
                  onClose();
                  onSelect(level);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowDivider,
                  isActive && styles.rowActive,
                  pressed && !isActive && styles.rowPressed,
                ]}
              >
                <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{CHAT_EFFORT_LABEL[level]}</Text>
                <View style={styles.rowSpacer} />
                {isActive ? <CheckIcon size={16} color={c.accent} /> : null}
              </Pressable>
            );
          })}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

function CheckIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.5 12.5 9.5 17.5 19.5 6.5" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Tight on purpose, and it had to get tighter: in the compact one-row
    // composer this pill shares the row with "+", the field and two round
    // buttons, and the first screenshot pass showed a three-word draft wrapping
    // onto a second line because the field had been squeezed to ~130pt. So the
    // chevron went (the glass edge, and the accent edge when open, carry the
    // affordance) and the label dropped to 13pt. "Instant", the longest label,
    // now costs ~58pt instead of ~84 — the difference lands in the draft field.
    // flexShrink:0 keeps the pill from being the thing that collapses instead.
    pill: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      height: EFFORT_PILL_HEIGHT,
      paddingHorizontal: space(2),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line,
    },
    pillOpen: { borderColor: c.accentLine, backgroundColor: c.accentFaint },
    pillLabel: { fontSize: 13, lineHeight: 17, color: c.text, fontWeight: "600" },
    // Left-aligned with the composer's own inset so the menu hangs under the
    // pill rather than floating in the middle of the screen.
    menuWrap: { position: "absolute", left: space(3), minWidth: 176 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingHorizontal: space(4) },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.line },
    rowActive: { backgroundColor: c.accentFaint },
    rowPressed: { backgroundColor: c.surface },
    rowLabel: { ...type.body, color: c.text },
    rowLabelActive: { color: c.accent, fontWeight: "600" },
    rowSpacer: { flex: 1 },
  });
