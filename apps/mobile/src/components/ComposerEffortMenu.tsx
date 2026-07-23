import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GlassSurface } from "./GlassSurface";
import { CHAT_EFFORT_LABEL, CHAT_EFFORTS, type ChatEffort } from "@/lib/chat-effort";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

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

/** The pill's height — the same as the composer's round buttons (control.md),
 *  which keeps the control row on one optical baseline. Exported so a caller
 *  doing its own layout maths reads it from here rather than guessing. */
export const EFFORT_PILL_HEIGHT = control.md;

export function EffortLabel({
  effort,
  open,
  onToggle,
}: {
  effort: ChatEffort;
  open: boolean;
  onToggle: () => void;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Intelligence: ${CHAT_EFFORT_LABEL[effort]}`}
      testID="composer-effort-pill"
      style={styles.label}
    >
      <Text style={[styles.labelText, open && styles.labelTextOpen]} numberOfLines={1}>
        {CHAT_EFFORT_LABEL[effort]}
      </Text>
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
    <View style={[StyleSheet.absoluteFill, styles.host]} pointerEvents={visible ? "auto" : "none"} testID="composer-effort-menu">
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
    // BARE TEXT, no box (owner reference screenshot 2026-07-22 — the level
    // reads as a quiet label just left of the mic, exactly where ChatGPT puts
    // its own). It was a bordered glass pill for one revision; the box made it
    // compete with the round buttons beside it and cost width the draft field
    // needed. flexShrink:0 so it's never the thing that collapses.
    label: { flexShrink: 0, justifyContent: "center", height: EFFORT_PILL_HEIGHT, paddingHorizontal: space(1) },
    labelText: { ...type.small, fontWeight: "500", color: c.text2 },
    labelTextOpen: { color: c.accent, fontWeight: "600" },
    // Above the page, explicitly. On iOS, `position: absolute` does NOT lift a
    // view over its later siblings the way it does in a browser — native paints
    // strictly in tree order, and only zIndex changes that. Without this the
    // menu drew UNDER whatever chat.tsx renders after it (owner 2026-07-23:
    // "stuck at medium in landing page"). chat.tsx also renders it last now;
    // this is the belt to that braces, so re-ordering can't silently break it.
    host: { zIndex: 30 },
    // Hangs under the RIGHT end of the composer now that the label lives there
    // — a left-anchored menu would point at the "+" instead.
    menuWrap: { position: "absolute", right: space(3), minWidth: 176 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingHorizontal: space(4) },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.line },
    rowActive: { backgroundColor: c.accentFaint },
    rowPressed: { backgroundColor: c.surface },
    rowLabel: { ...type.body, color: c.text },
    rowLabelActive: { color: c.accent, fontWeight: "600" },
    rowSpacer: { flex: 1 },
  });
