"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import {
  buildAdjacency,
  colorForLink,
  colorForNode,
  type EngineLink,
  type EngineNode,
  widthForLink,
} from "./graph-engine-helpers";
import type { GraphIndex } from "./graph-notes";
import { graphNodeColor, readGraphPalette, type GraphPalette } from "./graph-palette";
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
  const charge = Math.max(4, controls.repulsion) * 16;
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
      const force = ((distance - desiredDistance) / distance) * 0.045 * alpha;
      link.source.vx += dx * force;
      link.source.vy += dy * force;
      link.target.vx -= dx * force;
      link.target.vy -= dy * force;
    }
    const centerForce = Math.max(0.0003, controls.gravity * 0.008) * alpha;
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
    const graph = seedNodes(index);
    settleLayout(graph.nodes, graph.links, controlsRef.current);
    nodesRef.current = graph.nodes;
    linksRef.current = graph.links;
    const adjacency = buildAdjacency(index);
    const maxDegree = Math.max(1, ...graph.nodes.map((node) => node.degree));

    function resize(fit = false) {
      const width = host.clientWidth;
      const height = host.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (fit) transformRef.current = fittedTransform(graph.nodes, width, height);
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

      for (const link of graph.links) {
        const asEngineLink = link as unknown as EngineLink;
        context.beginPath();
        context.moveTo(link.source.x, link.source.y);
        context.lineTo(link.target.x, link.target.y);
        context.strokeStyle = colorForLink(asEngineLink, activeId, palette);
        context.lineWidth = widthForLink(asEngineLink, activeId) / view.scale;
        context.stroke();
      }

      const nodeRadius = 2.7 + controlsRef.current.nodeSize * 0.9;
      for (const node of graph.nodes) {
        const density = maxDegree > 1 ? Math.min(1, node.degree / maxDegree) : node.degree > 0 ? 1 : 0;
        const color = colorForNode(node, activeId, adjacency, palette, maxDegree);
        if (!node.ghost && density > 0.15) {
          context.save();
          context.beginPath();
          context.arc(node.x, node.y, nodeRadius * (1.65 + density * 0.75), 0, TWO_PI);
          context.fillStyle = graphNodeColor(node, palette, maxDegree);
          context.globalAlpha = 0.08 + density * 0.2;
          context.shadowBlur = 14 + density * 20;
          context.shadowColor = graphNodeColor(node, palette, maxDegree);
          context.fill();
          context.restore();
        }
        context.beginPath();
        context.arc(node.x, node.y, nodeRadius, 0, TWO_PI);
        context.fillStyle = color;
        context.globalAlpha = node.ghost ? 0.3 : 0.94;
        context.fill();
        if (node.ghost) {
          context.setLineDash([2.5 / view.scale, 2.5 / view.scale]);
          context.strokeStyle = palette.label;
          context.lineWidth = 0.8 / view.scale;
          context.stroke();
          context.setLineDash([]);
        }
        context.globalAlpha = 1;
        if (controlsRef.current.showNames) {
          const fontSize = Math.max(8, 8 + controlsRef.current.labelSize * 1.8) / view.scale;
          context.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "top";
          context.fillStyle = activeId && activeId !== node.id && !adjacency.get(activeId)?.has(node.id) ? color : palette.label;
          const label = node.title.length > 28 ? `${node.title.slice(0, 27)}…` : node.title;
          context.fillText(label, node.x, node.y + nodeRadius + 5 / view.scale);
        }
      }
      context.restore();
    }

    function nodeAt(clientX: number, clientY: number): FlatNode | null {
      const bounds = canvas.getBoundingClientRect();
      const view = transformRef.current;
      const x = (clientX - bounds.left - view.x) / view.scale;
      const y = (clientY - bounds.top - view.y) / view.scale;
      const hitRadius = (7 + controlsRef.current.nodeSize) / view.scale;
      let hit: FlatNode | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const node of graph.nodes) {
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
    resize(true);
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
  }, [index, controls.gravity, controls.repulsion, controls.spread]);

  useEffect(() => drawRef.current(), [controls.labelSize, controls.neighborGlow, controls.nodeSize, controls.showNames]);

  return (
    <div className={cn("min-h-0 overflow-hidden", className)} data-graph-mode="2d" ref={hostRef}>
      <canvas aria-label="Two-dimensional note graph" className="block size-full touch-none" ref={canvasRef} />
    </div>
  );
}
