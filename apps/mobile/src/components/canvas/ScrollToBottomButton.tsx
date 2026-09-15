import { Pressable, StyleSheet } from "react-native";
import { ArrowDownIcon } from "@/components/icons";
import { GlassSurface } from "@/components/GlassSurface";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control } from "@/theme/tokens";

// The ↓ disc (IMG_6556, `disc_grid.png`): a 44pt white circle (== control.lg) with a soft
// shadow, centered above the composer, shown once the learner has scrolled away from the
// newest content — during or after a reply, per the slice's item 7.
export function ScrollToBottomButton({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <GlassSurface style={[styles.disc, { bottom }]} fallbackColor={c.glassPanel} shadow>
      <Pressable style={styles.inner} onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Scroll to latest" testID="canvas-scroll-to-bottom">
        <ArrowDownIcon size={20} color={c.text} strokeWidth={2} />
      </Pressable>
    </GlassSurface>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    disc: {
      position: "absolute",
      alignSelf: "center",
      width: control.lg,
      height: control.lg,
      borderRadius: control.lg / 2,
      borderWidth: 1,
      borderColor: c.line,
    },
    inner: { flex: 1, alignItems: "center", justifyContent: "center" },
  });
