import { Pressable, StyleSheet, View } from "react-native";
import { ComposeIcon } from "@/components/icons-canvas";
import { GlassSurface } from "@/components/GlassSurface";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";

// The canvas header's right-hand chrome (IMG_6532/6551): the reference carries NO title —
// just one white pill holding two glyphs, compose and "…", with a thin divider between them.
// Measured off IMG_6551 (`pill_grid.png`): height 132px/3 = 44pt (== control.lg), right inset
// 61px/3 ≈ 20pt, fully pill-radiused (44/2 = 22).
//
// Two Pressables side by side rather than one wide button — the compose glyph and the dots
// glyph are separate taps in the reference (new chat vs. the actions menu), and MiniMenu-style
// popovers already anchor off a single button's rect, so keeping two distinct 44×~54pt tap
// zones (each roomier than the icon alone) beats guessing a midpoint split.
export function CanvasHeaderPill({
  onCompose,
  onMenu,
  menuOpen,
}: {
  onCompose: () => void;
  onMenu: () => void;
  menuOpen: boolean;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <GlassSurface style={styles.pill} fallbackColor={c.glassPanel} shadow>
      <Pressable
        style={styles.half}
        onPress={onCompose}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="New chat"
        testID="canvas-header-compose"
      >
        <ComposeIcon size={21} color={c.text} strokeWidth={1.8} />
      </Pressable>
      <View style={styles.divider} />
      <Pressable
        style={styles.half}
        onPress={onMenu}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Canvas actions"
        accessibilityState={{ expanded: menuOpen }}
        testID="canvas-actions-btn"
      >
        <DotsIcon size={20} color={menuOpen ? c.accent : c.text} />
      </Pressable>
    </GlassSurface>
  );
}

/** Horizontal "…" — same glyph chat.tsx/canvas.tsx have each drawn locally for their own
 *  header button; kept local here rather than promoted to icons.tsx, which is off-limits for
 *  this slice. */
function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", flexDirection: "row" }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{ width: size * 0.14, height: size * 0.14, borderRadius: size * 0.07, backgroundColor: color, marginHorizontal: size * 0.06 }}
        />
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // 44pt tall, fully rounded — measured (see file header). Width follows content: two
    // ~44pt-wide halves plus the divider, close to the reference's 108.7pt.
    pill: { flexDirection: "row", alignItems: "stretch", height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    half: { width: 44, alignItems: "center", justifyContent: "center" },
    divider: { width: StyleSheet.hairlineWidth, backgroundColor: c.line, marginVertical: 8 },
  });
