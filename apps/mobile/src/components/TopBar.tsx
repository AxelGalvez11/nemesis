import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShell } from "./AppDrawer";
import { c, space, type } from "@/theme/tokens";
import tokens from "@/theme/tokens.json";

// The quiet top bar: hamburger (opens the drawer) · Nemesis wordmark + mark · new-mission (+).
// Shared by every screen in the (tabs) shell, including the missions home — this is
// "chrome" in the design-parity sense, so the mark below is neutral (no accent wash),
// sourced from theme/tokens.json rather than the old lime PharmaOrb accent.
export function TopBar({ title = "Nemesis", showNewChat = true }: { title?: string; showNewChat?: boolean }) {
  const insets = useSafeAreaInsets();
  const { openDrawer, newChat } = useShell();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + space(2) }]}>
      <Pressable style={styles.iconBtn} onPress={openDrawer} hitSlop={8} accessibilityLabel="Open menu">
        <View style={styles.bun} />
        <View style={styles.bun} />
        <View style={styles.bun} />
      </Pressable>
      <View style={styles.brand}>
        <Orb size={16} />
        <Text style={styles.wordmark}>{title}</Text>
      </View>
      {showNewChat ? (
        <Pressable style={styles.iconBtn} onPress={newChat} hitSlop={8} accessibilityLabel="New chat">
          <View style={styles.plusH} />
          <View style={styles.plusV} />
        </Pressable>
      ) : (
        <View style={styles.iconBtn} />
      )}
    </View>
  );
}

// The Nemesis mark — a neutral steel sphere, deliberately un-accented: it lives in the
// chrome (top bar, sign-in), and the design-parity rule keeps chrome accent-free so the
// ONE crimson accent stays meaningful on primary actions instead of washing the nav.
export function Orb({ size = 16 }: { size?: number }) {
  return (
    <View style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.orbHi, { width: size * 0.4, height: size * 0.4, borderRadius: size, top: size * 0.18, left: size * 0.2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row", alignItems: "center", gap: space(2),
    paddingHorizontal: space(3), paddingBottom: space(3),
    borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.bg,
  },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  bun: { width: 19, height: 2, borderRadius: 2, backgroundColor: c.text2, marginVertical: 2 },
  plusH: { position: "absolute", width: 18, height: 2, borderRadius: 2, backgroundColor: c.text2 },
  plusV: { position: "absolute", width: 2, height: 18, borderRadius: 2, backgroundColor: c.text2 },
  brand: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2) },
  wordmark: { color: c.text, fontSize: 16.5, fontWeight: "700", letterSpacing: -0.2 },
  orb: { backgroundColor: tokens.colors.muted },
  orbHi: { position: "absolute", backgroundColor: "rgba(255,255,255,0.55)" },
});
