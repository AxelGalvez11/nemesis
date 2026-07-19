"use client";

// The real 3d-force-graph mount path — dynamic import, palette resolution,
// styling constants, reveal animation, neighbor-glow adjacency, idle-pause
// render control, one-time camera fit. Verbatim algorithm from desktop
// graph/index.tsx §B.3.
//
// The mount guard avoids constructing WebGL for an empty Library. Real notes,
// click-through navigation, and ghost-note creation are supplied by the cloud
// Graph workspace.

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import {
  buildAdjacency,
  CAMERA_FIT_MS,
  CAMERA_FIT_PADDING,
  colorForLink,
  colorForNode,
  easeOutCubic,
  ENGINE_STOP_FALLBACK_MS,
  type EngineLink,
  type EngineNode,
  HIGHLIGHT_LINK_PARTICLE_WIDTH,
  IDLE_PAUSE_MS,
  LINK_OPACITY,
  makeLabelSprite,
  NODE_OPACITY,
  particlesForLink,
  REVEAL_MS,
  widthForLink,
} from "./graph-engine-helpers";
import type { GraphIndex } from "./graph-notes";
import { readGraphPalette } from "./graph-palette";
import type { GraphControlsState } from "./graph-settings";

interface GraphCanvasProps {
  index: GraphIndex;
  controls: GraphControlsState;
  onNodeClick: (node: EngineNode) => void;
  className?: string;
}

type EngineInstance = import("3d-force-graph").ForceGraph3DInstance<EngineNode, EngineLink>;
type TunableForce = { distance?: (value: number) => unknown; strength?: (value: number) => unknown };
type OrbitControls = { autoRotate?: boolean; autoRotateSpeed?: number };

