import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";
import { GlassSurface } from "./GlassSurface";

export type StudyModeKey = "cards" | "tests" | "mindmaps";

const OPTIONS: { key: StudyModeKey; label: string }[] = [
  { key: "cards", label: "Cards" },
  { key: "tests", label: "Tests" },
  { key: "mindmaps", label: "Mindmaps" },
];

/** The FAB diameter — exported so study.tsx sizes its own glass buttons from
 *  the same number this menu anchors above (one source of truth). */
export const FAB_SIZE = 52;

/** The small popup anchored above the lower-right glass FAB — picks which
 *  study surface to use. Same always-mounted Animated.timing shape as
 *  SlideUpSheet (fade + a short rise instead of a full slide, since this is a
 *  small anchored menu rather than a page-sized sheet), so both overlays feel
 *  like one family. `insetBottom` is the screen's own safe-area/shell bottom
 *  padding — the caller doesn't need to know this menu's internal FAB math. */
export function StudyModeMenu({
  visible,
  onClose,
  onSelect,
  insetBottom,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (key: StudyModeKey) => void;
  insetBottom: number;
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
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID="study-mode-menu">
      {/* Transparent tap-catcher — dismiss on an outside tap WITHOUT blurring the page.
          The menu's own glass supplies the only blur (owner: confine blur to the component). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View
        style={[
          styles.menuWrap,
          { bottom: insetBottom + FAB_SIZE + space(3), opacity: progress, transform: [{ translateY }] },
        ]}
      >
        <GlassSurface style={styles.menu} fallbackColor={c.glassPanel} opaque>
          {OPTIONS.map((option, i) => (
            <Pressable
              key={option.key}
              testID={`study-mode-${option.key}`}
              onPress={() => onSelect(option.key)}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowLabel}>{option.label}</Text>
            </Pressable>
          ))}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    menuWrap: { position: "absolute", right: space(4), minWidth: 168 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    row: { paddingVertical: space(3), paddingHorizontal: space(4) },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.line },
    rowPressed: { backgroundColor: c.surface },
    rowLabel: { ...type.body, color: c.text },
  });
