import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import { fetchLibrary, loadCachedLibrary, type CloudLibraryNote } from "@/api/cloudLibrary";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { GlassSurface } from "@/components/GlassSurface";
import { GraphNodeView } from "@/components/GraphNodeView";
import { GraphSettingsPanel } from "@/components/GraphSettingsPanel";
import { SettingsIcon } from "@/components/icons";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { capGraphNotes, DEFAULT_FORCES, fitScaleFor, isSmallGraph, type LabelMode, shouldShowLabel } from "@/lib/graph-settings";
import { buildNoteGraph, createLayoutSim, type LayoutSim, type NoteGraph } from "@/lib/note-graph";
import type { GraphNode } from "@/lib/note-graph";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/palette";
import { radius, space, type } from "@/theme/tokens";

// Graph (cloud-first pivot, docs/design/nemesis-cloud-first-phone-2026-07.md §7) —
// the phone's twin of the web app's Graph page, 2D only (the 3D mode built
// 2026-07-20 was removed on owner ask 2026-07-21 — git history has it).
// Nodes are your account's library notes; an edge is a [[wikilink]] or
// [text](note.md) mention between two of them — including "ghost" nodes for
// a mention that doesn't resolve to any real note yet (see note-graph.ts's
// buildNoteGraph). Renders from the local disk cache first (offline-friendly,
// instant), refreshed from the cloud on every focus: cloudLibrary.ts →
// buildNoteGraph (note-graph.ts) → an animated force layout →
// react-native-svg.
//
// createLayoutSim (note-graph.ts) seeds a jittered spiral, edges draw as
// <Line>s, nodes are real Views (GraphNodeView) layered on top so each can
// carry its own drag/tap gesture, and the whole canvas pans/zooms as a cheap
// UI-thread transform (reanimated shared values) — no per-frame JS work
// while idle.
//
// One requestAnimationFrame loop (tick, below) steps the sim (a
// settle-and-stop cooling schedule) and stops scheduling itself the instant
// nothing would visibly change (sim settled) — an exact stop rather than
// web's graph-canvas.tsx IDLE_PAUSE_MS timer heuristic, which exists there
// because that engine has no cheap way to ask "is anything still moving";
// this one does (LayoutSim.settled), so a fixed grace period isn't needed.
// It also fully pauses on blur (tab switched away, screen still mounted
// under Expo Router's bottom tabs) and resumes on refocus — the
// phone-specific twin of that same web idle-pause precedent.
//
// Settings panel (GraphSettingsPanel.tsx): Gravity/Repulsion/Node size/Link
// distance mutate the running sim; Labels (All/Hubs/None) governs label
// visibility. See GraphSettingsPanel.tsx's top-of-file comment for exactly
// which of the web Graph's controls made the cut and which were skipped.
//
// The screen title ("Graph") is a centered, pointer-transparent overlay
// (pointerEvents="none") so canvas pan/drag passes straight through it. The
// settings gear lives in the TopBar's right slot (setHeaderRight).

// Size of the floating glass settings-gear button (top-RIGHT overlay chrome, sized to
// match the TopBar's 44pt menu button it sits opposite — owner 2026-07-18).
const GEAR_SIZE = 44;
// Physics steps per rendered animation frame — tuned to feel about as snappy
// as the previous setInterval(30ms)*3-steps schedule now that rAF (~60fps)
// drives ticking instead (see the top-of-file comment).
const STEPS_PER_FRAME = 2;
// Whole-canvas pinch-zoom bounds.
const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

