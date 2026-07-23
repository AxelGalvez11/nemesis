"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import {
  buildAdjacency,
  colorForLink,
  colorForNode,
  type EngineLink,
  type EngineNode,
} from "./graph-engine-helpers";
import type { GraphIndex } from "./graph-notes";
import { readGraphPalette, type GraphPalette } from "./graph-palette";
import type { GraphControlsState } from "./graph-settings";

interface GraphCanvas2DProps {
  index: GraphIndex;
  controls: GraphControlsState;
  onNodeClick: (node: EngineNode) => void;
  className?: string;
}

type FlatNode = EngineNode & { x: number; y: number; vx: number; vy: number };
type FlatLink = { source: FlatNode; target: FlatNode };
type ViewTransform = { x: number; y: number; scale: number };

const TWO_PI = Math.PI * 2;
/** linkForce 0.5 → 0.045, the pull this canvas shipped with. */
const LINK_FORCE_SCALE = 0.09;

/** Node radius grows with how many notes reference it — Obsidian's defining
 *  rule ("the more nodes that reference a given node, the bigger it gets").
 *  sqrt keeps a hub from dwarfing everything at high degree. */
export function nodeRadiusFor(degree: number, maxDegree: number, nodeSize: number): number {
  const base = 2.2 + nodeSize * 0.95;
  if (maxDegree <= 0) return base;
  const share = Math.min(1, Math.max(0, degree) / maxDegree);
  return base * (0.72 + 1.15 * Math.sqrt(share));
}

/** Note names fade out as you zoom away, per Obsidian's "text fade threshold".
 *  Threshold 0 means never fade. Returns 0-1 alpha.
 *
 *  `zoom` is measured RELATIVE to the fit-to-screen view (1 = the zoom you land
 *  on when the graph opens), not as a raw canvas scale. A raw scale would make
 *  the same threshold behave completely differently on a 5-note vault than on a
 *  500-note one, since fitting a bigger graph means starting further out. */
export function labelAlphaFor(zoom: number, threshold: number): number {
  if (threshold <= 0) return 1;
  const span = Math.max(0.35, threshold * 0.6);
  return Math.min(1, Math.max(0, (zoom - threshold) / span));
}

/** Orphans are notes with no links at all — Obsidian can hide them. */
export function visibleGraph(index: GraphIndex, showOrphans: boolean): GraphIndex {
  if (showOrphans) return index;
  const linked = new Set<string>();
  for (const link of index.links) {
    linked.add(link.source);
    linked.add(link.target);
  }
  return { ...index, nodes: index.nodes.filter((node) => linked.has(node.id)) };
}

/** Small filled triangle just short of the target node, showing link direction. */
function drawArrowhead(
  context: CanvasRenderingContext2D,
  link: FlatLink,
  targetRadius: number,
  /** World units per fitted-view pixel. */
  unitScale: number,
  thickness: number,
) {
  const dx = link.target.x - link.source.x;
  const dy = link.target.y - link.source.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  const ux = dx / distance;
  const uy = dy / distance;
  const size = (2.4 + thickness * 1.5) * unitScale;
  // Sit on the node's edge, not its center, or the head hides under the circle.
  const tipX = link.target.x - ux * targetRadius;
  const tipY = link.target.y - uy * targetRadius;
  context.beginPath();
  context.moveTo(tipX, tipY);
  context.lineTo(tipX - ux * size - uy * size * 0.55, tipY - uy * size + ux * size * 0.55);
  context.lineTo(tipX - ux * size + uy * size * 0.55, tipY - uy * size - ux * size * 0.55);
  context.closePath();
  context.fill();
}

