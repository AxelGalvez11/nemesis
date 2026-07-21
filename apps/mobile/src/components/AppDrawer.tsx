import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from "react";
import { Animated, Easing, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { router, usePathname } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { listThreads, newThreadId } from "@/api/chat";
import type { ThreadSummary } from "@/lib/chat-threads";
import Svg, { Path } from "react-native-svg";
import { CalendarIcon, GraphIcon, LibraryIcon, NotebookIcon, PluginIcon, PlusIcon, SearchIcon, SettingsIcon, StudyIcon, type IconProps } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// ChatGPT/Claude-style side drawer + the app-shell context that drives it. Built on RN's built-in
// Animated (no extra deps; renders identically under react-native-web for previews). The sidebar is
// always mounted UNDERNEATH the page; opening PUSHES the whole page (Slot + StatusBarBlur + TopBar) to
// the right by the panel width to reveal it, instead of sliding an overlay on top — see DrawerShell.
//
// The drawer IS the desktop sidebar on the phone: a compact nav (Chat · Study ·
// Library · Graph · Calendar), then the live CHATS history (owner: "chats should
// save to the sidebar") — each conversation persisted as its own thread — then a
// solid "New chat" button and a settings gear. Tapping a chat reopens it (via the
// /chat?c=<id> route param). Mac-dispatch "sessions" (the missions feature) are
// removed from the phone entirely (owner call 2026-07-20; see
// docs/design/nemesis-cloud-first-phone-2026-07.md §10) — this drawer no longer
// lists them.
//
// Owner call 2026-07-18: the drawer opens on a rightward swipe from ANYWHERE (plus
// tapping TopBar's menu button); on /graph and /calendar — which own their own
// horizontal drags — the swipe is restricted to the left edge so the child gesture
// keeps the interior. See DrawerShell's route-gated pan (EDGE_WIDTH / OPEN_THRESHOLD).

// On /graph and /calendar (which own horizontal drags) the open-swipe is restricted
// to a touch STARTING within this many points of the left edge, so the child gesture
// keeps the interior (react-native-gesture-handler's Pan `hitSlop`, points).
const EDGE_WIDTH = 28;
// The moving page's facing (left) corner radius when the drawer is open. Owner call
// 2026-07-18: the SIDEBAR is SQUARE — only the page (chat/library/etc.) gets rounded
// corners. Owner 2026-07-20: ChatGPT-round — device-corner scale, paired with
// borderCurve:"continuous" (Apple squircle) on pageShadow/pageClip below.
const PAGE_RADIUS = 48;

interface ShellState {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
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
  const [headerTitle, setHeaderTitle] = useState<string | null>(null);
  const [headerRight, setHeaderRight] = useState<ReactNode>(null);
  // Opening the drawer always drops the keyboard (owner 2026-07-20: swiping to the
  // sidebar should put the keyboard away) — covers the TopBar menu button; the swipe
  // path dismisses in DrawerShell's pan onStart so it drops the moment the drag begins.
  const openDrawer = useCallback(() => {
    Keyboard.dismiss();
    setOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  // A fresh chat is a new thread id in the route param; the chat screen loads it
  // (empty) and persists it on the first send, so it shows up in this drawer.
  const newChat = useCallback(() => {
    router.push(`/chat?c=${newThreadId()}` as never);
  }, []);

  const value = useMemo<ShellState>(
    () => ({ open, openDrawer, closeDrawer, newChat, headerTitle, setHeaderTitle, headerRight, setHeaderRight }),
    [open, openDrawer, closeDrawer, newChat, headerTitle, headerRight],
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

  // Settle the drawer to fully open/closed from WHEREVER the finger left it —
  // used both by the open-state effect and by a released drag that snaps back
  // to the same state (where the effect wouldn't re-fire).
  const animateTo = useCallback(
    (target: boolean) => {
      Animated.timing(progress, {
        toValue: target ? 1 : 0,
        duration: target ? 240 : 190,
        easing: target ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [progress],
  );
  useEffect(() => {
    animateTo(open);
  }, [open, animateTo]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, panelW] });
  const edgeRadius = progress.interpolate({ inputRange: [0, 1], outputRange: [0, PAGE_RADIUS] });

  // Owner 2026-07-20: the page FOLLOWS the finger. The pan runs on the JS thread
  // (`runOnJS(true)`) so each move writes `progress` directly — the same JS-driven
  // value the transforms already ride (borderRadius can't native-animate anyway).
  // Release settles to the nearest state, with a velocity fling overriding position.
  const gesture = useMemo(() => {
    const startFrom = open ? 1 : 0;
    const pan = Gesture.Pan()
      .runOnJS(true)
      .failOffsetY([-16, 16])
      .onStart(() => {
        progress.stopAnimation();
        // Drawer drag begins -> keyboard goes away immediately (owner 2026-07-20),
        // so the page isn't half-slid over a raised keyboard.
        if (!open) Keyboard.dismiss();
      })
      .onUpdate((event) => {
        const next = Math.min(1, Math.max(0, startFrom + event.translationX / panelW));
        progress.setValue(next);
      })
      .onEnd((event) => {
        const at = startFrom + event.translationX / panelW;
        const fling = Math.abs(event.velocityX) > 420;
        const target = fling ? event.velocityX > 0 : at > 0.5;
        if (target !== open) {
          if (target) onOpen();
          else onClose();
        } else {
          animateTo(open); // snapped back — state unchanged, settle manually
        }
      });
    // Direction/zone gating is set per state so the pan claims only the drags it owns:
    // when open, a leftward drag closes; when closed, a rightward drag opens (edge-only
    // on /graph + /calendar). This keeps it from cancelling child gestures it shouldn't.
    if (open) pan.activeOffsetX(-14);
    else if (edgeOnly) pan.hitSlop({ left: 0, width: EDGE_WIDTH }).activeOffsetX(12);
    else pan.activeOffsetX(16);
    return pan;
  }, [open, edgeOnly, onOpen, onClose, progress, panelW, animateTo]);

  return (
    <View style={styles.shellRoot}>
      <View style={[styles.underPanel, { width: panelW }]} pointerEvents={open ? "auto" : "none"}>
        {/* Solid, borderless (owner 2026-07-19): a glass panel here drew a bright material
            edge that competed with the page's rounded corners. A plain dark fill has no
            edge, so the pushed page's corners + shadow read cleanly against it. */}
        <View style={styles.panelSolid}>
          <DrawerContent open={open} onClose={onClose} onNewChat={onNewChat} />
        </View>
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

function DrawerContent({ open, onClose, onNewChat }: { open: boolean; onClose: () => void; onNewChat: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [chats, setChats] = useState<ThreadSummary[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Refresh chats each time the drawer opens (cheap; keeps it current).
  useEffect(() => {
    if (!open || !uid) return;
    let alive = true;
    void listThreads(uid).then((rows) => alive && setChats(rows)).catch(() => {});
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
          <NavRow Icon={StudyIcon} label="Study" onPress={() => go("/study")} />
          <NavRow Icon={LibraryIcon} label="Library" onPress={() => go("/library")} />
          <NavRow Icon={NotebookIcon} label="Notebooks" onPress={() => go("/notebooks")} />
          <NavRow Icon={GraphIcon} label="Graph" onPress={() => go("/graph")} />
          <NavRow Icon={CalendarIcon} label="Calendar" onPress={() => go("/calendar")} />
          <NavRow Icon={PluginIcon} label="Plugins" onPress={() => go("/plugins")} />
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

          <Pressable
            style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
            onPress={() => router.push("/settings" as never)}
            testID="drawer-settings"
            accessibilityLabel="Settings"
            hitSlop={8}
          >
            <SettingsIcon size={20} color={c.text2} />
          </Pressable>
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
    // The moving page (opaque backing); pageClip rounds the actual content. Both
    // round only the LEFT (facing) corners via edgeRadius. NO drop shadow — final
    // owner call 2026-07-20 after two tuning rounds (50% black, then faint themed):
    // ANY shadow paints some dark gray on the sidebar at the seam, and the owner
    // wants that edge completely clean. The bg (page) vs bg2 (sidebar) tone
    // difference alone separates the layers, ChatGPT-style. Don't re-add a shadow
    // here in any strength.
    pageShadow: { flex: 1, backgroundColor: c.bg, borderCurve: "continuous" },
    pageClip: { flex: 1, overflow: "hidden", borderCurve: "continuous" },
    panelSolid: { flex: 1, backgroundColor: c.bg2 },
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
    // Borderless (owner 2026-07-20: "remove the sidebar borders") — fills only.
    searchField: {
      flexDirection: "row", alignItems: "center", gap: space(2),
      marginHorizontal: space(3), marginBottom: space(2),
      paddingHorizontal: space(3), height: 40,
      backgroundColor: c.surface, borderRadius: radius.md,
    },
    searchInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },

    navGroup: { paddingHorizontal: space(2), marginBottom: space(2) },
    navRow: {
      flexDirection: "row", alignItems: "center", gap: space(3),
      paddingVertical: space(2.75), paddingHorizontal: space(2.5), borderRadius: radius.md,
    },
    navRowPressed: { backgroundColor: c.surface },
    navIcon: { width: 26, alignItems: "center" },
    // Sidebar text rides the shared type ramp (owner 2026-07-20: bigger + standardized).
    navLabel: { color: c.text, fontSize: type.bodyStrong.fontSize, fontWeight: "500", flex: 1 },

    sectionLabel: { color: c.text2, fontSize: type.micro.fontSize, fontWeight: "700", paddingHorizontal: space(4), marginTop: space(3), marginBottom: space(1.5) },

    // Chat rows share one compact row style.
    row: {
      flexDirection: "row", alignItems: "center", gap: space(2.5),
      paddingVertical: space(2.5), paddingHorizontal: space(3.5), marginHorizontal: space(2), borderRadius: radius.md,
    },
    rowPressed: { backgroundColor: c.surface },
    rowTitle: { flex: 1, color: c.text2, fontSize: type.small.fontSize + 1, minWidth: 0 },
    rowTime: { color: c.text3, fontSize: type.micro.fontSize, fontVariant: ["tabular-nums"] },
    emptyRows: { color: c.text3, ...type.small, paddingHorizontal: space(4), paddingVertical: space(2) },

    // Footer block — a single bottom row (New chat lower-left, Settings gear
    // lower-right). No identity row, no divider (owner call 2026-07-18).
    footerWrap: { paddingTop: space(2.5) },
    bottomRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      // Extra right padding keeps the gear comfortably clear of the pushed page's edge
      // (owner: the gear was "cutting out to the right"; kept after the shadow's removal).
      paddingLeft: space(3.5), paddingRight: space(6), paddingTop: space(1),
    },
    // Solid (not glass) squarish button that hugs its icon + label.
    newChatBtn: {
      flexDirection: "row", alignItems: "center", gap: space(1.75),
      paddingVertical: space(2.5), paddingHorizontal: space(3.5),
      backgroundColor: c.raised, borderRadius: radius.lg,
    },
    newChatBtnPressed: { backgroundColor: c.surface2 },
    newChatText: { color: c.accent, fontSize: type.small.fontSize + 1, fontWeight: "600" },

    // The gear is a PLAIN icon like the rest of the sidebar — no glass circle
    // (owner 2026-07-20: the white disc read as a floating blob on the light
    // sidebar). Press feedback matches searchBtn's quiet fill.
    settingsBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    settingsBtnPressed: { backgroundColor: c.surface },
  });