type Status = "loading" | "signin" | "empty" | "ready";

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
  const [emptyRefreshing, setEmptyRefreshing] = useState(false);
  const [gravity, setGravity] = useState(DEFAULT_FORCES.gravity);
  const [repulsion, setRepulsion] = useState(DEFAULT_FORCES.repulsion);
  const [nodeSize, setNodeSize] = useState(DEFAULT_FORCES.nodeSize);
  const [linkDistance, setLinkDistance] = useState(DEFAULT_FORCES.linkDistance);
  const [labelMode, setLabelMode] = useState<LabelMode>(DEFAULT_FORCES.labelMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped only by Reset (see handleReset) to force the seeding effect below
  // to recreate the sim even when every force is already at its default —
  // opening/closing the settings panel deliberately never touches this.
  const [reseedNonce, setReseedNonce] = useState(0);

  const sim2DRef = useRef<LayoutSim | null>(null);
  const rafRef = useRef<number | null>(null);
  // Set false on blur (tab switched away, screen still mounted — see the
  // top-of-file comment) so the rAF loop refuses to (re)schedule itself
  // until focus returns.
  const focusedRef = useRef(true);
  // Last signature (see librarySignature) a graph was actually built from —
  // lets applyNotes below skip rebuilding (and thus reseeding the layout)
  // when a background refresh confirms nothing changed.
  const lastSignatureRef = useRef<string>("");
  const canvasSizeRef = useRef({ height: 0, width: 0 });
  // True between a (re)seed and the zoom-to-fit that follows it settling — see
  // fitToContent. Not a state: reading it inside the rAF loop must never
  // re-render, and setting it must never restart the loop.
  const pendingFitRef = useRef(true);
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

  // ZOOM TO FIT once the layout stops moving (owner 2026-07-23: "the graph
  // page sucks"). The screen had NO fit at all — scale was pinned to 1 and the
  // transform to identity — so on any graph whose repulsion pushed it past the
  // canvas, most of it simply sat off-screen with nothing to say so. The seed
  // spiral is bounded by the canvas, so this only ever matters once the sim has
  // spread things out, which is why it runs on settle rather than per frame.
  //
  // The transform container is exactly the canvas and React Native scales about
  // an element's centre, so centring the content is just "how far the content's
  // centre is from the canvas centre", scaled.
  const fitToContent = useCallback(
    (snap: NoteGraph) => {
      const { width: vw, height: vh } = canvasSizeRef.current;
      if (vw <= 0 || vh <= 0 || snap.nodes.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of snap.nodes) {
        if (node.x < minX) minX = node.x;
        if (node.x > maxX) maxX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.y > maxY) maxY = node.y;
      }
      // Room for the dot itself and the label hanging under it, so an outermost
      // node isn't half off the edge at the fitted zoom.
      const pad = 36;
      const next = fitScaleFor(
        { height: maxY - minY + pad * 2, width: maxX - minX + pad * 2 },
        { height: vh, width: vw },
        MIN_SCALE,
        MAX_SCALE,
      );
      const nextX = -((minX + maxX) / 2 - vw / 2) * next;
      const nextY = -((minY + maxY) / 2 - vh / 2) * next;
      scale.value = withTiming(next, { duration: 280 });
      translateX.value = withTiming(nextX, { duration: 280 });
      translateY.value = withTiming(nextY, { duration: 280 });
      // The gesture handlers read these on the next pinch/pan, so they have to
      // agree with where the view actually ended up.
      savedScale.value = next;
      savedTranslateX.value = nextX;
      savedTranslateY.value = nextY;
    },
    [scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY],
  );

  // The one animation loop — see the top-of-file comment for why one rAF
  // driver replaces the old setInterval and how it decides to keep
  // rescheduling itself. Deps are shared values and stable callbacks only, so
  // its identity never changes — which is what lets ensureTicking stay stable.
  const tick = useCallback(() => {
    rafRef.current = null;
    if (!focusedRef.current) return;
    const sim = sim2DRef.current;
    if (!sim) return;
    for (let i = 0; i < STEPS_PER_FRAME && !sim.settled; i++) sim.step();
    const snap = sim.snapshot();
    setGraph(snap);
    if (!sim.settled) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    // Settled. Fit ONCE per seed/reset — refitting after every slider nudge
    // would yank the view out from under someone who had panned deliberately.
    if (pendingFitRef.current) {
      pendingFitRef.current = false;
      fitToContent(snap);
    }
  }, [fitToContent]);

  const ensureTicking = useCallback(() => {
    if (rafRef.current !== null) return;
    if (!focusedRef.current) return;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // Sliders mutate the running sim and reheat it — no reseed, so the graph
  // keeps its current shape and just re-relaxes under the new forces. Node
  // size is pure rendering (a prop multiplier) and needs neither a reheat
  // nor a wake — setNodeSize is passed straight through to
  // GraphSettingsPanel below.
  const handleGravityChange = useCallback(
    (v: number) => {
      setGravity(v);
      if (sim2DRef.current) {
        sim2DRef.current.gravity = v;
        sim2DRef.current.reheat();
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
      ensureTicking();
    },
    [ensureTicking],
  );

  // The only control that reseeds: restores every default and bumps
  // reseedNonce so the seeding effect (below) recreates the sim from a
  // fresh spiral — which also clears any pinned/dragged node and re-centers
  // pan/zoom, same as a real note-data or resize reseed.
  const handleReset = useCallback(() => {
    setGravity(DEFAULT_FORCES.gravity);
    setRepulsion(DEFAULT_FORCES.repulsion);
    setNodeSize(DEFAULT_FORCES.nodeSize);
    setLinkDistance(DEFAULT_FORCES.linkDistance);
    setLabelMode(DEFAULT_FORCES.labelMode);
    setReseedNonce((n) => n + 1);
  }, []);

  const navigateToNote = useCallback((pathHash: string) => {
    router.push({ params: { id: pathHash }, pathname: "/note" });
  }, []);

  // GraphNodeView's "a node was tapped" entry point — a ghost has no real
  // note behind it (see note-graph.ts's GraphNode.ghost doc comment for why
  // opening one is a no-op here rather than creating the note the way the
  // web Graph does).
  const openNode = useCallback(
    (node: GraphNode) => {
      if (node.ghost) return;
      navigateToNote(node.pathHash);
    },
    [navigateToNote],
  );

  // A node drag brackets the sim's active-drag state (note-graph.ts's
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

  // Pause/resume the animation loop on blur/focus — the phone twin of the
  // web Graph's idle-pause precedent (graph-canvas.tsx's IDLE_PAUSE_MS), and
  // a real fix here: Expo Router's bottom tabs keep this screen MOUNTED when
  // you switch tabs, so without this the sim would otherwise keep ticking
  // off-screen. Separate from the data-fetch useFocusEffect above —
  // different concern, and React is fine running more than one
  // useFocusEffect in the same component.
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

  // (Re)seeds the simulation whenever the note data or canvas size changes —
  // NOT when gravity/repulsion/linkDistance change; those mutate the
  // already-running sim in place (see the handlers above). Snapshots once
  // synchronously so the jittered spiral renders on the very first frame,
  // then ticks toward settled. Also resets the pinch/pan transform back to
  // identity so a fresh graph or a resize never starts out oddly zoomed or
  // panned.
  useEffect(() => {
    stopTicking();

    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    // A fresh layout earns a fresh zoom-to-fit once it settles.
    pendingFitRef.current = true;
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

    return () => {
      stopTicking();
      sim2DRef.current = null;
    };
  }, [
    builtGraph,
    canvasW,
    canvasH,
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

  // --- Canvas gestures: pinch to zoom, one-finger pan on empty space to
  // move — both run purely on the UI thread (shared-value math only, no JS
  // calls), composed so either can be active at once (pinch-while-panning).
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

  // Graph-shape aggregates (max degree, "is this a small graph") are
  // properties of builtGraph itself, computed once here.
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
        // Kept as a spinner, not a skeleton: a force-directed layout only gets node
        // positions once createLayoutSim seeds it from the real graph, so there is no
        // shape to preview ahead of that — a placeholder canvas would just be guessing.
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
          {graph ? (
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
          ) : null}
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
          nodeSize={nodeSize}
          onGravityChange={handleGravityChange}
          onLabelModeChange={setLabelMode}
          onLinkDistanceChange={handleLinkDistanceChange}
          onNodeSizeChange={setNodeSize}
          onReset={handleReset}
          onRepulsionChange={handleRepulsionChange}
          repulsion={repulsion}
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
    // Clips the pinch/pan transform so a zoomed-in or panned graph never
    // paints over the header above it.
    canvasClip: { overflow: "hidden" },
  });
