"use client";

// The real 3d-force-graph mount path — dynamic import, palette resolution,
// styling constants, reveal animation, neighbor-glow adjacency, idle-pause
// render control, one-time camera fit. Verbatim algorithm from desktop
// graph/index.tsx §B.3.
//
// Guard: the mount effect bails immediately when `index.nodes.length === 0`,
// so this component NEVER constructs a WebGL context for an empty vault — in
// v1, graph-notes.ts's loader always returns [], so this path is wired and
// correct but not yet exercised (see graph-workspace.tsx's status gate).
//
// Known gap (v1, harmless while unreachable): desktop's onNodeClick opens the
// note in the Library, and clicking a ghost node materializes it via
// saveNote(). Neither is wired here — the web Library page has no
// open-a-specific-note or create-note store yet (still a read-only stub), so
// there's nothing correct to navigate/write to. Revisit once cloud library
// sync lands and the notes loader above starts returning real data.

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
  className?: string;
}

type EngineInstance = import("3d-force-graph").ForceGraph3DInstance<EngineNode, EngineLink>;

export function GraphCanvas({ index, controls, className }: GraphCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EngineInstance | null>(null);
  // Accessor closures read live controls without forcing a full remount —
  // only the mount effect's own dependency (`index`) rebuilds the engine.
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

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
        idleTimer = setTimeout(() => graph.pauseAnimation(), IDLE_PAUSE_MS);
      }

      graph
        .backgroundColor(palette.background)
        .width(host.clientWidth)
        .height(host.clientHeight)
        .nodeRelSize(controlsRef.current.nodeSize)
        .nodeVal((node: EngineNode) => 1 + node.degree)
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
        graph._destructor();
      });
    }

    return () => {
      cancelled = true;
      for (const dispose of disposeFns) dispose();
    };
  }, [index]);

  // Live re-tune for an already-mounted engine: node/label size apply
  // directly, and re-triggering nodeThreeObject rebuilds label sprites (which
  // also picks up a showNames flip). Force-layout sliders (spread, repulsion,
  // gravity, rotation speed) still persist to localStorage and drive the
  // panel UI; wiring them into d3-force live is left for when this path is
  // actually exercised (v1's notes loader always returns [], so the engine
  // never mounts with real data yet).
  useEffect(() => {
    const graph = engineRef.current;
    if (!graph) return;
    graph.nodeRelSize(controls.nodeSize);
    graph.nodeThreeObject(graph.nodeThreeObject());
  }, [controls]);

  return <div className={cn("min-h-0", className)} ref={hostRef} />;
}
