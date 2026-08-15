"use client";

import { ease, pulse, window01 } from "../progress";

/**
 * Scene 1 — structure, drawn.
 *
 * Circulation as a loop: body, right heart, lungs, left heart, back to body.
 * The subject is chosen so the next scene has somewhere to go. A diagram of
 * circulation can show you the order of the circuit and nothing at all about
 * the shape of the thing doing it, which is exactly the moment a teaching
 * system should stop drawing boxes and show you the organ.
 *
 * ── AUTHORED, NOT GENERATED ───────────────────────────────────────────────────
 *
 * The diagram is a fixed SVG rather than a diagramming library rendering from
 * text at runtime. The library route ships around a megabyte, produces markup
 * whose structure is its own business, and would then have to be reverse
 * engineered node by node to animate the reveal — which is the entire
 * requirement here. Authoring it directly costs nothing at runtime and makes
 * every node and edge individually addressable.
 *
 * ── pathLength ────────────────────────────────────────────────────────────────
 *
 * Edges draw with stroke-dashoffset over `pathLength="1"`, which renormalises
 * every path to unit length regardless of its real geometry. Without it each
 * dash array would need the true arc length, which means measuring live DOM
 * with getTotalLength — and curves of different lengths would draw at visibly
 * different speeds.
 */

type NodeSpec = {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  /** When this node fades in, as a fraction of the scene. */
  readonly at: number;
};

const W = 132;

const NODES: readonly NodeSpec[] = [
  { id: "body", label: "body", x: 360, y: 344, w: W, at: 0.0 },
  { id: "right", label: "right heart", x: 176, y: 214, w: W, at: 0.06 },
  { id: "lungs", label: "lungs", x: 360, y: 84, w: W, at: 0.12 },
  { id: "left", label: "left heart", x: 544, y: 214, w: W, at: 0.18 },
];

type EdgeSpec = {
  readonly id: string;
  readonly d: string;
  readonly at: number;
  /** Part of the pulmonary circuit, emphasised late in the scene. */
  readonly pulmonary?: boolean;
};

const EDGES: readonly EdgeSpec[] = [
  { id: "body-right", d: "M300 336 C244 322 206 288 190 240", at: 0.26 },
  { id: "right-lungs", d: "M196 188 C214 138 262 100 296 92", at: 0.36, pulmonary: true },
  { id: "lungs-left", d: "M424 92 C458 100 506 138 524 188", at: 0.46, pulmonary: true },
  { id: "left-body", d: "M530 240 C514 288 476 322 420 336", at: 0.56 },
];

const H = 40;

export function DiagramScene({ t }: { readonly t: number }) {
  // The two heart nodes lift at the end. The next scene is the heart, and the
  // handover reads as continuous if the diagram has already pointed at it.
  const handover = window01(t, 0.78, 1);

  return (
    <svg className="shw-svg" viewBox="0 0 960 420" role="img" aria-label="Diagram of circulation: body to right heart to lungs to left heart and back to body">
      <defs>
        <marker id="shw-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="shw-arrowhead" />
        </marker>
      </defs>

      {/* The diagram was laid out on a 720-wide grid; the frame is 960 so the
          scenes stop letterboxing. Shifting the whole thing is cheaper and less
          error-prone than restating forty coordinates. */}
      <g transform="translate(120, 0)">
      <g className="shw-edges">
        {EDGES.map((e) => {
          const draw = ease(window01(t, e.at, e.at + 0.16));
          const emphasis = e.pulmonary ? pulse(t, 0.62, 0.84, 0.3) : 0;
          return (
            <path
              key={e.id}
              d={e.d}
              pathLength={1}
              markerEnd="url(#shw-arrow)"
              className="shw-edge"
              style={{
                strokeDasharray: 1,
                strokeDashoffset: 1 - draw,
                // The marker sits at the end of the path and would otherwise be
                // visible from the first frame, before its line arrives.
                opacity: draw < 0.02 ? 0 : 1,
                strokeWidth: 1.4 + emphasis * 1.1,
              }}
            />
          );
        })}
      </g>

      <g className="shw-nodes">
        {NODES.map((n) => {
          const appear = ease(window01(t, n.at, n.at + 0.14));
          const isHeart = n.id === "right" || n.id === "left";
          const lift = isHeart ? handover : 0;
          return (
            <g
              key={n.id}
              className="shw-node"
              data-strong={isHeart && lift > 0.4 ? "" : undefined}
              style={{
                opacity: appear,
                transform: `translateY(${(1 - appear) * 8}px)`,
                transformOrigin: `${n.x}px ${n.y}px`,
              }}
            >
              <rect x={n.x - n.w / 2} y={n.y - H / 2} width={n.w} height={H} rx={5} />
              <text x={n.x} y={n.y + 4}>
                {n.label}
              </text>
            </g>
          );
        })}
      </g>

      {/* Two words, on the two edges where the distinction is the lesson. Any
          more labelling and the diagram becomes something to read rather than
          something to see. */}
      <g className="shw-edgelabels">
        <text x={150} y={150} style={{ opacity: pulse(t, 0.42, 0.9, 0.2) }}>
          oxygen poor
        </text>
        <text x={570} y={150} style={{ opacity: pulse(t, 0.52, 0.9, 0.2) }}>
          oxygen rich
        </text>
      </g>
      </g>
    </svg>
  );
}
