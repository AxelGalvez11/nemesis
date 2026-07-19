import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { router, usePathname } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { listMissions, type Mission, type MissionStatus } from "@/api/missions";
import { listThreads, newThreadId } from "@/api/chat";
import type { ThreadSummary } from "@/lib/chat-threads";
import Svg, { Path } from "react-native-svg";
import { GlassSurface } from "./GlassSurface";
import { CalendarIcon, ChatIcon, GraphIcon, LibraryIcon, PlusIcon, SearchIcon, SettingsIcon, StudyIcon, type IconProps } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, shadow, space, type } from "@/theme/tokens";

// ChatGPT/Claude-style side drawer + the app-shell context that drives it. Built on RN's built-in
// Animated (no extra deps; renders identically under react-native-web for previews). The sidebar is
// always mounted UNDERNEATH the page; opening PUSHES the whole page (Slot + StatusBarBlur + TopBar) to
// the right by the panel width to reveal it, instead of sliding an overlay on top — see DrawerShell.
//
// The drawer IS the desktop sidebar on the phone: a compact nav (Chat · Study ·
// Library · Graph · Calendar), then the live CHATS history (owner: "chats should
// save to the sidebar") — each conversation persisted as its own thread — with the
// agent SESSIONS below it, then a solid "New chat" button and a settings gear.
// Tapping a chat reopens it (via the /chat?c=<id> route param).
//
// Owner call 2026-07-18: the drawer opens on a rightward swipe from ANYWHERE (plus
// tapping TopBar's menu button); on /graph and /calendar — which own their own
// horizontal drags — the swipe is restricted to the left edge so the child gesture
// keeps the interior. See DrawerShell's route-gated pan (EDGE_WIDTH / OPEN_THRESHOLD).

// On /graph and /calendar (which own horizontal drags) the open-swipe is restricted
// to a touch STARTING within this many points of the left edge, so the child gesture
// keeps the interior (react-native-gesture-handler's Pan `hitSlop`, points).
const EDGE_WIDTH = 28;
// How far the touch must travel horizontally before it flips the drawer open/closed.
const OPEN_THRESHOLD = 48;
// The moving page's facing (left) corner radius when the drawer is open. Owner call
// 2026-07-18: the SIDEBAR is SQUARE — only the page (chat/library/etc.) gets rounded
// corners, and rounder than before. ("New chat" button keeps radius.lg.)
const PAGE_RADIUS = 28;

interface ShellState {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Bumped by newSession(); the missions home focuses its composer when it changes. */
  resetNonce: number;
  /** Start a fresh agent session on the missions home (clear + focus its composer). */
  newSession: () => void;
  /** Open a brand-new chat thread (navigates to /chat with a fresh thread id). */
  newChat: () => void;
  /** The TopBar's center label: null → blank (owner call 2026-07-18, no logo/wordmark chrome); a string → that title. */
  headerTitle: string | null;
  setHeaderTitle: (title: string | null) => void;
  /** Optional right-side TopBar chrome — a screen's own action (Graph's gear, Chat's
   *  "…" menu). Rendered in the top-right slot, which paints ABOVE the status-bar blur,
   *  so it stays crisp and lines up exactly with the left menu button (owner 2026-07-18). */
  headerRight: ReactNode;
  setHeaderRight: (node: ReactNode) => void;
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
  const [headerTitle, setHeaderTitle] = useState<string | null>(null);
  const [headerRight, setHeaderRight] = useState<ReactNode>(null);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const newSession = useCallback(() => setResetNonce((n) => n + 1), []);
  // A fresh chat is a new thread id in the route param; the chat screen loads it
  // (empty) and persists it on the first send, so it shows up in this drawer.
  const newChat = useCallback(() => {
    router.push(`/chat?c=${newThreadId()}` as never);
  }, []);

