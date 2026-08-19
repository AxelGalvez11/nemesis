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
  CodeVisual,
  ConstructionVisual,
  TableVisual,
  TimelineVisual,
  VectorsVisual,
} from "@/lib/learn/canvas-visual";

const WIDTH = 640;

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
  const positions = visual.events.flatMap((event) => [event.at, event.until ?? event.at]);
  const min = Math.min(...positions);
  const max = Math.max(...positions);
  const span = max - min || 1;
  // Lanes let two threads run in parallel. Unlaned events share the first row, which is the common
  // case and must not cost a lane label.
  const lanes = [...new Set(visual.events.map((event) => event.lane ?? ""))];
  const rowHeight = 46;
  const top = 26;
  const height = top + lanes.length * rowHeight + 24;
  const left = 12;
  const right = 12;
  const x = (value: number) => left + ((value - min) / span) * (WIDTH - left - right);

  return (
    <svg aria-label={visual.learningGoal} className="h-auto w-full" role="img" viewBox={`0 0 ${WIDTH} ${height}`}>
      {lanes.map((lane, laneIndex) => {
        const y = top + laneIndex * rowHeight + rowHeight / 2;
        return (
          <g key={lane || "default"}>
            <line stroke="var(--ui-stroke-primary)" strokeWidth="1" x1={left} x2={WIDTH - right} y1={y} y2={y} />
            {lane && (
              <text fill="var(--ui-text-quaternary)" fontSize="10" x={left} y={y - rowHeight / 2 + 8}>
                {lane}
              </text>
            )}
          </g>
        );
      })}
      {visual.events.map((event, index) => {
        const laneIndex = Math.max(0, lanes.indexOf(event.lane ?? ""));
        const y = top + laneIndex * rowHeight + rowHeight / 2;
        const covered = visual.hidden === index;
        const isSpan = event.until !== undefined && event.until !== event.at;
        return (
          <g key={index}>
            {isSpan ? (
              <rect
                fill="var(--ui-accent)"
                height="10"
                // An uncertain span is drawn faint rather than annotated: the shape carries the
                // doubt, which is what a reader takes in before they read anything.
                opacity={event.uncertain ? 0.35 : 0.8}
                rx="5"
                width={Math.max(4, x(event.until!) - x(event.at))}
                x={x(event.at)}
                y={y - 5}
              />
            ) : (
              <circle
                cx={x(event.at)}
                cy={y}
                fill={event.uncertain ? "var(--ui-bg-secondary)" : "var(--ui-accent)"}
                r="5"
                stroke="var(--ui-accent)"
                strokeDasharray={event.uncertain ? "2 2" : undefined}
                strokeWidth="1.5"
              />
            )}
            <text
              fill={covered ? "var(--ui-text-quaternary)" : "var(--ui-text-primary)"}
              fontSize="12"
              textAnchor={x(event.at) > WIDTH * 0.75 ? "end" : "start"}
              x={x(event.at) + (x(event.at) > WIDTH * 0.75 ? -8 : 8)}
              y={y - 10}
            >
              {covered ? COVERED : event.label}
            </text>
            <text
              fill="var(--ui-text-quaternary)"
              fontSize="10"
              textAnchor={x(event.at) > WIDTH * 0.75 ? "end" : "start"}
              x={x(event.at) + (x(event.at) > WIDTH * 0.75 ? -8 : 8)}
              y={y + 18}
            >
              {covered ? "" : `${event.atLabel ?? event.at}${event.uncertain ? " (uncertain)" : ""}`}
            </text>
          </g>
        );
      })}
      {visual.unit && (
        <text fill="var(--ui-text-quaternary)" fontSize="10" x={left} y={height - 6}>
          {visual.unit}
        </text>
      )}
    </svg>
  );
}

export function Construction({ visual }: { visual: ConstructionVisual }) {
  // The figure is laid out in its own coordinate space and fitted here, so a model may place points
  // in whatever units the problem uses — centimetres, metres, arbitrary — without knowing the canvas.
  const xs = visual.points.map((point) => point.x);
  const ys = visual.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const pad = 40;
  const height = 320;
  const scale = Math.min((WIDTH - pad * 2) / spanX, (height - pad * 2) / spanY);
  // y is flipped: mathematics counts upward and SVG counts downward, and a figure drawn without
  // this is a correct construction mirrored, which looks like a different figure.
  const px = (value: number) => pad + (value - minX) * scale;
  const py = (value: number) => height - pad - (value - minY) * scale;
  const at = (id: string) => visual.points.find((point) => point.id === id)!;

  return (
    <svg aria-label={visual.learningGoal} className="h-auto w-full" role="img" viewBox={`0 0 ${WIDTH} ${height}`}>
      {visual.circles?.map((circle, index) => {
        const centre = at(circle.centre);
        const through = at(circle.through);
        const radius = Math.hypot(through.x - centre.x, through.y - centre.y) * scale;
        return (
          <circle
            cx={px(centre.x)}
            cy={py(centre.y)}
            fill="none"
            key={index}
            r={radius}
            stroke="var(--ui-stroke-primary)"
            strokeWidth="1.5"
          />
        );
      })}
      {visual.segments?.map((segment, index) => {
        const from = at(segment.from);
        const to = at(segment.to);
        return (
          <g key={index}>
            <line
              stroke="var(--ui-text-primary)"
              strokeWidth="1.5"
              x1={px(from.x)}
              x2={px(to.x)}
              y1={py(from.y)}
              y2={py(to.y)}
            />
            {segment.label && (
              <text
                fill="var(--ui-text-tertiary)"
                fontSize="11"
                textAnchor="middle"
                x={(px(from.x) + px(to.x)) / 2}
                y={(py(from.y) + py(to.y)) / 2 - 6}
              >
                {segment.label}
              </text>
            )}
          </g>
        );
      })}
      {visual.angles?.map((angle, index) => {
        const vertex = at(angle.at);
        // The mark is drawn from the verified measurement, so what is on screen and what was checked
        // are the same number — there is no second place for them to disagree.
        return (
          <text
            fill="var(--ui-accent)"
            fontSize="11"
            key={index}
            textAnchor="middle"
            x={px(vertex.x)}
            y={py(vertex.y) - 14}
          >
            {angle.degrees}°
          </text>
        );
      })}
      {visual.points.map((point) => (
        <g key={point.id}>
          <circle cx={px(point.x)} cy={py(point.y)} fill="var(--ui-text-primary)" r="3.5" />
          <text fill="var(--ui-text-secondary)" fontSize="12" x={px(point.x) + 8} y={py(point.y) - 8}>
            {point.label ?? point.id}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function VectorDiagram({ visual }: { visual: VectorsVisual }) {
  const rawId = useId();
  const markerId = `canvas-vector-${rawId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const height = 340;
  const cx = WIDTH / 2;
  const cy = height / 2;
  const longest = Math.max(...visual.vectors.map((vector) => vector.magnitude), 1);
  // Every arrow is scaled against the largest, so relative magnitude is readable at a glance — which
  // is most of what a force diagram is for.
  const armFor = (magnitude: number) => 24 + (magnitude / longest) * 108;

  return (
    <svg aria-label={visual.learningGoal} className="h-auto w-full" role="img" viewBox={`0 0 ${WIDTH} ${height}`}>
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
                x1={cx - Math.cos(radians) * 160}
                x2={cx + Math.cos(radians) * 160}
                y1={cy + Math.sin(radians) * 160}
                y2={cy - Math.sin(radians) * 160}
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
