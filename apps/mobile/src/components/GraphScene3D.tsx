import { memo, useMemo } from "react";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";
import { BASE_NODE_R } from "@/components/GraphNodeView";
import { depthVisuals, paintOrder, type Projected } from "@/lib/graph-layout-3d";
import { graphNodeColor } from "@/lib/graph-palette";
import type { GraphEdge, GraphNode } from "@/lib/note-graph";
import type { ThemeColors } from "@/theme/palette";

// Pure presentational renderer for the phone Graph screen's 3D mode — the
// SVG twin of GraphNodeView.tsx's per-node Views, but a single <Svg> instead
// of N gesture-bearing Views: 3D mode has no node dragging (see
// graph-layout-3d.ts's top-of-file comment — a screen-space drag has no
// well-defined depth to move a node to), so nodes here don't need their own
// GestureDetector, and SVG Circles are far cheaper to re-lay-out every
// animation frame than N absolutely-positioned native Views would be, which
// matters because — unlike the 2D canvas's pinch/pan (a GPU-side transform
// applied to an already-drawn scene) — orbiting the 3D camera has to
// re-project every node's screen position every frame (see
// graph-layout-3d.ts's projectNodes). graph.tsx owns the actual
// physics/camera/gesture loop and hands this component a ready-to-draw
// snapshot; tap hit-testing also happens in graph.tsx (against the same
// `projected` array this component just renders), since a single
// whole-canvas gesture — not per-node detectors — drives 3D mode.
//
// `projected` must be INDEX-ALIGNED to `nodes`/`edges` (projected[i]
// corresponds to nodes[i]) — exactly what graph-layout-3d.ts's
// projectNodes() returns. This component sorts its OWN copy for draw order
// (paintOrder — farthest-first, cheap: just a sort, no re-projection) while
// still using the index-aligned array for O(1) edge-endpoint lookup.

export interface GraphScene3DProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  projected: Projected[];
  width: number;
  height: number;
  c: ThemeColors;
  maxDegree: number;
  nodeSizeMultiplier: number;
  showLabel: (node: GraphNode) => boolean;
}

const LABEL_MAX_CHARS = 20;

function truncate(title: string): string {
  return title.length > LABEL_MAX_CHARS ? `${title.slice(0, LABEL_MAX_CHARS - 1)}…` : title;
}

export const GraphScene3D = memo(function GraphScene3D({
  nodes,
  edges,
  projected,
  width,
  height,
  c,
  maxDegree,
  nodeSizeMultiplier,
  showLabel,
}: GraphScene3DProps) {
  // Cheap re-sort of an already-projected array — the expensive trig lives
  // in graph.tsx's per-frame projectNodes() call, not here.
  const drawOrder = useMemo(() => paintOrder(projected), [projected]);

  return (
    <Svg height={height} width={width}>
      {edges.map((edge, i) => {
        const a = projected[edge.a];
        const b = projected[edge.b];
        if (!a || !b) return null;
        const avgOpacity = (depthVisuals(a.scale).opacity + depthVisuals(b.scale).opacity) / 2;
        return (
          <Line
            key={`e${i}`}
            opacity={avgOpacity}
            stroke={c.lineMuted}
            strokeWidth={1}
            x1={a.sx}
            x2={b.sx}
            y1={a.sy}
            y2={b.sy}
          />
        );
      })}
      {drawOrder.map((p) => {
        const node = nodes[p.index];
        if (!node) return null;
        const { opacity, radiusScale } = depthVisuals(p.scale);
        const r = BASE_NODE_R * nodeSizeMultiplier * radiusScale;
        const color = graphNodeColor(node, c.accent, maxDegree);
        const hub = !node.ghost && node.degree >= 2;
        const density = maxDegree > 1 ? Math.min(1, (node.degree - 1) / (maxDegree - 1)) : node.degree > 0 ? 1 : 0;
        const ghostOpacity = node.ghost ? 0.6 : 1;

        return (
          <G key={node.pathHash}>
            {hub ? <Circle cx={p.sx} cy={p.sy} fill={color} opacity={(0.16 + density * 0.24) * opacity} r={r + 5 + density * 4} /> : null}
            <Circle
              cx={p.sx}
              cy={p.sy}
              fill={color}
              opacity={ghostOpacity * opacity}
              r={r}
              // Real SVG dash support (unlike GraphNodeView.tsx's View-based
              // ghost ring — see that file's top-of-file comment for why the
              // 2D path settles for a solid outline instead).
              stroke={node.ghost ? c.text3 : undefined}
              strokeDasharray={node.ghost ? [2, 2] : undefined}
              strokeWidth={node.ghost ? 1 : 0}
            />
            {showLabel(node) ? (
              <SvgText
                fill={c.text2}
                fontSize={9}
                opacity={opacity}
                textAnchor="middle"
                x={p.sx}
                y={p.sy + r + 11}
              >
                {truncate(node.title)}
              </SvgText>
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
});
