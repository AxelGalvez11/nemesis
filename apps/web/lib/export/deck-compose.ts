// How a slide is COMPOSED — the part the owner was actually asking for.
//
// 🔴 THE LESSON THAT PAID FOR THIS FILE. Twenty gradients with different hues is not twenty
// designs. What PowerPoint's Designer does — and what this does — is change the LAYOUT: a
// colour block down one edge, a title reversed out of a band, points as cards instead of
// bullets, a huge numeral behind a section title, a hairline rule doing the work an image
// would do. Palette is the smallest part of a design; structure is the design.
//
// Every function here turns (design, slide) into a Scene (see deck-scene.ts). Nothing here
// knows about PowerPoint or SVG — that is the point. deck-pptx.ts writes the scene into a real
// file; deck-svg.ts draws the same scene for review, so a design cannot look good in a preview
// and wrong in the download.
//
// 🔴 RULES THE WHOLE SET OBEYS, so twenty designs still feel like one product made them:
//   - Generous margins. Designed decks breathe; 0.85in is the house minimum.
//   - Titles are large and set once. Body copy never competes with them.
//   - Type never rides an edge it cannot be read against: text on an accent block uses the
//     design's accentInk, text on a dark field uses deepInk. Both are declared, not guessed.
//   - Kickers are small, capitalised and letter-spaced; that single detail is most of what
//     separates a designed slide from a typed one.
//   - No accent rule under every title — still the tell of an AI deck.

import type { DeckArt } from "./deck-art";
import type { DeckSlide, DeckPlan } from "./deck-plan";
import {
  box,
  cells,
  columns,
  crossBand,
  edgeBand,
  inset,
  ordinal,
  rows,
  SLIDE_H,
  SLIDE_W,
  type Box,
  type Scene,
  type SceneItem,
} from "./deck-scene";

export type CoverKind =
  | "band-left"
  | "band-bottom"
  | "split-diagonal"
  | "frame"
  | "numeral"
  | "stack-bars"
  | "circle"
  | "panel-right"
  | "editorial"
  | "corner-blocks"
  | "ribbon"
  | "grid-dots"
  | "arc-corner"
  | "half-split"
  | "art-glow";

export type BodyKind =
  | "plain"
  | "cards"
  | "numbered"
  | "rail"
  | "panel-title"
  | "two-col-rule"
  | "chips"
  | "banner"
  | "boxed"
  | "hanging-rule";

export type SectionKind = "solid-numeral" | "band" | "split" | "rule" | "art";
export type StatKind = "panel" | "rule" | "circle" | "block";
export type QuoteKind = "mark" | "band" | "rule" | "panel";

export interface DeckDesign {
  id: string;
  name: string;
  blurb: string;
  fonts: { display: string; body: string };
  /** Page and its inks. */
  paper: string;
  ink: string;
  soft: string;
  muted: string;
  /** The brand colour: blocks, rules, numerals — and what text sits on it. */
  accent: string;
  accentInk: string;
  /** The dark (or simply full-bleed) field a cover or section can be built on. */
  deep: string;
  deepInk: string;
  deepSoft: string;
  cover: CoverKind;
  section: SectionKind;
  body: BodyKind;
  stat: StatKind;
  quote: QuoteKind;
  /** Painted art, for the designs whose covers are meant to glow rather than block. */
  art?: { cover?: DeckArt; section?: DeckArt; closing?: DeckArt };
  /** Kickers in caps with letter spacing — on by default, off for the quiet designs. */
  kicker?: boolean;
  /** Nudge the whole type scale, for designs that want to shout or whisper. */
  scale?: number;
}

const M = 0.85;
const CONTENT_W = SLIDE_W - M * 2;

/** Titles shrink as they lengthen, so a long one never crowds the composition. */
function fit(base: number, text: string): number {
  const n = text.length;
  if (n > 90) return base * 0.6;
  if (n > 62) return base * 0.72;
  if (n > 42) return base * 0.85;
  return base;
}

/** Blend two hex colours. Used for "ghost" type — a numeral sunk into its own background —
 *  because PowerPoint will not give us transparent TEXT, only transparent fills, and a preview
 *  that fakes it would be lying about the file. */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number): number => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return [0, 1, 2]
    .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t))
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("");
}

interface Ctx {
  plan: DeckPlan;
  /** 1-based position among the plan's slides — numerals and section marks use it. */
  index: number;
  credit: string;
}

