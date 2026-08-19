"use client";

import katex from "katex";
import { useId, useMemo } from "react";

import type { CanvasVisualRequest, FlowVisual, PlotVisual } from "@/lib/learn/canvas-visual";

import { ChemicalStructure } from "./chemical-structure";
import { CodeTrace, Construction, DataTable, Timeline, VectorDiagram } from "./subject-visual";

const WIDTH = 640;
const PLOT_HEIGHT = 280;
const COLOURS = ["var(--ui-accent)", "var(--ui-text-primary)", "#d97706", "#7c3aed"];

export function SemanticVisual({ visual }: { visual: CanvasVisualRequest }) {
  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) p-4">
      {visual.kind === "equation" ? <Equation visual={visual} /> : null}
      {visual.kind === "relationship" ? <Relationship visual={visual} /> : null}
      {visual.kind === "quantitative" ? <Quantitative visual={visual} /> : null}
      {visual.kind === "structure" ? <ChemicalStructure visual={visual} /> : null}
      {visual.kind === "table" ? <DataTable visual={visual} /> : null}
      {visual.kind === "timeline" ? <Timeline visual={visual} /> : null}
      {visual.kind === "construction" ? <Construction visual={visual} /> : null}
      {visual.kind === "vectors" ? <VectorDiagram visual={visual} /> : null}
      {visual.kind === "code" ? <CodeTrace visual={visual} /> : null}
      {visual.caption && (
        <figcaption className="mt-3 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">
          {visual.caption}
        </figcaption>
      )}
    </figure>
  );
}

function Equation({ visual }: { visual: Extract<CanvasVisualRequest, { kind: "equation" }> }) {
  const markup = useMemo(() => {
    try {
      return katex.renderToString(visual.latex, {
        displayMode: true,
        // 🔴 BOUNDED EXPANSION AND BOUNDED SIZE — the two ways a WELL-FORMED string still costs the
        // learner their tab. Neither is malformed LaTeX, so neither is something a validator could
        // have caught by counting characters.
        //
        // 🔴 MEASURED, NOT ASSUMED, AND THE TWO BEHAVE DIFFERENTLY. A 2^20 macro chain
        // (`\def\a{\b\b}\def\b{\c\c}…\a`) THROWS under `maxExpand: 100` and is caught by the
        // `catch` below. `maxSize: 50` does not throw: it CLAMPS, rendering `\rule{9999em}{9999em}`
        // at 50em instead of 9999em — which is the better of the two outcomes, because the learner
        // gets a bounded box rather than an error where the equation should be.
        //
        // `canvas-visual.ts` refuses macro definitions by NAME before anything reaches here; these
        // are the floor under that, holding whether or not the deny list was complete.
        maxExpand: 100,
        maxSize: 50,
        output: "htmlAndMathml",
        strict: "warn",
        throwOnError: true,
        // 🔴 THE SECURITY BOUNDARY, AND IT MUST NEVER BECOME A FUNCTION. `trust: true` — or a
        // callback that returns true for anything — re-enables `\href`, `\url` and
        // `\includegraphics` on a string a model wrote, which is a model writing a live link into
        // the learner's page.
        //
        // 🔴 MEASURED: IT HOLDS THE SECURITY LINE AND LOSES THE TEACHING MOMENT. With `trust: false`
        // KaTeX emits NO anchor for `\href{https://evil.test}{click me}` — but it does not throw
        // either. It prints the literal source, URL and all, in red (#cc0000) where the equation
        // should be. That is why `canvas-visual.ts` refuses these by name BEFORE rendering: the link
        // was never the only problem, and a red blob containing a model-chosen URL is not a lesson.
        trust: false,
      });
    } catch {
      return null;
    }
  }, [visual.latex]);
  if (!markup) {
    return (
      <p className="font-mono text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">
        {visual.latex}
      </p>
    );
  }
  return <div aria-label={visual.learningGoal} className="overflow-x-auto py-2 text-center" dangerouslySetInnerHTML={{ __html: markup }} />;
}

