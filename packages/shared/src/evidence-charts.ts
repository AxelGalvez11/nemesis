// Evidence distribution charts — the study-design mix and the publications-by-year of a report's REAL
// sources. Same discipline as forest-plot.ts: PURE + deterministic geometry over data we already have
// (report.citations metadata), no LLM, no Date/random. `build*` returns a layout MODEL the web renders as
// theme-aware SVG; each returns null when the real data is too thin to be honest (we stay silent rather
// than draw a misleading chart). Counts trace to the same `studyTypeLabel` / `citationYear` the evidence
// table already shows — the charts never introduce a value the metadata didn't carry.

import type { Citation } from "./answer.ts";
import { studyTypeLabel } from "./study-type.ts";
import { citationYear } from "./citation-meta.ts";

// ── shared geometry ──
const WIDTH = 560;
const PAD_X = 12;

// ── 1. Study-design breakdown (horizontal bars) ──

export interface DesignBar {
  label: string; // verbatim study-design label (never LLM-guessed)
  count: number;
  y: number;
  barX: number; // bar start x (after the label column)
  barW: number; // bar width (px), proportional to count
  rowH: number;
}

export interface StudyDesignModel {
  width: number;
  height: number;
  labelX: number;
  barX: number;
  bars: DesignBar[];
  maxCount: number;
  /** honest coverage line, e.g. "Based on 12 of 18 sources with a known study design". */
  coverageNote: string;
}

const DESIGN_ROW_H = 28;
const DESIGN_TOP = 10;
const DESIGN_LABEL_X = PAD_X;
const DESIGN_BAR_X = 210; // label column width
const DESIGN_BAR_MAX = WIDTH - DESIGN_BAR_X - 48; // leave room for the count at the bar end

/** Build the study-design breakdown, or null when too few sources carry a known design. PURE.
 *  Only sources whose study design is *known* from provider metadata are counted (studyTypeLabel);
 *  the coverage note states how many of the total that was, so the chart never overclaims. */
export function buildStudyDesignChart(citations: readonly Citation[]): StudyDesignModel | null {
  const counts = new Map<string, number>();
  let known = 0;
  for (const c of citations) {
    const label = studyTypeLabel(c);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    known += 1;
  }
  // Stay silent unless there is real signal: at least 3 classified sources across at least 2 designs.
  if (known < 3 || counts.size < 2) return null;

  // Sort by count desc, then label asc for a stable, deterministic order.
  const entries = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  const maxCount = Math.max(...entries.map(([, c]) => c));
  const bars: DesignBar[] = entries.map(([label, count], i) => ({
    label,
    count,
    y: DESIGN_TOP + i * DESIGN_ROW_H,
    barX: DESIGN_BAR_X,
    barW: Math.max(2, (count / maxCount) * DESIGN_BAR_MAX),
    rowH: DESIGN_ROW_H,
  }));
  return {
    width: WIDTH,
    height: DESIGN_TOP + entries.length * DESIGN_ROW_H + 6,
    labelX: DESIGN_LABEL_X,
    barX: DESIGN_BAR_X,
    bars,
    maxCount,
    coverageNote: `Based on ${known} of ${citations.length} source${citations.length === 1 ? "" : "s"} with a known study design`,
  };
}

// ── 2. Publications by year (vertical bars) ──

export interface YearBar {
  year: number;
  count: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TimelineModel {
  width: number;
  height: number;
  plotTop: number;
  axisY: number;
  bars: YearBar[];
  maxCount: number;
  minYear: number;
  maxYear: number;
}

const TL_HEIGHT = 180;
const TL_TOP = 12;
const TL_AXIS_PAD = 34; // room below the axis for year labels
const TL_BAR_GAP = 3;

/** Build the publications-by-year timeline, or null when fewer than 3 distinct dated years. PURE.
 *  Years come from citationYear (real metadata only); undated sources are excluded honestly. The full
 *  year range is filled so gap years show as zero-height bars (an honest "no papers that year"). */
export function buildEvidenceTimeline(citations: readonly Citation[]): TimelineModel | null {
  const counts = new Map<number, number>();
  for (const c of citations) {
    const y = citationYear(c);
    if (!/^\d{4}$/.test(y)) continue; // citationYear returns "—" when unknown
    const yr = Number(y);
    counts.set(yr, (counts.get(yr) ?? 0) + 1);
  }
  if (counts.size < 3) return null; // too few dated years to be a meaningful trend

  const years = [...counts.keys()];
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const span = maxYear - minYear + 1; // inclusive, so gap years render as zeros
  const maxCount = Math.max(...counts.values());

  const plotW = WIDTH - PAD_X * 2;
  const axisY = TL_HEIGHT - TL_AXIS_PAD;
  const plotH = axisY - TL_TOP;
  const slot = plotW / span;
  const barW = Math.max(2, slot - TL_BAR_GAP);

  const bars: YearBar[] = [];
  for (let i = 0; i < span; i++) {
    const year = minYear + i;
    const count = counts.get(year) ?? 0;
    const h = maxCount > 0 ? (count / maxCount) * plotH : 0;
    bars.push({
      year,
      count,
      x: PAD_X + i * slot + (slot - barW) / 2,
      y: axisY - h,
      w: barW,
      h,
    });
  }
  return { width: WIDTH, height: TL_HEIGHT, plotTop: TL_TOP, axisY, bars, maxCount, minYear, maxYear };
}
