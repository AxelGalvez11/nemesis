import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import { fetchLibrary, loadCachedLibrary, type CloudLibraryNote } from "@/api/cloudLibrary";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { GlassSurface } from "@/components/GlassSurface";
import { BASE_NODE_R, GraphNodeView } from "@/components/GraphNodeView";
import { GraphScene3D } from "@/components/GraphScene3D";
import { GraphSettingsPanel } from "@/components/GraphSettingsPanel";
import { SettingsIcon } from "@/components/icons";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import {
  type Camera3D,
  createLayoutSim3D,
  DEFAULT_CAMERA,
  hitTestProjected,
  type LayoutSim3D,
  MAX_ZOOM,
  MIN_ZOOM,
  type Projected,
  projectNodes,
  rotateCamera,
} from "@/lib/graph-layout-3d";
import {
  capGraphNotes,
  DEFAULT_FORCES,
  DEFAULT_GRAPH_MODE,
  GRAPH_MODE_STORE_KEY,
  type GraphMode,
  isSmallGraph,
  type LabelMode,
  shouldShowLabel,
} from "@/lib/graph-settings";
import { buildNoteGraph, createLayoutSim, type GraphEdge, type GraphNode, type LayoutSim, type NoteGraph } from "@/lib/note-graph";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/palette";
import { radius, space, type } from "@/theme/tokens";

// Graph (cloud-first pivot, docs/design/nemesis-cloud-first-phone-2026-07.md §7) —
// the phone's twin of the web app's Graph page, now including its 2D AND 3D
// modes (owner ask, 2026-07-20). Nodes are your account's library notes; an
// edge is a [[wikilink]] or [text](note.md) mention between two of them —
// including "ghost" nodes for a mention that doesn't resolve to any real
// note yet (see note-graph.ts's buildNoteGraph). Renders from the local disk
// cache first (offline-friendly, instant), refreshed from the cloud on every
// focus: cloudLibrary.ts → buildNoteGraph (note-graph.ts) → an animated
// force layout in the active mode's dimensionality → react-native-svg.
//
// 2D mode is the original screen, basically unchanged: createLayoutSim
// (note-graph.ts) seeds a jittered spiral, edges draw as <Line>s, nodes are
// real Views (GraphNodeView) layered on top so each can carry its own
// drag/tap gesture, and the whole canvas pans/zooms as a cheap UI-thread
// transform (reanimated shared values) — no per-frame JS work while idle.
//
// 3D mode is a from-scratch pure-JS simulation, NOT a shrunken copy of the
// web Graph's WebGL scene: this build has no expo-gl/WebGL and no `three`
// in apps/mobile's own dependencies (see graph-layout-3d.ts's top-of-file
// comment for the full reasoning). createLayoutSim3D relaxes the SAME notes
// in three dimensions; every animation frame, projectNodes() rotates by the
// camera's azimuth/elevation and perspective-projects onto the canvas, and
// GraphScene3D draws the result as SVG Circles/Lines in painter's-algorithm
// (farthest-first) order, scaled/dimmed by depth. There is no per-node
// dragging in 3D — a screen-space drag has no well-defined depth to move a
// node to — so the whole-canvas gesture means something different per mode:
// in 2D it pans/zooms a flat canvas; in 3D the SAME one-finger drag instead
// ORBITS the camera around the graph (owner's explicit mapping), and pinch
// zooms the camera in/out instead of the canvas.
//
// Both modes share ONE requestAnimationFrame loop (tick, below) rather than
// each owning a timer: whichever mode is active steps its own sim (a
// settle-and-stop cooling schedule, same shape note-graph.ts's 2D engine
// already had) and, in 3D, also re-projects every node and nudges the
// camera for the Rotation speed control's auto-orbit. The loop stops
// scheduling itself the instant nothing would visibly change (sim settled,
// no finger down, rotation speed 0) — an exact stop rather than web's
// graph-canvas.tsx IDLE_PAUSE_MS timer heuristic, which exists there because
// that engine has no cheap way to ask "is anything still moving"; this one
// does (LayoutSim/LayoutSim3D.settled), so a fixed grace period isn't
// needed. It also fully pauses on blur (tab switched away, screen still
// mounted under Expo Router's bottom tabs) and resumes on refocus — the
// phone-specific twin of that same web idle-pause precedent.
//
// Both modes share the SAME settings panel (GraphSettingsPanel.tsx):
// Gravity/Repulsion/Node size/Spread apply to whichever sim is currently
// running; Rotation speed only means something in 3D and is hidden in 2D;
// Labels (All/Hubs/None) governs both. See GraphSettingsPanel.tsx's
// top-of-file comment for exactly which of the web Graph's controls made
// the cut and which were skipped (and why).
//
// The screen title ("Graph") is a centered, pointer-transparent overlay
// (pointerEvents="none") so canvas pan/drag/orbit passes straight through
// it. The settings gear lives in the TopBar's right slot (setHeaderRight).