function Relationship({ visual }: { visual: FlowVisual }) {
  const rawId = useId();
  const safeId = rawId.replace(/[^A-Za-z0-9_-]/g, "");
  const markerId = `canvas-arrow-${safeId}`;
  // 🔴 A SECOND MARKER, AND IT IS WHAT MAKES A MECHANISM READABLE (§42). Every edge used to end in
  // the same arrowhead, so "A inhibits B" could only be said by writing the word on the line — and
  // a learner scanning a chain reads shape long before they read edge labels. A blunt bar is the
  // conventional "stops this" in every field that draws influence, which is why the polarity is
  // named `decreases` rather than `inhibits`: the shape is general, the verb is not.
  const barId = `canvas-bar-${safeId}`;
  const height = Math.max(180, visual.nodes.length * 82);
  const positions = new Map(visual.nodes.map((node, index) => [node.id, { x: WIDTH / 2, y: 45 + index * 82 }]));
  return (
    <svg aria-label={visual.learningGoal} className="h-auto w-full" role="img" viewBox={`0 0 ${WIDTH} ${height}`}>
      <defs>
        <marker id={markerId} markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--ui-text-tertiary)" />
        </marker>
        <marker id={barId} markerHeight="10" markerWidth="10" orient="auto-start-reverse" refX="2" refY="5">
          <path d="M1,0 L1,10" stroke="var(--ui-text-tertiary)" strokeWidth="2" />
        </marker>
      </defs>
      {visual.edges.map((edge, index) => {
        const from = positions.get(edge.from)!;
        const to = positions.get(edge.to)!;
        const y1 = from.y + 23;
        const y2 = to.y - 23;
        return (
          <g key={`${edge.from}-${edge.to}-${index}`}>
            <line
              markerEnd={`url(#${edge.polarity === "decreases" ? barId : markerId})`}
              stroke="var(--ui-text-tertiary)"
              strokeWidth="1.5"
              x1={from.x}
              x2={to.x}
              y1={y1}
              y2={y2}
            />
            {edge.label && (
              <text fill="var(--ui-text-tertiary)" fontSize="12" textAnchor="start" x={from.x + 12} y={(y1 + y2) / 2}>
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
      {visual.nodes.map((node) => {
        const point = positions.get(node.id)!;
        return (
          <g key={node.id}>
            <rect fill="var(--ui-bg-elevated)" height="46" rx="10" stroke="var(--ui-stroke-primary)" width="360" x={point.x - 180} y={point.y - 23} />
            <text dominantBaseline="middle" fill="var(--ui-text-primary)" fontSize="14" textAnchor="middle" x={point.x} y={point.y}>
              {node.label.length > 54 ? `${node.label.slice(0, 53)}…` : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Quantitative({ visual }: { visual: PlotVisual }) {
  const points = visual.series.flatMap((series) => series.points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const left = 58;
  const right = 18;
  const top = 18;
  const bottom = 46;
  const x = (value: number) => left + ((value - xMin) / (xMax - xMin || 1)) * (WIDTH - left - right);
  const y = (value: number) => PLOT_HEIGHT - bottom - ((value - yMin) / (yMax - yMin || 1)) * (PLOT_HEIGHT - top - bottom);
  return (
    <div>
      <svg aria-label={visual.learningGoal} className="h-auto w-full" role="img" viewBox={`0 0 ${WIDTH} ${PLOT_HEIGHT}`}>
        <line stroke="var(--ui-stroke-primary)" x1={left} x2={WIDTH - right} y1={PLOT_HEIGHT - bottom} y2={PLOT_HEIGHT - bottom} />
        <line stroke="var(--ui-stroke-primary)" x1={left} x2={left} y1={top} y2={PLOT_HEIGHT - bottom} />
        <text fill="var(--ui-text-tertiary)" fontSize="11" textAnchor="middle" x={(left + WIDTH - right) / 2} y={PLOT_HEIGHT - 10}>{visual.xLabel ?? "x"}</text>
        <text fill="var(--ui-text-tertiary)" fontSize="11" textAnchor="middle" transform={`rotate(-90 14 ${PLOT_HEIGHT / 2})`} x="14" y={PLOT_HEIGHT / 2}>{visual.yLabel ?? "y"}</text>
        {visual.series.map((series, index) => (
          <g key={series.label}>
            <polyline fill="none" points={series.points.map((point) => `${x(point.x)},${y(point.y)}`).join(" ")} stroke={COLOURS[index]} strokeWidth="2" />
            {series.points.map((point, pointIndex) => <circle cx={x(point.x)} cy={y(point.y)} fill={COLOURS[index]} key={pointIndex} r="3" />)}
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        {/* 🔴 DEDUPED BY LABEL (§45). A curve computed from an expression comes back as one series
            per continuous segment — `1/x` is two — and all of them carry the same name. Listing the
            legend per series would print "1/x" twice for one curve and imply two functions. */}
        {visual.series
          .map((series, index) => ({ colour: COLOURS[index], label: series.label }))
          .filter((entry, index, all) => all.findIndex((other) => other.label === entry.label) === index)
          .map((entry) => (
            <span className="flex items-center gap-1.5" key={entry.label}><span className="h-2 w-2 rounded-full" style={{ background: entry.colour }} />{entry.label}</span>
          ))}
      </div>
    </div>
  );
}