function seedNodes(index: GraphIndex): { nodes: FlatNode[]; links: FlatLink[] } {
  const count = Math.max(1, index.nodes.length);
  const nodes = index.nodes.map((node, position): FlatNode => {
    const angle = position * 2.399963229728653;
    const radius = 18 * Math.sqrt(position + 1);
    return { ...node, vx: 0, vy: 0, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const links = index.links.flatMap((link) => {
    const source = byId.get(link.source);
    const target = byId.get(link.target);
    return source && target ? [{ source, target }] : [];
  });
  if (count === 1 && nodes[0]) Object.assign(nodes[0], { x: 0, y: 0 });
  return { nodes, links };
}

function settleLayout(nodes: FlatNode[], links: FlatLink[], controls: GraphControlsState) {
  const iterations = Math.min(220, 90 + nodes.length * 2);
  const desiredDistance = Math.max(18, controls.spread);
  const charge = Math.max(0, controls.repulsion) * 22;
  for (let tick = 0; tick < iterations; tick += 1) {
    const alpha = 1 - tick / iterations;
    for (let i = 0; i < nodes.length; i += 1) {
      const left = nodes[i];
      if (!left) continue;
      for (let j = i + 1; j < nodes.length; j += 1) {
        const right = nodes[j];
        if (!right) continue;
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < 1) {
          dx = (i % 2 ? -1 : 1) * 0.5;
          dy = (j % 2 ? -1 : 1) * 0.5;
          distanceSquared = dx * dx + dy * dy;
        }
        const force = (charge * alpha) / Math.max(24, distanceSquared);
        left.vx -= dx * force;
        left.vy -= dy * force;
        right.vx += dx * force;
        right.vy += dy * force;
      }
    }
    for (const link of links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const pull = Math.max(0, controls.linkForce) * LINK_FORCE_SCALE;
      const force = ((distance - desiredDistance) / distance) * pull * alpha;
      link.source.vx += dx * force;
      link.source.vy += dy * force;
      link.target.vx -= dx * force;
      link.target.vy -= dy * force;
    }
    const centerForce = Math.max(0, controls.gravity) * 0.015 * alpha;
    for (const node of nodes) {
      node.vx -= node.x * centerForce;
      node.vy -= node.y * centerForce;
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x += node.vx;
      node.y += node.vy;
    }
  }
}

export function measureSettled2DLayout(index: GraphIndex, controls: GraphControlsState) {
  const graph = seedNodes(index);
  settleLayout(graph.nodes, graph.links, controls);
  if (graph.nodes.length === 0) return { width: 0, height: 0 };
  const xs = graph.nodes.map((node) => node.x);
  const ys = graph.nodes.map((node) => node.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function fittedTransform(nodes: FlatNode[], width: number, height: number): ViewTransform {
  if (nodes.length === 0) return { x: width / 2, y: height / 2, scale: 1 };
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(2.1, Math.max(0.18, Math.min((width - 90) / Math.max(1, maxX - minX), (height - 90) / Math.max(1, maxY - minY))));
  return { x: width / 2 - ((minX + maxX) / 2) * scale, y: height / 2 - ((minY + maxY) / 2) * scale, scale };
}

export function GraphCanvas2D({ index, controls, onNodeClick, className }: GraphCanvas2DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<FlatNode[]>([]);
  const linksRef = useRef<FlatLink[]>([]);
  const transformRef = useRef<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const hoverRef = useRef<string | null>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const fittedIndexRef = useRef<GraphIndex | null>(null);
  const controlsRef = useRef(controls);
  const onNodeClickRef = useRef(onNodeClick);
  controlsRef.current = controls;
  onNodeClickRef.current = onNodeClick;

  useEffect(() => {
    const hostElement = hostRef.current;
    const canvasElement = canvasRef.current;
    if (!hostElement || !canvasElement) return;
    const context2d = canvasElement.getContext("2d");
    if (!context2d) return;
    const host = hostElement;
    const canvas = canvasElement;
    const context = context2d;

    const palette: GraphPalette = readGraphPalette(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    // Orphans are dropped before layout so hiding them actually reclaims the
    // space they were holding open, rather than leaving a gap.
    const shown = visibleGraph(index, controlsRef.current.showOrphans);
    const graph = seedNodes(shown);
    settleLayout(graph.nodes, graph.links, controlsRef.current);
    nodesRef.current = graph.nodes;
    linksRef.current = graph.links;
    const adjacency = buildAdjacency(shown);
    const maxDegree = Math.max(1, ...graph.nodes.map((node) => node.degree));

    // The first resize can land before layout gives the host a size. Fitting to
    // 0x0 leaves the whole graph jammed in the top-left corner, and because the
    // ResizeObserver only ever asked to redraw — never to re-fit — it stayed
    // there. Remember whether a fit has actually succeeded and retry until one
    // does.
    let fitted = false;
    // Zoom at which the whole graph just fits — the label fade threshold is
    // measured against this, so it behaves the same on any size vault.
    let fitScale = 1;
    function resize(fit = false) {
      const width = host.clientWidth;
      const height = host.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const usable = width > 0 && height > 0;
      if ((fit || !fitted) && usable) {
        const next = fittedTransform(graph.nodes, width, height);
        transformRef.current = next;
        fitScale = next.scale || 1;
        fitted = true;
      }
      draw();
    }

    function draw() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const view = transformRef.current;
      const activeId = controlsRef.current.neighborGlow ? hoverRef.current : null;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = palette.background;
      context.fillRect(0, 0, width, height);
      context.save();
      context.translate(view.x, view.y);
      context.scale(view.scale, view.scale);

      // Links are hairlines that only light up around the hovered note — the
      // reference graph reads as mostly-empty space, not a web of visible wire.
      const settings = controlsRef.current;
      // The force layout settles into thousands of world units for even a small
      // vault, so a "radius 4" circle would render as one pixel at the fitted
      // zoom. Express every drawn size at the FITTED view and convert to world
      // units once: the graph opens looking right, and zooming in scales nodes,
      // text, and links together the way Obsidian does — rather than pinning
      // text to a constant screen size while the circles shrink away from it.
      const unit = 1 / (fitScale || 1);
      const radiusOf = (node: FlatNode) => nodeRadiusFor(node.degree, maxDegree, settings.nodeSize) * unit;
      for (const link of graph.links) {
        const asEngineLink = link as unknown as EngineLink;
        const active = activeId !== null && (link.source.id === activeId || link.target.id === activeId);
        const linkColor = colorForLink(asEngineLink, activeId, palette);
        context.beginPath();
        context.moveTo(link.source.x, link.source.y);
        context.lineTo(link.target.x, link.target.y);
        context.strokeStyle = linkColor;
        context.lineWidth = settings.linkThickness * (active ? 2.2 : 1) * unit;
        context.globalAlpha = active ? 0.95 : 0.42;
        context.stroke();
        if (settings.showArrows) {
          context.fillStyle = linkColor;
          drawArrowhead(context, link, radiusOf(link.target), unit, settings.linkThickness);
        }
        context.globalAlpha = 1;
      }

      for (const node of graph.nodes) {
        // Flat filled circle, no halo: the glow was the loudest tell that this
        // wasn't Obsidian. Size carries connectivity instead.
        const nodeRadius = radiusOf(node);
        const color = colorForNode(node, activeId, adjacency, palette, maxDegree);
        context.beginPath();
        context.arc(node.x, node.y, nodeRadius, 0, TWO_PI);
        context.fillStyle = color;
        context.globalAlpha = node.ghost ? 0.35 : 1;
        context.fill();
        if (node.ghost) {
          context.setLineDash([2.5 * unit, 2.5 * unit]);
          context.strokeStyle = palette.label;
          context.lineWidth = 0.8 * unit;
          context.stroke();
          context.setLineDash([]);
        }
        context.globalAlpha = 1;
        const labelAlpha = settings.showNames ? labelAlphaFor(view.scale / fitScale, settings.textFadeThreshold) : 0;
        if (labelAlpha > 0.01) {
          // World-space, like the node circles: names grow and shrink WITH the
          // graph instead of staying a fixed screen size. Screen-fixed text
          // swamped the nodes when zoomed out — the fade threshold is what
          // handles "too small to read", not a constant font size.
          const fontSize = Math.max(8, 8 + settings.labelSize * 1.8) * unit;
          context.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "top";
          context.fillStyle = activeId && activeId !== node.id && !adjacency.get(activeId)?.has(node.id) ? color : palette.label;
          context.globalAlpha = labelAlpha;
          const label = node.title.length > 28 ? `${node.title.slice(0, 27)}…` : node.title;
          context.fillText(label, node.x, node.y + nodeRadius + fontSize * 0.35);
          context.globalAlpha = 1;
        }
      }
      context.restore();
    }

    function nodeAt(clientX: number, clientY: number): FlatNode | null {
      const bounds = canvas.getBoundingClientRect();
      const view = transformRef.current;
      const x = (clientX - bounds.left - view.x) / view.scale;
      const y = (clientY - bounds.top - view.y) / view.scale;
      let hit: FlatNode | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const node of graph.nodes) {
        // Follow each node's own drawn size — circles differ by degree now —
        // with a small floor so tiny leaf nodes stay clickable.
        // Same world units the circle is drawn in, or clicks miss the target.
        const drawn = nodeRadiusFor(node.degree, maxDegree, controlsRef.current.nodeSize) / (fitScale || 1);
        const hitRadius = Math.max(6 / view.scale, drawn * 1.6);
        const distance = Math.hypot(node.x - x, node.y - y);
        if (distance <= hitRadius && distance < best) {
          hit = node;
          best = distance;
        }
      }
      return hit;
    }

    let drag: { x: number; y: number; originX: number; originY: number; moved: boolean } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      drag = { x: event.clientX, y: event.clientY, originX: transformRef.current.x, originY: transformRef.current.y, moved: false };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.moved ||= Math.hypot(dx, dy) > 3;
        transformRef.current = { ...transformRef.current, x: drag.originX + dx, y: drag.originY + dy };
      }
      const nextHover = nodeAt(event.clientX, event.clientY)?.id ?? null;
      if (nextHover !== hoverRef.current) hoverRef.current = nextHover;
      canvas.style.cursor = drag?.moved ? "grabbing" : nextHover ? "pointer" : "grab";
      draw();
    };
    const onPointerUp = (event: PointerEvent) => {
      const moved = drag?.moved ?? false;
      drag = null;
      if (!moved) {
        const node = nodeAt(event.clientX, event.clientY);
        if (node) onNodeClickRef.current(node);
      }
      canvas.style.cursor = hoverRef.current ? "pointer" : "grab";
    };
    const onPointerLeave = () => {
      hoverRef.current = null;
      if (!drag) canvas.style.cursor = "grab";
      draw();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const old = transformRef.current;
      const nextScale = Math.min(5, Math.max(0.12, old.scale * Math.exp(-event.deltaY * 0.0015)));
      const worldX = (event.clientX - bounds.left - old.x) / old.scale;
      const worldY = (event.clientY - bounds.top - old.y) / old.scale;
      transformRef.current = {
        scale: nextScale,
        x: event.clientX - bounds.left - worldX * nextScale,
        y: event.clientY - bounds.top - worldY * nextScale,
      };
      draw();
    };

    drawRef.current = draw;
    const shouldFit = fittedIndexRef.current !== index;
    resize(shouldFit);
    fittedIndexRef.current = index;
    const observer = new ResizeObserver(() => resize(false));
    observer.observe(host);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      drawRef.current = () => undefined;
    };
    // Anything that changes where nodes END UP has to re-run the layout.
  }, [index, controls.gravity, controls.repulsion, controls.spread, controls.linkForce, controls.showOrphans]);

  // Anything that only changes how they LOOK just repaints.
  useEffect(() => drawRef.current(), [
    controls.labelSize,
    controls.linkThickness,
    controls.neighborGlow,
    controls.nodeSize,
    controls.showArrows,
    controls.showNames,
    controls.textFadeThreshold,
  ]);

  return (
    <div
      className={cn("min-h-0 overflow-hidden", className)}
      data-force-gravity={controls.gravity}
      data-force-repulsion={controls.repulsion}
      data-force-spread={controls.spread}
      data-graph-mode="2d"
      ref={hostRef}
    >
      <canvas aria-label="Two-dimensional note graph" className="block size-full touch-none" ref={canvasRef} />
    </div>
  );
}
