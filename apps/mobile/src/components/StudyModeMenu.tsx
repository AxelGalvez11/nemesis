import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GlassSurface } from "./GlassSurface";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

export type StudyModeKey = "cards" | "tests" | "mindmaps";

/** The sections the menu OFFERS.
 *
 *  Mindmaps is deliberately absent (owner 2026-07-29: "hide the mindmaps tab
 *  from the study page"). Only the menu row is gone — the mindmap viewer, its
 *  data and its deep links all still work, so anything already created stays
 *  reachable and putting the row back is a one-line change. Removing the
 *  control is not the same as removing the feature. */
const OPTIONS: { key: StudyModeKey; label: string }[] = [
  { key: "cards", label: "Cards" },
  { key: "tests", label: "Tests" },
];

/** Labels stay complete, Mindmaps included: a deep link into a mindmap still
 *  opens it, and the trigger has to be able to name where you are. `activeMode`
 *  resets to Cards on every launch, so nobody gets stuck in a section the menu
 *  no longer lists. */
export const MODE_LABEL: Record<StudyModeKey, string> = {
  cards: "Cards",
  mindmaps: "Mindmaps",
  tests: "Tests",
};

/** The lower-left Add FAB's diameter — exported so study.tsx sizes its own
 *  glass button from the same number (one source of truth). Named/homed here
 *  from when this file anchored a popup above the old Modes FAB; study.tsx
 *  already imports it from this module, so the constant stayed put rather
 *  than churning an unrelated import. */
export const FAB_SIZE = control.xl;

/** The trigger pill's height — study.tsx adds it to its own content-top inset
 *  to work out where the dropdown hangs, so the two can't drift apart. */
export const TRIGGER_HEIGHT = 40;

/**
 * The Study page's section switcher — a liquid-glass DROPDOWN since owner
 * 2026-07-22 ("change the pill component ... to a liquid glass dropdown menu
 * that shows which page user is on like 'cards v'"). It replaced an inline
 * three-segment pill; the section you're in is now the trigger's own label,
 * so the control stays one tap wide no matter how many sections exist.
 *
 * Stats rides in the menu as a trailing row behind a hairline divider. It
 * opens the existing stats sheet rather than switching sections, so it never
 * takes the active fill — same arrangement it had inside the old pill.
 */
export function StudyModeMenu({
  active,
  open,
  onToggle,
}: {
  active: StudyModeKey;
  open: boolean;
  onToggle: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(spin, {
      toValue: open ? 1 : 0,
      duration: open ? 180 : 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <Pressable
      testID="study-mode-toggle"
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Study section: ${MODE_LABEL[active]}`}
    >
      <GlassSurface style={[styles.trigger, open && styles.triggerOpen]} fallbackColor={c.glassPanel} shadow>
        <Text style={styles.triggerLabel}>{MODE_LABEL[active]}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={15} color={c.text} />
        </Animated.View>
      </GlassSurface>
    </Pressable>
  );
}

/**
 * The dropdown itself. Rendered at the Study screen's ROOT, not inside the
 * trigger — an absolutely-positioned child would either be painted under the
 * deck list or, once pushed outside its parent's bounds, stop receiving taps
 * on Android. Same always-mounted fade+rise as the app's other menus, so the
 * close animation gets to play.
 */
export function StudyModePopup({
  visible,
  active,
  topOffset,
  onSelect,
  onStats,
  onClose,
}: {
  visible: boolean;
  active: StudyModeKey;
  /** Distance from the top of the screen to just below the trigger pill. */
  topOffset: number;
  onSelect: (key: StudyModeKey) => void;
  onStats: () => void;
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

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });

  const pickAndClose = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID="study-mode-menu">
      {/* Transparent tap-catcher — dismiss on an outside tap WITHOUT blurring the
          page (owner: confine blur to the component), same as every other menu here. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View style={[styles.menuWrap, { top: topOffset, opacity: progress, transform: [{ translateY }] }]}>
        <GlassSurface style={styles.menu} fallbackColor={c.glassPanel} opaque>
          {OPTIONS.map((option, index) => {
            const isActive = active === option.key;
            return (
              <Pressable
                key={option.key}
                testID={`study-mode-${option.key}`}
                onPress={() => pickAndClose(() => onSelect(option.key))}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowDivider,
                  isActive && styles.rowActive,
                  pressed && !isActive && styles.rowPressed,
                ]}
              >
                <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{option.label}</Text>
                <View style={styles.rowSpacer} />
                {isActive ? <CheckIcon size={16} color={c.accent} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            testID="study-mode-stats"
            onPress={() => pickAndClose(onStats)}
            accessibilityRole="button"
            accessibilityLabel="Study stats"
            style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
          >
            {/* Text only (owner 2026-07-29: "remove the icon from the stats
                tab"). The section rows above carry no leading glyph either, so
                the menu now reads as one column of labels. */}
            <Text style={styles.rowLabel}>Stats</Text>
          </Pressable>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

function ChevronDown({ size = 15, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
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
    // Sized to its content, not stretched — study.tsx centers this row itself
    // ("compact pill-row", owner's words) rather than this component assuming
    // its own placement.
    // Borderless (owner 2026-07-22: "remove the pill border at the top of the
    // study page"). The glass fill alone carries the shape now, so the header
    // reads as a label you can tap rather than a boxed control sitting on the
    // page. Open state tints the LABEL instead of an outline that no longer
    // exists — see triggerOpen below.
    trigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1.5),
      height: TRIGGER_HEIGHT,
      paddingHorizontal: space(4),
      borderRadius: radius.pill,
    },
    triggerOpen: { backgroundColor: c.accentFaint },
    triggerLabel: { ...type.body, color: c.text, fontWeight: "600" },
    menuWrap: { position: "absolute", alignSelf: "center", minWidth: 200 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingHorizontal: space(4) },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.line },
    rowActive: { backgroundColor: c.accentFaint },
    rowPressed: { backgroundColor: c.surface },
    rowLabel: { ...type.body, color: c.text },
    rowLabelActive: { color: c.accent, fontWeight: "600" },
    rowSpacer: { flex: 1 },
  });
