import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { listMissions, type Mission, type MissionStatus } from "@/api/missions";
import { GlassSurface } from "./GlassSurface";
import { CalendarIcon, ChatIcon, GraphIcon, LibraryIcon, PlusIcon, SearchIcon, SettingsIcon, StudyIcon, type IconProps } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// ChatGPT/Claude-style slide-out drawer + the app-shell context that drives it. Built on RN's built-in
// Animated (no extra deps; renders identically under react-native-web for previews). The drawer is always
// mounted and slides via translateX so there is no mount/unmount flicker; pointer events are gated on `open`.
//
// Liquid-glass redesign: the panel itself is a glass sheet sliding over the app.
// The drawer IS the desktop app's sidebar on the phone (owner call 2026-07-17),
// composed to match the web/desktop build (components/workspace/shell/chat-sidebar):
// a compact nav (New session · Chat · Study · Library · Graph · Calendar), then the
// live SESSIONS list (the agent's recent runs, tap to open), then an account footer
// with the "Student" plan pill + settings gear. Cloud-first wording throughout.

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
          <DrawerContent open={open} onClose={onClose} onNewChat={onNewChat} />
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

// Short "5m / 3h / 2d / Jul 8" stamp for a session row.
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return "now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The session dot mirrors the desktop status accents: one attention color for a
// run that needs review, everything else quiet.
function statusColor(status: MissionStatus, c: ThemeColors): string {
  if (status === "needs_review") return c.accent;
  if (status === "failed") return c.danger;
  if (status === "running" || status === "claimed") return c.info;
  if (status === "done") return c.good;
  return c.text3; // queued, cancelled
}

