import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShell } from "./AppDrawer";
import { GlassSurface } from "./GlassSurface";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, space, type } from "@/theme/tokens";

// The top chrome — no bar, no border (owner call): ONE floating liquid-glass menu
// button top-left, and a centered label that appears once the student has asked
// something (screens drive it via useShell().setHeaderTitle) — blank otherwise.
// A screen can put a live CONTROL in that center slot instead of a label with
// setHeaderCenter (Study's section dropdown, owner 2026-07-22).
// Owner call 2026-07-18: dropped the Nemesis logo/wordmark and the '+' button from
// every page's top chrome (the drawer's own "New chat" button, plus the new
// edge-swipe-to-open gesture, cover that job now). A same-size invisible spacer
// sits top-right purely so the center label stays visually centered between two
// equal-width slots. Content scrolls freely underneath. Chrome stays neutral —
// crimson is for primary actions.
/** The round glass buttons' diameter — also the bar row's height, since they're
 *  its tallest children. Exported so a screen that publishes a control into the
 *  center slot can work out where that control's bottom edge lands (Study hangs
 *  its dropdown from there) instead of hardcoding a guess. */
export const TOP_BAR_BUTTON = control.lg;

/** The bar's own top padding below the status-bar inset — the other half of
 *  that same calculation. */
export const TOP_BAR_PAD_TOP = space(2);

export function TopBar() {
  const insets = useSafeAreaInsets();
  const { openDrawer, headerTitle, headerCenter, headerRight } = useShell();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + space(2) }]} pointerEvents="box-none">
      <GlassButton onPress={openDrawer} label="Open menu" styles={styles} fallback={c.glassPanel}>
        <View style={styles.bun} />
        <View style={styles.bun} />
        <View style={styles.bun} />
      </GlassButton>

      {/* Center slot: a plain title by default, or a screen's own CONTROL when it
          publishes one (Study's Cards/Tests/Mindmaps dropdown). A label can't be
          tapped, so it stays pointerEvents="none" and lets swipes through to the
          page; a control has to receive taps, so the slot switches to "box-none"
          — which passes touches through the empty space around it either way. */}
      <View style={styles.center} pointerEvents={headerCenter ? "box-none" : "none"}>
        {headerCenter ?? (headerTitle ? <Text style={styles.title} numberOfLines={1}>{headerTitle}</Text> : null)}
      </View>

      {/* Right slot: a screen's own action (Graph gear, Chat "…") when set — it paints
          here, in the chrome above the status-bar blur, perfectly in line with the menu
          button. Empty otherwise, so the same-size slot keeps the center title centered. */}
      <View style={styles.spacer} pointerEvents="box-none">{headerRight}</View>
    </View>
  );
}

function GlassButton({
  onPress,
  label,
  styles,
  fallback,
  children,
}: {
  onPress: () => void;
  label: string;
  styles: ReturnType<typeof createStyles>;
  fallback?: string;
  children: ReactNode;
}) {
  return (
    <GlassSurface style={styles.glassBtn} fallbackColor={fallback} shadow>
      <Pressable style={styles.glassBtnInner} onPress={onPress} hitSlop={8} accessibilityLabel={label}>
        {children}
      </Pressable>
    </GlassSurface>
  );
}

const MARK = require("../../assets/images/nemesis-mark.png");
// 1.240 = the trimmed mark's native width/height (the bolder 1254px flat master,
// owner-supplied 2026-07-17); keeps the wings from squashing.
const MARK_ASPECT = 1.24;

// The Nemesis mark — the winged logo, flat white on transparent, from the brand master.
// `size` is the rendered HEIGHT in points; width follows the mark's own aspect ratio.
// Width and height are BOTH explicit on purpose: static require()'d images carry their
// intrinsic pixel size as a default style, and on-device that default beat the
// height+aspectRatio combination (owner screenshot, build 6). Explicit dimensions win.
// tintColor recolors the white master to the theme's text tone so it reads in light mode.
// No longer used by TopBar itself (owner call 2026-07-18 dropped the top chrome
// wordmark), but stays exported — sign-in.tsx still renders the mark as page branding.
export function LogoMark({ size = 16, tint }: { size?: number; tint?: string }) {
  const { colors: c } = useTheme();
  return (
    <Image
      source={MARK}
      style={{ width: Math.round(size * MARK_ASPECT), height: size, tintColor: tint ?? c.text }}
      resizeMode="contain"
      accessibilityLabel="Nemesis"
    />
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      position: "absolute", top: 0, left: 0, right: 0,
      flexDirection: "row", alignItems: "center", gap: space(2),
      paddingHorizontal: space(3), paddingBottom: space(2),
      // paddingTop is applied inline (it adds the live safe-area inset); the
      // constant half of it is TOP_BAR_PAD_TOP above.
      // Above StatusBarBlur (zIndex 5) so the menu button, title and headerRight action
      // paint ON TOP of the blur/black-fade instead of getting frosted by it.
      zIndex: 10,
    },
    glassBtn: { width: TOP_BAR_BUTTON, height: TOP_BAR_BUTTON, borderRadius: TOP_BAR_BUTTON / 2, borderWidth: 1, borderColor: c.line },
    glassBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },
    bun: { width: 18, height: 2, borderRadius: 2.5, backgroundColor: c.text2, marginVertical: 2 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(1) },
    title: { color: c.text, fontSize: type.bodyStrong.fontSize, fontWeight: "600", letterSpacing: -0.2 },
    // Right slot — holds a screen's headerRight action (Graph gear / Chat "…", or the canvas
    // screen's two-glyph pill) when set, else an empty same-size box so the center label stays
    // centered between two equal slots. minWidth (not a fixed width) so every existing
    // single-button caller renders exactly as before, while the canvas screen's wider pill
    // (CanvasHeaderPill, ~109pt) isn't clipped to a single button's box.
    spacer: { minWidth: TOP_BAR_BUTTON, height: TOP_BAR_BUTTON, alignItems: "center", justifyContent: "center" },
  });
