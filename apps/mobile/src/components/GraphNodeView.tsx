import { memo, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, type PanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { graphNodeColor } from "@/lib/graph-palette";
import { nodeRadiusFor } from "@/lib/graph-settings";
import type { GraphNode } from "@/lib/note-graph";
import type { ThemeColors } from "@/theme/palette";

// One node in the phone Graph screen's constellation (see graph.tsx),
// rendered as a plain absolutely-positioned View layered on top of the
// <Svg> that draws the edges — not as an SVG <Circle>, unlike before.
// react-native-svg shapes don't reliably support their own
// react-native-gesture-handler detector, so a node that needs its own
// drag/tap gesture has to be a real View; edges (no interactivity of their
// own) stay in the SVG, in the same coordinate space.
//
// Color is a connectivity heatmap, not a fixed hub/non-hub binary — see
// graph-palette.ts's graphNodeColor (ported from the web Graph's own
// graph-palette.ts): hue pinned to the live theme accent, saturation/
// lightness climbing with degree, so a hub reads brighter than a
// lightly-linked note instead of just two flat colors. A "ghost" node (an
// unresolved wikilink target — see note-graph.ts's buildNoteGraph) renders
// in the same hue family but pale and part-transparent, with a thin outline
// ring standing in for the web Graph's dashed ring: React Native's
// `borderStyle: "dashed"` on a plain View is unreliable on Android (a known
// RN limitation), so a solid low-emphasis ring is the cross-platform choice
// here.
//
// Tap opens the note; drag moves and pins it (see note-graph.ts's
// LayoutSim.pin). A ghost has no real note behind it, so opening one is a
// no-op — see graph.tsx's openNode wrapper, which is why onOpen is handed
// the whole node (not just a pathHash): it needs `node.ghost` to decide.
// Gesture.Race(pan, tap) tells RNGH to let whichever one
// actually recognizes the gesture first win and cancel the other: a finger
// that lifts before crossing the pan's minDistance never activates the pan
// at all, so the tap (which only checks its own maxDistance/duration at
// lift) wins; a finger that moves past minDistance activates the pan first
// and the tap is cancelled. `.blocksExternalGesture(canvasPanGesture)` on
// the node's pan stops the *whole-canvas* pan (graph.tsx) from also
// recognizing that same one-finger touch — without it, a drag starting on a
// node would both move the node AND pan the canvas underneath it, since
// nested gesture handlers don't exclude each other by default in RNGH.
//
// POSITION DOES NOT COME THROUGH PROPS. `node` carries only the things that
// change when the LIBRARY changes — title, degree, ghost — while x/y ride a
// reanimated shared array (`positions`, flat [x0,y0,x1,y1,…]) that the
// simulation writes once per frame. That split is the whole performance story
// (owner 2026-07-24: the graph was "still slow" after the previous fix):
// positions used to arrive as a new `node` object every frame, which defeated
// the memo() below, re-rendered all 200 nodes, and — because the gestures were
// constructed in the render body — rebuilt and re-attached three gesture
// objects PER NODE PER FRAME. A single node drag holds the sim warm for ~1,400
// frames, so one drag meant on the order of 840,000 gesture allocations.
// Now the component re-renders only when the graph itself changes, and motion
// is a transform on the UI thread.
//
// onDragStart/onDragEnd bracket the gesture so graph.tsx can call the sim's
// startDrag()/endDrag() (note-graph.ts) — keeping the force simulation fully
// energized, with a temporarily stiffer pull on this node's own edges, for
// the whole gesture, so linked neighbors visibly follow instead of barely
// creeping. onDragEnd fires from `.onFinalize()`, not `.onEnd()`: finalize is
// the one RNGH callback guaranteed to run whether the pan ended normally,
// was cancelled, or lost the Race to the tap — the didStartDrag ref below
// filters out that last case (a plain tap, where onDragStart never fired) so
// a tap can't spuriously end a drag that was never started.
const LABEL_W = 100;

export interface GraphNodeViewProps {
  /** Structure only — title, degree, ghost. Its x/y are IGNORED here; live
   * position comes from `positions` (see the top-of-file note). */
  node: GraphNode;
  index: number;
  /** Every node's live position, flat: `[x0, y0, x1, y1, …]`. This node reads
   * slots `index * 2` and `index * 2 + 1`. Written once per frame by graph.tsx's
   * animation loop; consumed here on the UI thread, so a moving graph costs no
   * React renders at all. */
  positions: SharedValue<number[]>;
  /** Current whole-canvas zoom level (graph.tsx's pinch), so a drag's
   * on-screen finger movement can be converted to graph-space movement —
   * the node lives inside the same scaled container the finger's raw
   * screen pixels don't. */
  scale: SharedValue<number>;
  /** The whole-canvas pan gesture (graph.tsx) — threaded through purely so
   * this node's own pan can block it via blocksExternalGesture. */
  canvasPanGesture: PanGesture;
  showLabel: boolean;
  /** Rendered-radius multiplier from the graph screen's settings panel (Node
   * size slider) — scales the single uniform node radius (BASE_NODE_R below);
   * 1 renders every node at that base size. hitR/haloR both derive from r
   * below, so the tap target and hub halo scale right along with the visible
   * dot instead of needing their own multiplier. */
  sizeMultiplier: number;
  /** Highest degree across the whole graph — the heatmap's top end (see
   * graph-palette.ts's graphNodeColor). Computed once per graph, not per
   * node, so every node's color is relative to the same scale. */
  maxDegree: number;
  c: ThemeColors;
  /** Fired once when a drag gesture actually activates (crosses the pan's
   * minDistance) — before the first onDragTo. The caller starts the sim's
   * drag-energized state (see note-graph.ts's LayoutSim.startDrag). */
  onDragStart: (index: number) => void;
  /** Fired at drag start and on every subsequent move with the node's new
   * graph-space (x, y) — the same coordinate space node.x/node.y are
   * already in. The caller pins the sim to this position and re-renders. */
  onDragTo: (index: number, x: number, y: number) => void;
  /** Fired once when an activated drag gesture finishes (finger lifted or
   * the gesture was cancelled) — never for a plain tap, which never starts
   * a drag in the first place. The caller ends the sim's drag-energized
   * state (see note-graph.ts's LayoutSim.endDrag); the node itself stays
   * pinned exactly as before. */
  onDragEnd: (index: number) => void;
  /** Fired on a successful tap with the WHOLE node (not just its pathHash)
   * so the caller can no-op a ghost tap (see note-graph.ts's GraphNode.ghost
   * doc comment) instead of trying to open a note that doesn't exist. */
  onOpen: (node: GraphNode) => void;
}

export const GraphNodeView = memo(function GraphNodeView({
  node,
  index,
  positions,
  scale,
  canvasPanGesture,
  showLabel,
  sizeMultiplier,
  maxDegree,
  c,
  onDragStart,
  onDragTo,
  onDragEnd,
  onOpen,
}: GraphNodeViewProps) {
  // Captured at the drag's real start and read from onUpdate, because a pan
  // reports translation from where the finger began, not absolute position.
  // Read out of the shared array rather than off a prop: position no longer
  // arrives through props at all, and the array is the only thing that knows
  // where this node actually is at touch-down (it may have drifted since the
  // last render — during a settle it certainly has).
  const dragOrigin = useRef({ x: 0, y: 0 });
  // Set in onStart, cleared in onFinalize — lets onFinalize (which fires for
  // a losing-the-Race tap too, see the top-of-file comment) tell "a drag
  // really was active" apart from "this was just a tap", so onDragEnd only
  // ever fires paired with a real onDragStart.
  const didStartDrag = useRef(false);

  // SIZE CARRIES CONNECTEDNESS (owner 2026-07-23: "the graph page sucks", and
  // the same fix web's graph got in PR #254). Every node used to draw at one
  // fixed radius, with a hub marked by a glow halo instead — which is the
  // loudest tell that a graph isn't Obsidian: Obsidian is flat, and its
  // defining rule is "the more nodes that reference a given node, the bigger
  // it gets". The halo is gone; nodeRadiusFor does the work now.
  const r = nodeRadiusFor(node.degree, maxDegree, sizeMultiplier);
  const color = graphNodeColor(node, c.accent, maxDegree);
  const label = node.title.length > 18 ? `${node.title.slice(0, 17)}…` : node.title;
  // Generous tap target, independent of the visual dot radius — mirrors the
  // original SVG's invisible Math.max(16, r + 8) hit-circle.
  const hitR = Math.max(16, r + 8);
  const size = hitR * 2;

  // MEMOIZED, and that matters as much as the shared position array: these
  // used to be rebuilt in the render body, so every frame of a settle or a drag
  // threw away and re-attached three gesture handlers for every node on screen.
  // The deps are all stable — index and the callbacks are, `positions`/`scale`
  // are shared values whose identity never changes, and `node` only changes
  // when the library does.
  const nodeGesture = useMemo(() => {
    const tapGesture = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(10)
      .onEnd((_event, success) => {
        if (success) onOpen(node);
      });

    const panGesture = Gesture.Pan()
      .runOnJS(true)
      .minDistance(6)
      .blocksExternalGesture(canvasPanGesture)
      .onStart(() => {
        const p = positions.value;
        dragOrigin.current = { x: p[index * 2] ?? 0, y: p[index * 2 + 1] ?? 0 };
        didStartDrag.current = true;
        onDragStart(index);
      })
      .onUpdate((event) => {
        const s = scale.value || 1;
        onDragTo(index, dragOrigin.current.x + event.translationX / s, dragOrigin.current.y + event.translationY / s);
      })
      .onFinalize(() => {
        if (!didStartDrag.current) return;
        didStartDrag.current = false;
        onDragEnd(index);
      });

    return Gesture.Race(panGesture, tapGesture);
  }, [node, index, positions, scale, canvasPanGesture, onOpen, onDragStart, onDragTo, onDragEnd]);

  // The node's whole position, on the UI thread. translate (not left/top) so
  // the layout never has to be recomputed as it moves.
  const positionStyle = useAnimatedStyle(() => {
    const p = positions.value;
    return {
      transform: [
        { translateX: (p[index * 2] ?? 0) - hitR },
        { translateY: (p[index * 2 + 1] ?? 0) - hitR },
      ],
    };
  }, [index, hitR]);

  return (
    <GestureDetector gesture={nodeGesture}>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            width: size,
            height: size,
          },
          positionStyle,
        ]}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: hitR - r,
            top: hitR - r,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: color,
            // Ghost = "mentioned but not written yet". The fade lives on the DOT
            // alone, never on the node's wrapper — a wrapper opacity dragged the
            // label down with it, and owner 2026-07-22 wants text at full
            // strength everywhere. The ring plus graphNodeColor's paler ghost
            // branch still mark it out.
            opacity: node.ghost ? 0.6 : 1,
            // A solid outline ring stands in for the web Graph's dashed
            // ghost ring — see the top-of-file comment for why this file
            // uses a border instead of a dash pattern.
            borderWidth: node.ghost ? 1 : 0,
            borderColor: c.text3,
          }}
        />
        {showLabel ? (
          <Text
            numberOfLines={1}
            pointerEvents="none"
            style={[styles.label, { left: hitR - LABEL_W / 2, top: hitR + r + 4, color: c.text2 }]}
          >
            {label}
          </Text>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  label: {
    position: "absolute",
    width: LABEL_W,
    fontSize: 9,
    lineHeight: 11,
    textAlign: "center",
  },
});