// ── small builders ───────────────────────────────────────────────────────────────────────────

const rect = (b: Box, fill: string, alpha?: number): SceneItem => ({ alpha, box: b, fill, kind: "shape", shape: "rect" });

const hair = (b: Box, color: string, width = 0.012): SceneItem => ({
  box: b,
  kind: "shape",
  line: { color, width },
  shape: "line",
});

function title(d: DeckDesign, text: string, b: Box, size: number, color: string, align?: "left" | "center"): SceneItem {
  return {
    align: align ?? "left",
    bold: true,
    box: b,
    color,
    font: d.fonts.display,
    kind: "text",
    lineSpacing: 1.06,
    size: fit(size, text) * (d.scale ?? 1),
    text,
    valign: "top",
  };
}

function kicker(d: DeckDesign, text: string, b: Box, color: string, align?: "left" | "center"): SceneItem[] {
  if (!text) return [];
  return [
    {
      align: align ?? "left",
      bold: true,
      box: b,
      caps: d.kicker !== false,
      color,
      font: d.fonts.body,
      kind: "text",
      size: 10.5,
      spacing: d.kicker === false ? 0 : 1.8,
      text,
      valign: "top",
    },
  ];
}

function body(d: DeckDesign, text: string, b: Box, size: number, color: string, align?: "left" | "center"): SceneItem {
  return {
    align: align ?? "left",
    box: b,
    color,
    font: d.fonts.body,
    kind: "text",
    lineSpacing: 1.22,
    size,
    text,
    valign: "top",
  };
}

// ── covers ───────────────────────────────────────────────────────────────────────────────────