export function GraphCanvas({ index, controls, onNodeClick, className }: GraphCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EngineInstance | null>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  // Accessor closures read live controls without forcing a full remount —
  // only the mount effect's own dependency (`index`) rebuilds the engine.
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || index.nodes.length === 0) return;

    let cancelled = false;
    const disposeFns: Array<() => void> = [];

    void mount();

    async function mount() {
      const [{ default: ForceGraph3D }, { default: SpriteText }] = await Promise.all([
        import("3d-force-graph"),
        import("three-spritetext"),
      ]);
      if (cancelled || !host) return;

      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      const palette = readGraphPalette(dark ? "dark" : "light");
      const maxDegree = Math.max(1, ...index.nodes.map((n) => n.degree));
      const adjacency = buildAdjacency(index);
      let activeId: string | null = null;

      const graph = new ForceGraph3D(host).graphData({
        nodes: index.nodes.map((n) => ({ ...n })),
        links: index.links.map((l) => ({ source: l.source, target: l.target })),
      }) as unknown as EngineInstance;
      engineRef.current = graph;

      (graph.d3Force("link") as TunableForce | undefined)?.distance?.(controlsRef.current.spread);
      (graph.d3Force("charge") as TunableForce | undefined)?.strength?.(-controlsRef.current.repulsion);
      (graph.d3Force("center") as TunableForce | undefined)?.strength?.(controlsRef.current.gravity);
      const orbit = graph.controls() as OrbitControls;
      orbit.autoRotate = controlsRef.current.rotationSpeed > 0;
      orbit.autoRotateSpeed = controlsRef.current.rotationSpeed;

      function recolor() {
        graph.nodeColor(graph.nodeColor());
        graph.linkColor(graph.linkColor());
        graph.linkWidth(graph.linkWidth());
        graph.linkDirectionalParticles(graph.linkDirectionalParticles());
      }

      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      function wake() {
        graph.resumeAnimation();
        if (idleTimer) clearTimeout(idleTimer);
        if (controlsRef.current.rotationSpeed === 0) {
          idleTimer = setTimeout(() => graph.pauseAnimation(), IDLE_PAUSE_MS);
        }
      }
      wakeRef.current = wake;

      graph
        .backgroundColor(palette.background)
        .width(host.clientWidth)
        .height(host.clientHeight)
        .numDimensions(2)
        .nodeRelSize(controlsRef.current.nodeSize)
        .nodeVal(() => 1)
        .nodeOpacity(0)
        .linkOpacity(0)
        .nodeColor((node: EngineNode) => colorForNode(node, activeId, adjacency, palette, maxDegree))
        .linkColor((link: EngineLink) => colorForLink(link, activeId, palette))
        .linkWidth((link: EngineLink) => widthForLink(link, activeId))
        .linkDirectionalParticles((link: EngineLink) => particlesForLink(link, activeId))
        .linkDirectionalParticleWidth(HIGHLIGHT_LINK_PARTICLE_WIDTH)
        .linkDirectionalParticleColor(() => palette.accent)
        .nodeThreeObject((node: EngineNode) => makeLabelSprite(node, SpriteText, palette, controlsRef.current))
        .nodeThreeObjectExtend(true)
        .onNodeClick((node: EngineNode) => onNodeClickRef.current(node))
        .onNodeHover((node: EngineNode | null) => {
          if (!controlsRef.current.neighborGlow) return;
          const nextId = node ? node.id : null;
          if (nextId === activeId) return;
          activeId = nextId;
          recolor();
          wake();
        })
        .onBackgroundClick(() => {
          if (!controlsRef.current.neighborGlow || activeId === null) return;
          activeId = null;
          recolor();
        });

      // Reveal: 1600ms ease-out-cubic fade-in from 0, then settle into the
      // idle-pause cadence.
      let revealStart: number | null = null;
      let revealFrame = requestAnimationFrame(runReveal);
      function runReveal(timestamp: number) {
        if (revealStart === null) revealStart = timestamp;
        const t = Math.min(1, (timestamp - revealStart) / REVEAL_MS);
        const eased = easeOutCubic(t);
        graph.nodeOpacity(NODE_OPACITY * eased);
        graph.linkOpacity(LINK_OPACITY * eased);
        if (t < 1) revealFrame = requestAnimationFrame(runReveal);
        else wake();
      }

      // Camera auto-fits exactly once, on first engine settle (or a 2000ms
      // fallback if onEngineStop never fires — e.g. a 0px container at
      // construction time). Never re-fits after that; user pan/zoom persists.
      let hasFitted = false;
      function fitOnce() {
        if (hasFitted) return;
        hasFitted = true;
        graph.zoomToFit(CAMERA_FIT_MS, CAMERA_FIT_PADDING);
      }
      graph.onEngineStop(fitOnce);
      const fallbackFitTimer = setTimeout(fitOnce, ENGINE_STOP_FALLBACK_MS);

      const resizeObserver = new ResizeObserver(() => {
        graph.width(host.clientWidth).height(host.clientHeight);
      });
      resizeObserver.observe(host);

      const onInteract = () => wake();
      host.addEventListener("pointerdown", onInteract);
      host.addEventListener("wheel", onInteract, { passive: true });

      disposeFns.push(() => {
        clearTimeout(fallbackFitTimer);
        if (idleTimer) clearTimeout(idleTimer);
        cancelAnimationFrame(revealFrame);
        resizeObserver.disconnect();
        host.removeEventListener("pointerdown", onInteract);
        host.removeEventListener("wheel", onInteract);
        if (engineRef.current === graph) engineRef.current = null;
        if (wakeRef.current === wake) wakeRef.current = null;
        graph._destructor();
      });
    }

    return () => {
      cancelled = true;
      for (const dispose of disposeFns) dispose();
    };
  }, [index]);

  // Apply every tuning control live. Layout changes reheat the simulation;
  // label changes rebuild sprites; rotation keeps the render loop awake.
  useEffect(() => {
    const graph = engineRef.current;
    if (!graph) return;
    graph.nodeRelSize(controls.nodeSize);
    (graph.d3Force("link") as TunableForce | undefined)?.distance?.(controls.spread);
    (graph.d3Force("charge") as TunableForce | undefined)?.strength?.(-controls.repulsion);
    (graph.d3Force("center") as TunableForce | undefined)?.strength?.(controls.gravity);
    graph.nodeThreeObject(graph.nodeThreeObject());
    graph.d3ReheatSimulation();
    graph.refresh();
    const orbit = graph.controls() as OrbitControls;
    orbit.autoRotate = controls.rotationSpeed > 0;
    orbit.autoRotateSpeed = controls.rotationSpeed;
    wakeRef.current?.();
  }, [controls]);

  return <div className={cn("min-h-0", className)} ref={hostRef} />;
}