  const value = useMemo<ShellState>(
    () => ({ open, openDrawer, closeDrawer, resetNonce, newSession, newChat, headerTitle, setHeaderTitle, headerRight, setHeaderRight }),
    [open, openDrawer, closeDrawer, resetNonce, newSession, newChat, headerTitle, headerRight],
  );

  return (
    <ShellContext.Provider value={value}>
      <DrawerShell open={open} onOpen={openDrawer} onClose={closeDrawer} onNewChat={newChat}>
        {children}
      </DrawerShell>
    </ShellContext.Provider>
  );
}

// The push shell: the sidebar sits UNDERNEATH at the left; the page slides right by
// the panel width to reveal it. One JS-driven progress value (0 closed -> 1 open)
// drives BOTH the page's translateX and its left-corner radius, so the rounded,
// shadowed edge only shows while open (no closed-state notch) — a native-driver
// transform can't co-animate borderRadius, so the whole thing stays on the JS driver
// (fine for a ~220ms one-shot). Opening/closing is a worklet + runOnJS trigger (same
// idiom as the Graph canvas pan); `triggered` fires it once per drag and resets on
// each new touch. Rightward opens, leftward closes; failOffsetY yields to scrolls.
function DrawerShell({
  open,
  onOpen,
  onClose,
  onNewChat,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNewChat: () => void;
  children: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const panelW = Math.min(330, Math.round((width || 380) * 0.86));

  // On the Graph canvas and Calendar the open-swipe is restricted to the left edge so
  // the child's own horizontal drag keeps the interior; elsewhere it opens from anywhere.
  const edgeOnly = pathname === "/graph" || pathname === "/calendar";

  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 240 : 190,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open, progress]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, panelW] });
  const edgeRadius = progress.interpolate({ inputRange: [0, 1], outputRange: [0, PAGE_RADIUS] });

  const triggered = useSharedValue(false);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .failOffsetY([-16, 16])
      .onStart(() => {
        triggered.value = false;
      })
      .onUpdate((event) => {
        if (triggered.value) return;
        if (!open && event.translationX > OPEN_THRESHOLD) {
          triggered.value = true;
          runOnJS(onOpen)();
        } else if (open && event.translationX < -OPEN_THRESHOLD) {
          triggered.value = true;
          runOnJS(onClose)();
        }
      });
    // Direction/zone gating is set per state so the pan claims only the drags it owns:
    // when open, a leftward drag closes; when closed, a rightward drag opens (edge-only
    // on /graph + /calendar). This keeps it from cancelling child gestures it shouldn't.
    if (open) pan.activeOffsetX(-14);
    else if (edgeOnly) pan.hitSlop({ left: 0, width: EDGE_WIDTH }).activeOffsetX(12);
    else pan.activeOffsetX(16);
    return pan;
  }, [open, edgeOnly, onOpen, onClose, triggered]);

  return (
    <View style={styles.shellRoot}>
      <View style={[styles.underPanel, { width: panelW }]} pointerEvents={open ? "auto" : "none"}>
        <GlassSurface style={styles.panelGlass} fallbackColor={c.bg2}>
          <DrawerContent open={open} onClose={onClose} onNewChat={onNewChat} />
        </GlassSurface>
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.pageShadow,
            { transform: [{ translateX }], borderTopLeftRadius: edgeRadius, borderBottomLeftRadius: edgeRadius },
          ]}
        >
          <Animated.View
            style={[styles.pageClip, { borderTopLeftRadius: edgeRadius, borderBottomLeftRadius: edgeRadius }]}
          >
            {children}
            {open ? (
              <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
            ) : null}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// Short "5m / 3h / 2d / Jul 8" stamp for a row.
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
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [chats, setChats] = useState<ThreadSummary[]>([]);
  const [sessions, setSessions] = useState<Mission[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Refresh chats + sessions each time the drawer opens (cheap; keeps it current).
  useEffect(() => {
    if (!open || !uid) return;
    let alive = true;
    void listThreads(uid).then((rows) => alive && setChats(rows)).catch(() => {});
    void listMissions().then((rows) => alive && setSessions(rows)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, uid]);

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const trimmed = query.trim().toLowerCase();
  const shownChats = trimmed ? chats.filter((chat) => chat.title.toLowerCase().includes(trimmed)) : chats;

  return (
    <View style={[styles.panelInner, { paddingTop: insets.top + space(2) }]}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>Nemesis</Text>
        <Pressable
          style={({ pressed }) => [styles.searchBtn, (pressed || searchOpen) && styles.searchBtnActive]}
          onPress={() => setSearchOpen((v) => !v)}
          hitSlop={8}
          accessibilityLabel="Search chats"
        >
          <SearchIcon size={19} color={searchOpen ? c.text : c.text2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.navGroup}>
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
              placeholder="Search chats"
              placeholderTextColor={c.text3}
              autoFocus
              testID="drawer-search"
            />
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Chats</Text>
        {shownChats.length === 0 ? (
          <Text style={styles.emptyRows}>{trimmed ? "No matches" : "No chats yet"}</Text>
        ) : (
          shownChats.map((chat) => (
            <Pressable
              key={chat.id}
              testID={`drawer-chat-${chat.id}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => go(`/chat?c=${chat.id}`)}
            >
              {chat.pinned ? <PinIcon size={12} color={c.accent} /> : null}
              <Text style={styles.rowTitle} numberOfLines={1}>{chat.title}</Text>
              <Text style={styles.rowTime}>{relTime(chat.updatedAt)}</Text>
            </Pressable>
          ))
        )}

        {sessions.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Sessions</Text>
            {sessions.map((mission) => (
              <Pressable
                key={mission.id}
                testID={`drawer-session-${mission.id}`}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => go(`/mission/${mission.id}`)}
              >
                <View style={[styles.statusDot, { backgroundColor: statusColor(mission.status, c) }]} />
                <Text style={styles.rowTitle} numberOfLines={1}>{mission.title}</Text>
                <Text style={styles.rowTime}>{relTime(mission.updated_at || mission.created_at)}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* Footer: a single bottom row — a SOLID "New chat" button lower-left, gear-only
          Settings lower-right (owner call 2026-07-18: no identity row, no divider).
          Settings deliberately skips onClose(): unlike go() (used by every nav/chat/
          session row, which SHOULD close the drawer on navigation), pushing /settings
          without closing means the drawer stays `open` underneath and the modal sheet
          slides up OVER it — so dismissing Settings lands you right back on the still-
          open drawer instead of a closed one. See TopBar.tsx / settings.tsx. */}
      <View style={[styles.footerWrap, { paddingBottom: insets.bottom + space(2.5) }]}>
        <View style={styles.bottomRow}>
          <Pressable
            style={({ pressed }) => [styles.newChatBtn, pressed && styles.newChatBtnPressed]}
            onPress={() => {
              onNewChat();
              onClose();
            }}
            testID="drawer-new-chat"
            accessibilityLabel="New chat"
          >
            <PlusIcon size={17} color={c.accent} />
            <Text style={styles.newChatText}>New chat</Text>
          </Pressable>

          <GlassSurface style={styles.settingsBtn}>
            <Pressable
              style={styles.settingsBtnInner}
              onPress={() => router.push("/settings" as never)}
              testID="drawer-settings"
              accessibilityLabel="Settings"
              hitSlop={8}
            >
              <SettingsIcon size={19} color={c.text2} />
            </Pressable>
          </GlassSurface>
        </View>
      </View>
    </View>
  );
}

function NavRow({ Icon, label, onPress }: { Icon: ComponentType<IconProps>; label: string; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <Pressable style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]} onPress={onPress}>
      <View style={styles.navIcon}>
        <Icon size={17} color={c.text2} />
      </View>
      <Text style={styles.navLabel}>{label}</Text>
    </Pressable>
  );
}

/** Small pushpin marking a pinned chat row. */
function PinIcon({ size = 12, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 17v5 M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Push shell: the sidebar sits UNDER the page at the left; the page slides right to
    // reveal it. shellRoot's bg shows only behind the page's rounded left edge when open
    // (near-black, reads as background).
    shellRoot: { flex: 1, backgroundColor: c.bg, overflow: "hidden" },
    // Square (owner 2026-07-18: the sidebar has no rounded corners). overflow:hidden still
    // clips the glass to the panel rect; with no rounded bottom-right corner the footer gear
    // is no longer nipped on its right side (owner: the gear was cutting off).
    underPanel: {
      position: "absolute", top: 0, bottom: 0, left: 0, overflow: "hidden",
    },
    // The moving page. pageShadow carries the drop shadow (needs an opaque bg and NO
    // overflow clip so the shadow can bleed onto the sidebar); pageClip rounds the
    // actual content. Both round only the LEFT (facing) corners via edgeRadius.
    pageShadow: { flex: 1, backgroundColor: c.bg, ...shadow.raise },
    pageClip: { flex: 1, overflow: "hidden" },
    panelGlass: { flex: 1 },
    panelInner: { flex: 1 },
    // flex:1 so the ScrollView fills the gap between the brand row and the footer — the
    // footer then pins to the BOTTOM (owner 2026-07-18: bottom buttons had empty space
    // below them) instead of floating up beneath short content.
    scroll: { flex: 1 },
    scrollBody: { paddingBottom: space(2) },

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

    navGroup: { paddingHorizontal: space(2), marginBottom: space(2) },
    navRow: {
      flexDirection: "row", alignItems: "center", gap: space(3),
      paddingVertical: space(2.75), paddingHorizontal: space(2.5), borderRadius: radius.md,
    },
    navRowPressed: { backgroundColor: c.surface },
    navIcon: { width: 24, alignItems: "center" },
    navLabel: { color: c.text, fontSize: 16, fontWeight: "500", flex: 1 },

    sectionLabel: { color: c.text2, fontSize: 13, fontWeight: "700", paddingHorizontal: space(4), marginTop: space(3), marginBottom: space(1.5) },

    // Chat + session rows share one compact row style.
    row: {
      flexDirection: "row", alignItems: "center", gap: space(2.5),
      paddingVertical: space(2.25), paddingHorizontal: space(3.5), marginHorizontal: space(2), borderRadius: radius.md,
    },
    rowPressed: { backgroundColor: c.surface },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    rowTitle: { flex: 1, color: c.text2, fontSize: 14.5, minWidth: 0 },
    rowTime: { color: c.text3, fontSize: 11, fontVariant: ["tabular-nums"] },
    emptyRows: { color: c.text3, ...type.small, paddingHorizontal: space(4), paddingVertical: space(2) },

    // Footer block — a single bottom row (New chat lower-left, Settings gear
    // lower-right). No identity row, no divider (owner call 2026-07-18).
    footerWrap: { paddingTop: space(2.5) },
    bottomRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingLeft: space(3.5), paddingRight: space(4.5), paddingTop: space(1),
    },
    // Solid (not glass) squarish button that hugs its icon + label.
    newChatBtn: {
      flexDirection: "row", alignItems: "center", gap: space(1.75),
      paddingVertical: space(2.5), paddingHorizontal: space(3.5),
      backgroundColor: c.raised, borderRadius: radius.lg,
    },
    newChatBtnPressed: { backgroundColor: c.surface2 },
    newChatText: { color: c.accent, fontSize: 15, fontWeight: "600" },

    // The gear sits fully inside the panel. Now that the sidebar is square (no rounded
    // bottom-right corner) the clip is gone; bottomRow's paddingRight is just breathing room.
    settingsBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line },
    settingsBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  });