function composeCover(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const heading = s.title || ctx.plan.title;
  const sub = s.subtitle || ctx.plan.subtitle;
  const items: SceneItem[] = [];
  let background = d.paper;

  switch (d.cover) {
    case "band-left": {
      const band = edgeBand("left", SLIDE_W * 0.34);
      items.push(rect(band, d.accent));
      items.push(...kicker(d, ctx.credit, box(M, M, band.w - M * 1.4, 0.3), d.accentInk));
      items.push(title(d, heading, box(band.w + 0.9, 2.3, SLIDE_W - band.w - 0.9 - M, 3), 46, d.ink));
      if (sub) items.push(body(d, sub, box(band.w + 0.9, 4.6, SLIDE_W - band.w - 1.9, 1.4), 15, d.soft));
      break;
    }
    case "band-bottom": {
      background = d.deep;
      const band = crossBand("bottom", SLIDE_H * 0.34);
      items.push(rect(band, d.accent));
      items.push(title(d, heading, box(M, 2.1, CONTENT_W * 0.8, 2.2), 42, d.deepInk));
      items.push(...kicker(d, ctx.credit, box(M, 1.5, CONTENT_W, 0.3), d.accent));
      if (sub) items.push(body(d, sub, box(M, band.y + 0.8, CONTENT_W * 0.7, 1.4), 15, d.accentInk));
      break;
    }
    case "split-diagonal": {
      background = d.deep;
      items.push({ box: box(0, 0, SLIDE_W, SLIDE_H), fill: d.accent, kind: "shape", shape: "rtTriangle" });
      items.push(title(d, heading, box(M, 4.05, CONTENT_W * 0.62, 2.2), 38, d.deepInk));
      if (sub) items.push(body(d, sub, box(M, 6.05, CONTENT_W * 0.55, 0.9), 14, d.deepSoft));
      items.push(...kicker(d, ctx.credit, box(SLIDE_W - M - 3.2, M, 3.2, 0.3), d.accentInk, "center"));
      break;
    }
    case "frame": {
      const f = inset(box(0, 0, SLIDE_W, SLIDE_H), 0.55);
      items.push({ box: f, kind: "shape", line: { color: d.accent, width: 0.02 }, shape: "rect" });
      items.push(...kicker(d, ctx.credit, box(M, 1.5, CONTENT_W, 0.3), d.accent, "center"));
      items.push(title(d, heading, box(M + 0.6, 2.5, CONTENT_W - 1.2, 2.4), 44, d.ink, "center"));
      items.push(hair(box(SLIDE_W / 2 - 0.5, 5.15, 1, 0), d.accent, 0.02));
      if (sub) items.push(body(d, sub, box(M + 1.2, 5.5, CONTENT_W - 2.4, 1), 14, d.soft, "center"));
      break;
    }
    case "numeral": {
      background = d.deep;
      items.push({
        align: "right",
        bold: true,
        box: box(SLIDE_W - 6.4, -0.9, 6, 6),
        color: mix(d.deep, d.accent, 0.26),
        font: d.fonts.display,
        kind: "text",
        size: 260,
        text: ordinal(1),
        valign: "top",
      });
      items.push(...kicker(d, ctx.credit, box(M, M, CONTENT_W, 0.3), d.accent));
      items.push(title(d, heading, box(M, 3.1, CONTENT_W * 0.72, 2.4), 42, d.deepInk));
      if (sub) items.push(body(d, sub, box(M, 5.3, CONTENT_W * 0.6, 1.2), 15, d.deepSoft));
      break;
    }
    case "stack-bars": {
      const widths = [4.6, 3.1, 1.8];
      widths.forEach((w, i) => items.push(rect(box(M, 1.35 + i * 0.34, w, 0.16), d.accent, i * 28)));
      items.push(title(d, heading, box(M, 3.0, CONTENT_W * 0.78, 2.4), 40, d.ink));
      if (sub) items.push(body(d, sub, box(M, 5.2, CONTENT_W * 0.62, 1.2), 15, d.soft));
      items.push(...kicker(d, ctx.credit, box(M, SLIDE_H - M - 0.3, CONTENT_W, 0.3), d.muted));
      break;
    }
    case "circle": {
      background = d.deep;
      items.push({ box: box(SLIDE_W - 5.2, -1.5, 6.4, 6.4), fill: d.accent, kind: "shape", shape: "ellipse" });
      items.push(...kicker(d, ctx.credit, box(M, M, 5, 0.3), d.deepSoft));
      items.push(title(d, heading, box(M, 3.4, CONTENT_W * 0.6, 2.4), 40, d.deepInk));
      if (sub) items.push(body(d, sub, box(M, 5.6, CONTENT_W * 0.5, 1), 14, d.deepSoft));
      break;
    }
    case "panel-right": {
      const panel = edgeBand("right", SLIDE_W * 0.38);
      items.push(rect(panel, d.deep));
      items.push(title(d, heading, box(M, 2.5, SLIDE_W - panel.w - M - 0.9, 2.6), 46, d.ink));
      items.push(hair(box(M, 2.25, 1.1, 0), d.accent, 0.03));
      if (sub) items.push(body(d, sub, box(panel.x + 0.8, 3.0, panel.w - 1.5, 2), 15, d.deepSoft));
      items.push(...kicker(d, ctx.credit, box(panel.x + 0.8, 2.4, panel.w - 1.5, 0.3), d.accent));
      break;
    }
    case "editorial": {
      items.push(...kicker(d, ctx.credit, box(M, 2.1, CONTENT_W, 0.3), d.accent, "center"));
      items.push(title(d, heading, box(M + 0.9, 2.85, CONTENT_W - 1.8, 2.6), 46, d.ink, "center"));
      if (sub) items.push(body(d, sub, box(M + 1.6, 5.35, CONTENT_W - 3.2, 1), 14.5, d.soft, "center"));
      items.push(hair(box(M, 1.7, CONTENT_W, 0), d.ink, 0.008));
      items.push(hair(box(M, SLIDE_H - 1.7, CONTENT_W, 0), d.ink, 0.008));
      break;
    }
    case "corner-blocks": {
      items.push(rect(box(0, 0, 1.5, 1.5), d.accent));
      items.push(rect(box(SLIDE_W - 2.2, SLIDE_H - 0.55, 2.2, 0.55), d.deep));
      items.push(title(d, heading, box(M, 2.8, CONTENT_W * 0.7, 2.4), 46, d.ink));
      if (sub) items.push(body(d, sub, box(M, 5.1, CONTENT_W * 0.55, 1.2), 15, d.soft));
      items.push(...kicker(d, ctx.credit, box(M, 2.35, CONTENT_W, 0.3), d.accent));
      break;
    }
    case "ribbon": {
      background = d.paper;
      const ribbon = box(0, 2.55, SLIDE_W, 2.4);
      items.push(rect(ribbon, d.deep));
      items.push(rect(box(0, 2.4, SLIDE_W, 0.14), d.accent));
      items.push(title(d, heading, box(M, ribbon.y + 0.55, CONTENT_W * 0.8, 1.6), 38, d.deepInk));
      if (sub) items.push(body(d, sub, box(M, ribbon.y + ribbon.h + 0.45, CONTENT_W * 0.6, 1), 14.5, d.soft));
      items.push(...kicker(d, ctx.credit, box(M, 1.7, CONTENT_W, 0.3), d.muted));
      break;
    }
    case "grid-dots": {
      for (let r = 0; r < 6; r += 1) {
        for (let c = 0; c < 6; c += 1) {
          items.push({
            alpha: 55,
            box: box(SLIDE_W - 4.3 + c * 0.42, 1.1 + r * 0.42, 0.1, 0.1),
            fill: d.accent,
            kind: "shape",
            shape: "ellipse",
          });
        }
      }
      items.push(title(d, heading, box(M, 2.9, CONTENT_W * 0.62, 2.4), 44, d.ink));
      if (sub) items.push(body(d, sub, box(M, 5.2, CONTENT_W * 0.5, 1.2), 15, d.soft));
      items.push(...kicker(d, ctx.credit, box(M, 2.45, CONTENT_W, 0.3), d.accent));
      break;
    }
    case "arc-corner": {
      background = d.deep;
      items.push({ box: box(-2.2, SLIDE_H - 4.4, 6.6, 6.6), fill: d.accent, kind: "shape", shape: "ellipse" });
      items.push(title(d, heading, box(SLIDE_W * 0.36, 2.7, SLIDE_W * 0.55, 2.6), 40, d.deepInk));
      if (sub) items.push(body(d, sub, box(SLIDE_W * 0.36, 5.0, SLIDE_W * 0.45, 1.2), 15, d.deepSoft));
      items.push(...kicker(d, ctx.credit, box(SLIDE_W * 0.36, 2.15, 4, 0.3), d.accent));
      break;
    }
    case "half-split": {
      const [left] = [edgeBand("left", SLIDE_W / 2)];
      items.push(rect(left, d.accent));
      items.push(title(d, heading, box(M, 2.9, left.w - M - 0.7, 2.6), 36, d.accentInk));
      items.push(...kicker(d, ctx.credit, box(M, 2.35, left.w - M, 0.3), d.accentInk));
      if (sub) items.push(body(d, sub, box(left.w + 0.9, 3.05, SLIDE_W / 2 - 1.75, 2), 15, d.soft));
      items.push(hair(box(left.w + 0.9, 2.75, 1, 0), d.accent, 0.03));
      break;
    }
    default: {
      // art-glow — the painted background, kept for the designs whose character is light
      background = d.deep;
      items.push(...kicker(d, ctx.credit, box(M, M, CONTENT_W, 0.3), d.accent));
      items.push(title(d, heading, box(M, 3.2, CONTENT_W * 0.75, 2.4), 42, d.deepInk));
      if (sub) items.push(body(d, sub, box(M, 5.4, CONTENT_W * 0.6, 1.2), 15, d.deepSoft));
    }
  }

  return { background: { art: d.cover === "art-glow" ? d.art?.cover : undefined, color: background }, items };
}

