import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShell } from "./AppDrawer";
import { c, space } from "@/theme/tokens";

// The quiet top bar: hamburger (opens the drawer) · Nemesis wordmark + mark · new-mission (+).
// Shared by every screen in the (tabs) shell. This is "chrome" in the design-parity sense,
// so everything here stays neutral — the one crimson accent is reserved for primary actions.
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
        <LogoMark size={15} />
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

const MARK = require("../../assets/images/nemesis-mark.png");
// 1.324 = the trimmed mark's native width/height; keeps the wings from squashing.
const MARK_ASPECT = 1.324;

// The Nemesis mark — the winged logo, silver on transparent, straight from the brand art.
// `size` is the rendered HEIGHT in points; width follows the mark's own aspect ratio.
// Width and height are BOTH explicit on purpose: static require()'d images carry their
// intrinsic pixel size as a default style, and on-device that default beat the
// height+aspectRatio combination — the mark rendered at its raw 678×512 and swallowed
// the whole screen (owner screenshot, build 6). Explicit dimensions always win.
export function LogoMark({ size = 16 }: { size?: number }) {
  return (
    <Image
      source={MARK}
      style={{ width: Math.round(size * MARK_ASPECT), height: size }}
      resizeMode="contain"
      accessibilityLabel="Nemesis"
    />
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
});
