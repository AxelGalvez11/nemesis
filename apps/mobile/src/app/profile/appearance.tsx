import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { accentSwatchHex, ACCENT_SWATCHES, type ThemeColors, type ThemeMode } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

// Appearance — its own page (owner call), pushed from the Settings sheet. Holds
// the theme mode (System / Light / Dark) and the ten accent swatches; both apply
// live and persist per-device (ThemeProvider).

const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export default function AppearanceScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { accentId, mode, setAccent, setMode } = useTheme();

  return (
    <View style={styles.root} testID="appearance-screen">
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="appearance-back">
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}>
        <Text style={styles.title}>Appearance</Text>

        <Text style={styles.label}>Theme</Text>
        <View style={styles.segment} testID="appearance-modes">
          {THEME_MODES.map((entry) => (
            <Pressable
              key={entry.id}
              testID={`mode-${entry.id}`}
              onPress={() => setMode(entry.id)}
              style={[styles.segmentItem, mode === entry.id && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, mode === entry.id && styles.segmentTextActive]}>{entry.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Accent color</Text>
        <View style={styles.swatchRow} testID="appearance-accents">
          {ACCENT_SWATCHES.map((swatch) => (
            <Pressable
              key={swatch.id}
              testID={`accent-${swatch.id}`}
              accessibilityLabel={`${swatch.label} accent`}
              onPress={() => setAccent(swatch.id)}
              style={styles.swatchCell}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: swatch.id === "crimson" ? "#ff2740" : accentSwatchHex(swatch.hue) },
                  accentId === swatch.id && styles.swatchActive,
                ]}
              />
              <Text style={[styles.swatchLabel, accentId === swatch.id && styles.swatchLabelActive]} numberOfLines={1}>
                {swatch.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: space(3), paddingBottom: space(1) },
    back: { alignSelf: "flex-start", paddingVertical: space(1) },
    backText: { fontSize: 16, color: c.accent, fontWeight: "500" },
    body: { paddingHorizontal: space(5), flexGrow: 1 },
    title: { fontSize: 28, fontWeight: "700", color: c.text, marginBottom: space(4), marginTop: space(1) },

    label: { fontSize: 13, fontWeight: "600", color: c.text3, marginTop: space(4), marginBottom: space(2) },
    segment: { flexDirection: "row", backgroundColor: c.surface2, borderRadius: radius.sm, padding: 3, gap: 3 },
    segmentItem: { flex: 1, paddingVertical: space(2.5), alignItems: "center", borderRadius: radius.sm - 2 },
    segmentItemActive: { backgroundColor: c.accentFaint },
    segmentText: { fontSize: 15, color: c.text2, fontWeight: "600" },
    segmentTextActive: { color: c.accent },

    swatchRow: { flexDirection: "row", flexWrap: "wrap" },
    swatchCell: { width: "20%", alignItems: "center", paddingVertical: space(2.5), gap: space(1.5) },
    swatch: { width: 34, height: 34, borderRadius: 999, borderWidth: 2, borderColor: "transparent" },
    swatchActive: { borderColor: c.text },
    swatchLabel: { fontSize: 10.5, color: c.text3 },
    swatchLabelActive: { color: c.text2, fontWeight: "600" },
  });
