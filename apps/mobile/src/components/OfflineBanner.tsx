import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import { useOnline } from "@/lib/useOnline";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

// The doc-06 "offline" state, surfaced globally so it satisfies the §12 matrix on every
// key screen at once (Ask/Drug/Source/Search/Watchlist all show ●) rather than five
// per-screen copies. Floats over the active route; renders nothing while online.
// Liquid-glass redesign: the strip is glass like the rest of the chrome, and it pads
// by the real status-bar inset instead of the old hardcoded 44.
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  if (online) return null;
  return (
    <GlassSurface
      style={[styles.banner, { paddingTop: insets.top + space(1.5) }]}
      fallbackColor={c.raised}
      testID="offline-banner"
    >
      <Text style={styles.text} accessibilityRole="alert">
        You're offline. Showing cached data where available.
      </Text>
    </GlassSurface>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    banner: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingBottom: space(2.5),
      paddingHorizontal: space(4),
      zIndex: 1000,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    text: { color: c.text, fontSize: 13, fontWeight: "600", textAlign: "center" },
  });