// ── section breaks ───────────────────────────────────────────────────────────────────────────

function composeSection(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const items: SceneItem[] = [];
  let background = d.paper;
  switch (d.section) {
    case "solid-numeral": {
      background = d.accent;
      items.push({
        bold: true,
        box: box(SLIDE_W - 4.6, 1.2, 4, 4.4),
        color: mix(d.accent, d.accentInk, 0.24),
        font: d.fonts.display,
        kind: "text",
        size: 190,
        text: ordinal(ctx.index),
        valign: "top",
      });
      items.push(title(d, s.title, box(M, 3.1, CONTENT_W * 0.62, 2.4), 38, d.accentInk));
      break;
    }
    case "band": {
      background = d.paper;
      items.push(rect(crossBand("top", 2.5), d.deep));
      items.push(...kicker(d, `Part ${ordinal(ctx.index)}`, box(M, 1.0, 4, 0.3), d.accent));
      items.push(title(d, s.title, box(M, 3.15, CONTENT_W * 0.72, 2.2), 36, d.ink));
      break;
    }
    case "split": {
      items.push(rect(edgeBand("left", SLIDE_W * 0.42), d.deep));
      items.push({
        bold: true,
        box: box(M, 2.9, 3, 2),
        color: d.accent,
        font: d.fonts.display,
        kind: "text",
        size: 96,
        text: ordinal(ctx.index),
        valign: "top",
      });
      items.push(title(d, s.title, box(SLIDE_W * 0.42 + 0.9, 3.2, SLIDE_W * 0.5, 2), 34, d.ink));
      break;
    }
    case "rule": {
      items.push(...kicker(d, `Part ${ordinal(ctx.index)}`, box(M, 2.9, 4, 0.3), d.accent));
      items.push(hair(box(M, 3.35, CONTENT_W, 0), d.accent, 0.03));
      items.push(title(d, s.title, box(M, 3.7, CONTENT_W * 0.8, 2), 36, d.ink));
      break;
    }
    default: {
      background = d.deep;
      items.push(...kicker(d, `Part ${ordinal(ctx.index)}`, box(M, 2.9, 4, 0.3), d.accent));
      items.push(title(d, s.title, box(M, 3.4, CONTENT_W * 0.75, 2.2), 36, d.deepInk));
    }
  }
  return { background: { art: d.section === "art" ? d.art?.section : undefined, color: background }, items };
}

