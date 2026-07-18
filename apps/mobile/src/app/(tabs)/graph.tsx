import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";
import { decryptLibrary, loadCachedRows, loadVaultKey, pullLibraryRows } from "@/api/librarySync";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { useShellPadding } from "@/components/shell-chrome";
import { buildNoteGraph, createLayoutSim, type LayoutSim, type NoteGraph } from "@/lib/note-graph";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Graph — the phone's twin of the desktop Graph page, rebuilt for read-only sync.
// Nodes are the synced library notes; an edge is a [[wikilink]] mention between two
// of them. Everything renders from the local cache (offline-friendly, zero tokens):
// decrypt → buildNoteGraph → animated force layout → one SVG. The desktop's 3D
// scene stays a desktop luxury — a 2D constellation is the right weight for a phone.
//
// The layout ANIMATES: createLayoutSim (note-graph.ts) seeds a jittered spiral,
// then a setInterval here ticks it toward settled, pushing each frame's positions
// into React state. Two hand-rolled sliders (Pressable + PanResponder — no new
// deps) let the student steer Gravity (pull-to-center) and Repulsion (node
// spacing) live: they mutate the running sim in place and "reheat" it, so
// dragging never resets the graph back to its starting spiral. Tap a node to
// open the note.

const HEADER_H = 34;
const SLIDERS_H = 112;
const TICK_MS = 30;
// Multiple physics steps per rendered frame: at one step per tick the default
// 180-iteration settle takes ~5.4s, which reads as sluggish. Batching keeps the
// exact same final (and intermediate) math as note-graph.ts — just fewer, chunkier
// frames rendered.
const STEPS_PER_TICK = 3;

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
  useEffect(() => {
    stopTicking();
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
  }, [builtGraph, canvasW, canvasH, ensureTicking, stopTicking]);

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
        <Svg width={canvasW} height={canvasH} testID="graph-canvas">
          {graph.edges.map((edge, i) => {
            const a = graph.nodes[edge.a];
            const b = graph.nodes[edge.b];
            return <Line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.lineMuted} strokeWidth={1} />;
          })}
          {graph.nodes.map((node) => {
            const r = 3.5 + Math.min(5, node.degree * 1.1);
            const hub = node.degree >= 3;
            const label = node.title.length > 18 ? `${node.title.slice(0, 17)}…` : node.title;
            const open = () => router.push({ params: { ph: node.pathHash }, pathname: "/note" });
            return (
              <G key={node.pathHash}>
                {hub ? <Circle cx={node.x} cy={node.y} r={r + 5} fill={c.accentFaint} /> : null}
                <Circle cx={node.x} cy={node.y} r={r} fill={hub ? c.accent : c.text3} />
                {showAllLabels || node.degree >= 2 ? (
                  <SvgText
                    x={node.x}
                    y={node.y + r + 11}
                    fontSize={9}
                    fill={c.text2}
                    textAnchor="middle"
                  >
                    {label}
                  </SvgText>
                ) : null}
                {/* Generous invisible tap target on top of everything for this node. */}
                <Circle cx={node.x} cy={node.y} r={Math.max(16, r + 8)} fill="transparent" onPress={open} />
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

const THUMB = 22;
const TRACK_H = 22;

interface ForceSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  c: ThemeColors;
}

/** Small hand-rolled slider (Pressable + PanResponder — no new deps) for the
 * Gravity/Repulsion controls. PanResponder drives continuous drag-to-set over
 * the track; the thumb is a Pressable with accessibilityRole="adjustable" so
 * VoiceOver/TalkBack can also swipe up/down to nudge the value by one step.
 * The gesture callbacks read from a `live` ref (refreshed every render)
 * instead of closing over props directly — PanResponder.create's config is
 * only evaluated once, so a closure captured there over a since-changed prop
 * would otherwise go stale. */
const ForceSlider = memo(function ForceSlider({ label, value, min, max, step, onChange, c }: ForceSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const live = useRef({ max, min, onChange, step, trackWidth });
  live.current = { max, min, onChange, step, trackWidth };

  const applyAtRatio = useCallback((ratio: number) => {
    const { max: hi, min: lo, onChange: emit, step: gran } = live.current;
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const raw = lo + clampedRatio * (hi - lo);
    const stepped = Math.round(raw / gran) * gran;
    const clamped = Math.min(hi, Math.max(lo, stepped));
    emit(Number(clamped.toFixed(2)));
  }, []);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const w = live.current.trackWidth;
        if (w > 0) applyAtRatio(evt.nativeEvent.locationX / w);
      },
      onPanResponderMove: (evt) => {
        const w = live.current.trackWidth;
        if (w > 0) applyAtRatio(evt.nativeEvent.locationX / w);
      },
      onStartShouldSetPanResponder: () => true,
    }),
  ).current;

  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const thumbLeft = Math.max(0, Math.min(trackWidth - THUMB, ratio * trackWidth - THUMB / 2));

  return (
    <View style={sliderStyles.row}>
      <View style={sliderStyles.labelRow}>
        <Text style={[sliderStyles.label, { color: c.text2 }]}>{label}</Text>
        <Text style={[sliderStyles.value, { color: c.text3 }]}>{value.toFixed(1)}×</Text>
      </View>
      <View
        style={[sliderStyles.track, { backgroundColor: c.surface2 }]}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        <View style={[sliderStyles.fill, { backgroundColor: c.accentFaint, width: `${ratio * 100}%` }]} />
        <Pressable
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          accessibilityLabel={label}
          accessibilityRole="adjustable"
          accessibilityValue={{ max, min, now: Number(value.toFixed(2)) }}
          hitSlop={12}
          onAccessibilityAction={(event) => {
            const gran = live.current.step;
            const delta = gran / (max - min || 1);
            if (event.nativeEvent.actionName === "increment") applyAtRatio(ratio + delta);
            else if (event.nativeEvent.actionName === "decrement") applyAtRatio(ratio - delta);
          }}
          style={[sliderStyles.thumb, { backgroundColor: c.accent, left: thumbLeft }]}
        />
      </View>
    </View>
  );
});

const sliderStyles = StyleSheet.create({
  row: { gap: space(1.5) },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...type.micro },
  value: { ...type.micro },
  track: {
    height: TRACK_H,
    borderRadius: radius.pill,
    justifyContent: "center",
    overflow: "hidden",
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  thumb: {
    position: "absolute",
    top: (TRACK_H - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
});

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
  });
