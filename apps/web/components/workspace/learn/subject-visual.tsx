"use client";

// Drawing the five §44 shapes.
//
// 🔴 EVERY ONE IS DETERMINISTIC SVG OR SEMANTIC HTML, DRAWN FROM A SPEC THAT WAS ALREADY VERIFIED.
// No library, no model-supplied markup, no configuration. `subject-visuals.ts` recomputed every
// numeric claim before any of this ran, so a total on screen is a total that sums and an angle mark
// is an angle the coordinates agree with.
//
// 🔴 THE HIDDEN CELL AND THE HIDDEN EVENT ARE THE POINT, NOT A FEATURE. §41 allows a visual on the
// Canvas when it participates in the teaching loop; a table you can only read is decoration. Both
// occlusions here are the same interaction `FigureOcclusion` gives a source figure — cover one
// thing, ask what belongs there — applied to a representation Nemesis drew itself.
//
// Colours come from the same CSS variables as the rest of the Canvas, so all five follow the theme
// without being redrawn — unlike the chemistry lane, whose library bakes colour into its output.

import { useId } from "react";

import type {
  CircuitVisual,
  CodeVisual,
  ConstructionVisual,
  TableVisual,
  TimelineVisual,
  VectorsVisual,
} from "@/lib/learn/canvas-visual";
import {
  layoutCircuit,
  layoutConstruction,
  layoutTimeline,
  VISUAL_FIGURE_CLASS,
  VISUAL_HEIGHT,
  VISUAL_WIDTH,
  type CircuitPartBox,
} from "@/lib/learn/visual-layout";

const WIDTH = VISUAL_WIDTH;

/** What a covered cell or event shows instead of its value. */
const COVERED = "?";

