// Study stats, as a MODAL — the older presentation, opened from the Study screen.
//
// 🔴 THE NUMBERS MOVED OUT, THE FRAME STAYED. Stats became a destination of its own
// (`app/(tabs)/stats.tsx`) when the phone adopted the web app's four-destination model, and
// both render the same `StudyStatsBody`. What is left here is only what makes this a modal:
// its own header, its own close button, its own safe-area handling.
//
// Kept working although Study is now retired (`lib/retired-surfaces.ts`), on the same terms as
// every other retired surface: unlinked, not deleted. The close button falls back to the Stats
// destination rather than `/study`, so it can never return somebody to a closed door.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CloseIcon } from "@/components/icons";
import { StudyStatsBody } from "@/components/StudyStatsBody";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, space, type } from "@/theme/tokens";

export default function StudyStatsScreen() {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.root} testID="study-stats-page">
      <View style={[styles.header, { paddingTop: insets.top + space(1.5) }]}>
        <Text style={styles.title}>Study stats</Text>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/stats"))}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityLabel="Close study stats"
          testID="study-stats-close"
        >
          <CloseIcon size={17} color={c.text} />
        </Pressable>
      </View>
      <StudyStatsBody paddingBottom={insets.bottom} />
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      minHeight: 64,
      paddingHorizontal: space(4),
      paddingBottom: space(2),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    title: { ...type.h1, color: c.text },
    close: {
      width: control.sm,
      height: control.sm,
      borderRadius: control.sm / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface2,
    },
    pressed: { opacity: 0.65 },
  });