// ── body slides ──────────────────────────────────────────────────────────────────────────────

function composeBody(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const points = s.points.slice(0, 5);
  const items: SceneItem[] = [];
  let background = d.paper;
  const heading = s.title;

  switch (d.body) {
    case "cards": {
      items.push(title(d, heading, box(M, 0.75, CONTENT_W * 0.8, 1.1), 27, d.ink));
      const area = box(M, 2.25, CONTENT_W, SLIDE_H - 2.25 - 0.9);
      const grid = cells(area, points.length || 1, 0.32);
      const tight = points.length > 3;
      points.forEach((point, i) => {
        const c = grid[i];
        if (!c) return;
        items.push({ alpha: 92, box: c, fill: d.accent, kind: "shape", radius: 0.06, shape: "roundRect" });
        items.push({ box: box(c.x, c.y, 0.07, c.h), fill: d.accent, kind: "shape", shape: "rect" });
        items.push({
          bold: true,
          box: box(c.x + 0.32, c.y + 0.26, 1, 0.4),
          color: d.accent,
          font: d.fonts.display,
          kind: "text",
          size: 14,
          text: ordinal(i + 1),
          valign: "top",
        });
        items.push(body(d, point, box(c.x + 0.32, c.y + 0.74, c.w - 0.64, c.h - 0.95), tight ? 13 : 15, d.soft));
      });
      break;
    }
    case "numbered": {
      items.push(title(d, heading, box(M, 0.75, CONTENT_W * 0.8, 1.1), 27, d.ink));
      const area = box(M, 2.1, CONTENT_W, SLIDE_H - 2.1 - 0.85);
      const lines = rows(area, Math.max(points.length, 1), 0.12);
      points.forEach((point, i) => {
        const r = lines[i];
        if (!r) return;
        items.push({
          bold: true,
          box: box(r.x, r.y + 0.04, 0.9, r.h),
          color: d.accent,
          font: d.fonts.display,
          kind: "text",
          size: 26,
          text: ordinal(i + 1),
          valign: "top",
        });
        items.push(body(d, point, box(r.x + 1.05, r.y + 0.12, r.w - 1.05, r.h), 15, d.soft));
        if (i < points.length - 1) items.push(hair(box(r.x, r.y + r.h + 0.02, r.w, 0), d.muted, 0.006));
      });
      break;
    }
    case "rail": {
      const rail = edgeBand("left", 3.25);
      items.push(rect(rail, d.deep));
      items.push(rect(box(0, 0, 0.14, SLIDE_H), d.accent));
      items.push(title(d, heading, box(0.62, 1.15, rail.w - 1.15, 3.4), 19, d.deepInk));
      items.push(...kicker(d, ordinal(ctx.index), box(0.62, 0.78, 1.5, 0.3), d.accent));
      items.push({
        box: box(rail.w + 0.85, 1.15, SLIDE_W - rail.w - 0.85 - M, SLIDE_H - 2.2),
        bullet: "dash",
        color: d.soft,
        font: d.fonts.body,
        gap: 12,
        items: points,
        kind: "bullets",
        size: 15.5,
      });
      break;
    }
    case "panel-title": {
      const panel = crossBand("top", 1.95);
      items.push(rect(panel, d.deep));
      items.push(rect(box(0, panel.h, SLIDE_W, 0.1), d.accent));
      items.push(title(d, heading, box(M, 0.72, CONTENT_W * 0.85, 1.1), 26, d.deepInk));
      items.push({
        box: box(M, panel.h + 0.75, CONTENT_W * 0.88, SLIDE_H - panel.h - 1.4),
        bullet: "dash",
        color: d.soft,
        font: d.fonts.body,
        gap: 12,
        items: points,
        kind: "bullets",
        size: 15.5,
      });
      break;
    }
    case "two-col-rule": {
      items.push(title(d, heading, box(M, 0.75, CONTENT_W * 0.8, 1.1), 27, d.ink));
      const half = Math.ceil(points.length / 2);
      const [left, right] = columns(box(M, 2.1, CONTENT_W, SLIDE_H - 3), 2, 0.9);
      if (left && right) {
        items.push(hair(box(left.x + left.w + 0.45, 2.1, 0, SLIDE_H - 3.1), d.muted, 0.006));
        items.push({ box: left, bullet: "dash", color: d.soft, font: d.fonts.body, gap: 12, items: points.slice(0, half), kind: "bullets", size: 15 });
        items.push({ box: right, bullet: "dash", color: d.soft, font: d.fonts.body, gap: 12, items: points.slice(half), kind: "bullets", size: 15 });
      }
      break;
    }
    case "chips": {
      items.push(title(d, heading, box(M, 0.75, CONTENT_W * 0.8, 1.1), 27, d.ink));
      const area = box(M, 2.2, CONTENT_W, SLIDE_H - 3.1);
      const lines = rows(area, Math.max(points.length, 1), 0.22);
      points.forEach((point, i) => {
        const r = lines[i];
        if (!r) return;
        items.push({ box: r, fill: d.accent, kind: "shape", alpha: 94, radius: 0.5, shape: "roundRect" });
        items.push({ box: box(r.x + 0.42, r.y + r.h / 2 - 0.09, 0.18, 0.18), fill: d.accent, kind: "shape", shape: "ellipse" });
        items.push(body(d, point, box(r.x + 0.95, r.y + r.h / 2 - 0.16, r.w - 1.4, r.h), 14.5, d.soft));
      });
      break;
    }
    case "banner": {
      items.push(rect(box(0, 0.65, SLIDE_W * 0.62, 1.3), d.accent));
      items.push(title(d, heading, box(M, 0.95, SLIDE_W * 0.62 - M - 0.4, 1), 25, d.accentInk));
      items.push({
        box: box(M, 2.7, CONTENT_W * 0.85, SLIDE_H - 3.5),
        bullet: "dash",
        color: d.soft,
        font: d.fonts.body,
        gap: 13,
        items: points,
        kind: "bullets",
        size: 15.5,
      });
      break;
    }
    case "boxed": {
      const frame = inset(box(0, 0, SLIDE_W, SLIDE_H), 0.5);
      items.push({ box: frame, kind: "shape", line: { color: d.muted, width: 0.008 }, shape: "rect" });
      items.push(title(d, heading, box(frame.x + 0.55, frame.y + 0.5, frame.w - 1.1, 1.1), 26, d.ink));
      items.push(hair(box(frame.x + 0.55, frame.y + 1.5, 0.9, 0), d.accent, 0.03));
      items.push({
        box: box(frame.x + 0.55, frame.y + 1.95, frame.w - 1.5, frame.h - 2.6),
        bullet: "dash",
        color: d.soft,
        font: d.fonts.body,
        gap: 12,
        items: points,
        kind: "bullets",
        size: 15,
      });
      break;
    }
    case "hanging-rule": {
      items.push(...kicker(d, `${ordinal(ctx.index)} / ${ordinal(ctx.plan.slides.length)}`, box(M, 0.75, 3, 0.3), d.accent));
      items.push(title(d, heading, box(M, 1.25, CONTENT_W * 0.72, 1.2), 28, d.ink));
      items.push(hair(box(M, 2.55, CONTENT_W, 0), d.ink, 0.01));
      items.push({
        box: box(M + CONTENT_W * 0.22, 2.95, CONTENT_W * 0.72, SLIDE_H - 3.7),
        bullet: "none",
        color: d.soft,
        font: d.fonts.body,
        gap: 15,
        items: points,
        kind: "bullets",
        size: 15.5,
      });
      break;
    }
    default: {
      items.push(title(d, heading, box(M, 0.8, CONTENT_W * 0.78, 1.2), 27, d.ink));
      items.push(rect(box(M, 2.0, 0.75, 0.05), d.accent));
      items.push({
        box: box(M, 2.45, CONTENT_W * 0.86, SLIDE_H - 3.2),
        bullet: "dash",
        color: d.soft,
        font: d.fonts.body,
        gap: 13,
        items: points,
        kind: "bullets",
        size: 16,
      });
    }
  }
  return { background: { color: background }, items };
}

