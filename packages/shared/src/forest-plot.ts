// Forest plot — the iconic meta-analysis figure, drawn from the REAL computed pool (meta-analysis.ts).
//
// PURE + deterministic: geometry is plain math over the already-computed risk ratios, CIs and weights;
// no LLM, no Date/random. `buildForestPlot` returns a layout MODEL (so the web can render it with
// theme-aware SVG from React), and `renderForestSvg` turns that model into a self-contained SVG STRING
// (fixed print colors) the Word/PDF/PPT export embeds. Every coordinate traces to a number a reviewer
// can audit in the forest table — the plot never introduces a value the pool didn't compute.

import type { MetaAnalysisResult } from "./meta-analysis.ts";

export type ForestRowKind = "study" | "pooled_fixed" | "pooled_random";

export interface ForestRow {
  label: string;
  kind: ForestRowKind;
  citation_tag?: string;
  effect: number; // risk ratio
  ci_low: number;
  ci_high: number;
  /** Fixed-effect weight (%) — studies only. */
  weightPercent?: number;
  // ── geometry (px) ──
  y: number; // row centre
  markX: number; // point-estimate x
  whiskerLowX: number; // CI left, clamped to the plot
  whiskerHighX: number; // CI right, clamped to the plot
  boxSize: number; // study box side (0 for pooled diamonds)
  clippedLow: boolean; // true CI extends past the left edge (draw an arrow)
  clippedHigh: boolean;
}

export interface ForestTick {
  value: number; // risk-ratio value (e.g. 0.5, 1, 2)
  x: number;
}

export interface ForestPlotModel {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  labelColX: number; // study-label text x
  valueColX: number; // "RR (95% CI)" text x
  refX: number; // x of the RR = 1 reference line
  axisY: number; // y of the value axis
  rows: ForestRow[];
  ticks: ForestTick[];
}