export function DataTable({ visual }: { visual: TableVisual }) {
  const numberFormat = new Intl.NumberFormat();
  return (
    <div className="overflow-x-auto">
      <table aria-label={visual.learningGoal} className="w-full border-collapse text-left">
        <thead>
          <tr>
            {visual.columns.map((column) => (
              <th
                className={`border-b border-(--ui-stroke-primary) px-3 py-2 text-[length:var(--canvas-text-meta)] font-semibold text-(--ui-text-tertiary) ${column.numeric ? "text-right" : ""}`}
                key={column.key}
                scope="col"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visual.rows.map((row, index) => (
            <tr key={index}>
              {visual.columns.map((column) => {
                const covered = visual.hidden?.column === column.key && visual.hidden.row === index;
                const cell = row.cells[column.key];
                return (
                  <td
                    className={`border-b border-(--ui-stroke-tertiary) px-3 py-2 text-[length:var(--canvas-text-body)] ${column.numeric ? "text-right tabular-nums" : ""}`}
                    key={column.key}
                  >
                    {covered ? (
                      // The occlusion. A covered cell is a question, so it is marked up as one
                      // rather than being blanked — a screen reader gets the same prompt.
                      <span
                        aria-label="hidden value"
                        className="inline-block min-w-10 rounded bg-(--ui-bg-elevated) px-2 text-center text-(--ui-text-quaternary)"
                      >
                        {COVERED}
                      </span>
                    ) : cell === undefined ? (
                      ""
                    ) : typeof cell === "number" ? (
                      numberFormat.format(cell)
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {visual.totals && visual.totals.length > 0 && (
            <tr>
              {visual.columns.map((column, index) => {
                const total = visual.totals?.find((entry) => entry.column === column.key);
                return (
                  <td
                    className={`px-3 py-2 text-[length:var(--canvas-text-body)] font-semibold ${column.numeric ? "text-right tabular-nums" : ""}`}
                    key={column.key}
                  >
                    {total ? numberFormat.format(total.value) : index === 0 ? "Total" : ""}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
      {visual.balance && (
        // 🔴 SAID ON SCREEN, BECAUSE THE CHECK HAPPENED. The learner is being shown a table whose
        // two sides were recomputed and agreed — that is a fact about this picture worth stating,
        // and it is the visible half of the rule that a table which did NOT balance never rendered.
        <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          {visual.columns.find((column) => column.key === visual.balance?.left)?.label} and{" "}
          {visual.columns.find((column) => column.key === visual.balance?.right)?.label} balance.
        </p>
      )}
    </div>
  );
}

export function Timeline({ visual }: { visual: TimelineVisual }) {
  // 🔴 WHERE EACH LABEL GOES IS DECIDED IN `visual-layout.ts`, NOT HERE. Two events four years apart
  // on a three-century scale used to print one label on top of the other — arithmetically correct,
  // completely unreadable. A label that cannot be placed beside its neighbour is now lifted a tier
  // and tied back to its marker by a leader line, and the lane grows to hold it.
  const layout = layoutTimeline(visual);

  return (
    <svg aria-label={visual.learningGoal} className={VISUAL_FIGURE_CLASS} role="img" viewBox={`0 0 ${WIDTH} ${layout.height}`}>
      {layout.lanes.map((lane) => (
        <g key={lane.name || "default"}>
          <line stroke="var(--ui-stroke-primary)" strokeWidth="1" x1={layout.left} x2={layout.right} y1={lane.axisY} y2={lane.axisY} />
          {lane.name && (
            // Below the axis, because everything a reader has to read is above it.
            <text fill="var(--ui-text-quaternary)" fontSize="10" x={layout.left} y={lane.axisY + 14}>
              {lane.name}
            </text>
          )}
        </g>
      ))}
      {layout.marks.map((mark) => (
        <g key={mark.index}>
          {mark.tier > 0 && (
            // The leader. Without it a lifted label is floating text with no stated owner, which is
            // a worse failure than the overlap it was lifted to avoid.
            <line
              opacity="0.5"
              stroke="var(--ui-stroke-primary)"
              strokeWidth="1"
              x1={mark.x}
              x2={mark.x}
              y1={mark.axisY - 7}
              y2={mark.dateY + 3}
            />
          )}
          {mark.isSpan ? (
            <rect
              fill="var(--ui-accent)"
              height="10"
              // An uncertain span is drawn faint rather than annotated: the shape carries the
              // doubt, which is what a reader takes in before they read anything.
              opacity={mark.uncertain ? 0.35 : 0.8}
              rx="5"
              width={Math.max(4, mark.endX - mark.x)}
              x={mark.x}
              y={mark.axisY - 5}
            />
          ) : (
            <circle
              cx={mark.x}
              cy={mark.axisY}
              fill={mark.uncertain ? "var(--ui-bg-secondary)" : "var(--ui-accent)"}
              r="5"
              stroke="var(--ui-accent)"
              strokeDasharray={mark.uncertain ? "2 2" : undefined}
              strokeWidth="1.5"
            />
          )}
          <text
            fill={mark.covered ? "var(--ui-text-quaternary)" : "var(--ui-text-primary)"}
            fontSize="12"
            textAnchor={mark.anchor}
            x={mark.textX}
            y={mark.labelY}
          >
            {mark.label}
          </text>
          <text fill="var(--ui-text-quaternary)" fontSize="10" textAnchor={mark.anchor} x={mark.textX} y={mark.dateY}>
            {mark.date}
          </text>
        </g>
      ))}
      {visual.unit && (
        <text fill="var(--ui-text-quaternary)" fontSize="10" textAnchor="end" x={layout.right} y={layout.height - 4}>
          {visual.unit}
        </text>
      )}
    </svg>
  );
}

export function Construction({ visual }: { visual: ConstructionVisual }) {
  // 🔴 THE FIGURE IS FITTED AND EVERY LABEL PLACED IN `visual-layout.ts`. Point names used to sit up
  // and to the right of their point whatever the shape, so on a triangle with its right angle at the
  // origin the vertex name, the side length and the angle mark all landed on the same spot. Labels
  // now go outward from the middle of the figure and the angle mark goes inward along its own
  // bisector, which is the space the vertex label has just vacated.
  const layout = layoutConstruction(visual);

  return (
    <svg aria-label={visual.learningGoal} className={VISUAL_FIGURE_CLASS} role="img" viewBox={`0 0 ${WIDTH} ${layout.height}`}>
      {layout.circles.map((circle, index) => (
        <circle cx={circle.cx} cy={circle.cy} fill="none" key={index} r={circle.r} stroke="var(--ui-stroke-primary)" strokeWidth="1.5" />
      ))}
      {layout.segments.map((segment, index) => (
        <g key={index}>
          <line stroke="var(--ui-text-primary)" strokeWidth="1.5" x1={segment.x1} x2={segment.x2} y1={segment.y1} y2={segment.y2} />
          {segment.label && (
            <text fill="var(--ui-text-tertiary)" fontSize="11" textAnchor={segment.anchor} x={segment.labelX} y={segment.labelY}>
              {segment.label}
            </text>
          )}
        </g>
      ))}
      {layout.angles.map((angle, index) => (
        <g key={index}>
          {/* The mark and the number are drawn from the verified measurement, so what is on screen
              and what was checked are the same angle — there is no second place for them to disagree. */}
          <path d={angle.markPath} fill="none" stroke="var(--ui-accent)" strokeWidth="1.5" />
          <text fill="var(--ui-accent)" fontSize="11" textAnchor={angle.anchor} x={angle.labelX} y={angle.labelY}>
            {angle.degrees}°
          </text>
        </g>
      ))}
      {layout.points.map((point) => (
        <g key={point.id}>
          <circle cx={point.cx} cy={point.cy} fill="var(--ui-text-primary)" r="3.5" />
          <text fill="var(--ui-text-secondary)" fontSize="12" textAnchor={point.anchor} x={point.labelX} y={point.labelY}>
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function VectorDiagram({ visual }: { visual: VectorsVisual }) {
  const rawId = useId();
  const markerId = `canvas-vector-${rawId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const height = VISUAL_HEIGHT;
  const cx = WIDTH / 2;
  const cy = height / 2;
  const longest = Math.max(...visual.vectors.map((vector) => vector.magnitude), 1);
  // 🔴 BOTH REACHES ARE DERIVED FROM THE BOX NOW, AND THEY HAD TO BE. This diagram alone chose a
  // height of 340 and then hardcoded two lengths tuned to it: axes that ran 160 from the centre
  // (cy was 170, so they spanned the full box) and arms of 24–132. Dropping the box to the shared
  // 280 without touching them would have pushed the axes 20px past both edges and CLIPPED them.
  // Written as fractions of the half-height, they reproduce the old drawing exactly at 340 and
  // scale correctly at any height — so the next change to VISUAL_HEIGHT cannot silently crop this.
  const axisReach = cy - 10;
  const armFor = (magnitude: number) => cy * (0.14 + 0.64 * (magnitude / longest));

  return (
    <svg aria-label={visual.learningGoal} className={VISUAL_FIGURE_CLASS} role="img" viewBox={`0 0 ${WIDTH} ${height}`}>
      <defs>
        <marker id={markerId} markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--ui-accent)" />
        </marker>
      </defs>
      {visual.axesDegrees !== undefined && (
        <g opacity="0.35">
          {[visual.axesDegrees, visual.axesDegrees + 90].map((degrees) => {
            const radians = (degrees * Math.PI) / 180;
            return (
              <line
                key={degrees}
                stroke="var(--ui-stroke-primary)"
                strokeDasharray="4 4"
                x1={cx - Math.cos(radians) * axisReach}
                x2={cx + Math.cos(radians) * axisReach}
                y1={cy + Math.sin(radians) * axisReach}
                y2={cy - Math.sin(radians) * axisReach}
              />
            );
          })}
        </g>
      )}
      <rect
        fill="var(--ui-bg-elevated)"
        height="34"
        rx="8"
        stroke="var(--ui-stroke-primary)"
        width="96"
        x={cx - 48}
        y={cy - 17}
      />
      {visual.bodyLabel && (
        <text dominantBaseline="middle" fill="var(--ui-text-primary)" fontSize="11" textAnchor="middle" x={cx} y={cy}>
          {visual.bodyLabel.length > 16 ? `${visual.bodyLabel.slice(0, 15)}…` : visual.bodyLabel}
        </text>
      )}
      {visual.vectors.map((vector, index) => {
        const radians = (vector.degrees * Math.PI) / 180;
        const arm = armFor(vector.magnitude);
        const x2 = cx + Math.cos(radians) * arm;
        const y2 = cy - Math.sin(radians) * arm;
        return (
          <g key={index}>
            <line
              markerEnd={`url(#${markerId})`}
              stroke="var(--ui-accent)"
              strokeWidth="2"
              x1={cx + Math.cos(radians) * 30}
              x2={x2}
              y1={cy - Math.sin(radians) * 30}
              y2={y2}
            />
            <text
              fill="var(--ui-text-secondary)"
              fontSize="11"
              textAnchor={Math.cos(radians) < -0.3 ? "end" : Math.cos(radians) > 0.3 ? "start" : "middle"}
              x={x2 + Math.cos(radians) * 8}
              y={y2 - Math.sin(radians) * 8 + (Math.sin(radians) < -0.3 ? 10 : 0)}
            >
              {vector.label} {vector.magnitude}
              {vector.unit ? ` ${vector.unit}` : ""}
            </text>
          </g>
        );
      })}
      {visual.equilibrium && (
        // Stated because it was checked. A diagram claiming balance that did not balance never
        // reached this component.
        <text fill="var(--ui-text-tertiary)" fontSize="11" x="12" y={height - 10}>
          These forces balance.
        </text>
      )}
    </svg>
  );
}

/**
 * One component symbol, drawn across its slot with its own lead wires.
 *
 * 🔴 EVERY GLYPH IS THE SCHOOLBOOK SYMBOL, PARAMETERISED BY THE BOX THE LAYOUT CHOSE. The zigzag,
 * the plates, the long-and-short battery lines are conventions a learner will meet on every exam
 * paper; nothing here is a style choice beyond stroke width.
 */
function CircuitGlyph({ part }: { part: CircuitPartBox }) {
  const { component, cx, cy, h, w } = part;
  const gw = w * 0.44;
  const left = cx - w / 2;
  const right = cx + w / 2;
  const g0 = cx - gw / 2;
  const g1 = cx + gw / 2;
  const stroke = "var(--ui-text-primary)";
  const leads = (toGlyphStart: number, fromGlyphEnd: number) => (
    <>
      <line stroke={stroke} strokeWidth="1.5" x1={left} x2={toGlyphStart} y1={cy} y2={cy} />
      <line stroke={stroke} strokeWidth="1.5" x1={fromGlyphEnd} x2={right} y1={cy} y2={cy} />
    </>
  );

  if (component === "resistor") {
    const a = h * 0.3;
    const step = gw / 6;
    const zig = [
      `${g0},${cy}`,
      `${g0 + step * 0.5},${cy - a}`,
      `${g0 + step * 1.5},${cy + a}`,
      `${g0 + step * 2.5},${cy - a}`,
      `${g0 + step * 3.5},${cy + a}`,
      `${g0 + step * 4.5},${cy - a}`,
      `${g0 + step * 5.5},${cy + a}`,
      `${g1},${cy}`,
    ].join(" ");
    return (
      <g>
        {leads(g0, g1)}
        <polyline fill="none" points={zig} stroke={stroke} strokeLinejoin="round" strokeWidth="1.5" />
      </g>
    );
  }
  if (component === "capacitor") {
    const gap = Math.max(3, w * 0.05);
    const plate = h * 0.42;
    return (
      <g>
        {leads(cx - gap, cx + gap)}
        <line stroke={stroke} strokeWidth="2" x1={cx - gap} x2={cx - gap} y1={cy - plate} y2={cy + plate} />
        <line stroke={stroke} strokeWidth="2" x1={cx + gap} x2={cx + gap} y1={cy - plate} y2={cy + plate} />
      </g>
    );
  }
  if (component === "inductor") {
    const r = gw / 8;
    const bumps = Array.from({ length: 4 }, (_, index) => {
      const x = g0 + r + index * 2 * r;
      return `M ${x - r} ${cy} A ${r} ${r} 0 0 1 ${x + r} ${cy}`;
    }).join(" ");
    return (
      <g>
        {leads(g0, g1)}
        <path d={bumps} fill="none" stroke={stroke} strokeWidth="1.5" />
      </g>
    );
  }
  if (component === "battery") {
    const gap = Math.max(3.5, w * 0.055);
    return (
      <g>
        {leads(cx - gap, cx + gap)}
        <line stroke={stroke} strokeWidth="2" x1={cx - gap} x2={cx - gap} y1={cy - h * 0.42} y2={cy + h * 0.42} />
        <line stroke={stroke} strokeWidth="2" x1={cx + gap} x2={cx + gap} y1={cy - h * 0.2} y2={cy + h * 0.2} />
      </g>
    );
  }
  if (component === "switch") {
    return (
      <g>
        {leads(g0, g1)}
        <circle cx={g0} cy={cy} fill={stroke} r="2.5" />
        <circle cx={g1} cy={cy} fill={stroke} r="2.5" />
        <line stroke={stroke} strokeWidth="1.5" x1={g0} x2={g1 - 2} y1={cy} y2={cy - h * 0.42} />
      </g>
    );
  }
  if (component === "diode") {
    const half = h * 0.32;
    const tip = cx + gw * 0.22;
    const back = cx - gw * 0.22;
    return (
      <g>
        {leads(back, tip)}
        <path d={`M ${back} ${cy - half} L ${back} ${cy + half} L ${tip} ${cy} Z`} fill="none" stroke={stroke} strokeWidth="1.5" />
        <line stroke={stroke} strokeWidth="2" x1={tip} x2={tip} y1={cy - half} y2={cy + half} />
      </g>
    );
  }
  const r = h * 0.46;
  if (component === "lamp") {
    const k = r * 0.7071;
    return (
      <g>
        {leads(cx - r, cx + r)}
        <circle cx={cx} cy={cy} fill="none" r={r} stroke={stroke} strokeWidth="1.5" />
        <line stroke={stroke} strokeWidth="1.5" x1={cx - k} x2={cx + k} y1={cy - k} y2={cy + k} />
        <line stroke={stroke} strokeWidth="1.5" x1={cx - k} x2={cx + k} y1={cy + k} y2={cy - k} />
      </g>
    );
  }
  // Ammeter and voltmeter: a circle wearing its letter, which is the whole convention.
  return (
    <g>
      {leads(cx - r, cx + r)}
      <circle cx={cx} cy={cy} fill="none" r={r} stroke={stroke} strokeWidth="1.5" />
      <text dominantBaseline="central" fill={stroke} fontSize={r * 1.1} textAnchor="middle" x={cx} y={cy + 0.5}>
        {component === "ammeter" ? "A" : "V"}
      </text>
    </g>
  );
}

export function Circuit({ visual }: { visual: CircuitVisual }) {
  // 🔴 EVERY POSITION COMES FROM `visual-layout.ts` (§46). The series runs, the parallel rails and
  // where each symbol sits are arithmetic a test exercises; this component only draws the answer.
  const layout = layoutCircuit(visual);
  return (
    <div>
      <svg aria-label={visual.learningGoal} className={VISUAL_FIGURE_CLASS} role="img" viewBox={`0 0 ${VISUAL_WIDTH} ${layout.height}`}>
        {layout.wires.map((wire, index) => (
          <line key={index} stroke="var(--ui-text-primary)" strokeWidth="1.5" x1={wire.x1} x2={wire.x2} y1={wire.y1} y2={wire.y2} />
        ))}
        {layout.dots.map((dot, index) => (
          <circle cx={dot.x} cy={dot.y} fill="var(--ui-text-primary)" key={index} r="2.5" />
        ))}
        {layout.parts.map((part, index) => (
          <g key={index}>
            <CircuitGlyph part={part} />
            {part.label && (
              <text fill="var(--ui-text-secondary)" fontSize="11" textAnchor="middle" x={part.cx} y={part.cy - part.h / 2 - 5}>
                {part.label}
              </text>
            )}
            {part.value && (
              <text fill="var(--ui-text-tertiary)" fontSize="10" textAnchor="middle" x={part.cx} y={part.cy + part.h / 2 + 13}>
                {part.value}
              </text>
            )}
          </g>
        ))}
        {layout.supply && (
          <g>
            <CircuitGlyph
              part={{ component: "battery", cx: layout.supply.cx, cy: layout.supply.cy, h: layout.supply.h, w: layout.supply.w }}
            />
            {layout.supply.label && (
              <text
                fill="var(--ui-text-secondary)"
                fontSize="11"
                textAnchor="middle"
                x={layout.supply.cx}
                y={layout.supply.cy + layout.supply.h / 2 + 14}
              >
                {layout.supply.label}
              </text>
            )}
          </g>
        )}
      </svg>
      {visual.equivalentOhms !== undefined && (
        // Stated because it was checked: a claimed equivalent that did not match the network's own
        // arithmetic never reached this component. The same visible half the table's balance keeps.
        <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          Equivalent resistance {visual.equivalentOhms} Ω · checked against the diagram.
        </p>
      )}
    </div>
  );
}

export function CodeTrace({ visual }: { visual: CodeVisual }) {
  const lines = visual.source.split("\n");
  const traced = new Set(visual.trace?.map((step) => step.line) ?? []);
  return (
    <div>
      <pre
        aria-label={visual.learningGoal}
        className="overflow-x-auto rounded-lg bg-(--ui-bg-elevated) p-3 text-[length:var(--canvas-text-meta)] leading-relaxed"
      >
        <code>
          {lines.map((line, index) => (
            <div className="flex gap-3" key={index}>
              <span className="select-none text-right text-(--ui-text-quaternary) tabular-nums" style={{ minWidth: "2ch" }}>
                {index + 1}
              </span>
              <span className={traced.has(index + 1) ? "text-(--ui-text-primary)" : "text-(--ui-text-secondary)"}>
                {line || " "}
              </span>
            </div>
          ))}
        </code>
      </pre>
      {visual.trace && visual.trace.length > 0 && (
        <ol className="mt-3 space-y-1.5">
          {visual.trace.map((step, index) => (
            <li className="flex gap-3 text-[length:var(--canvas-text-meta)]" key={index}>
              <span className="shrink-0 text-(--ui-text-quaternary) tabular-nums">line {step.line}</span>
              <span className="text-(--ui-text-secondary)">
                {step.note}
                {step.variables && step.variables.length > 0 && (
                  <span className="ml-2 font-mono text-(--ui-text-tertiary)">
                    {step.variables.map((variable) => `${variable.name} = ${variable.value}`).join(", ")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {visual.traceOrigin === "narrated" && (
        // 🔴 THE LABEL IS NOT DECORATION AND MUST NOT BE REMOVED. Nothing in this codebase executes
        // code, so this trace is the model's account of what would happen. It may be wrong in
        // exactly the way an invented diagram is wrong, and a learner has to know which they are
        // reading. The day something genuinely runs, this line changes with it.
        <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
          Walkthrough written by Nemesis, not produced by running the code.
        </p>
      )}
    </div>
  );
}