// ── stat, quote, closing ─────────────────────────────────────────────────────────────────────

function composeStat(d: DeckDesign, s: DeckSlide): Scene {
  const items: SceneItem[] = [];
  let background = d.paper;
  const label = s.statLabel || s.title;
  switch (d.stat) {
    case "panel": {
      items.push(rect(edgeBand("left", SLIDE_W * 0.46), d.accent));
      items.push({
        bold: true,
        box: box(M, 2.5, SLIDE_W * 0.46 - M - 0.4, 2.4),
        color: d.accentInk,
        font: d.fonts.display,
        kind: "text",
        size: 96,
        text: s.statValue,
        valign: "top",
      });
      items.push(body(d, label, box(SLIDE_W * 0.46 + 0.9, 3.0, SLIDE_W * 0.42, 2), 18, d.ink));
      break;
    }
    case "circle": {
      background = d.deep;
      items.push({ box: box(SLIDE_W / 2 - 2.5, 1.15, 5, 5), fill: d.accent, kind: "shape", shape: "donut" });
      items.push({
        align: "center",
        bold: true,
        box: box(SLIDE_W / 2 - 2.4, 3.0, 4.8, 1.6),
        color: d.deepInk,
        font: d.fonts.display,
        kind: "text",
        size: 76,
        text: s.statValue,
        valign: "top",
      });
      items.push(body(d, label, box(SLIDE_W / 2 - 3, 6.35, 6, 0.9), 15, d.deepSoft, "center"));
      break;
    }
    case "block": {
      background = d.deep;
      items.push(rect(box(M, 1.5, 2.1, 4.5), d.accent));
      items.push({
        bold: true,
        box: box(M + 2.9, 2.2, CONTENT_W - 3.2, 2.6),
        color: d.deepInk,
        font: d.fonts.display,
        kind: "text",
        size: 104,
        text: s.statValue,
        valign: "top",
      });
      items.push(body(d, label, box(M + 2.95, 4.85, CONTENT_W * 0.6, 1.4), 17, d.deepSoft));
      break;
    }
    default: {
      items.push({
        bold: true,
        box: box(M, 2.15, CONTENT_W, 2.6),
        color: d.accent,
        font: d.fonts.display,
        kind: "text",
        size: 118,
        text: s.statValue,
        valign: "top",
      });
      items.push(hair(box(M, 4.55, CONTENT_W * 0.5, 0), d.ink, 0.012));
      items.push(body(d, label, box(M, 4.85, CONTENT_W * 0.62, 1.4), 18, d.soft));
    }
  }
  return { background: { color: background }, items };
}

