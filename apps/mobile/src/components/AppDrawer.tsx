import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from "react";
import { Alert, Animated, AppState, Easing, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { router, usePathname } from "expo-router";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming, Easing as ReEasing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { deleteThread, listThreads, newThreadId, pinThread, renameThread } from "@/api/chat";
import type { ThreadSummary } from "@/lib/chat-threads";
// The hold haptic now fires inside useRowDrag, with the gesture that earns it.
import { hapticDrawerOpened } from "@/lib/haptics";
import { CHAT_RETIRED } from "@/lib/retired-surfaces";
import { NAV_DESTINATIONS } from "@/lib/nav-destinations";
import Svg, { Path } from "react-native-svg";
import { MiniMenu, type MenuAnchor } from "./MiniMenu";
import { useRowDrag } from "./useRowDrag";
import { TextPromptSheet, type RowAction } from "./RowActionSheets";
// The destination glyphs moved to `lib/nav-destinations.ts` with the rows they label; what is
// left here is the drawer's own chrome (its chevrons, its search, its gear).
import { ChevronIcon, SearchIcon, SettingsIcon, type IconProps } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// ChatGPT/Claude-style side drawer + the app-shell context that drives it. Built on RN's built-in
// Animated (no extra deps; renders identically under react-native-web for previews). The sidebar is
// always mounted UNDERNEATH the page; opening PUSHES the whole page (Slot + StatusBarBlur + TopBar) to
// the right by the panel width to reveal it, instead of sliding an overlay on top — see DrawerShell.
//
// The drawer IS the desktop sidebar on the phone, and it now lists exactly what that sidebar
// lists: New canvas · Library · Calendar · Stats, drawn from `lib/nav-destinations.ts`, plus a
// settings gear. See that file for why the two lists are kept literally aligned.
//
// 🔴 THE CHATS HISTORY IS CLOSED, NOT DELETED (`lib/retired-surfaces.ts`). The drawer used to
// carry the live list of threads under the nav ("chats should save to the sidebar"), each
// reopened through the `/chat?c=<id>` param, plus a solid "New chat" pill in the footer. The web
// sidebar carries no such list and says why (owner 2026-08-13, §L): students are managing bodies
// of knowledge, not recovering a conversation from three weeks ago. All of that code — the rows,
// the search, the drag-to-reorder, the rename/delete menus — is still below and still works if
// `CHAT_RETIRED` is flipped back.
//
// Mac-dispatch "sessions" (the missions feature) were removed from the phone entirely (owner call
// 2026-07-20; see docs/design/nemesis-cloud-first-phone-2026-07.md §10).
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
  /** A CONTROL in the TopBar's center slot, in place of the title — Study puts
   *  its Cards/Tests/Mindmaps dropdown here (owner 2026-07-22: "remove 'study'
   *  text and move the toggle in its place"), buying back the whole row the
   *  switcher used to occupy under the bar. Wins over headerTitle when both
   *  are set, and unlike the title slot it accepts taps. */
  headerCenter: ReactNode;
  setHeaderCenter: (node: ReactNode) => void;
  /** Optional right-side TopBar chrome — a screen's own action (Graph's gear, Chat's
   *  "…" menu). Rendered in the top-right slot, which paints ABOVE the status-bar blur,
   *  so it stays crisp and lines up exactly with the left menu button (owner 2026-07-18). */
  headerRight: ReactNode;
  setHeaderRight: (node: ReactNode) => void;
  /** Full-screen mode: the page owns the whole display. The TopBar and the
   *  status-bar blur stop rendering and the drawer's open-swipe is switched
   *  OFF entirely — not merely confirmed like drawerOpenGuard, which still
   *  lets the sidebar take over the screen. Chat turns this on for record mode
   *  (owner 2026-07-22: "the chat page should become full screen, removing the
   *  ability to swipe away to sidebar"). The way out is the composer's own ✕,
   *  which stays on screen throughout. */
  immersive: boolean;
  setImmersive: (immersive: boolean) => void;
}

const ShellContext = createContext<ShellState | undefined>(undefined);

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within DrawerProvider");
  return ctx;
}

