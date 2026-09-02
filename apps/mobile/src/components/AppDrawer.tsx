import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from "react";
import { Alert, Animated, Easing, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { router, usePathname } from "expo-router";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { createFolder, deleteCanvas, deleteFolder, renameCanvas, renameFolder, setCanvasFolder, setCanvasPinned, setFolderPinned } from "@/api/canvases";
import { buildProjects, canvasLabel, sidebarSections, type CanvasSummary, type Folder, type ProjectNode } from "@/lib/canvases";
import { flattenProjects, shortRelativeTime } from "@/lib/relative-time";
import { hapticDrawerOpened } from "@/lib/haptics";
import Svg, { Path } from "react-native-svg";
import { MiniMenu, type MenuAnchor, type MenuRow } from "./MiniMenu";
import { CanvasRow, ProjectRow } from "./ProjectRows";
import { useCanvasesAndFolders } from "./useCanvasesAndFolders";
import { useRowDrag } from "./useRowDrag";
import { TextPromptSheet } from "./RowActionSheets";
import { CalendarIcon, ChevronIcon, FolderIcon, LibraryIcon, PluginIcon, SearchIcon, SettingsIcon, type IconProps } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// ChatGPT/Claude-style side drawer + the app-shell context that drives it. Built on RN's built-in
// Animated (no extra deps; renders identically under react-native-web for previews). The sidebar is
// always mounted UNDERNEATH the page; opening PUSHES the whole page (Slot + StatusBarBlur + TopBar) to
// the right by the panel width to reveal it, instead of sliding an overlay on top — see DrawerShell.
//
// The drawer IS the desktop sidebar on the phone: a compact nav (Library · Projects ·
// Plugins · Calendar), then the web's own Pinned / Projects / Canvases sections — the
// learner's `learning_canvases` and `folders` rows, exactly as the desktop sidebar groups
// them (see src/lib/canvases.ts's `sidebarSections`) — replacing the retired chat-threads
// list (docs/design/ios-web-parity-2026-09.md, slice 1). Tapping a canvas reopens it (via
// the /canvas?c=<id> route param); tapping a project expands it in place to its most recent
// canvases. A solid "New canvas" pill and a settings gear float over the bottom of the list.
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
  /** Start a brand-new canvas — navigates to "/", the front door. Nothing is created by
   *  this alone (api/canvases.ts's `startCanvas`: "nothing is created by pressing this,
   *  only by beginning"); the front door mints and saves the canvas on the first send. */
  newCanvas: () => void;
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
  const newCanvas = useCallback(() => {
    router.push("/" as never);
  }, []);

  const value = useMemo<ShellState>(
    () => ({
      open, openDrawer, closeDrawer, newCanvas,
      headerTitle, setHeaderTitle,
      headerCenter, setHeaderCenter,
      headerRight, setHeaderRight,
      immersive, setImmersive,
    }),
    [open, openDrawer, closeDrawer, newCanvas, headerTitle, headerCenter, headerRight, immersive],
  );

  return (
    <ShellContext.Provider value={value}>
      <DrawerShell open={open} onOpen={openDrawer} onClose={closeDrawer} onNewCanvas={newCanvas} immersive={immersive}>
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
  onNewCanvas,
  immersive,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNewCanvas: () => void;
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
          <DrawerContent open={open} onClose={onClose} onNewCanvas={onNewCanvas} />
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

/** What the long-press menu is acting on — a canvas row or a project tile. One Modal
 *  serves both, its rows swapped by `menuMode` below, rather than stacking a second menu. */
type ActionTarget = { kind: "canvas"; canvas: CanvasSummary } | { kind: "project"; project: ProjectNode };

/** The one text-prompt dialog, in its three shapes. `newProject` carries the CANVAS id
 *  it will file once the folder exists — `onConfirm` creates the folder, then files it. */
type PromptState =
  | { mode: "renameCanvas"; id: string; initial: string }
  | { mode: "renameProject"; id: string; initial: string }
  | { mode: "newProject"; canvasId: string };

function DrawerContent({ open, onClose, onNewCanvas }: { open: boolean; onClose: () => void; onNewCanvas: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  // Data + its three refresh paths (open, debounced-on-mutation, on-foreground) live
  // in one hook shared with the Projects page — see useCanvasesAndFolders.ts.
  const { canvases, folders, setCanvases, setFolders } = useCanvasesAndFolders(uid, open);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Each section collapses independently — same chevron idiom the old Pinned/Chats
  // headers used.
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [canvasesCollapsed, setCanvasesCollapsed] = useState(false);
  // Which project (if any) is expanded in place, and which expanded projects have had
  // their "Show more" tapped — both keyed by folder id.
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [expandedFully, setExpandedFully] = useState<ReadonlySet<string>>(new Set());

  // Long-press a row -> a MiniMenu at the touch point (owner 2026-07-23 precedent,
  // carried over from the retired chat list). `menuMode` swaps the SAME menu's rows to
  // the "Add to project" picker rather than opening a second menu on top of it.
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [actionAt, setActionAt] = useState<MenuAnchor | null>(null);
  const [menuMode, setMenuMode] = useState<"actions" | "addToProject">("actions");
  const [prompt, setPrompt] = useState<PromptState | null>(null);

  // Every canvas/project on screen, so the hold gesture can find the one it picked up
  // by its (section-prefixed) key — rebuilt each render from the arrays the rows draw
  // from, same pattern the old chat list used for its own lookup map.
  const canvasesByIdRef = useRef(new Map<string, CanvasSummary>());
  const projectsByIdRef = useRef(new Map<string, ProjectNode>());

  // The menu/prompt must not survive the drawer closing: dismissing via the dimmed
  // page taps the drawer's OWN close-catcher, not the sheet's, so without this the
  // menu would silently reappear on the next open.
  useEffect(() => {
    if (!open) {
      setActionTarget(null);
      setActionAt(null);
      setMenuMode("actions");
      setPrompt(null);
    }
  }, [open]);

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  function closeMenu() {
    setActionTarget(null);
    setActionAt(null);
    setMenuMode("actions");
  }

  // ---- canvas row actions ----

  function togglePinCanvas(canvas: CanvasSummary) {
    closeMenu();
    const next = !canvas.pinnedAt;
    setCanvases((rows) => rows.map((row) => (row.id === canvas.id ? { ...row, pinnedAt: next ? new Date().toISOString() : null } : row)));
    if (uid) void setCanvasPinned(uid, canvas.id, next);
  }

  function beginRenameCanvas(canvas: CanvasSummary) {
    closeMenu();
    setPrompt({ id: canvas.id, initial: canvasLabel(canvas), mode: "renameCanvas" });
  }

  function confirmDeleteCanvas(canvas: CanvasSummary) {
    closeMenu();
    Alert.alert("Delete canvas?", `"${canvasLabel(canvas)}" will be removed from your canvases on every device.`, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          setCanvases((rows) => rows.filter((row) => row.id !== canvas.id));
          if (uid) void deleteCanvas(uid, canvas.id);
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }

  function fileCanvas(canvasId: string, folderId: string | null) {
    closeMenu();
    setCanvases((rows) => rows.map((row) => (row.id === canvasId ? { ...row, folderId } : row)));
    if (uid) void setCanvasFolder(uid, canvasId, folderId);
  }

  // ---- project tile actions ----

  function togglePinProject(project: ProjectNode) {
    closeMenu();
    const next = !project.pinnedAt;
    setFolders((rows) => rows.map((row) => (row.id === project.id ? { ...row, pinnedAt: next ? new Date().toISOString() : null } : row)));
    if (uid) void setFolderPinned(uid, project.id, next);
  }

  function beginRenameProject(project: ProjectNode) {
    closeMenu();
    setPrompt({ id: project.id, initial: project.name, mode: "renameProject" });
  }

  function confirmDeleteProject(project: ProjectNode) {
    closeMenu();
    Alert.alert(`Delete "${project.name}"?`, "Its canvases go back to Canvases. Projects inside it are deleted too.", [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          setFolders((rows) => rows.filter((row) => row.id !== project.id));
          if (uid) void deleteFolder(uid, project.id);
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }

  // The one prompt dialog, in its three shapes (see PromptState).
  async function handlePromptConfirm(value: string) {
    const p = prompt;
    setPrompt(null);
    const clean = value.trim();
    if (!p || !uid || !clean) return;
    if (p.mode === "renameCanvas") {
      setCanvases((rows) => rows.map((row) => (row.id === p.id ? { ...row, title: clean } : row)));
      void renameCanvas(uid, p.id, clean);
    } else if (p.mode === "renameProject") {
      setFolders((rows) => rows.map((row) => (row.id === p.id ? { ...row, name: clean } : row)));
      void renameFolder(uid, p.id, clean);
    } else {
      const folder = await createFolder(uid, clean);
      if (!folder) return;
      setFolders((rows) => [...rows, folder]);
      fileCanvas(p.canvasId, folder.id);
    }
  }

  // The SAME hold gesture the Library/Study trees use, adopted here 2026-07-23 for the
  // (now retired) chat list and carried over unchanged. No DragChip: this panel is
  // ~330pt wide with its overflow clipped, so the row lifts where it sits instead.
  //
  // Keys are scoped by WHERE a row is drawn ("pin:c:<id>", "rec:c:<id>",
  // "proj:<projectId>:c:<id>", "p:<projectId>") rather than bare ids: a canvas that is
  // both pinned AND filed in a project draws TWICE (once under Pinned, once inside its
  // project's expansion) — bare ids would make holding either copy light up both.
  const rowDrag = useRowDrag({
    onDrop: () => {},
    onHold: (key, x, y) => {
      const id = key.slice(key.lastIndexOf(":") + 1);
      if (key.startsWith("p:")) {
        const project = projectsByIdRef.current.get(id);
        if (project) {
          setActionAt({ x, y });
          setActionTarget({ kind: "project", project });
        }
        return;
      }
      const canvas = canvasesByIdRef.current.get(id);
      if (canvas) {
        setActionAt({ x, y });
        setActionTarget({ kind: "canvas", canvas });
      }
    },
  });
  const liftGesture = (key: string) => rowDrag.gestureFor(key, { canDropOn: () => false, draggable: false, lift: true });

  const sections = useMemo(() => sidebarSections(canvases, folders, query), [canvases, folders, query]);
  const allProjects = useMemo(() => buildProjects(folders, canvases), [folders, canvases]);
  const flatProjects = useMemo(() => flattenProjects(allProjects), [allProjects]);

  canvasesByIdRef.current = new Map(canvases.map((canvas) => [canvas.id, canvas]));
  projectsByIdRef.current = new Map([...sections.pinnedProjects, ...sections.projects].map((project) => [project.id, project]));

  const trimmed = query.trim();
  const hasPinned = sections.pinnedCanvases.length > 0 || sections.pinnedProjects.length > 0;

  const renderCanvasRow = (canvas: CanvasSummary, scope: string, indent = false) => {
    const key = `${scope}:c:${canvas.id}`;
    return (
      <CanvasRow
        key={key}
        label={canvasLabel(canvas)}
        time={shortRelativeTime(canvas.updatedAt)}
        lifted={rowDrag.activeKey === key}
        gesture={liftGesture(key)}
        indent={indent}
        onPress={() => go(`/canvas?c=${canvas.id}`)}
        testID={`drawer-canvas-${canvas.id}`}
      />
    );
  };

  const renderProjectRow = (project: ProjectNode) => {
    const key = `p:${project.id}`;
    const expanded = expandedProjectId === project.id;
    const shown = expandedFully.has(project.id) ? project.canvases : project.canvases.slice(0, 5);
    const more = project.canvases.length - shown.length;
    return (
      <Reanimated.View key={project.id} layout={LinearTransition.duration(200)}>
        <ProjectRow
          name={project.name}
          color={project.color}
          lifted={rowDrag.activeKey === key}
          gesture={liftGesture(key)}
          onPress={() => setExpandedProjectId(expanded ? null : project.id)}
          compact
          testID={`drawer-project-${project.id}`}
        />
        {expanded ? (
          <Reanimated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)} layout={LinearTransition.duration(200)}>
            {shown.length === 0 ? (
              <Text style={styles.emptyRows}>No canvases yet</Text>
            ) : (
              shown.map((canvas) => renderCanvasRow(canvas, `proj:${project.id}`, true))
            )}
            {more > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.showMore, pressed && styles.rowPressed]}
                onPress={() => setExpandedFully((prev) => new Set(prev).add(project.id))}
                testID={`drawer-project-${project.id}-more`}
              >
                <Text style={styles.showMoreLabel}>Show {more} more</Text>
              </Pressable>
            ) : null}
          </Reanimated.View>
        ) : null}
      </Reanimated.View>
    );
  };

  const rowActions: MenuRow[] = (() => {
    if (!actionTarget) return [];
    if (menuMode === "addToProject" && actionTarget.kind === "canvas") {
      const canvas = actionTarget.canvas;
      const rows: MenuRow[] = [];
      if (canvas.folderId) {
        rows.push({ key: "remove", label: "Remove from project", onPress: () => fileCanvas(canvas.id, null) });
      }
      for (const { depth, node } of flatProjects) {
        rows.push({ indent: depth, key: `to:${node.id}`, label: node.name, onPress: () => fileCanvas(canvas.id, node.id) });
      }
      rows.push({
        key: "new-project",
        label: "New project…",
        onPress: () => {
          // Both state changes land in the same handler so the Modal's `visible`
          // (actionTarget !== null || prompt !== null) never goes false between
          // them — the menu and the prompt are one continuous sheet, not two.
          setActionTarget(null);
          setActionAt(null);
          setMenuMode("actions");
          setPrompt({ canvasId: canvas.id, mode: "newProject" });
        },
      });
      return rows;
    }
    if (actionTarget.kind === "canvas") {
      const canvas = actionTarget.canvas;
      return [
        { key: "pin", label: canvas.pinnedAt ? "Unpin" : "Pin", onPress: () => togglePinCanvas(canvas) },
        { key: "rename", label: "Rename", onPress: () => beginRenameCanvas(canvas) },
        { key: "add-to-project", label: "Add to project ›", onPress: () => setMenuMode("addToProject") },
        { destructive: true, key: "delete", label: "Delete", onPress: () => confirmDeleteCanvas(canvas) },
      ];
    }
    const project = actionTarget.project;
    return [
      { key: "pin", label: project.pinnedAt ? "Unpin" : "Pin", onPress: () => togglePinProject(project) },
      { key: "rename", label: "Rename", onPress: () => beginRenameProject(project) },
      { destructive: true, key: "delete", label: "Delete", onPress: () => confirmDeleteProject(project) },
    ];
  })();

  const promptTitle =
    prompt?.mode === "renameCanvas" ? "Rename canvas" : prompt?.mode === "renameProject" ? "Rename project" : "New project";
  const promptInitial = prompt?.mode === "renameCanvas" || prompt?.mode === "renameProject" ? prompt.initial : "";

  return (
    <View style={[styles.panelInner, { paddingTop: insets.top + space(2) }]}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>Nemesis</Text>
        {/* No "+" here (owner 2026-07-24: "remove the '+' from the main
            sidebar") — the floating "New canvas" pill below covers that job. */}
        <Pressable
          style={({ pressed }) => [styles.searchBtn, (pressed || searchOpen) && styles.searchBtnActive]}
          onPress={() => setSearchOpen((v) => !v)}
          hitSlop={8}
          accessibilityLabel="Search canvases and projects"
        >
          <SearchIcon size={19} color={searchOpen ? c.text : c.text2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        // Bottom padding tracks the floating pill + gear's REAL footprint
        // (insets.bottom + 10 gap + 46 button + breathing room) — a flat
        // constant undershot it on home-indicator iPhones and the last row
        // slid under the buttons (review finding, 2026-07-21).
        contentContainerStyle={{ paddingBottom: insets.bottom + space(2.5) + 46 + space(4) }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.navGroup}>
          <NavRow Icon={LibraryIcon} label="Library" onPress={() => go("/library")} />
          <NavRow Icon={FolderIcon} label="Projects" onPress={() => go("/projects")} />
          <NavRow Icon={PluginIcon} label="Plugins" onPress={() => go("/plugins")} />
          <NavRow Icon={CalendarIcon} label="Calendar" onPress={() => go("/calendar")} />
        </View>

        {searchOpen ? (
          <View style={styles.searchField}>
            <SearchIcon size={16} color={c.text3} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search canvases and projects"
              placeholderTextColor={c.textHint}
              autoFocus
              testID="drawer-search"
            />
          </View>
        ) : null}

        {hasPinned ? (
          <>
            <Pressable
              style={({ pressed }) => [styles.sectionHeader, pressed && styles.rowPressed]}
              onPress={() => setPinnedCollapsed((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Pinned"
              accessibilityState={{ expanded: !pinnedCollapsed }}
              testID="drawer-pinned-header"
            >
              <View style={pinnedCollapsed ? undefined : styles.chevronOpen}>
                <ChevronIcon size={12} color={c.text2} strokeWidth={2.2} />
              </View>
              <Text style={styles.sectionHeaderLabel}>Pinned</Text>
              <Text style={styles.sectionCount}>{sections.pinnedCanvases.length + sections.pinnedProjects.length}</Text>
            </Pressable>
            {pinnedCollapsed ? null : (
              <>
                {sections.pinnedCanvases.map((canvas) => renderCanvasRow(canvas, "pin"))}
                {sections.pinnedProjects.map(renderProjectRow)}
              </>
            )}
          </>
        ) : null}

        {/* Same collapsible header as Pinned, chevron and all. */}
        <Pressable
          style={({ pressed }) => [styles.sectionHeader, pressed && styles.rowPressed]}
          onPress={() => setProjectsCollapsed((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Projects"
          accessibilityState={{ expanded: !projectsCollapsed }}
          testID="drawer-projects-header"
        >
          <View style={projectsCollapsed ? undefined : styles.chevronOpen}>
            <ChevronIcon size={12} color={c.text2} strokeWidth={2.2} />
          </View>
          <Text style={styles.sectionHeaderLabel}>Projects</Text>
          <Text style={styles.sectionCount}>{sections.projects.length}</Text>
        </Pressable>
        {projectsCollapsed ? null : sections.projects.map(renderProjectRow)}

        <Pressable
          style={({ pressed }) => [styles.sectionHeader, pressed && styles.rowPressed]}
          onPress={() => setCanvasesCollapsed((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Canvases"
          accessibilityState={{ expanded: !canvasesCollapsed }}
          testID="drawer-canvases-header"
        >
          <View style={canvasesCollapsed ? undefined : styles.chevronOpen}>
            <ChevronIcon size={12} color={c.text2} strokeWidth={2.2} />
          </View>
          <Text style={styles.sectionHeaderLabel}>Canvases</Text>
          <Text style={styles.sectionCount}>{sections.recents.length}</Text>
        </Pressable>
        {canvasesCollapsed ? null : sections.recents.length === 0 ? (
          <Text style={styles.emptyRows}>{trimmed ? "No matches" : "No canvases yet"}</Text>
        ) : (
          sections.recents.map((canvas) => renderCanvasRow(canvas, "rec"))
        )}
      </ScrollView>

      {/* Footer (owner 2026-07-21, matching their ChatGPT reference crop): a
          FLOATING bottom row hovering over the list — a solid ACCENT pill
          (compose icon + "New canvas"; its color follows the appearance setting's
          accent swatch) that starts a fresh canvas, and a raised circular Settings
          gear. Close the drawer before presenting Settings: otherwise the pushed
          page shadow intersects the floating gear and makes its right edge look
          clipped beneath the modal. */}
      <View style={[styles.footerFloat, { bottom: insets.bottom + space(2.5) }]} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.canvasPill, pressed && styles.canvasPillPressed]}
          onPress={() => {
            onNewCanvas();
            onClose();
          }}
          testID="drawer-new-canvas"
          accessibilityRole="button"
          accessibilityLabel="New canvas"
        >
          <ComposeIcon size={18} color={c.onAccent} strokeWidth={1.9} />
          <Text style={styles.canvasPillText}>New canvas</Text>
        </Pressable>

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

      {/* Long-press row menu + rename/new-project dialog. Wrapped in a Modal so they
          present FULL-SCREEN above the app: the drawer panel is only ~330pt wide with
          its overflow clipped, so inline the menu would be both cut off and stuck
          inside a sidebar-width strip. The Modal escapes that — and it is why MiniMenu
          is positioned from window coordinates. GestureHandlerRootView keeps the
          prompt's gestures working inside it. */}
      <Modal
        transparent
        animationType="none"
        visible={actionTarget !== null || prompt !== null}
        onRequestClose={closeMenu}
      >
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          <MiniMenu
            visible={actionTarget !== null}
            anchor={actionAt}
            actions={rowActions}
            onClose={closeMenu}
            testID="drawer-row-actions"
          />
          <TextPromptSheet
            visible={prompt !== null}
            title={promptTitle}
            placeholder={prompt?.mode === "renameCanvas" ? "Canvas name" : "Project name"}
            initialValue={promptInitial}
            onConfirm={(value) => void handlePromptConfirm(value)}
            onClose={() => setPrompt(null)}
            testID="drawer-text-prompt"
          />
        </GestureHandlerRootView>
      </Modal>
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

/** Pencil-in-square "compose" glyph — the floating pill's icon (the
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

    // Collapsible section header — a tappable row with a chevron that rotates
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

    rowPressed: { backgroundColor: c.surface },
    emptyRows: { color: c.text3, ...type.small, paddingHorizontal: space(4), paddingVertical: space(2) },

    // "Show N more" — inside an expanded project, below its capped canvas list.
    showMore: { borderRadius: radius.md, marginHorizontal: space(2), paddingHorizontal: space(3.5) + space(5), paddingVertical: space(2) },
    showMoreLabel: { color: c.text3, ...type.small },

    // Footer — a FLOATING row over the list (owner 2026-07-21, ChatGPT style;
    // replaces the in-flow "New chat"/plain-gear row). Extra right padding so the
    // gear clears the pushed page's shadow that bleeds onto the sidebar's right edge
    // (owner: the gear was "cutting out to the right").
    footerFloat: {
      position: "absolute", left: 0, right: 0,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingLeft: space(3.5), paddingRight: space(4),
    },
    // The pill: solid ACCENT fill (the appearance setting's swatch drives it),
    // onAccent content, soft drop shadow (c.pageShadow bakes the alpha).
    canvasPill: {
      flexDirection: "row", alignItems: "center", gap: space(1.75),
      height: 46, paddingHorizontal: space(4.5), borderRadius: 23,
      backgroundColor: c.accent,
      shadowColor: c.pageShadow, shadowOpacity: 1, shadowRadius: 10,
      shadowOffset: { height: 5, width: 0 }, elevation: 8,
    },
    canvasPillPressed: { backgroundColor: c.accentDeep },
    canvasPillText: { color: c.onAccent, fontSize: type.small.fontSize + 2, fontWeight: "700" },

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