function composeQuote(d: DeckDesign, s: DeckSlide): Scene {
  const items: SceneItem[] = [];
  let background = d.paper;
  const attribution = s.quoteAttribution;
  switch (d.quote) {
    case "band": {
      background = d.deep;
      items.push(rect(box(0, 2.0, SLIDE_W, 0.1), d.accent));
      items.push({
        box: box(M, 2.75, CONTENT_W * 0.85, 2.8),
        color: d.deepInk,
        font: d.fonts.display,
        italic: true,
        kind: "text",
        lineSpacing: 1.2,
        size: fit(30, s.title),
        text: `“${s.title}”`,
        valign: "top",
      });
      if (attribution) items.push(body(d, attribution, box(M, 5.85, CONTENT_W * 0.6, 0.7), 14, d.deepSoft));
      break;
    }
    case "panel": {
      items.push(rect(edgeBand("left", 0.9), d.accent));
      items.push({
        box: box(1.75, 2.35, CONTENT_W - 1.1, 3),
        color: d.ink,
        font: d.fonts.display,
        italic: true,
        kind: "text",
        lineSpacing: 1.22,
        size: fit(30, s.title),
        text: `“${s.title}”`,
        valign: "top",
      });
      if (attribution) items.push(body(d, attribution, box(1.75, 5.6, CONTENT_W * 0.6, 0.7), 14, d.muted));
      break;
    }
    case "rule": {
      items.push(hair(box(M, 2.2, CONTENT_W, 0), d.accent, 0.03));
      items.push({
        box: box(M, 2.75, CONTENT_W * 0.82, 3),
        color: d.ink,
        font: d.fonts.display,
        italic: true,
        kind: "text",
        lineSpacing: 1.22,
        size: fit(30, s.title),
        text: s.title,
        valign: "top",
      });
      if (attribution) items.push(body(d, `— ${attribution}`, box(M, 5.75, CONTENT_W * 0.6, 0.7), 14, d.muted));
      break;
    }
    default: {
      items.push({
        bold: true,
        box: box(M - 0.15, 0.6, 3, 3),
        color: mix(d.paper, d.accent, 0.3),
        font: d.fonts.display,
        kind: "text",
        size: 200,
        text: "“",
        valign: "top",
      });
      items.push({
        box: box(M + 0.15, 2.6, CONTENT_W * 0.8, 3),
        color: d.ink,
        font: d.fonts.display,
        italic: true,
        kind: "text",
        lineSpacing: 1.22,
        size: fit(30, s.title),
        text: s.title,
        valign: "top",
      });
      if (attribution) items.push(body(d, `— ${attribution}`, box(M + 0.15, 5.7, CONTENT_W * 0.6, 0.7), 14, d.muted));
    }
  }
  return { background: { color: background }, items };
}