// Size of the floating glass settings-gear button (top-RIGHT overlay chrome, sized to
// match the TopBar's 44pt menu button it sits opposite — owner 2026-07-18).
const GEAR_SIZE = 44;
// Physics steps per rendered animation frame — tuned to feel about as snappy
// as the previous setInterval(30ms)*3-steps schedule now that rAF (~60fps)
// drives ticking instead (see the top-of-file comment).
const STEPS_PER_FRAME = 2;
// Whole-canvas pinch-zoom bounds (2D mode only — 3D's zoom bounds are
// MIN_ZOOM/MAX_ZOOM, imported from graph-layout-3d.ts).
const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
// Radians of camera orbit per screen pixel of one-finger drag, and radians/
// second of auto-orbit per Rotation-speed slider unit (slider range 0-3,
// same numeric range as the web Graph's own rotationSpeed control).
const ORBIT_RADIANS_PER_PX = 0.008;
const AUTO_ROTATE_RADIANS_PER_SEC = 0.18;

type Status = "loading" | "signin" | "empty" | "ready";

interface Scene3DState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  projected: Projected[];
}
const EMPTY_SCENE_3D: Scene3DState = { edges: [], nodes: [], projected: [] };

/** Stable per-note signature (id + updated_at, order-independent) — lets a
 * background refresh tell "nothing actually changed" apart from "the library
 * changed", so a same-data refresh never reseeds the running layout sim (a
 * fresh buildNoteGraph() result is a new object every call, and the seeding
 * effect below reseeds whenever `builtGraph` changes identity). Computed over
 * the UNCAPPED notes list (see capGraphNotes below) so a change beyond the
 * phone's node cap still isn't silently missed. */
function librarySignature(notes: readonly CloudLibraryNote[]): string {
  return notes.map((n) => `${n.id}:${n.updatedAt}`).sort().join("|");
}

