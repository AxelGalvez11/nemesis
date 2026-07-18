import { memo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, type PanGesture } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";
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
// Tap opens the note; drag moves and pins it (see note-graph.ts's
// LayoutSim.pin). Gesture.Race(pan, tap) tells RNGH to let whichever one
// actually recognizes the gesture first win and cancel the other: a finger
// that lifts before crossing the pan's minDistance never activates the pan
// at all, so the tap (which only checks its own maxDistance/duration at
// lift) wins; a finger that moves past minDistance activates the pan first
// and the tap is cancelled. `.blocksExternalGesture(canvasPanGesture)` on
// the node's pan stops the *whole-canvas* pan (graph.tsx) from also
// recognizing that same one-finger touch — without it, a drag starting on a
// node would both move the node AND pan the canvas underneath it, since
// nested gesture handlers don't exclude each other by default in RNGH.
const LABEL_W = 100;

export interface GraphNodeViewProps {
  node: GraphNode;
  index: number;
  /** Current whole-canvas zoom level (graph.tsx's pinch), so a drag's
   * on-screen finger movement can be converted to graph-space movement —
   * the node lives inside the same scaled container the finger's raw
   * screen pixels don't. */
  scale: SharedValue<number>;
  /** The whole-canvas pan gesture (graph.tsx) — threaded through purely so
   * this node's own pan can block it via blocksExternalGesture. */
  canvasPanGesture: PanGesture;
  showLabel: boolean;
  c: ThemeColors;
  /** Fired at drag start and on every subsequent move with the node's new
   * graph-space (x, y) — the same coordinate space node.x/node.y are
   * already in. The caller pins the sim to this position and re-renders. */
  onDragTo: (index: number, x: number, y: number) => void;
  onOpen: (pathHash: string) => void;
}

export const GraphNodeView = memo(function GraphNodeView({
  node,
  index,
  scale,
  canvasPanGesture,
  showLabel,
  c,
  onDragTo,
  onOpen,
}: GraphNodeViewProps) {
  // Captured at the drag's real start and read from onUpdate. onStart fires
  // once per physical touch-down, but this component can re-render *during*
  // an active drag (dragging reheats the sim — see graph.tsx — so the tick
  // loop keeps calling setGraph while a finger is still down), which
  // rebuilds this Gesture.Pan() with a fresh closure mid-gesture. A ref
  // survives that rebuild; a plain variable captured at construction time
  // would not, since onStart — which would reassign it — doesn't fire again
  // for the same physical touch.
  const dragOrigin = useRef({ x: node.x, y: node.y });

  const r = 3.5 + Math.min(5, node.degree * 1.1);
  const hub = node.degree >= 3;
  const label = node.title.length > 18 ? `${node.title.slice(0, 17)}…` : node.title;
  const haloR = r + 5;
  // Generous tap target, independent of the visual dot radius — mirrors the
  // original SVG's invisible Math.max(16, r + 8) hit-circle.
  const hitR = Math.max(16, r + 8);
  const size = hitR * 2;

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(10)
    .onEnd((_event, success) => {
      if (success) onOpen(node.pathHash);
    });

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(6)
    .blocksExternalGesture(canvasPanGesture)
    .onStart(() => {
      dragOrigin.current = { x: node.x, y: node.y };
    })
    .onUpdate((event) => {
      const s = scale.value || 1;
      onDragTo(index, dragOrigin.current.x + event.translationX / s, dragOrigin.current.y + event.translationY / s);
    });

  const nodeGesture = Gesture.Race(panGesture, tapGesture);

  return (
    <GestureDetector gesture={nodeGesture}>
      <View style={{ position: "absolute", left: node.x - hitR, top: node.y - hitR, width: size, height: size }}>
        {hub ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: hitR - haloR,
              top: hitR - haloR,
              width: haloR * 2,
              height: haloR * 2,
              borderRadius: haloR,
              backgroundColor: c.accentFaint,
            }}
          />
        ) : null}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: hitR - r,
            top: hitR - r,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: hub ? c.accent : c.text3,
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
      </View>
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
