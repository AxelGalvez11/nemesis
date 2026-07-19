import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { decryptLibrary, loadCachedRows, loadVaultKey, pullLibraryRows } from "@/api/librarySync";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { ForceSlider } from "@/components/ForceSlider";
import { GlassSurface } from "@/components/GlassSurface";
import { GraphNodeView } from "@/components/GraphNodeView";
import { SettingsIcon } from "@/components/icons";
import { useShellPadding } from "@/components/shell-chrome";
import { buildNoteGraph, createLayoutSim, type GraphNode, type LayoutSim, type NoteGraph } from "@/lib/note-graph";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/palette";
import { radius, space, type } from "@/theme/tokens";

// Graph — the phone's twin of the desktop Graph page, rebuilt for read-only sync.
// Nodes are the synced library notes; an edge is a [[wikilink]] mention between two
// of them. Everything renders from the local cache (offline-friendly, zero tokens):
// decrypt → buildNoteGraph → animated force layout → an SVG for edges with real
// Views layered on top for nodes. The desktop's 3D scene stays a desktop luxury — a
// 2D constellation is the right weight for a phone.
//
// The layout ANIMATES: createLayoutSim (note-graph.ts) seeds a jittered spiral,
// then a setInterval here ticks it toward settled, pushing each frame's positions
// into React state. Two touch layers sit on top of that animation:
//   - Whole-canvas PINCH (zoom) + one-finger PAN (move), via
//     react-native-gesture-handler Gesture.Pinch()/Gesture.Pan() composed with
//     Gesture.Simultaneous and driving reanimated shared values (scale,
//     translateX, translateY) applied as a transform on the Animated.View that
//     wraps the SVG + node Views.
//   - Per-node DRAG (GraphNodeView), which pins the dragged node in the sim
//     (LayoutSim.pin in note-graph.ts) so the running force layout stops fighting
//     the finger, while startDrag/endDrag (also note-graph.ts) keep the sim fully
//     energized — with a temporarily stiffer pull on the dragged node's own edges —
//     for the whole gesture, so its linked neighbors visibly get pulled along
//     instead of the layout barely reacting.
//
// The screen title ("Graph") and a gear button are floating overlay chrome
// (position: absolute, layered ABOVE the canvas): the title is centered and
// pointer-transparent (pointerEvents="none") so canvas pan/drag passes straight
// through it, and the gear — a top-left GlassSurface button whose wrapper is
// pointerEvents="box-none" so only the button itself is tappable — toggles a
// settings panel: Gravity/Repulsion/Node size/Link distance sliders
// (ForceSlider), a Labels 3-way toggle, and a Reset.
// The panel is a FLOATING overlay (position: absolute, opaque background, above
// the canvas in z-order) rather than an in-flow block — deliberately, so opening
// or closing it never changes canvasH and therefore never re-triggers the
// seeding effect below. Gravity/Repulsion/Link distance mutate the running sim
// in place and "reheat" it (identical pattern, all three); Node size is pure
// rendering — a prop multiplying GraphNodeView's radius — and never touches the
// sim. Reset is the ONLY control that reseeds (see reseedNonce): dragging a
// node and panning/zooming survive every other control, including opening and
// closing the panel itself. A short tap on a node still opens the note.

// Size of the floating glass settings-gear button (top-left overlay chrome).
const GEAR_SIZE = 40;
const TICK_MS = 30;
// Multiple physics steps per rendered frame: at one step per tick the default
// 180-iteration settle takes ~5.4s, which reads as sluggish. Batching keeps the
// exact same final (and intermediate) math as note-graph.ts — just fewer, chunkier
// frames rendered.
const STEPS_PER_TICK = 3;
// Whole-canvas pinch-zoom bounds.
const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

type Status = "loading" | "unpaired" | "empty" | "ready";

// Which node labels the settings panel's Labels toggle shows. "hubs" is the
// default and reproduces the screen's original always-on behavior exactly —
// see shouldShowLabel below.
type LabelMode = "all" | "hubs" | "none";
const LABEL_MODES: { id: LabelMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hubs", label: "Hubs" },
  { id: "none", label: "None" },
];

/** The original label-visibility rule, factored out so the Labels toggle can
 * widen ("all") or narrow ("none") it without disturbing the "hubs" default:
 * small graphs (≤40 nodes) always showed every label; larger ones only
 * labeled nodes with 2+ connections. */
