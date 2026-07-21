import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

export type StudyModeKey = "cards" | "tests" | "mindmaps";

const OPTIONS: { key: StudyModeKey; label: string }[] = [
  { key: "cards", label: "Cards" },
  { key: "tests", label: "Tests" },
  { key: "mindmaps", label: "Mindmaps" },
];

/** The lower-left Add FAB's diameter — exported so study.tsx sizes its own
 *  glass button from the same number (one source of truth). Named/homed here
 *  from when this file anchored a popup above the old Modes FAB; study.tsx
 *  already imports it from this module, so the constant stayed put rather
 *  than churning an unrelated import. */
export const FAB_SIZE = 52;

/**
 * The Study page's section switcher — INLINE now, not a popup (owner
 * 2026-07-20: "change it from a button to a toggle that shows which section
 * user is in"). A bordered pill row with three text segments
 * (Cards/Tests/Mindmaps); the active one fills with the accent tint so
 * "which section you're in" reads at a glance — the same active-state
 * language the calendar event-kind picker and the library sort sheet already
 * use elsewhere in this app (accentFaint fill + accent text), not a new
 * convention.
 *
 * Stats used to be its own lower-left FAB; the owner asked it to move INTO
 * this control instead ("move it into the minimenu"), so it rides along as a
 * trailing icon-segment behind a hairline divider. Tapping it opens the
 * existing stats sheet rather than switching sections — it isn't a
 * persistent content mode, so it never shows an "active" fill, only a press
 * state.
 */
export function StudyModeMenu({
  active,
  onSelect,
  onStats,
}: {
  active: StudyModeKey;
  onSelect: (key: StudyModeKey) => void;
  onStats: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();

  return (
    <View style={styles.pill} testID="study-mode-toggle">
      {OPTIONS.map((option) => {
        const isActive = active === option.key;
        return (
          <Pressable
            key={option.key}
            testID={`study-mode-${option.key}`}
            onPress={() => onSelect(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [styles.segment, isActive && styles.segmentActive, pressed && !isActive && styles.segmentPressed]}
          >
            <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
      <View style={styles.divider} />
      <Pressable
        testID="study-mode-stats"
        onPress={onStats}
        accessibilityRole="button"
        accessibilityLabel="Study stats"
        style={({ pressed }) => [styles.statsSegment, pressed && styles.segmentPressed]}
      >
        <ChartIcon size={15} color={c.text2} />
      </Pressable>
    </View>
  );
}

/** Simple bar-chart glyph for the toggle's trailing Stats segment — kept
 *  local to this file (moved here from study.tsx along with the Stats
 *  trigger it now belongs to). */
function ChartIcon({ size = 22, color, strokeWidth = 1.7 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="4.2" y1="20" x2="19.8" y2="20" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M7.4 20V13.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M12 20V8.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M16.6 20V11" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Sized to its content, not stretched — study.tsx centers this row itself
    // ("compact pill-row", owner's words) rather than this component assuming
    // its own placement.
    pill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.pill,
      padding: 3,
      gap: 2,
    },
    segment: { paddingVertical: space(1.75), paddingHorizontal: space(3.5), borderRadius: radius.pill },
    segmentActive: { backgroundColor: c.accentFaint },
    segmentPressed: { backgroundColor: c.surface2 },
    segmentLabel: { ...type.small, color: c.text2, fontWeight: "600" },
    segmentLabelActive: { color: c.accent },
    divider: { width: 1, height: 18, backgroundColor: c.line, marginHorizontal: space(1) },
    statsSegment: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  });