// Layout constants (a compact, journal-style single-column figure).
const WIDTH = 660;
const LABEL_X = 10;
const PLOT_LEFT = 132;
const PLOT_RIGHT = 496;
const VALUE_X = 508;
const TOP_PAD = 16;
const ROW_H = 26;
const POOLED_GAP = 10;
const MIN_BOX = 6;
const MAX_BOX = 16;
const RANGE_CLAMP_LOW = 0.05; // ignore absurd CI tails when choosing the x-range
const RANGE_CLAMP_HIGH = 20;
const TICK_CANDIDATES = [0.1, 0.125, 0.25, 0.5, 1, 2, 4, 8, 10];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Build the forest-plot layout from a poolable result, or null when there is nothing to pool. PURE. */
export function buildForestPlot(meta: MetaAnalysisResult): ForestPlotModel | null {
  if (!meta.poolable) return null;

  // x-range on the log scale, from the data, clamped so one wide CI can't flatten the figure, and
  // always wide enough that the RR = 1 reference line is comfortably inside.
  const vals: number[] = [];
  for (const s of meta.studies) vals.push(s.ci_low, s.ci_high, s.effect);
  vals.push(meta.fixed.ci_low, meta.fixed.ci_high, meta.random.ci_low, meta.random.ci_high);
  let logMin = Math.log(RANGE_CLAMP_HIGH);
  let logMax = Math.log(RANGE_CLAMP_LOW);
  for (const v of vals) {
    const lv = Math.log(clamp(v, RANGE_CLAMP_LOW, RANGE_CLAMP_HIGH));
    if (lv < logMin) logMin = lv;
    if (lv > logMax) logMax = lv;
  }
  logMin = Math.min(logMin, Math.log(0.5));
  logMax = Math.max(logMax, Math.log(2));
  const pad = (logMax - logMin) * 0.08 || 0.1;
  logMin -= pad;
  logMax += pad;

  const span = logMax - logMin;
  const plotW = PLOT_RIGHT - PLOT_LEFT;
  const xOf = (rr: number) => PLOT_LEFT + ((Math.log(clamp(rr, RANGE_CLAMP_LOW, RANGE_CLAMP_HIGH)) - logMin) / span) * plotW;

  const maxWeight = Math.max(...meta.studies.map((s) => s.weight_percent), 1e-9);
  const lo = Math.exp(logMin);
  const hi = Math.exp(logMax);

  const rows: ForestRow[] = [];
  meta.studies.forEach((s, i) => {
    const y = TOP_PAD + i * ROW_H + ROW_H / 2;
    const box = MIN_BOX + (MAX_BOX - MIN_BOX) * Math.sqrt(clamp(s.weight_percent / maxWeight, 0, 1));
    rows.push({
      label: s.label,
      kind: "study",
      citation_tag: s.citation_tag,
      effect: s.effect,
      ci_low: s.ci_low,
      ci_high: s.ci_high,
      weightPercent: s.weight_percent,
      y,
      markX: xOf(s.effect),
      whiskerLowX: xOf(s.ci_low),
      whiskerHighX: xOf(s.ci_high),
      boxSize: box,
      clippedLow: s.ci_low < lo,
      clippedHigh: s.ci_high > hi,
    });
  });

  const pooledTop = TOP_PAD + meta.studies.length * ROW_H + POOLED_GAP;
  const pooled = (kind: "pooled_fixed" | "pooled_random", label: string, est: typeof meta.fixed, rowIdx: number): ForestRow => {
    const y = pooledTop + rowIdx * ROW_H + ROW_H / 2;
    return {
      label,
      kind,
      effect: est.estimate,
      ci_low: est.ci_low,
      ci_high: est.ci_high,
      y,
      markX: xOf(est.estimate),
      whiskerLowX: xOf(est.ci_low),
      whiskerHighX: xOf(est.ci_high),
      boxSize: 0,
      clippedLow: est.ci_low < lo,
      clippedHigh: est.ci_high > hi,
    };
  };
  rows.push(pooled("pooled_random", "Pooled (random effects)", meta.random, 0));
  rows.push(pooled("pooled_fixed", "Pooled (fixed effect)", meta.fixed, 1));

  const axisY = pooledTop + 2 * ROW_H + 6;
  const ticks: ForestTick[] = TICK_CANDIDATES
    .filter((v) => v >= lo && v <= hi)
    .map((value) => ({ value, x: xOf(value) }));

  return {
    width: WIDTH,
    height: axisY + 30,
    plotLeft: PLOT_LEFT,
    plotRight: PLOT_RIGHT,
    labelColX: LABEL_X,
    valueColX: VALUE_X,
    refX: xOf(1),
    axisY,
    rows,
    ticks,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const f2 = (n: number) => n.toFixed(2);

/** Self-contained SVG string with fixed print colors — what the Word/PDF/PPT export embeds. PURE. */
export function renderForestSvg(m: ForestPlotModel): string {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}" viewBox="0 0 ${m.width} ${m.height}" font-family="Helvetica, Arial, sans-serif" font-size="11">`,
  );
  parts.push(`<rect width="${m.width}" height="${m.height}" fill="#ffffff"/>`);
  // RR = 1 reference line (solid no-effect line, spanning the rows).
  parts.push(`<line x1="${f2(m.refX)}" y1="6" x2="${f2(m.refX)}" y2="${m.axisY}" stroke="#9aa0a6" stroke-width="1"/>`);
  // axis
  parts.push(`<line x1="${m.plotLeft}" y1="${m.axisY}" x2="${m.plotRight}" y2="${m.axisY}" stroke="#3c4043" stroke-width="1"/>`);
  for (const t of m.ticks) {
    parts.push(`<line x1="${f2(t.x)}" y1="${m.axisY}" x2="${f2(t.x)}" y2="${m.axisY + 4}" stroke="#3c4043" stroke-width="1"/>`);
    parts.push(`<text x="${f2(t.x)}" y="${m.axisY + 16}" text-anchor="middle" fill="#3c4043">${t.value}</text>`);
  }
  parts.push(`<text x="${f2((m.plotLeft + m.plotRight) / 2)}" y="${m.axisY + 28}" text-anchor="middle" fill="#5f6368">Risk ratio (log scale)</text>`);

  for (const r of m.rows) {
    const pooled = r.kind !== "study";
    const ink = "#202124";
    // whisker
    parts.push(`<line x1="${f2(r.whiskerLowX)}" y1="${f2(r.y)}" x2="${f2(r.whiskerHighX)}" y2="${f2(r.y)}" stroke="${ink}" stroke-width="1"/>`);
    if (pooled) {
      // diamond centred on the pooled estimate
      const h = 7;
      parts.push(
        `<polygon points="${f2(r.whiskerLowX)},${f2(r.y)} ${f2(r.markX)},${f2(r.y - h)} ${f2(r.whiskerHighX)},${f2(r.y)} ${f2(r.markX)},${f2(r.y + h)}" fill="${ink}"/>`,
      );
    } else {
      const s = r.boxSize;
      parts.push(`<rect x="${f2(r.markX - s / 2)}" y="${f2(r.y - s / 2)}" width="${f2(s)}" height="${f2(s)}" fill="${ink}"/>`);
    }
    // study label (left) + RR (CI) value (right)
    const weight = pooled ? "font-weight=\"600\"" : "";
    parts.push(`<text x="${m.labelColX}" y="${f2(r.y + 3.5)}" fill="${ink}" ${weight}>${esc(r.label)}</text>`);
    parts.push(
      `<text x="${m.valueColX}" y="${f2(r.y + 3.5)}" fill="${ink}" ${weight}>${f2(r.effect)} (${f2(r.ci_low)}–${f2(r.ci_high)})</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}
