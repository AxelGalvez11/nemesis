import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { decryptLibrary, loadCachedRows, loadVaultKey, pullLibraryRows } from "@/api/librarySync";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { ForceSlider } from "@/components/ForceSlider";
import { GraphNodeView } from "@/components/GraphNodeView";
import { useShellPadding } from "@/components/shell-chrome";
import { buildNoteGraph, createLayoutSim, type LayoutSim, type NoteGraph } from "@/lib/note-graph";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/palette";
import { space, type } from "@/theme/tokens";

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
//     the finger, while its neighbors keep reacting to it live.
// The Gravity/Repulsion sliders (ForceSlider) still mutate the running sim in
// place and "reheat" it, so dragging never resets the graph back to its starting
// spiral. A short tap on a node still opens the note.

const HEADER_H = 34;
const SLIDERS_H = 112;
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

  const simRef = useRef<LayoutSim | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The seeding effect below reads this once per (re)seed instead of depending
  // on gravity/repulsion state directly — depending on them would reseed the
  // spiral (and jump every node's position) on every slider drag.
  const initialForces = useRef({ gravity, repulsion });
  initialForces.current = { gravity, repulsion };

  const canvasW = win.width;
  const canvasH = Math.max(220, win.height - contentTop - contentBottom - HEADER_H - SLIDERS_H);

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

  const openNote = useCallback((pathHash: string) => {
    router.push({ params: { ph: pathHash }, pathname: "/note" });
  }, []);

  // A node drag pins it (see note-graph.ts's LayoutSim.pin) and, if the sim had
  // already settled into stillness, gives it one reheat so its neighbors get a
  // chance to visibly react to the new pinned position instead of staying frozen.
  const handleNodeDragTo = useCallback(
    (index: number, x: number, y: number) => {
      const sim = simRef.current;
      if (!sim) return;
      sim.pin(index, x, y);
      if (sim.settled) sim.reheat();
      ensureTicking();
      setGraph(sim.snapshot());
    },
    [ensureTicking],
  );

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

  const showAllLabels = (graph?.nodes.length ?? 0) <= 40;

  return (
    <View
      style={[styles.flex, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]}
      testID="graph-screen"
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Graph</Text>
        {status === "ready" && graph ? (
          <Text style={styles.headerMeta}>
            {graph.nodes.length} notes · {graph.edges.length} connections
          </Text>
        ) : null}
      </View>

      {status === "ready" && graph && graph.nodes.length > 0 ? (
        <View style={styles.sliders} testID="graph-sliders">
          <ForceSlider c={c} label="Gravity" max={3} min={0} onChange={handleGravityChange} step={0.1} value={gravity} />
          <ForceSlider c={c} label="Repulsion" max={4} min={0.2} onChange={handleRepulsionChange} step={0.1} value={repulsion} />
        </View>
      ) : null}

      {status === "loading" ? (
        <View style={styles.centered} testID="graph-loading">
          <ActivityIndicator color={c.text2} />
        </View>
      ) : status === "unpaired" ? (
        <View style={styles.centered}>
          <EmptyBlock
            title="Pair with your Mac"
            body="The graph is drawn from your synced library. Pair this phone and your notes — and the links between them — appear here."
          />
          <View style={styles.pairBtn}>
            <MissionButton label="Pair with your Mac" variant="primary" onPress={() => router.push("/pair")} />
          </View>
        </View>
      ) : status === "empty" ? (
        <View style={styles.centered}>
          <EmptyBlock
            title="No notes to map yet"
            body="As Nemesis writes notes into your library on the Mac, the connections between them draw themselves here."
          />
        </View>
      ) : graph ? (
        <View style={[styles.canvasClip, { width: canvasW, height: canvasH }]} testID="graph-canvas">
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
                  onDragTo={handleNodeDragTo}
                  onOpen={openNote}
                  scale={scale}
                  showLabel={showAllLabels || node.degree >= 2}
                />
              ))}
            </Animated.View>
          </GestureDetector>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    headerRow: {
      height: HEADER_H,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
    },
    headerTitle: { ...type.h2, color: c.text },
    headerMeta: { ...type.micro, color: c.text3 },
    sliders: { paddingHorizontal: space(4), paddingBottom: space(2), gap: space(3) },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    pairBtn: { paddingBottom: space(4), paddingHorizontal: space(8), alignSelf: "stretch" },
    // Clips the pinch/pan transform so a zoomed-in or panned graph never
    // paints over the header/sliders above it.
    canvasClip: { overflow: "hidden" },
  });