function shouldShowLabel(mode: LabelMode, node: GraphNode, smallGraphAllLabels: boolean): boolean {
  if (mode === "all") return true;
  if (mode === "none") return false;
  return smallGraphAllLabels || node.degree >= 2;
}

export default function GraphScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const { contentTop, contentBottom } = useShellPadding();
  const win = useWindowDimensions();
  const [status, setStatus] = useState<Status>("loading");
  const [builtGraph, setBuiltGraph] = useState<NoteGraph | null>(null);
  const [graph, setGraph] = useState<NoteGraph | null>(null);
  const [gravity, setGravity] = useState(1);
  const [repulsion, setRepulsion] = useState(1);
  const [nodeSize, setNodeSize] = useState(1);
  const [linkDistance, setLinkDistance] = useState(1);
  const [labelMode, setLabelMode] = useState<LabelMode>("hubs");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped only by Reset (see handleReset) to force the seeding effect below
  // to recreate the sim even when gravity/repulsion/linkDistance are already
  // at their defaults. The ONLY on-demand reseed trigger in this screen —
  // opening/closing the settings panel deliberately never touches this.
  const [reseedNonce, setReseedNonce] = useState(0);

  const simRef = useRef<LayoutSim | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
  // nodes just from tapping the gear icon. The title/gear chrome are likewise
  // absolute overlays (not in flow), so the canvas fills the whole area below
  // the shell TopBar.
  const canvasH = Math.max(220, win.height - contentTop - contentBottom);

  // Whole-canvas pinch/pan transform. `saved*` hold the value the gesture
  // started from, so each new pinch/pan composes on top of wherever the
  // canvas already was instead of jumping back to identity.
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const stopTicking = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const ensureTicking = useCallback(() => {
    if (tickRef.current !== null) return;
    tickRef.current = setInterval(() => {
      const sim = simRef.current;
      if (!sim) {
        stopTicking();
        return;
      }
      // Liveness note: while a drag is active, sim.settled is always false
      // (see LayoutSim.startDrag in note-graph.ts), so this loop's own exit
      // below depends on endDrag() being reached — normally guaranteed by
      // GraphNodeView's pan gesture firing onDragEnd from `.onFinalize()`
      // (RNGH's documented always-runs-eventually callback). If that were
      // ever missed, this interval would keep re-rendering every node every
      // tick indefinitely; it self-heals on the next drag (startDrag resets
      // the sim's drag state) and on leaving the screen (the seeding effect's
      // cleanup calls stopTicking()), so this is a low-severity latent risk,
      // not a correctness bug — noted rather than defended against further.
      for (let i = 0; i < STEPS_PER_TICK && !sim.settled; i++) sim.step();
      setGraph(sim.snapshot());
      if (sim.settled) stopTicking();
    }, TICK_MS);
  }, [stopTicking]);

  // Sliders mutate the running sim directly and reheat it — no reseed, so the
  // graph keeps its current shape and just re-relaxes under the new forces.
  const handleGravityChange = useCallback(
    (v: number) => {
      setGravity(v);
      const sim = simRef.current;
      if (sim) {
        sim.gravity = v;
        sim.reheat();
        ensureTicking();
      }
    },
    [ensureTicking],
  );

  const handleRepulsionChange = useCallback(
    (v: number) => {
      setRepulsion(v);
      const sim = simRef.current;
      if (sim) {
        sim.repulsion = v;
        sim.reheat();
        ensureTicking();
      }
    },
    [ensureTicking],
  );

  const handleLinkDistanceChange = useCallback(
    (v: number) => {
      setLinkDistance(v);
      const sim = simRef.current;
      if (sim) {
        sim.linkDistance = v;
        sim.reheat();
        ensureTicking();
      }
    },
    [ensureTicking],
  );

  // Node size is pure rendering — a prop multiplying GraphNodeView's radius —
  // so, unlike the three handlers above, it never touches the sim and needs no
  // reheat/ensureTicking. setNodeSize's setter signature already matches
  // ForceSlider's onChange, so it's passed straight through in the JSX below.

  // The only control that reseeds: restores every default and bumps
  // reseedNonce so the seeding effect (below) recreates the sim from a fresh
  // spiral — which also clears any pinned/dragged nodes and re-centers
  // pan/zoom, same as a real note-data or resize reseed.
  const handleReset = useCallback(() => {
    setGravity(1);
    setRepulsion(1);
    setNodeSize(1);
    setLinkDistance(1);
    setLabelMode("hubs");
    setReseedNonce((n) => n + 1);
  }, []);

  const openNote = useCallback((pathHash: string) => {
    router.push({ params: { ph: pathHash }, pathname: "/note" });
  }, []);

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
      const sim = simRef.current;
      if (!sim) return;
      sim.startDrag(index);
      ensureTicking();
    },
    [ensureTicking],
  );

  const handleNodeDragTo = useCallback(
    (index: number, x: number, y: number) => {
      const sim = simRef.current;
      if (!sim) return;
      sim.pin(index, x, y);
      ensureTicking();
      setGraph(sim.snapshot());
    },
    [ensureTicking],
  );

  const handleNodeDragEnd = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.endDrag();
    ensureTicking();
    setGraph(sim.snapshot());
  }, [ensureTicking]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const key = await loadVaultKey();
        if (!alive) return;
        if (!key) {
          setStatus("unpaired");
          return;
        }
        let cache = await loadCachedRows();
        if (Object.keys(cache).length === 0) {
          // First visit before the Library tab ever pulled: try one network pull,
          // but stay graceful offline — an empty graph is a state, not an error.
          try {
            cache = await pullLibraryRows(cache);
          } catch {
            // offline: render from whatever the cache holds
          }
        }
        if (!alive) return;
        const notes = decryptLibrary(cache, key)
          .docs.filter((d) => d.kind === "note")
          .map((d) => ({ content: d.content, path: d.path, pathHash: d.pathHash, title: d.title }));
        if (notes.length === 0) {
          setStatus("empty");
          setBuiltGraph(null);
          setGraph(null);
          return;
        }
        setBuiltGraph(buildNoteGraph(notes));
        setStatus("ready");
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  // (Re)seeds the simulation whenever the note data or canvas size changes —
  // NOT when gravity/repulsion change; those mutate the already-running sim in
  // place (see the handlers above). Snapshots once synchronously so the
  // jittered spiral renders on the very first frame, then ticks toward settled.
  // Also resets the pinch/pan transform back to identity so a fresh graph (or a
  // resize) never starts out oddly zoomed or panned.
  useEffect(() => {
    stopTicking();
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    if (!builtGraph || builtGraph.nodes.length === 0) {
      simRef.current = null;
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
    simRef.current = sim;
    setGraph(sim.snapshot());
    ensureTicking();
    return () => {
      stopTicking();
      simRef.current = null;
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

  // Pinch to zoom, one-finger pan on empty space to move — both run purely on
  // the UI thread (shared-value math only, no JS calls), composed so either can
  // be active at once (pinch-while-panning). maxPointers(1) on the pan keeps a
  // second finger exclusively in pinch's domain. See GraphNodeView for why the
  // pan gesture object itself (not just a ref) is threaded down to nodes.
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

  const smallGraphAllLabels = (graph?.nodes.length ?? 0) <= 40;
  const hasGraph = status === "ready" && !!graph && graph.nodes.length > 0;

  return (
    <View style={styles.flex} testID="graph-screen">
      {status === "loading" ? (
        <View style={[styles.centered, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="graph-loading">
          <ActivityIndicator color={c.text2} />
        </View>
      ) : status === "unpaired" ? (
        <View style={[styles.centered, { paddingTop: contentTop, paddingBottom: contentBottom }]}>
          <EmptyBlock
            title="Pair with your Mac"
            body="The graph is drawn from your synced library. Pair this phone and your notes — and the links between them — appear here."
          />
          <View style={styles.pairBtn}>
            <MissionButton label="Pair with your Mac" variant="primary" onPress={() => router.push("/pair")} />
          </View>
        </View>
      ) : status === "empty" ? (
        <View style={[styles.centered, { paddingTop: contentTop, paddingBottom: contentBottom }]}>
          <EmptyBlock
            title="No notes to map yet"
            body="As Nemesis writes notes into your library on the Mac, the connections between them draw themselves here."
          />
        </View>
      ) : graph ? (
        <View
          style={[styles.canvasClip, { width: canvasW, height: canvasH, marginTop: contentTop }]}
          testID="graph-canvas"
        >
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
                  node={node}
                  onDragEnd={handleNodeDragEnd}
                  onDragStart={handleNodeDragStart}
                  onDragTo={handleNodeDragTo}
                  onOpen={openNote}
                  scale={scale}
                  showLabel={shouldShowLabel(labelMode, node, smallGraphAllLabels)}
                  sizeMultiplier={nodeSize}
                />
              ))}
            </Animated.View>
          </GestureDetector>
        </View>
      ) : null}

      {/* Screen title — centered overlay chrome. pointerEvents="none" so the
          canvas pan/drag underneath is never intercepted. */}
      <View pointerEvents="none" style={[styles.titleOverlay, { top: contentTop }]}>
        <Text style={styles.headerTitle}>Graph</Text>
        {status === "ready" && graph ? (
          <Text style={styles.headerMeta}>
            {graph.nodes.length} notes · {graph.edges.length} connections
          </Text>
        ) : null}
      </View>

      {/* Settings gear — a top-left GlassSurface button. The wrapper is
          pointerEvents="box-none", so ONLY the glass button is tappable and the
          rest of the canvas underneath still receives pan/drag gestures. */}
      {hasGraph ? (
        <View pointerEvents="box-none" style={[styles.gearOverlay, { top: contentTop }]}>
          <GlassSurface style={styles.gearGlass} tint={settingsOpen ? c.accentFaint : undefined}>
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
        </View>
      ) : null}

      {hasGraph && settingsOpen ? (
        <View style={[styles.panel, { top: contentTop + GEAR_SIZE + space(2) }]} testID="graph-settings-panel">
          <ForceSlider c={c} label="Gravity" max={3} min={0} onChange={handleGravityChange} step={0.1} value={gravity} />
          <ForceSlider c={c} label="Repulsion" max={4} min={0.2} onChange={handleRepulsionChange} step={0.1} value={repulsion} />
          <ForceSlider c={c} label="Node size" max={2} min={0.5} onChange={setNodeSize} step={0.1} value={nodeSize} />
          <ForceSlider
            c={c}
            label="Link distance"
            max={2}
            min={0.5}
            onChange={handleLinkDistanceChange}
            step={0.1}
            value={linkDistance}
          />

          <View style={styles.labelsRow}>
            <Text style={styles.panelLabel}>Labels</Text>
            <View style={styles.segment} testID="graph-label-mode">
              {LABEL_MODES.map((entry) => (
                <Pressable
                  key={entry.id}
                  testID={`graph-label-mode-${entry.id}`}
                  onPress={() => setLabelMode(entry.id)}
                  style={[styles.segmentItem, labelMode === entry.id && styles.segmentItemActive]}
                >
                  <Text style={[styles.segmentText, labelMode === entry.id && styles.segmentTextActive]}>
                    {entry.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable accessibilityRole="button" onPress={handleReset} style={styles.resetBtn} testID="graph-settings-reset">
            <Text style={styles.resetBtnText}>Reset to defaults</Text>
          </Pressable>
        </View>
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
    // Gear overlay — top-left, above the canvas and left-aligned under the
    // shell TopBar's menu button. The wrapper only positions; box-none (in JSX)
    // means just the glass button inside is tappable.
    gearOverlay: { position: "absolute", left: space(3), zIndex: 30 },
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
    // The settings panel: a FLOATING overlay (see the top-of-file comment for
    // why), not an in-flow block — opaque so it fully occludes the canvas
    // beneath it, and on top in paint order (zIndex/elevation) so its own
    // Pressables/ForceSliders always receive the touch instead of the canvas
    // underneath.
    panel: {
      position: "absolute",
      left: 0,
      right: 0,
      zIndex: 50,
      elevation: 20,
      backgroundColor: c.bg,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      paddingHorizontal: space(4),
      paddingTop: space(3),
      paddingBottom: space(3),
      gap: space(3),
    },
    labelsRow: { gap: space(1.5) },
    panelLabel: { ...type.micro, color: c.text2 },
    segment: { flexDirection: "row", backgroundColor: c.surface2, borderRadius: radius.sm, padding: 3, gap: 3 },
    segmentItem: { flex: 1, paddingVertical: space(1.5), alignItems: "center", borderRadius: radius.sm - 2 },
    segmentItemActive: { backgroundColor: c.accentFaint },
    segmentText: { ...type.micro, color: c.text2, fontWeight: "600" },
    segmentTextActive: { color: c.accent },
    resetBtn: {
      alignSelf: "flex-start",
      paddingVertical: space(1.5),
      paddingHorizontal: space(3),
      borderRadius: radius.sm,
      backgroundColor: c.surface2,
    },
    resetBtnText: { ...type.micro, color: c.text2, fontWeight: "600" },
  });
