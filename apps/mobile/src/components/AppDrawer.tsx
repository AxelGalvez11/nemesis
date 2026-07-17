import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { GlassSurface } from "./GlassSurface";
import { CalendarIcon, ChatIcon, GraphIcon, LibraryIcon, PlusIcon, SessionsIcon, StudyIcon, type IconProps } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// ChatGPT/Claude-style slide-out drawer + the app-shell context that drives it. Built on RN's built-in
// Animated (no extra deps; renders identically under react-native-web for previews). The drawer is always
// mounted and slides via translateX so there is no mount/unmount flicker; pointer events are gated on `open`.
//
// Liquid-glass redesign: the panel itself is a glass sheet sliding over the app.
// The drawer IS the desktop sidebar on the phone (owner call 2026-07-17): every
// page lives here — Sessions · Chat · Library · Study · Graph · Calendar — plus
// "New session" on top and the account/Settings row at the bottom. Cloud-first
// wording: the agent's runs are "sessions", matching the desktop app.

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
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
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
        {/* The sliding sheet is glass: the app shows through it on iOS 26; the blur
            fallback fills with the solid drawer color so text never loses contrast. */}
        <GlassSurface style={styles.panelGlass} fallbackColor={c.bg2}>
          <DrawerContent onClose={onClose} onNewChat={onNewChat} />
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

function DrawerContent({ onClose, onNewChat }: { onClose: () => void; onNewChat: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const email = session?.user?.email ?? "Signed in";
  const initial = (email[0] ?? "?").toUpperCase();

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };
  const startNewMission = () => {
    onNewChat();
    onClose();
    router.push("/" as never);
  };

  return (
    <View style={[styles.panelInner, { paddingTop: insets.top + space(2) }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(3) }}>
        <Pressable style={styles.newChat} onPress={startNewMission}>
          <PlusIcon size={17} color={c.text2} />
          <Text style={styles.newChatText}>New session</Text>
        </Pressable>

        {/* The desktop sidebar's pages, same order. */}
        <NavRow Icon={SessionsIcon} label="Sessions" onPress={() => go("/")} />
        <NavRow Icon={ChatIcon} label="Chat" onPress={() => go("/chat")} />
        <NavRow Icon={LibraryIcon} label="Library" onPress={() => go("/library")} />
        <NavRow Icon={StudyIcon} label="Study" onPress={() => go("/study")} />
        <NavRow Icon={GraphIcon} label="Graph" onPress={() => go("/graph")} />
        <NavRow Icon={CalendarIcon} label="Calendar" onPress={() => go("/calendar")} />
      </ScrollView>

      {/* The account row IS the door to Settings (owner call 2026-07-17, matching
          the desktop's lower-left pattern). Sign out lives inside Settings. */}
      <Pressable
        testID="drawer-account"
        style={({ pressed }) => [styles.footer, { paddingBottom: insets.bottom + space(3) }, pressed && styles.footerPressed]}
        onPress={() => go("/profile")}
        accessibilityLabel="Open settings"
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.footerName} numberOfLines={1}>{email}</Text>
          <Text style={styles.footerHint}>Settings</Text>
        </View>
        <Text style={styles.footerChevron}>›</Text>
      </Pressable>
    </View>
  );
}

function NavRow({ Icon, label, badge, soon, onPress }: { Icon: ComponentType<IconProps>; label: string; badge?: string; soon?: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <Pressable style={({ pressed }) => [styles.navRow, pressed && !soon && styles.navRowPressed]} disabled={soon} onPress={onPress}>
      <View style={styles.navIcon}>
        <Icon size={19} color={soon ? c.text3 : c.text2} />
      </View>
      <Text style={[styles.navLabel, soon && styles.dim]}>{label}</Text>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      {soon ? <Text style={styles.soon}>SOON</Text> : null}
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    scrim: { backgroundColor: c.scrim },
    panel: { position: "absolute", top: 0, bottom: 0, left: 0, borderRightWidth: 1, borderRightColor: c.line, overflow: "hidden" },
    panelGlass: { flex: 1 },
    panelInner: { flex: 1 },

    newChat: {
      flexDirection: "row", alignItems: "center", gap: space(2.5),
      marginHorizontal: space(3.5), marginBottom: space(4),
      borderWidth: 1, borderColor: c.line2, borderRadius: radius.md, paddingVertical: space(3), paddingHorizontal: space(3.5),
    },
    newChatText: { color: c.text, ...type.title },

    navRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2.75), paddingHorizontal: space(4.5) },
    navRowPressed: { backgroundColor: c.surface },
    navIcon: { width: 22, alignItems: "center" },
    navLabel: { color: c.text, ...type.bodyStrong, flex: 1 },
    dim: { color: c.text3, opacity: 0.7 },
    badge: { color: c.accent, ...type.micro, borderWidth: 1, borderColor: c.accentLine, borderRadius: 6, paddingHorizontal: space(1.5), paddingVertical: 2, overflow: "hidden" },
    soon: { color: c.text3, fontSize: 9.5, letterSpacing: 0.5, fontWeight: "700" },

    footer: { flexDirection: "row", alignItems: "center", gap: space(2.5), borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: space(4.5), paddingTop: space(3.5) },
    footerPressed: { backgroundColor: c.surface },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
    avatarText: { color: c.text, ...type.small, fontWeight: "700" },
    footerName: { color: c.text, ...type.small, fontWeight: "600" },
    footerHint: { color: c.text3, ...type.micro },
    footerChevron: { color: c.text3, fontSize: 20 },
  });