export default function GraphScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const { contentTop, contentBottom } = useShellPadding();
  const { setHeaderRight } = useShell();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const win = useWindowDimensions();
  const [status, setStatus] = useState<Status>("loading");
  const [builtGraph, setBuiltGraph] = useState<NoteGraph | null>(null);
  const [graph, setGraph] = useState<NoteGraph | null>(null);
  const [scene3D, setScene3D] = useState<Scene3DState>(EMPTY_SCENE_3D);
  const [emptyRefreshing, setEmptyRefreshing] = useState(false);
  const [mode, setMode] = useState<GraphMode>(DEFAULT_GRAPH_MODE);
  const [gravity, setGravity] = useState(DEFAULT_FORCES.gravity);
  const [repulsion, setRepulsion] = useState(DEFAULT_FORCES.repulsion);
  const [nodeSize, setNodeSize] = useState(DEFAULT_FORCES.nodeSize);
  const [linkDistance, setLinkDistance] = useState(DEFAULT_FORCES.linkDistance);
  const [rotationSpeed, setRotationSpeed] = useState(DEFAULT_FORCES.rotationSpeed);
  const [labelMode, setLabelMode] = useState<LabelMode>(DEFAULT_FORCES.labelMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped only by Reset (see handleReset) to force the seeding effect below
  // to recreate the sim even when every force is already at its default. The
  // ONLY on-demand reseed trigger in this screen besides a mode switch —
  // opening/closing the settings panel deliberately never touches this.
  const [reseedNonce, setReseedNonce] = useState(0);

  const sim2DRef = useRef<LayoutSim | null>(null);
  const sim3DRef = useRef<LayoutSim3D | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  // Set false on blur (tab switched away, screen still mounted — see the
  // top-of-file comment) so the rAF loop refuses to (re)schedule itself
  // until focus returns.
  const focusedRef = useRef(true);
  // 3D-only camera state — a plain ref, not reanimated: unlike 2D's pan/
  // zoom (a pure UI-thread transform on an already-drawn scene), orbiting
  // has to re-project every node's screen position every frame (see
  // graph-layout-3d.ts), so the camera has to be readable from the JS-side
  // tick loop regardless. Gesture callbacks below run `.runOnJS(true)`
  // (same pattern GraphNodeView.tsx's per-node drag already uses) and
  // reassign this ref via the immutable rotateCamera()/zoom helpers rather
  // than mutating it in place (coding-style rule).
  const cameraRef = useRef<Camera3D>(DEFAULT_CAMERA);
  // True for as long as a finger is actively orbiting/pinch-zooming — the
  // tick loop keeps rescheduling itself while this is true, and auto-orbit
  // (Rotation speed) is suppressed while a real finger is already steering.
  const cameraActiveRef = useRef(false);
  const cameraStartRef = useRef<Camera3D>(DEFAULT_CAMERA);
  const zoomStartRef = useRef(1);
  // Latest 3D projection + its source nodes, kept outside React state so the
  // whole-canvas Tap gesture (3D mode) can hit-test synchronously against
  // whatever was actually drawn most recently, without waiting on a
  // re-render.
  const projected3DRef = useRef<Projected[]>([]);
  const nodes3DRef = useRef<GraphNode[]>([]);
  // Last signature (see librarySignature) a graph was actually built from —
  // lets applyNotes below skip rebuilding (and thus reseeding the layout)
  // when a background refresh confirms nothing changed.
  const lastSignatureRef = useRef<string>("");
  // "Live" refs the STABLE tick callback below reads instead of closing over
  // state directly — tick is created once (empty deps) so it never goes
  // stale itself, matching the file's existing initialForces pattern.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const rotationSpeedRef = useRef(rotationSpeed);
  rotationSpeedRef.current = rotationSpeed;
  const nodeSizeRef = useRef(nodeSize);
  nodeSizeRef.current = nodeSize;
  const canvasSizeRef = useRef({ height: 0, width: 0 });
  // The seeding effect below reads this once per (re)seed instead of depending
  // on gravity/repulsion/linkDistance state directly — depending on them would
  // reseed the spiral (and jump every node's position) on every slider drag.
  const initialForces = useRef({ gravity, linkDistance, repulsion });
  initialForces.current = { gravity, linkDistance, repulsion };

  const canvasW = win.width;
  // Deliberately NOT a function of settingsOpen: the settings panel renders as
  // a floating overlay (see the JSX below and the top-of-file comment), not an
  // in-flow block, specifically so toggling it never changes canvasH — which
  // would otherwise re-trigger the seeding effect and reset pan/zoom/pinned
  // nodes just from tapping the gear icon. The title chrome is likewise an
  // absolute overlay (not in flow), so the canvas fills the whole area below
  // the shell TopBar.
  const canvasH = Math.max(220, win.height - contentTop - contentBottom);
  canvasSizeRef.current = { height: canvasH, width: canvasW };

  // Whole-canvas pinch/pan transform (2D mode only). `saved*` hold the value
  // the gesture started from, so each new pinch/pan composes on top of
  // wherever the canvas already was instead of jumping back to identity.
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const stopTicking = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // The one animation loop for both modes — see the top-of-file comment for
  // why one rAF driver replaces the old setInterval and how it decides to
  // keep rescheduling itself. Empty deps (reads only refs) so its identity
  // never changes, which is what lets ensureTicking below stay stable too.
  const tick = useCallback((now: number) => {
    rafRef.current = null;
    if (!focusedRef.current) return;
    const last = lastFrameTimeRef.current;
    // Capped so a long gap (e.g. the JS thread was busy, or focus just
    // returned after a while away) can't produce one huge auto-rotate jump.
    const dt = last === null ? 1 / 60 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    lastFrameTimeRef.current = now;

    let stillActive = false;

    if (modeRef.current === "3d") {
      const sim = sim3DRef.current;
      if (sim) {
        if (!sim.settled) {
          for (let i = 0; i < STEPS_PER_FRAME; i++) sim.step();
        }
        if (rotationSpeedRef.current > 0 && !cameraActiveRef.current) {
          cameraRef.current = rotateCamera(cameraRef.current, rotationSpeedRef.current * AUTO_ROTATE_RADIANS_PER_SEC * dt, 0);
        }
        const snapshot = sim.snapshot();
        const projected = projectNodes(snapshot.nodes, cameraRef.current, canvasSizeRef.current);
        projected3DRef.current = projected;
        nodes3DRef.current = snapshot.nodes;
        setScene3D({ edges: snapshot.edges, nodes: snapshot.nodes, projected });
        stillActive = !sim.settled || cameraActiveRef.current || rotationSpeedRef.current > 0;
      }
    } else {
      const sim = sim2DRef.current;
      if (sim) {
        for (let i = 0; i < STEPS_PER_FRAME && !sim.settled; i++) sim.step();
        setGraph(sim.snapshot());
        stillActive = !sim.settled;
      }
    }

    if (stillActive) rafRef.current = requestAnimationFrame(tick);
  }, []);

  const ensureTicking = useCallback(() => {
    if (rafRef.current !== null) return;
    if (!focusedRef.current) return;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // Sliders mutate whichever sim is currently running and reheat it — no
  // reseed, so the graph keeps its current shape and just re-relaxes under
  // the new forces. Only one of sim2DRef/sim3DRef is ever non-null at a time
  // (see the seeding effect below), so trying both is simplest — the inert
  // one is just a no-op.
  const handleGravityChange = useCallback(
    (v: number) => {
      setGravity(v);
      if (sim2DRef.current) {
        sim2DRef.current.gravity = v;
        sim2DRef.current.reheat();
      }
      if (sim3DRef.current) {
        sim3DRef.current.gravity = v;
        sim3DRef.current.reheat();
      }
      ensureTicking();
    },
    [ensureTicking],
  );

  const handleRepulsionChange = useCallback(
    (v: number) => {
      setRepulsion(v);
      if (sim2DRef.current) {
        sim2DRef.current.repulsion = v;
        sim2DRef.current.reheat();
      }
      if (sim3DRef.current) {
        sim3DRef.current.repulsion = v;
        sim3DRef.current.reheat();
      }
      ensureTicking();
    },
    [ensureTicking],
  );

  const handleLinkDistanceChange = useCallback(
    (v: number) => {
      setLinkDistance(v);
      if (sim2DRef.current) {
        sim2DRef.current.linkDistance = v;
        sim2DRef.current.reheat();
      }
      if (sim3DRef.current) {
        sim3DRef.current.linkDistance = v;
        sim3DRef.current.reheat();
      }
      ensureTicking();
    },
    [ensureTicking],
  );

  // 3D-only: no sim to mutate, just wakes the loop so a newly-raised speed
  // starts auto-orbiting immediately instead of waiting for some other
  // trigger. Node size is pure rendering (a prop multiplier, like before)
  // and needs neither a reheat nor a wake — setNodeSize is passed straight
  // through to GraphSettingsPanel below.
  const handleRotationSpeedChange = useCallback(
    (v: number) => {
      setRotationSpeed(v);
      ensureTicking();
    },
    [ensureTicking],
  );

  const handleModeChange = useCallback((next: GraphMode) => {
    setMode(next);
    void SecureStore.setItemAsync(GRAPH_MODE_STORE_KEY, next).catch(() => {});
  }, []);

  // The only control that reseeds: restores every default and bumps
  // reseedNonce so the seeding effect (below) recreates the active mode's
  // sim from a fresh spiral/sphere — which also clears any pinned/dragged
  // 2D node and re-centers pan/zoom/camera, same as a real note-data or
  // resize reseed. Deliberately does NOT touch `mode` — which dimension
  // you're viewing is a deliberate, persisted choice, not a "force".
  const handleReset = useCallback(() => {
    setGravity(DEFAULT_FORCES.gravity);
    setRepulsion(DEFAULT_FORCES.repulsion);
    setNodeSize(DEFAULT_FORCES.nodeSize);
    setLinkDistance(DEFAULT_FORCES.linkDistance);
    setRotationSpeed(DEFAULT_FORCES.rotationSpeed);
    setLabelMode(DEFAULT_FORCES.labelMode);
    setReseedNonce((n) => n + 1);
  }, []);

  const navigateToNote = useCallback((pathHash: string) => {
    router.push({ params: { id: pathHash }, pathname: "/note" });
  }, []);

  // Handed to both GraphNodeView (2D) and the 3D tap hit-test below as the
  // single "a node was tapped" entry point — a ghost has no real note behind
  // it (see note-graph.ts's GraphNode.ghost doc comment for why opening one
  // is a no-op here rather than creating the note the way the web Graph does).
  const openNode = useCallback(
    (node: GraphNode) => {
      if (node.ghost) return;
      navigateToNote(node.pathHash);
    },
    [navigateToNote],
  );

  // A node drag (2D only) brackets the sim's active-drag state (note-graph.ts's
  // LayoutSim.startDrag/endDrag) around pin()-ing it to the finger.
  // startDrag keeps the simulation fully energized for the whole gesture —
  // with a temporarily stiffer pull on this node's own edges — so its linked
  // neighbors visibly follow instead of barely creeping: a single bounded
  // reheat() kick (the old approach, still what the sliders use) is tuned
  // for a one-off nudge, not a multi-hundred-pixel drag. endDrag lets the
  // sim ease back to a normal settle once the finger lifts.
  const handleNodeDragStart = useCallback(
    (index: number) => {
      const sim = sim2DRef.current;
      if (!sim) return;
      sim.startDrag(index);
      ensureTicking();
    },
    [ensureTicking],
  );

  const handleNodeDragTo = useCallback(
    (index: number, x: number, y: number) => {
      const sim = sim2DRef.current;
      if (!sim) return;
      sim.pin(index, x, y);
      ensureTicking();
      setGraph(sim.snapshot());
    },
    [ensureTicking],
  );

  const handleNodeDragEnd = useCallback(() => {
    const sim = sim2DRef.current;
    if (!sim) return;
    sim.endDrag();
    ensureTicking();
    setGraph(sim.snapshot());
  }, [ensureTicking]);

  // Apply a fresh notes list: rebuilds the graph (and reseeds the layout — see the
  // seeding effect below) only when librarySignature actually changed, so a
  // background refresh that confirms nothing changed never disturbs the running
  // simulation, pan/zoom/camera, or any pinned 2D node. Empty clears everything (a
  // real "no notes" state, not an error). Capped to MAX_GRAPH_NOTES (phone-sane —
  // the web Graph has no cap of its own; see graph-settings.ts) BEFORE building,
  // so a huge library still renders a bounded, deterministic (path-sorted) subset.
  const applyNotes = useCallback((notes: readonly CloudLibraryNote[]) => {
    if (notes.length === 0) {
      lastSignatureRef.current = "";
      setStatus("empty");
      setBuiltGraph(null);
      setGraph(null);
      setScene3D(EMPTY_SCENE_3D);
      return;
    }
    const signature = librarySignature(notes);
    if (signature !== lastSignatureRef.current) {
      lastSignatureRef.current = signature;
      const capped = capGraphNotes(notes);
      setBuiltGraph(
        buildNoteGraph(capped.map((n) => ({ content: n.content, path: n.path, pathHash: n.id, title: n.title }))),
      );
    }
    setStatus("ready");
  }, []);

  // Manual "Refresh" affordance in the empty state (§7): a background focus-refresh
  // already ran above and came back empty, so this gives the student an explicit
  // way to re-check the cloud after creating a note on the web app.
  const runManualRefresh = useCallback(async () => {
    if (!userId) return;
    setEmptyRefreshing(true);
    try {
      const fresh = await fetchLibrary(userId);
      applyNotes(fresh.notes);
    } catch {
      // stays on the empty state — nothing else to do here
    } finally {
      setEmptyRefreshing(false);
    }
  }, [userId, applyNotes]);

  // Cache first (instant, offline-friendly), then a cloud refresh behind it — same
  // "refresh on focus" policy as the Library tab. A refresh failure (offline) just
  // keeps whatever the cache already produced; only a genuinely empty cache AND a
  // failed refresh falls through to the empty state.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!userId) {
        setStatus("signin");
        return () => {
          alive = false;
        };
      }
      void (async () => {
        const cached = await loadCachedLibrary(userId);
        if (!alive) return;
        if (cached.notes.length > 0) applyNotes(cached.notes);
        try {
          const fresh = await fetchLibrary(userId);
          if (!alive) return;
          applyNotes(fresh.notes);
        } catch {
          if (cached.notes.length === 0) setStatus("empty");
        }
      })();
      return () => {
        alive = false;
      };
    }, [userId, applyNotes]),
  );

  // Load the persisted 2D/3D choice once at mount — same idiom
  // theme/ThemeProvider.tsx uses for its own appearance preference
  // (expo-secure-store; renders the shipped default, 2D, until the stored
  // value loads, so cold start never flashes 3D unexpectedly).
  useEffect(() => {
    let alive = true;
    void SecureStore.getItemAsync(GRAPH_MODE_STORE_KEY)
      .then((raw) => {
        if (!alive) return;
        if (raw === "2d" || raw === "3d") setMode(raw);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Pause/resume the animation loop on blur/focus — the phone twin of the
  // web Graph's idle-pause precedent (graph-canvas.tsx's IDLE_PAUSE_MS), and
  // a real fix here: Expo Router's bottom tabs keep this screen MOUNTED when
  // you switch tabs, so without this the sim (and, in 3D, an auto-orbiting
  // camera) would otherwise keep ticking off-screen. Separate from the
  // data-fetch useFocusEffect above — different concern, and React is fine
  // running more than one useFocusEffect in the same component.
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      ensureTicking();
      return () => {
        focusedRef.current = false;
        stopTicking();
      };
    }, [ensureTicking, stopTicking]),
  );

  // (Re)seeds the active mode's simulation whenever the note data, canvas
  // size, or mode changes — NOT when gravity/repulsion/linkDistance change;
  // those mutate the already-running sim in place (see the handlers above).
  // Snapshots once synchronously so the jittered spiral/sphere renders on
  // the very first frame, then ticks toward settled. Also resets 2D's
  // pinch/pan transform and 3D's camera back to identity/default so a fresh
  // graph, a resize, or a mode switch never starts out oddly zoomed, panned,
  // or rotated.
  useEffect(() => {
    stopTicking();
    lastFrameTimeRef.current = null;
    cameraActiveRef.current = false;

    if (mode === "2d") {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      sim3DRef.current = null;
      setScene3D(EMPTY_SCENE_3D);
      if (!builtGraph || builtGraph.nodes.length === 0) {
        sim2DRef.current = null;
        setGraph(null);
        return;
      }
      const sim = createLayoutSim(builtGraph, {
        gravity: initialForces.current.gravity,
        height: canvasH,
        linkDistance: initialForces.current.linkDistance,
        padding: 30,
        repulsion: initialForces.current.repulsion,
        width: canvasW,
      });
      sim2DRef.current = sim;
      setGraph(sim.snapshot());
      ensureTicking();
    } else {
      sim2DRef.current = null;
      setGraph(null);
      cameraRef.current = DEFAULT_CAMERA;
      if (!builtGraph || builtGraph.nodes.length === 0) {
        sim3DRef.current = null;
        setScene3D(EMPTY_SCENE_3D);
        return;
      }
      const sim = createLayoutSim3D(builtGraph, {
        gravity: initialForces.current.gravity,
        linkDistance: initialForces.current.linkDistance,
        repulsion: initialForces.current.repulsion,
      });
      sim3DRef.current = sim;
      const snapshot = sim.snapshot();
      const projected = projectNodes(snapshot.nodes, cameraRef.current, { height: canvasH, width: canvasW });
      projected3DRef.current = projected;
      nodes3DRef.current = snapshot.nodes;
      setScene3D({ edges: snapshot.edges, nodes: snapshot.nodes, projected });
      ensureTicking();
    }

    return () => {
      stopTicking();
      sim2DRef.current = null;
      sim3DRef.current = null;
    };
  }, [
    builtGraph,
    canvasW,
    canvasH,
    mode,
    ensureTicking,
    stopTicking,
    scale,
    savedScale,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
    // Not read inside the effect body (initialForces.current is, instead) —
    // bumped purely to force a reseed on Reset; see reseedNonce's declaration
    // above for why it's the only thing that does.
    reseedNonce,
  ]);

  // --- 2D gestures: pinch to zoom, one-finger pan on empty space to move —
  // both run purely on the UI thread (shared-value math only, no JS calls),
  // composed so either can be active at once (pinch-while-panning).
  // maxPointers(1) on the pan keeps a second finger exclusively in pinch's
  // domain. See GraphNodeView for why the pan gesture object itself (not
  // just a ref) is threaded down to nodes.
  const canvasPinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          savedScale.value = scale.value;
        })
        .onUpdate((event) => {
          scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * event.scale));
        })
        .onEnd(() => {
          savedScale.value = scale.value;
        }),
    [scale, savedScale],
  );

  const canvasPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        .onStart(() => {
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        })
        .onUpdate((event) => {
          translateX.value = savedTranslateX.value + event.translationX;
          translateY.value = savedTranslateY.value + event.translationY;
        })
        .onEnd(() => {
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        }),
    [translateX, translateY, savedTranslateX, savedTranslateY],
  );

  const canvasGesture = useMemo(
    () => Gesture.Simultaneous(canvasPinchGesture, canvasPanGesture),
    [canvasPinchGesture, canvasPanGesture],
  );

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  // --- 3D gestures: one-finger pan ORBITS the camera (owner's explicit
  // mapping — see the top-of-file comment) instead of panning the canvas;
  // pinch zooms the camera instead of the canvas. Both run `.runOnJS(true)`
  // — unlike the 2D gestures above, which stay entirely on the UI thread —
  // because orbiting has to feed the JS-side tick loop's per-frame
  // re-projection (graph-layout-3d.ts's projectNodes), the same reason
  // GraphNodeView.tsx's per-node drag already runs on the JS thread. A
  // single Tap (Race'd against pan+pinch, same pattern GraphNodeView.tsx
  // uses per-node) hit-tests the last projected frame — see
  // graph-layout-3d.ts's hitTestProjected — instead of every node owning
  // its own gesture detector (see GraphScene3D.tsx's top-of-file comment).
  const orbitPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minPointers(1)
        .maxPointers(1)
        .onStart(() => {
          cameraStartRef.current = cameraRef.current;
          cameraActiveRef.current = true;
          ensureTicking();
        })
        .onUpdate((event) => {
          cameraRef.current = rotateCamera(
            cameraStartRef.current,
            event.translationX * ORBIT_RADIANS_PER_PX,
            -event.translationY * ORBIT_RADIANS_PER_PX,
          );
          ensureTicking();
        })
        .onEnd(() => {
          cameraActiveRef.current = false;
        })
        .onFinalize(() => {
          cameraActiveRef.current = false;
        }),
    [ensureTicking],
  );

  const orbitPinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => {
          zoomStartRef.current = cameraRef.current.zoom;
          cameraActiveRef.current = true;
          ensureTicking();
        })
        .onUpdate((event) => {
          const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomStartRef.current * event.scale));
          cameraRef.current = { ...cameraRef.current, zoom: nextZoom };
          ensureTicking();
        })
        .onEnd(() => {
          cameraActiveRef.current = false;
        })
        .onFinalize(() => {
          cameraActiveRef.current = false;
        }),
    [ensureTicking],
  );

  const orbitTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDistance(10)
        .onEnd((event, success) => {
          if (!success) return;
          const index = hitTestProjected(event.x, event.y, projected3DRef.current, BASE_NODE_R * nodeSizeRef.current);
          if (index === null) return;
          const node = nodes3DRef.current[index];
          if (node) openNode(node);
        }),
    [openNode],
  );

  const orbitGesture = useMemo(
    () => Gesture.Race(orbitTapGesture, Gesture.Simultaneous(orbitPanGesture, orbitPinchGesture)),
    [orbitTapGesture, orbitPanGesture, orbitPinchGesture],
  );

  // Graph-shape aggregates (max degree, "is this a small graph") are
  // properties of builtGraph itself — the SAME regardless of which mode is
  // rendering it — so they're computed once here rather than per-mode.
  const nodeCount = builtGraph?.nodes.length ?? 0;
  const smallGraphAllLabels = isSmallGraph(nodeCount);
  const maxDegree = Math.max(1, ...(builtGraph?.nodes.map((n) => n.degree) ?? []));
  const showLabelFor = useCallback(
    (node: GraphNode) => shouldShowLabel(labelMode, node, smallGraphAllLabels),
    [labelMode, smallGraphAllLabels],
  );

  const hasGraph = status === "ready" && !!builtGraph && builtGraph.nodes.length > 0;

  // Publish the settings gear into the TopBar's right slot (owner 2026-07-18: on the
  // right, in line with the menu button). Living in the chrome layer keeps it crisp
  // above the status-bar blur and perfectly aligned. Cleared when the graph isn't
  // ready and on unmount so it never lingers onto another screen.
  useEffect(() => {
    setHeaderRight(
      hasGraph ? (
        <GlassSurface style={styles.gearGlass} fallbackColor={c.glassPanel} tint={settingsOpen ? c.accentFaint : undefined} shadow>
          <Pressable
            accessibilityLabel="Graph settings"
            accessibilityRole="button"
            accessibilityState={{ expanded: settingsOpen }}
            hitSlop={8}
            onPress={() => setSettingsOpen((v) => !v)}
            style={styles.gearGlassInner}
            testID="graph-settings-toggle"
          >
            <SettingsIcon color={settingsOpen ? c.accent : c.text2} size={18} />
          </Pressable>
        </GlassSurface>
      ) : null,
    );
    return () => setHeaderRight(null);
  }, [hasGraph, settingsOpen, c, styles, setHeaderRight]);

  return (
    <View style={styles.flex} testID="graph-screen">
      {status === "loading" ? (
        <View style={[styles.centered, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="graph-loading">
          <ActivityIndicator color={c.text2} />
        </View>
      ) : status === "signin" ? (
        <View style={[styles.centered, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="graph-signin">
          <EmptyBlock
            title="Sign in to see your graph"
            body="The graph is drawn from your account's library. Sign in and the connections between your notes appear here."
          />
          <View style={styles.pairBtn}>
            <MissionButton label="Sign in" variant="primary" testID="graph-goto-signin" onPress={() => router.push("/sign-in")} />
          </View>
        </View>
      ) : status === "empty" ? (
        <View style={[styles.centered, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="graph-empty">
          <EmptyBlock
            title="Nothing here yet"
            body="Your library lives in your account. Create notes on the web app and they appear here."
          />
          <View style={styles.pairBtn}>
            <MissionButton label="Refresh" busy={emptyRefreshing} testID="graph-empty-refresh" onPress={() => void runManualRefresh()} />
          </View>
        </View>
      ) : hasGraph ? (
        <View
          style={[styles.canvasClip, { width: canvasW, height: canvasH, marginTop: contentTop }]}
          testID="graph-canvas"
        >
          {mode === "2d" ? (
            graph ? (
              <GestureDetector gesture={canvasGesture}>
                <Animated.View style={[{ width: canvasW, height: canvasH }, canvasAnimatedStyle]}>
                  <Svg width={canvasW} height={canvasH}>
                    {graph.edges.map((edge, i) => {
                      const a = graph.nodes[edge.a];
                      const b = graph.nodes[edge.b];
                      return <Line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.lineMuted} strokeWidth={1} />;
                    })}
                  </Svg>
                  {graph.nodes.map((node, i) => (
                    <GraphNodeView
                      key={node.pathHash}
                      c={c}
                      canvasPanGesture={canvasPanGesture}
                      index={i}
                      maxDegree={maxDegree}
                      node={node}
                      onDragEnd={handleNodeDragEnd}
                      onDragStart={handleNodeDragStart}
                      onDragTo={handleNodeDragTo}
                      onOpen={openNode}
                      scale={scale}
                      showLabel={showLabelFor(node)}
                      sizeMultiplier={nodeSize}
                    />
                  ))}
                </Animated.View>
              </GestureDetector>
            ) : null
          ) : (
            <GestureDetector gesture={orbitGesture}>
              <View style={{ width: canvasW, height: canvasH }} testID="graph-canvas-3d">
                <GraphScene3D
                  c={c}
                  edges={scene3D.edges}
                  height={canvasH}
                  maxDegree={maxDegree}
                  nodeSizeMultiplier={nodeSize}
                  nodes={scene3D.nodes}
                  projected={scene3D.projected}
                  showLabel={showLabelFor}
                  width={canvasW}
                />
              </View>
            </GestureDetector>
          )}
        </View>
      ) : null}

      {/* Screen title — centered overlay chrome. pointerEvents="none" so the
          canvas pan/drag/orbit underneath is never intercepted. */}
      <View pointerEvents="none" style={[styles.titleOverlay, { top: contentTop }]}>
        <Text style={styles.headerTitle}>Graph</Text>
        {status === "ready" && builtGraph ? (
          <Text style={styles.headerMeta}>
            {builtGraph.nodes.length} notes · {builtGraph.edges.length} connections
          </Text>
        ) : null}
      </View>

      {hasGraph && settingsOpen ? (
        <GraphSettingsPanel
          c={c}
          gravity={gravity}
          labelMode={labelMode}
          linkDistance={linkDistance}
          mode={mode}
          nodeSize={nodeSize}
          onGravityChange={handleGravityChange}
          onLabelModeChange={setLabelMode}
          onLinkDistanceChange={handleLinkDistanceChange}
          onModeChange={handleModeChange}
          onNodeSizeChange={setNodeSize}
          onReset={handleReset}
          onRepulsionChange={handleRepulsionChange}
          onRotationSpeedChange={handleRotationSpeedChange}
          repulsion={repulsion}
          rotationSpeed={rotationSpeed}
          top={contentTop + space(2)}
        />
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    // Screen title — a centered overlay band pinned to the top of the canvas.
    // zIndex lifts it above the in-flow canvas; the element itself carries
    // pointerEvents="none" so it never intercepts canvas gestures.
    titleOverlay: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 20 },
    headerTitle: { ...type.h2, color: c.text, textAlign: "center" },
    headerMeta: { ...type.micro, color: c.text3, marginTop: 2, textAlign: "center" },
    // The gear button lives in the TopBar's right slot (see the setHeaderRight effect);
    // this is just its glass shape — 44pt to fill that slot and match the menu button.
    gearGlass: {
      width: GEAR_SIZE,
      height: GEAR_SIZE,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      overflow: "hidden",
    },
    gearGlassInner: { flex: 1, alignItems: "center", justifyContent: "center" },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    pairBtn: { paddingBottom: space(4), paddingHorizontal: space(8), alignSelf: "stretch" },
    // Clips the pinch/pan transform (2D) so a zoomed-in or panned graph never
    // paints over the header above it; 3D's canvas is fixed-size so this is
    // just a safety clip there.
    canvasClip: { overflow: "hidden" },
  });
