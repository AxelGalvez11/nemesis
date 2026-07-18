import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShell } from "./AppDrawer";
import { GlassSurface } from "./GlassSurface";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

// The top chrome — no bar, no border (owner call): two FLOATING liquid-glass
// buttons (menu top-left, new-session '+' top-right) with a centered label that
// shows the Nemesis logo by default and swaps to the active chat/session title
// once the student has asked something (screens drive it via useShell().setHeaderTitle).
// Content scrolls freely underneath. Chrome stays neutral — crimson is for primary actions.
export function TopBar({ showNewChat = true }: { showNewChat?: boolean }) {
  const insets = useSafeAreaInsets();
  const { openDrawer, newChat, headerTitle } = useShell();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + space(1.5) }]} pointerEvents="box-none">
      <GlassButton onPress={openDrawer} label="Open menu" styles={styles}>
        <View style={styles.bun} />
        <View style={styles.bun} />
        <View style={styles.bun} />
      </GlassButton>

      <View style={styles.center} pointerEvents="none">
        {headerTitle ? (
          <Text style={styles.title} numberOfLines={1}>{headerTitle}</Text>
        ) : (
          <View style={styles.brand}>
            <LogoMark size={15} />
            <Text style={styles.wordmark}>Nemesis</Text>
          </View>
        )}
      </View>

      {showNewChat ? (
        // "+" starts a new session from anywhere: land on home and bump the nonce
        // (clears + focuses the composer).
        <GlassButton
          onPress={() => {
            newChat();
            router.push("/");
          }}
          label="New session"
          styles={styles}
        >
          <View style={styles.plusH} />
          <View style={styles.plusV} />
        </GlassButton>
      ) : (
        <View style={styles.glassBtn} />
      )}
    </View>
  );
}

function GlassButton({
  onPress,
  label,
  styles,
  children,
}: {
  onPress: () => void;
  label: string;
  styles: ReturnType<typeof createStyles>;
  children: ReactNode;
}) {
  return (
    <GlassSurface style={styles.glassBtn}>
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
    },
    glassBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line },
    glassBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },
    bun: { width: 16, height: 1.8, borderRadius: 2, backgroundColor: c.text2, marginVertical: 1.8 },
    plusH: { position: "absolute", width: 16, height: 1.8, borderRadius: 2, backgroundColor: c.text2 },
    plusV: { position: "absolute", width: 1.8, height: 16, borderRadius: 2, backgroundColor: c.text2 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(1) },
    brand: { flexDirection: "row", alignItems: "center", gap: space(2) },
    wordmark: { color: c.text, fontSize: 16.5, fontWeight: "700", letterSpacing: -0.2 },
    title: { color: c.text, fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
  });