function DrawerContent({ open, onClose, onNewChat }: { open: boolean; onClose: () => void; onNewChat: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const email = session?.user?.email ?? "Sign in";
  const initial = (email[0] ?? "?").toUpperCase();
  const [sessions, setSessions] = useState<Mission[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Refresh the sessions list each time the drawer opens (cheap; keeps it current
  // without a realtime subscription). Guests get an empty list, never an error.
  useEffect(() => {
    if (!open || !session) return;
    let alive = true;
    void listMissions()
      .then((rows) => {
        if (alive) setSessions(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, session]);

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };
  const startNewSession = () => {
    onNewChat();
    onClose();
    router.push("/" as never);
  };

  const trimmed = query.trim().toLowerCase();
  const shownSessions = trimmed
    ? sessions.filter((mission) => mission.title.toLowerCase().includes(trimmed))
    : sessions;

  return (
    <View style={[styles.panelInner, { paddingTop: insets.top + space(2) }]}>
      {/* Title + search — the ChatGPT sidebar header. */}
      <View style={styles.brandRow}>
        <Text style={styles.brand}>Nemesis</Text>
        <Pressable
          style={({ pressed }) => [styles.searchBtn, (pressed || searchOpen) && styles.searchBtnActive]}
          onPress={() => setSearchOpen((v) => !v)}
          hitSlop={8}
          accessibilityLabel="Search sessions"
        >
          <SearchIcon size={19} color={searchOpen ? c.text : c.text2} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
        <View style={styles.navGroup}>
          <NavRow Icon={PlusIcon} label="New session" onPress={startNewSession} accent />
          <NavRow Icon={ChatIcon} label="Chat" onPress={() => go("/chat")} />
          <NavRow Icon={StudyIcon} label="Study" onPress={() => go("/study")} />
          <NavRow Icon={LibraryIcon} label="Library" onPress={() => go("/library")} />
          <NavRow Icon={GraphIcon} label="Graph" onPress={() => go("/graph")} />
          <NavRow Icon={CalendarIcon} label="Calendar" onPress={() => go("/calendar")} />
        </View>

        {searchOpen ? (
          <View style={styles.searchField}>
            <SearchIcon size={16} color={c.text3} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search sessions"
              placeholderTextColor={c.text3}
              autoFocus
              testID="drawer-search"
            />
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Sessions</Text>

        {shownSessions.length === 0 ? (
          <Text style={styles.emptySessions}>{trimmed ? "No matches" : "No sessions yet"}</Text>
        ) : (
          shownSessions.map((mission) => (
            <Pressable
              key={mission.id}
              testID={`drawer-session-${mission.id}`}
              style={({ pressed }) => [styles.sessionRow, pressed && styles.sessionRowPressed]}
              onPress={() => go(`/mission/${mission.id}`)}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor(mission.status, c) }]} />
              <Text style={styles.sessionTitle} numberOfLines={1}>{mission.title}</Text>
              <Text style={styles.sessionTime}>{relTime(mission.updated_at || mission.created_at)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* The account row IS the door to Settings (matching the desktop sidebar's
          lower-left account button). Sign out lives inside Settings. */}
      <Pressable
        testID="drawer-account"
        style={({ pressed }) => [styles.footer, { paddingBottom: insets.bottom + space(2.5) }, pressed && styles.footerPressed]}
        onPress={() => go("/settings")}
        accessibilityLabel="Account and settings"
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.footerName} numberOfLines={1}>{email}</Text>
        <View style={styles.planPill}>
          <Text style={styles.planPillText}>Student</Text>
        </View>
        <SettingsIcon size={16} color={c.text3} />
      </Pressable>
    </View>
  );
}

function NavRow({
  Icon,
  label,
  accent,
  onPress,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  accent?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <Pressable style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]} onPress={onPress}>
      <View style={styles.navIcon}>
        <Icon size={17} color={accent ? c.accent : c.text2} />
      </View>
      <Text style={[styles.navLabel, accent && styles.navLabelAccent]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    scrim: { backgroundColor: c.scrim },
    panel: { position: "absolute", top: 0, bottom: 0, left: 0, borderRightWidth: 1, borderRightColor: c.line, overflow: "hidden" },
    panelGlass: { flex: 1 },
    panelInner: { flex: 1 },
    scrollBody: { paddingBottom: space(2) },

    // Brand + search header (ChatGPT sidebar top).
    brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space(4), paddingBottom: space(3) },
    brand: { color: c.text, fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
    searchBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    searchBtnActive: { backgroundColor: c.surface },
    searchField: {
      flexDirection: "row", alignItems: "center", gap: space(2),
      marginHorizontal: space(3), marginBottom: space(2),
      paddingHorizontal: space(3), height: 38,
      backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line,
    },
    searchInput: { flex: 1, color: c.text, fontSize: 15, padding: 0 },

    // Nav — spacious rows (ChatGPT: ~44px, 16px white).
    navGroup: { paddingHorizontal: space(2), marginBottom: space(2) },
    navRow: {
      flexDirection: "row", alignItems: "center", gap: space(3),
      paddingVertical: space(2.75), paddingHorizontal: space(2.5), borderRadius: radius.md,
    },
    navRowPressed: { backgroundColor: c.surface },
    navIcon: { width: 24, alignItems: "center" },
    navLabel: { color: c.text, fontSize: 16, fontWeight: "500", flex: 1 },
    navLabelAccent: { color: c.text, fontWeight: "600" },

    // Section label — ChatGPT's plain bold header (e.g. "Pinned").
    sectionLabel: { color: c.text2, fontSize: 13, fontWeight: "700", paddingHorizontal: space(4), marginTop: space(3), marginBottom: space(1.5) },

    // Session rows.
    sessionRow: {
      flexDirection: "row", alignItems: "center", gap: space(2.5),
      paddingVertical: space(2.25), paddingHorizontal: space(3.5), marginHorizontal: space(2), borderRadius: radius.md,
    },
    sessionRowPressed: { backgroundColor: c.surface },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    sessionTitle: { flex: 1, color: c.text2, fontSize: 14.5, minWidth: 0 },
    sessionTime: { color: c.text3, fontSize: 11, fontVariant: ["tabular-nums"] },
    emptySessions: { color: c.text3, ...type.small, paddingHorizontal: space(4), paddingVertical: space(2) },

    // Account footer — avatar + email + Student pill + settings gear.
    footer: { flexDirection: "row", alignItems: "center", gap: space(2), borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: space(3.5), paddingTop: space(3) },
    footerPressed: { backgroundColor: c.surface },
    avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.line },
    avatarText: { color: c.text2, fontSize: 11, fontWeight: "700" },
    footerName: { flex: 1, color: c.text, fontSize: 12.5, fontWeight: "500", minWidth: 0 },
    planPill: { backgroundColor: c.accentFaint, borderRadius: radius.pill, paddingHorizontal: space(1.75), paddingVertical: 2 },
    planPillText: { color: c.accent, fontSize: 10, fontWeight: "700" },
  });
