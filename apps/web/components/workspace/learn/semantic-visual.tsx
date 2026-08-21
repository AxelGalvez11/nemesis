"use client";

import katex from "katex";
import { useId, useMemo } from "react";

import type { CanvasVisualRequest, FlowVisual, PlotVisual } from "@/lib/learn/canvas-visual";
import { layoutFlow, VISUAL_FIGURE_CLASS, VISUAL_HEIGHT, VISUAL_WIDTH } from "@/lib/learn/visual-layout";

import { ChemicalStructure } from "./chemical-structure";
import { CodeTrace, Construction, DataTable, Timeline, VectorDiagram } from "./subject-visual";

const WIDTH = VISUAL_WIDTH;
const PLOT_HEIGHT = VISUAL_HEIGHT;
const COLOURS = ["var(--ui-accent)", "var(--ui-text-primary)", "#d97706", "#7c3aed"];

export function SemanticVisual({ visual }: { visual: CanvasVisualRequest }) {
  return (
    // 🔴 NO FILL, REPORTED 2026-08-20: *"why does it have a blue gray background instead of a
    // transparent background?"* It was `bg-(--ui-bg-secondary)`, which resolves to
    // `color-mix(srgb, var(--ui-accent) 11%, …)` — eleven percent of the THEME ACCENT, which is
    // exactly the blue the owner was seeing. Nobody chose a tint for figures; the card system's
    // default fill came along with the card.
    //
    // A drawing is the content, not a card on the page, and Nemesis drew it in the theme's own
    // colours precisely so it would sit in the column rather than in a panel. The hairline stays:
    // a wide table with no boundary at all bleeds into the prose above it.
    <figure
      className={
        // 🔴 A MOLECULE SIZES ITS FRAME; EVERYTHING ELSE FILLS THE COLUMN. Owner, twice: *"can you
        // make the size of it be smaller to fit with the canvas sizing?"* The drawing itself was
        // already bounded — the FRAME was not, so ethanol sat in the middle of a 640px panel that
        // was mostly empty, and the emptiness was the thing being complained about.
        //
        // 🔴 ONLY THE STRUCTURE, AND THAT IS DELIBERATE. A plot, a table and a timeline are drawn
        // ACROSS the column on purpose — their whole job is to use that width, and a shrink-wrapped
        // plot would be a smaller plot. A molecule has an intrinsic size and gains nothing from the
        // extra room.
        // 🔴 AND A TIGHTER INSET. `p-4` is 18px here, not 16 — every rem in this app is 1.125x its
        // number (`html{font-size:112.5%}`) — so a shrink-wrapped molecule was carrying 36px of
        // frame around a drawing about 100px tall. `p-3` is 13.5px, which reads as a frame rather
        // than as a margin. The full-width kinds keep the larger inset: a plot's axis labels sit
        // near the edge and want the room.
        visual.kind === "structure"
          ? "my-4 mx-auto w-fit max-w-full overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) p-3"
          : "my-4 overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) p-4"
      }
    >
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
  // 🔴 POSITION COMES FROM `visual-layout.ts` AND NOT FROM HERE. Every node used to sit at the middle
  // of the frame, one row per node, so a branch — an inhibitor acting on a step it is not part of —
  // was drawn IN the chain and read as a step in it. Rows now hold everything that acts at the same
  // stage, side by side, and the maths that decides which stage that is lives somewhere a test can
  // reach it.
  const layout = useMemo(() => layoutFlow(visual), [visual]);
  return (
    <svg aria-label={visual.learningGoal} className={VISUAL_FIGURE_CLASS} role="img" viewBox={`0 0 ${WIDTH} ${layout.height}`}>
      <defs>
        <marker id={markerId} markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--ui-text-tertiary)" />
        </marker>
        <marker id={barId} markerHeight="10" markerWidth="10" orient="auto-start-reverse" refX="2" refY="5">
          <path d="M1,0 L1,10" stroke="var(--ui-text-tertiary)" strokeWidth="2" />
        </marker>
      </defs>
      {layout.edges.map((edge, index) => (
        <g key={index}>
          <path
            d={edge.path}
            fill="none"
            markerEnd={`url(#${edge.polarity === "decreases" ? barId : markerId})`}
            stroke="var(--ui-text-tertiary)"
            strokeWidth="1.5"
          />
          {edge.label && (
            <text fill="var(--ui-text-tertiary)" fontSize="12" textAnchor={edge.labelAnchor} x={edge.labelX} y={edge.labelY}>
              {edge.label}
            </text>
          )}
        </g>
      ))}
      {layout.boxes.map((box) => (
        <g key={box.id}>
          <rect
            fill="var(--ui-bg-elevated)"
            height={box.height}
            rx="10"
            stroke="var(--ui-stroke-primary)"
            width={box.width}
            x={box.cx - box.width / 2}
            y={box.cy - box.height / 2}
          />
          <text dominantBaseline="middle" fill="var(--ui-text-primary)" fontSize="14" textAnchor="middle" x={box.cx} y={box.cy}>
            {box.label}
          </text>
        </g>
      ))}
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
      <svg aria-label={visual.learningGoal} className={VISUAL_FIGURE_CLASS} role="img" viewBox={`0 0 ${WIDTH} ${PLOT_HEIGHT}`}>
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
