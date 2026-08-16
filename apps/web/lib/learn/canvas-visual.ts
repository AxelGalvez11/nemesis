// A constrained semantic request for a teaching visual.
//
// The model says what relationship should be made visible. It never supplies HTML, SVG, Mermaid,
// JavaScript, or renderer configuration. Trusted code below this boundary owns all drawing.

export interface CanvasVisualBase {
  /** What the learner should understand after seeing this visual. */
  learningGoal: string;
  caption?: string;
}

export interface EquationVisual extends CanvasVisualBase {
  kind: "equation";
  latex: string;
}

export interface FlowVisual extends CanvasVisualBase {
  kind: "relationship";
  nodes: readonly { id: string; label: string }[];
  edges: readonly { from: string; to: string; label?: string }[];
}

export interface PlotVisual extends CanvasVisualBase {
  kind: "quantitative";
  xLabel?: string;
  yLabel?: string;
  series: readonly {
    label: string;
    points: readonly { x: number; y: number }[];
  }[];
}

export type CanvasVisualRequest = EquationVisual | FlowVisual | PlotVisual;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function base(value: Record<string, unknown>): CanvasVisualBase | null {
  const learningGoal = boundedText(value.learningGoal, 240);
  if (!learningGoal) return null;
  const caption = value.caption === undefined ? null : boundedText(value.caption, 240);
  if (value.caption !== undefined && !caption) return null;
  return { learningGoal, ...(caption ? { caption } : {}) };
}

/** Validate and bound a model request. Malformed visuals disappear; the teaching text survives. */
export function parseCanvasVisual(value: unknown): CanvasVisualRequest | null {
  if (!record(value)) return null;
  const common = base(value);
  if (!common) return null;

  if (value.kind === "equation") {
    const latex = boundedText(value.latex, 500);
    return latex ? { ...common, kind: "equation", latex } : null;
  }

  if (value.kind === "relationship") {
    if (!Array.isArray(value.nodes) || value.nodes.length < 2 || value.nodes.length > 8) return null;
    if (!Array.isArray(value.edges) || value.edges.length < 1 || value.edges.length > 12) return null;
    const nodes: Array<{ id: string; label: string }> = [];
    for (const item of value.nodes) {
      if (!record(item)) return null;
      const id = boundedText(item.id, 40);
      const label = boundedText(item.label, 100);
      if (!id || !label || !/^[A-Za-z0-9_-]+$/.test(id) || nodes.some((node) => node.id === id)) return null;
      nodes.push({ id, label });
    }
    const ids = new Set(nodes.map((node) => node.id));
    const edges: Array<{ from: string; to: string; label?: string }> = [];
    for (const item of value.edges) {
      if (!record(item)) return null;
      const from = boundedText(item.from, 40);
      const to = boundedText(item.to, 40);
      const label = item.label === undefined ? null : boundedText(item.label, 80);
      if (!from || !to || !ids.has(from) || !ids.has(to) || (item.label !== undefined && !label)) return null;
      edges.push({ from, to, ...(label ? { label } : {}) });
    }
    return { ...common, edges, kind: "relationship", nodes };
  }

  if (value.kind === "quantitative") {
    if (!Array.isArray(value.series) || value.series.length < 1 || value.series.length > 4) return null;
    const series: Array<{ label: string; points: Array<{ x: number; y: number }> }> = [];
    let totalPoints = 0;
    for (const item of value.series) {
      if (!record(item) || !Array.isArray(item.points) || item.points.length < 2 || item.points.length > 40) return null;
      const label = boundedText(item.label, 80);
      if (!label) return null;
      const points: Array<{ x: number; y: number }> = [];
      for (const point of item.points) {
        if (!record(point) || typeof point.x !== "number" || typeof point.y !== "number") return null;
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
        points.push({ x: point.x, y: point.y });
      }
      totalPoints += points.length;
      if (totalPoints > 80) return null;
      series.push({ label, points });
    }
    const xLabel = value.xLabel === undefined ? null : boundedText(value.xLabel, 80);
    const yLabel = value.yLabel === undefined ? null : boundedText(value.yLabel, 80);
    if ((value.xLabel !== undefined && !xLabel) || (value.yLabel !== undefined && !yLabel)) return null;
    return {
      ...common,
      kind: "quantitative",
      series,
      ...(xLabel ? { xLabel } : {}),
      ...(yLabel ? { yLabel } : {}),
    };
  }

  return null;
}
