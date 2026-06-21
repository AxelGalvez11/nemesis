import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { c, radius, space, type } from "@/theme/tokens";

// ChatGPT/Claude-style slide-out drawer + the app-shell context that drives it. Built on RN's built-in
// Animated (no extra deps; renders identically under react-native-web for previews). The drawer is always
// mounted and slides via translateX so there is no mount/unmount flicker; pointer events are gated on `open`.
//
// Item ORDER (owner's call): New chat → the nav options → THEN recent chats → profile.

interface ShellState {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Bumped when the user taps "New chat"; the chat screen watches it to clear the thread. */
  resetNonce: number;
  newChat: () => void;
}

const ShellContext = createContext<ShellState | undefined>(undefined);

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within DrawerProvider");
  return ctx;
}

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const newChat = useCallback(() => setResetNonce((n) => n + 1), []);

  const value = useMemo<ShellState>(
    () => ({ open, openDrawer, closeDrawer, resetNonce, newChat }),
    [open, openDrawer, closeDrawer, resetNonce, newChat],
  );

  return (
    <ShellContext.Provider value={value}>
      {children}
      <DrawerOverlay open={open} onClose={closeDrawer} onNewChat={newChat} />
    </ShellContext.Provider>
  );
}

function DrawerOverlay({ open, onClose, onNewChat }: { open: boolean; onClose: () => void; onNewChat: () => void }) {
  const { width } = useWindowDimensions();
  // Fallback when width is momentarily 0 (e.g. server-rendered first paint) so the panel never collapses to
  // zero-width and spills its content; on a device this is always the real screen width.
  const panelW = Math.min(330, Math.round((width || 380) * 0.86));
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 230 : 180,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-panelW, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View style={[styles.panel, { width: panelW, transform: [{ translateX }] }]}>
        <DrawerContent onClose={onClose} onNewChat={onNewChat} />
      </Animated.View>
    </View>
  );
}

function DrawerContent({ onClose, onNewChat }: { onClose: () => void; onNewChat: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? "Signed in";
  const initial = (email[0] ?? "?").toUpperCase();

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };
  const startNewChat = () => {
    onNewChat();
    onClose();
    router.push("/" as never);
  };

  return (
    <View style={[styles.panelInner, { paddingTop: insets.top + space(2) }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(3) }}>
        <Pressable style={styles.newChat} onPress={startNewChat}>
          <Text style={styles.newChatPlus}>+</Text>
          <Text style={styles.newChatText}>New chat</Text>
        </Pressable>

        <NavRow glyph="⌕" label="Explore drugs" onPress={() => go("/explore")} />
        <NavRow glyph="◉" label="Live Monitoring" badge="3" onPress={() => go("/watchlist")} />
        <NavRow glyph="▤" label="Reports" soon onPress={() => {}} />
        <NavRow glyph="⚙" label="Settings" onPress={() => go("/profile")} />

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Recent</Text>
        <View style={styles.recentEmpty}>
          <Text style={styles.recentEmptyText}>Your chats will appear here.</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space(3) }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.footerName} numberOfLines={1}>{email}</Text>
        </View>
        <Pressable onPress={() => { onClose(); void signOut(); }} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NavRow({ glyph, label, badge, soon, onPress }: { glyph: string; label: string; badge?: string; soon?: boolean; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.navRow, pressed && !soon && styles.navRowPressed]} disabled={soon} onPress={onPress}>
      <Text style={[styles.navGlyph, soon && styles.dim]}>{glyph}</Text>
      <Text style={[styles.navLabel, soon && styles.dim]}>{label}</Text>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      {soon ? <Text style={styles.soon}>SOON</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: c.scrim },
  panel: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: c.bg2, borderRightWidth: 1, borderRightColor: c.line, overflow: "hidden" },
  panelInner: { flex: 1 },

  newChat: {
    flexDirection: "row", alignItems: "center", gap: space(2.5),
    marginHorizontal: space(3.5), marginBottom: space(4),
    borderWidth: 1, borderColor: c.line2, borderRadius: radius.md, paddingVertical: space(3), paddingHorizontal: space(3.5),
  },
  newChatPlus: { color: c.acid, fontSize: 19, lineHeight: 19, marginTop: -2 },
  newChatText: { color: c.text, ...type.title },

  navRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2.75), paddingHorizontal: space(4.5) },
  navRowPressed: { backgroundColor: c.surface },
  navGlyph: { color: c.text2, fontSize: 17, width: 22, textAlign: "center" },
  navLabel: { color: c.text, ...type.bodyStrong, flex: 1 },
  dim: { color: c.text3, opacity: 0.7 },
  badge: { color: c.acid, ...type.micro, borderWidth: 1, borderColor: c.acidLine, borderRadius: 6, paddingHorizontal: space(1.5), paddingVertical: 2, overflow: "hidden" },
  soon: { color: c.text3, fontSize: 9.5, letterSpacing: 0.5, fontWeight: "700" },

  divider: { height: 1, backgroundColor: c.line, marginVertical: space(3), marginHorizontal: space(4) },
  sectionLabel: { color: c.text3, ...type.micro, letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: space(5), paddingBottom: space(1) },
  recentEmpty: { paddingHorizontal: space(5), paddingVertical: space(2) },
  recentEmptyText: { color: c.text3, ...type.small },

  footer: { flexDirection: "row", alignItems: "center", gap: space(2.5), borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: space(4.5), paddingTop: space(3.5) },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.text, ...type.small, fontWeight: "700" },
  footerName: { color: c.text2, ...type.small },
  signOut: { color: c.text3, ...type.small, fontWeight: "600" },
});