function composeClosing(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const heading = s.title || "Thank you";
  const items: SceneItem[] = [];
  const dark = d.cover !== "band-left" && d.cover !== "frame" && d.cover !== "editorial" && d.cover !== "stack-bars";
  const background = dark ? d.deep : d.paper;
  const ink = dark ? d.deepInk : d.ink;
  const soft = dark ? d.deepSoft : d.soft;
  items.push(rect(crossBand("bottom", 0.5), d.accent));
  items.push(title(d, heading, box(M, 2.7, CONTENT_W * 0.75, 1.8), 40, ink));
  if (s.points.length) {
    items.push({
      box: box(M, 4.35, CONTENT_W * 0.7, 2),
      bullet: "dash",
      color: soft,
      font: d.fonts.body,
      gap: 9,
      items: s.points.slice(0, 3),
      kind: "bullets",
      size: 14,
    });
  }
  items.push(...kicker(d, ctx.credit, box(M, 2.2, CONTENT_W, 0.3), d.accent));
  return { background: { art: d.cover === "art-glow" ? d.art?.closing : undefined, color: background }, items };
}

/** The references slide: the canvas's own sources, never anything invented. */
export function composeReferences(d: DeckDesign, refs: Array<{ title: string; url?: string }>): Scene {
  const items: SceneItem[] = [];
  items.push(title(d, "References", box(M, 0.8, CONTENT_W * 0.6, 1), 26, d.ink));
  items.push(rect(box(M, 2.0, 0.75, 0.05), d.accent));
  items.push({
    box: box(M, 2.45, CONTENT_W, SLIDE_H - 3.2),
    bullet: "none",
    color: d.muted,
    font: d.fonts.body,
    gap: 10,
    items: refs.slice(0, 10).map((r) => (r.url ? `${r.title}  ${r.url}` : r.title)),
    kind: "bullets",
    size: 12,
  });
  return { background: { color: d.paper }, items };
}

/** One slide, composed for one design. */
export function composeSlide(design: DeckDesign, slide: DeckSlide, ctx: Ctx): Scene {
  switch (slide.layout) {
    case "cover":
      return composeCover(design, slide, ctx);
    case "section":
      return composeSection(design, slide, ctx);
    case "stat":
      return composeStat(design, slide);
    case "quote":
      return composeQuote(design, slide);
    case "closing":
      return composeClosing(design, slide, ctx);
    case "two_column": {
      // Two-column content is a body slide whose points are already split by the model.
      const merged = { ...slide, points: [...slide.points, ...slide.rightPoints] };
      return composeBody({ ...design, body: "two-col-rule" }, merged, ctx);
    }
    default:
      return composeBody(design, slide, ctx);
  }
}

export type { Ctx as ComposeContext };