/** While an inline recording is live on the chat screen, the drawer is the one
 * navigation surface that can silently destroy it (open drawer → tap another
 * thread/New chat → the chat screen's reset effect unmounts RecordSession and
 * the unsaved transcript is gone — review finding 2026-07-21). The chat screen
 * installs a confirm-gate here while a recording is live; openDrawer routes
 * every open path (menu button AND edge swipe, both funnel through onOpen)
 * through it. Module-scoped holder like note-tabs' noteNavHolder; it carries a
 * callback only (no user data), and the chat screen's effect cleanup clears it
 * whenever recording ends or the screen unmounts. */
export const drawerOpenGuard = {
  current: null as null | ((proceed: () => void) => void),
};

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [headerTitle, setHeaderTitle] = useState<string | null>(null);
  const [headerCenter, setHeaderCenter] = useState<ReactNode>(null);
  const [headerRight, setHeaderRight] = useState<ReactNode>(null);
  const [immersive, setImmersive] = useState(false);
  // Opening the drawer always drops the keyboard (owner 2026-07-20: swiping to the
  // sidebar should put the keyboard away) — covers the TopBar menu button; the swipe
  // path dismisses in DrawerShell's pan onStart so it drops the moment the drag begins.
  // While a recording is live, the open routes through drawerOpenGuard's
  // confirm first (see its doc comment) — declining leaves the drawer shut.
  const openDrawer = useCallback(() => {
    const finishOpen = () => {
      Keyboard.dismiss();
      // Inside finishOpen, not above it: a recording-guard prompt can decline the
      // open, and a tap for a drawer that never appeared would be a lie.
      hapticDrawerOpened();
      setOpen(true);
    };
    const guard = drawerOpenGuard.current;
    if (guard) guard(finishOpen);
    else finishOpen();
  }, []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  // A fresh chat is a new thread id in the route param; the chat screen loads it
  // (empty) and persists it on the first send, so it shows up in this drawer.
  const newChat = useCallback(() => {
    router.push(`/chat?c=${newThreadId()}` as never);
  }, []);

  const value = useMemo<ShellState>(
    () => ({
      open, openDrawer, closeDrawer, newChat,
      headerTitle, setHeaderTitle,
      headerCenter, setHeaderCenter,
      headerRight, setHeaderRight,
      immersive, setImmersive,
    }),
    [open, openDrawer, closeDrawer, newChat, headerTitle, headerCenter, headerRight, immersive],
  );

  return (
    <ShellContext.Provider value={value}>
      <DrawerShell open={open} onOpen={openDrawer} onClose={closeDrawer} onNewChat={newChat} immersive={immersive}>
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
  immersive,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNewChat: () => void;
  /** Switches the open-swipe off outright — see ShellState.immersive. */
  immersive: boolean;
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
    // Full-screen page: no swipe to the sidebar at all. Gated only while the
    // drawer is CLOSED — if it were somehow open, killing the gesture would
    // trap the student behind a sidebar they can't swipe back (the tap-catcher
    // still works, but a dead drag reads as a frozen app).
    if (immersive && !open) pan.enabled(false);
    return pan;
  }, [open, edgeOnly, immersive, onOpen, onClose, progress, panelW, animateTo]);

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
            {/* Rides the SAME `progress` value as the push, so the page greys in
                step with the finger rather than snapping at the settled state.
                pointerEvents="none" keeps the tap-catcher below reachable. */}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: c.pageDim, opacity: progress }]}
            />
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
  // Pinned chats get their own collapsible block above the main list (owner
  // 2026-07-23). Expanded by default; the chevron rotates open exactly like the
  // folder rows on the Library/Study trees.
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  // …and so does the main Chats list (owner 2026-07-23: "chats should also have
  // that downward arrow for collapse like pin does").
  const [chatsCollapsed, setChatsCollapsed] = useState(false);
  // Long-press a chat row → a mini menu (owner 2026-07-23: "hold down on chats
  // in the side bar to open up minimenu for delete chat, rename, pin", then
  // "should bring out a minimenu not a popup from the bottom"). The first pass
  // reused the Library/Study bottom sheet; this now opens at the touch point.
  // `actionAt` is where the press landed, in window coordinates.
  const [actionTarget, setActionTarget] = useState<ThreadSummary | null>(null);
  const [actionAt, setActionAt] = useState<MenuAnchor | null>(null);
  const [renameTarget, setRenameTarget] = useState<ThreadSummary | null>(null);
  // Every chat currently on screen, so the hold gesture can find the one it
  // picked up by id. Rebuilt below from the same list the rows render from.
  const chatsByIdRef = useRef(new Map<string, ThreadSummary>());

  // Count of in-flight local mutations (pin/rename/delete). A refresh while one
  // is still writing to the cloud would re-read the STALE row and
  // mergeCloudThreadList (cloud-wins) would revert the optimistic change — the
  // just-deleted chat reappears, or a rename/pin snaps back (review finding). So
  // every refresh path skips while this is non-zero.
  const pendingRef = useRef(0);
  const withPending = useCallback(async (work: () => Promise<unknown>) => {
    pendingRef.current += 1;
    try {
      await work();
    } finally {
      pendingRef.current -= 1;
    }
  }, []);
  const refresh = useCallback(() => {
    if (!uid || pendingRef.current > 0) return;
    void listThreads(uid).then(setChats).catch(() => {});
  }, [uid]);

  // Refresh chats each time the drawer opens (cheap; keeps it current) — unless
  // a local write is still in flight (see pendingRef).
  useEffect(() => {
    if (!open || !uid || pendingRef.current > 0) return;
    let alive = true;
    void listThreads(uid).then((rows) => alive && setChats(rows)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, uid]);

  // …and again whenever the app returns to the foreground while the drawer is
  // open, so a chat started on the web (or another device) appears without
  // having to close and reopen the sidebar (owner 2026-07-23: "chats still
  // arent synced with the webapp"). This is the drawer's half of the
  // refresh-on-foreground story; the open chat thread refreshes itself the same
  // way — see chat.tsx.
  useEffect(() => {
    if (!open || !uid) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [open, uid, refresh]);

  // The long-press menu / rename dialog must not survive the drawer closing:
  // dismissing via the dimmed page taps the drawer's OWN close-catcher, not the
  // sheet's, so without this the menu would silently reappear on the next open.
  useEffect(() => {
    if (!open) {
      setActionTarget(null);
      setRenameTarget(null);
    }
  }, [open]);

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const togglePin = (chat: ThreadSummary) => {
    setActionTarget(null);
    const next = !chat.pinned;
    // Optimistic — the row jumps between the Pinned block and the main list at
    // once; the cloud write is best-effort. withPending blocks a refresh from
    // reverting it before the write lands.
    setChats((rows) => rows.map((row) => (row.id === chat.id ? { ...row, pinned: next } : row)));
    if (uid) void withPending(() => pinThread(uid, chat.id, next));
  };

  const confirmDelete = (chat: ThreadSummary) => {
    setActionTarget(null);
    Alert.alert("Delete chat?", `"${chat.title}" will be removed from your chats on every device.`, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          setChats((rows) => rows.filter((row) => row.id !== chat.id));
          if (uid) void withPending(() => deleteThread(uid, chat.id));
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  };

  const confirmRename = (value: string) => {
    const chat = renameTarget;
    setRenameTarget(null);
    const clean = value.trim();
    if (!chat || !uid || !clean) return;
    setChats((rows) => rows.map((row) => (row.id === chat.id ? { ...row, title: clean } : row)));
    void withPending(() => renameThread(uid, chat.id, clean));
  };

  // The SAME hold gesture the Library and Study trees use (owner 2026-08-01:
  // "the entire card should appear to be picked up, same goes for side bar
  // chats"). Adopting it rather than keeping the row's own onLongPress is what
  // makes the hold two-phase: the Pan activates at HOLD_MS — the moment the row
  // lifts — and the menu opens on RELEASE. A Pressable's onLongPress only ever
  // fires once, so there was no "still holding" state to draw.
  //
  // 🔴 THE ROW'S onLongPress HAD TO GO WITH IT, or every hold would open two
  // menus. useRowDrag's own header says so; it is worth repeating here because
  // this is the file that had one.
  //
  // No DragChip here, unlike the trees. That card is positioned in WINDOW
  // coordinates, and this panel is ~330pt wide with its overflow clipped — the
  // same reason the MiniMenu below has to escape into a Modal. The row lifts
  // where it sits instead, which is legible in a list this narrow and needs no
  // Modal to appear mid-gesture.
  const rowDrag = useRowDrag({
    // Nothing to drop onto and nothing to reorder: a chat list is flat and
    // ordered by recency. Only the hold half of this hook is in use.
    onDrop: () => {},
    onHold: (key, x, y) => {
      const chat = chatsByIdRef.current.get(key);
      if (!chat) return;
      // Window coordinates, which is what MiniMenu wants — this panel's own
      // coordinate space would put the menu in the wrong place the moment it
      // escapes into the Modal.
      setActionAt({ x, y });
      setActionTarget(chat);
    },
  });

  const rowActions: RowAction[] = actionTarget
    ? [
        { key: "pin", label: actionTarget.pinned ? "Unpin" : "Pin", onPress: () => togglePin(actionTarget) },
        {
          key: "rename",
          label: "Rename",
          onPress: () => {
            const target = actionTarget;
            setActionTarget(null);
            setRenameTarget(target);
          },
        },
        { key: "delete", label: "Delete", destructive: true, onPress: () => confirmDelete(actionTarget) },
      ]
    : [];

  const trimmed = query.trim().toLowerCase();
  const shownChats = trimmed ? chats.filter((chat) => chat.title.toLowerCase().includes(trimmed)) : chats;
  const pinnedChats = shownChats.filter((chat) => chat.pinned);
  const otherChats = shownChats.filter((chat) => !chat.pinned);
  chatsByIdRef.current = new Map(shownChats.map((chat) => [chat.id, chat]));

  const renderChatRow = (chat: ThreadSummary) => (
    <ChatRow
      key={chat.id}
      chat={chat}
      lifted={rowDrag.activeKey === chat.id}
      gesture={rowDrag.gestureFor(chat.id, {
        // Chats have no folders, so there is nowhere to drag one TO. The hold
        // still has to look like it did something, which is what `lift` is for.
        canDropOn: () => false,
        draggable: false,
        lift: true,
      })}
      onPress={() => go(`/chat?c=${chat.id}`)}
      styles={styles}
    />
  );

  return (
    <View style={[styles.panelInner, { paddingTop: insets.top + space(2) }]}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>Nemesis</Text>
        {/* No "+" here (owner 2026-07-24: "remove the '+' from the main
            sidebar"). It was added the day before for "users cannot create a new
            note from the library sidebar", and the CONTROL is what's gone — you
            can still make a note from the "+" on the note screen's bottom bar and
            from the Library screen, which is also where you can see which folder
            it lands in. */}
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
        // Bottom padding tracks the floating Chat pill + gear's REAL footprint
        // (insets.bottom + 10 gap + 46 button + breathing room) — a flat
        // constant undershot it on home-indicator iPhones and the last chat
        // row slid under the buttons (review finding, 2026-07-21).
        contentContainerStyle={{ paddingBottom: insets.bottom + space(2.5) + 46 + space(4) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 🔴 DRAWN FROM `NAV_DESTINATIONS`, NOT WRITTEN OUT HERE. These four rows are the same
            product decision as the web app's `SIDEBAR_NAV`, and the list lives in
            `lib/nav-destinations.ts` so the two can be compared side by side. Rows written inline
            here is how the phone drifted from the web in the first place. */}
        <View style={styles.navGroup}>
          {NAV_DESTINATIONS.map((dest) => (
            <NavRow Icon={dest.Icon} key={dest.id} label={dest.label} onPress={() => go(dest.route)} />
          ))}
        </View>

        {/* 🔴 THE CHAT LIST IS CLOSED, NOT DELETED — see `lib/retired-surfaces.ts`.
            The web sidebar carries no conversation list and says why (owner 2026-08-13, §L):
            "eventually the sidebar becomes a giant chronological dump. Nemesis users aren't
            primarily trying to recover a conversation from three weeks ago. They're managing
            BODIES OF KNOWLEDGE." The rows, their search, their drag-to-reorder and their
            rename/delete menus all still work if this flag is flipped back. */}
        {CHAT_RETIRED ? null : (
        <>
        {searchOpen ? (
          <View style={styles.searchField}>
            <SearchIcon size={16} color={c.text3} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats"
              placeholderTextColor={c.textHint}
              autoFocus
              testID="drawer-search"
            />
          </View>
        ) : null}

        {pinnedChats.length > 0 ? (
          <>
            <Pressable
              style={({ pressed }) => [styles.sectionHeader, pressed && styles.rowPressed]}
              onPress={() => setPinnedCollapsed((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Pinned chats"
              accessibilityState={{ expanded: !pinnedCollapsed }}
              testID="drawer-pinned-header"
            >
              <View style={pinnedCollapsed ? undefined : styles.chevronOpen}>
                <ChevronIcon size={12} color={c.text2} strokeWidth={2.2} />
              </View>
              <Text style={styles.sectionHeaderLabel}>Pinned</Text>
              <Text style={styles.sectionCount}>{pinnedChats.length}</Text>
            </Pressable>
            {pinnedCollapsed ? null : pinnedChats.map(renderChatRow)}
          </>
        ) : null}

        {/* Same collapsible header as Pinned, chevron and all. */}
        <Pressable
          style={({ pressed }) => [styles.sectionHeader, pressed && styles.rowPressed]}
          onPress={() => setChatsCollapsed((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Chats"
          accessibilityState={{ expanded: !chatsCollapsed }}
          testID="drawer-chats-header"
        >
          <View style={chatsCollapsed ? undefined : styles.chevronOpen}>
            <ChevronIcon size={12} color={c.text2} strokeWidth={2.2} />
          </View>
          <Text style={styles.sectionHeaderLabel}>Chats</Text>
          <Text style={styles.sectionCount}>{otherChats.length}</Text>
        </Pressable>
        {chatsCollapsed ? null : otherChats.length === 0 ? (
          <Text style={styles.emptyRows}>
            {trimmed ? "No matches" : pinnedChats.length ? "No other chats" : "No chats yet"}
          </Text>
        ) : (
          otherChats.map(renderChatRow)
        )}
        </>
        )}

      </ScrollView>

      {/* Footer (owner 2026-07-21, matching their ChatGPT reference crop): a
          FLOATING bottom row hovering over the chat list — a solid ACCENT "Chat"
          pill (compose icon + label; its color follows the appearance setting's
          accent swatch) that starts a new chat, and a raised circular Settings
          gear. Close the drawer before presenting Settings: otherwise the pushed
          page shadow intersects the floating gear and makes its right edge look
          clipped beneath the modal. */}
      {/* With the Chat pill withdrawn the gear is the only child left, and `space-between` would
          park it on the LEFT — the one edge it has never sat on. Pushed to the end instead, so it
          holds exactly the position it held before. */}
      <View
        style={[styles.footerFloat, CHAT_RETIRED && styles.footerFloatEnd, { bottom: insets.bottom + space(2.5) }]}
        pointerEvents="box-none"
      >
        {/* 🔴 THE "CHAT" PILL IS WITHDRAWN WITH THE SURFACE IT STARTED. Starting something new is
            now the FIRST ROW of the nav — "New canvas" — so a second, differently-shaped control
            for the same intent would offer two front doors to one product. The gear keeps the
            footer, and keeps its position, so nothing else in this corner moves. */}
        {CHAT_RETIRED ? null : (
          <Pressable
            style={({ pressed }) => [styles.chatPill, pressed && styles.chatPillPressed]}
            onPress={() => {
              onNewChat();
              onClose();
            }}
            testID="drawer-new-chat"
            accessibilityRole="button"
            accessibilityLabel="New chat"
          >
            <ComposeIcon size={18} color={c.onAccent} strokeWidth={1.9} />
            <Text style={styles.chatPillText}>Chat</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.gearFloat, pressed && styles.gearFloatPressed]}
          onPress={() => {
            onClose();
            router.push("/settings" as never);
          }}
          testID="drawer-settings"
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
        >
          <SettingsIcon size={21} color={c.text} />
        </Pressable>
      </View>

      {/* Long-press chat menu + rename dialog (owner 2026-07-23). Wrapped in a
          Modal so they present FULL-SCREEN above the app: the drawer panel is
          only ~330pt wide with its overflow clipped, so inline the menu would be
          both cut off and stuck inside a sidebar-width strip. The Modal escapes
          that — and it is why MiniMenu is positioned from window coordinates.
          GestureHandlerRootView keeps the rename dialog's gestures working
          inside it. */}
      <Modal
        transparent
        animationType="none"
        visible={actionTarget !== null || renameTarget !== null}
        onRequestClose={() => {
          setActionTarget(null);
          setRenameTarget(null);
        }}
      >
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          <MiniMenu
            visible={actionTarget !== null}
            anchor={actionAt}
            actions={rowActions}
            onClose={() => setActionTarget(null)}
            testID="drawer-chat-actions"
          />
          <TextPromptSheet
            visible={renameTarget !== null}
            title="Rename chat"
            placeholder="Chat name"
            initialValue={renameTarget?.title ?? ""}
            onConfirm={confirmRename}
            onClose={() => setRenameTarget(null)}
            testID="drawer-chat-rename"
          />
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

/**
 * One chat in the sidebar, which LIFTS while it is being held.
 *
 * Its own component so the animated style is one hook per row rather than a
 * loop of them in DrawerContent — and so the lift is a plain style animation on
 * a shared value. A layout animation would have been fewer lines and is exactly
 * what not to use here: this list lives in a panel that is sometimes behind a
 * Modal, where those are unreliable.
 *
 * Scale plus a raised surface and a shadow, not a colour change: "picked up" is
 * a statement about depth, and the row already uses its background for the
 * pressed state.
 */
function ChatRow({
  chat,
  lifted,
  gesture,
  onPress,
  styles,
}: {
  chat: ThreadSummary;
  lifted: boolean;
  gesture: ReturnType<typeof Gesture.Pan>;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withTiming(lifted ? 1 : 0, {
      duration: lifted ? 140 : 120,
      easing: ReEasing.out(ReEasing.cubic),
    });
  }, [lift, lifted]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lift.value * 0.04 }],
    shadowOpacity: lift.value * 0.35,
    shadowRadius: 4 + lift.value * 12,
    elevation: lift.value * 10,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View style={[styles.rowLift, animated]}>
        <Pressable
          testID={`drawer-chat-${chat.id}`}
          // No onLongPress. The gesture above owns the hold — see the note on
          // useRowDrag in DrawerContent for why having both opened two menus.
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed, lifted && styles.rowLifted]}
          onPress={onPress}
          accessibilityHint="Touch and hold to rename, pin, or delete this chat."
        >
          <Text style={styles.rowTitle} numberOfLines={1}>{chat.title}</Text>
          <Text style={styles.rowTime}>{relTime(chat.updatedAt)}</Text>
        </Pressable>
      </Reanimated.View>
    </GestureDetector>
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

/** Pencil-in-square "compose" glyph — the floating Chat pill's icon (the
 * ChatGPT-style mark the owner's crop shows). */
function ComposeIcon({ size = 23, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M11.3 5.4H7.1A2.6 2.6 0 0 0 4.5 8v8.9a2.6 2.6 0 0 0 2.6 2.6H16a2.6 2.6 0 0 0 2.6-2.6v-4.2M18.9 3.8l1.3 1.3a1.7 1.7 0 0 1 0 2.4l-7.5 7.5-3.9 1 1-3.9 7.5-7.5a1.7 1.7 0 0 1 2.4 0Z"
        stroke={color}
        strokeWidth={strokeWidth}
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
    // reveal it. shellRoot's bg shows only behind the page's ROUNDED CORNERS when open —
    // it MUST match whatever panelSolid uses, or it peeks through as a wedge of the
    // wrong shade between the sidebar and the rounded page (owner 2026-07-20). Both
    // are `bg` since 2026-07-27; see panelSolid.
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
    // Owner 2026-07-20 round 2: shadow stays but must never read as a wide gray
    // band — so the geometry is TIGHT (12pt blur hugging the edge, vs the composer's
    // 18pt shadow.raise) and the color is themed (alpha baked into c.pageShadow;
    // faint ink in light, the shipped 50% black in dark). opacity 1 = color's alpha.
    pageShadow: {
      flex: 1, backgroundColor: c.bg, borderCurve: "continuous",
      shadowColor: c.pageShadow, shadowOpacity: 1, shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 }, elevation: 10,
    },
    pageClip: { flex: 1, overflow: "hidden", borderCurve: "continuous" },
    // `bg`, not `bg2` (owner 2026-07-27: "make the sidebar background completely
    // white instead of gray"). bg2 is the app's one remaining gray surface in light
    // mode and stays as it is for the composer pill and the row-action sheets — this
    // is the drawer only. The page still separates from the panel: pageShadow draws
    // a tight drop shadow down the page's facing edge, which is the same way iOS and
    // ChatGPT separate a white sheet from a white page. Dark mode is unchanged (bg
    // and bg2 are both #000 there).
    panelSolid: { flex: 1, backgroundColor: c.bg },
    panelInner: { flex: 1 },
    // flex:1 so the ScrollView fills the gap between the brand row and the footer — the
    // footer then pins to the BOTTOM (owner 2026-07-18: bottom buttons had empty space
    // below them) instead of floating up beneath short content.
    scroll: { flex: 1 },

    // gap + marginRight:auto on the wordmark so the two buttons sit together on
    // the right rather than space-between pushing them apart.
    brandRow: { flexDirection: "row", alignItems: "center", gap: space(1), paddingHorizontal: space(4), paddingBottom: space(3) },
    brand: { ...type.h2, color: c.text, letterSpacing: -0.3, marginRight: "auto" },
    searchBtn: { width: control.md, height: control.md, borderRadius: control.md / 2, alignItems: "center", justifyContent: "center" },
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


    // Collapsible "Pinned" header — a tappable row with a chevron that rotates
    // open (owner 2026-07-23). Same chevron idiom as the Library/Study folder rows.
    sectionHeader: {
      flexDirection: "row", alignItems: "center", gap: space(1.5),
      paddingHorizontal: space(4), marginTop: space(3), marginBottom: space(1.5),
      paddingVertical: space(1), borderRadius: radius.sm, marginHorizontal: space(2),
    },
    sectionHeaderLabel: { color: c.text2, fontSize: type.micro.fontSize, fontWeight: "700", flex: 1 },
    sectionCount: { color: c.text3, fontSize: type.micro.fontSize, fontVariant: ["tabular-nums"] },
    // ChevronIcon points right by default; rotate it down for the expanded state.
    chevronOpen: { transform: [{ rotate: "90deg" }] },

    // Chat rows share one compact row style.
    row: {
      flexDirection: "row", alignItems: "center", gap: space(2.5),
      paddingVertical: space(2.5), paddingHorizontal: space(3.5), marginHorizontal: space(2), borderRadius: radius.md,
    },
    rowPressed: { backgroundColor: c.surface },
    // The shadow's own colour and offset are static; only its opacity, radius
    // and the scale animate, which keeps the animated style to properties
    // Reanimated can drive without re-laying out the list.
    rowLift: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 } },
    // Held rows sit on the raised surface so the card reads as solid rather than
    // as the list showing through whatever is behind it.
    rowLifted: { backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
    rowTitle: { flex: 1, color: c.text2, fontSize: type.small.fontSize + 1, minWidth: 0 },
    rowTime: { color: c.text3, fontSize: type.micro.fontSize, fontVariant: ["tabular-nums"] },
    emptyRows: { color: c.text3, ...type.small, paddingHorizontal: space(4), paddingVertical: space(2) },

    // Footer — a FLOATING row over the chat list (owner 2026-07-21, ChatGPT
    // style; replaces the in-flow "New chat"/plain-gear row). Extra right
    // padding so the gear clears the pushed page's shadow that bleeds onto the
    // sidebar's right edge (owner: the gear was "cutting out to the right").
    footerFloat: {
      position: "absolute", left: 0, right: 0,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingLeft: space(3.5), paddingRight: space(4),
    },
    footerFloatEnd: { justifyContent: "flex-end" },
    // The Chat pill: solid ACCENT fill (the appearance setting's swatch drives
    // it), onAccent content, soft drop shadow (c.pageShadow bakes the alpha).
    chatPill: {
      flexDirection: "row", alignItems: "center", gap: space(1.75),
      height: 46, paddingHorizontal: space(4.5), borderRadius: 23,
      backgroundColor: c.accent,
      shadowColor: c.pageShadow, shadowOpacity: 1, shadowRadius: 10,
      shadowOffset: { height: 5, width: 0 }, elevation: 8,
    },
    chatPillPressed: { backgroundColor: c.accentDeep },
    chatPillText: { color: c.onAccent, fontSize: type.small.fontSize + 2, fontWeight: "700" },

    // The gear rides its own raised disc now (owner's crop shows a circled
    // gear floating beside the pill — supersedes the 2026-07-20 plain-icon
    // call; the shadow makes the disc deliberate instead of a stray blob).
    gearFloat: {
      width: control.lg, height: control.lg, borderRadius: control.lg / 2, alignItems: "center", justifyContent: "center",
      backgroundColor: c.raised,
      shadowColor: c.pageShadow, shadowOpacity: 1, shadowRadius: 10,
      shadowOffset: { height: 5, width: 0 }, elevation: 8,
    },
    gearFloatPressed: { backgroundColor: c.surface2 },
  });
