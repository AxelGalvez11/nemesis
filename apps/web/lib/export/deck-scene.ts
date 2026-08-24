// What a slide IS, before anyone decides how to write it out.
//
// 🔴 WHY A SCENE EXISTS. The first twenty "themes" were twenty colourways of one layout: the
// same gradient, the same title, the same bullets. The owner's verdict was blunt and correct —
// *"I need actually good themes not just gradient theme every single time… like slides and
// PowerPoint have the designer feature."* Designer does not recolour a slide, it RECOMPOSES it:
// colour blocks, split panels, cards, numerals, rails, rules, asymmetric type. Composition is
// the product, so composition needs a first-class representation.
//
// A Scene is that representation: a background plus a flat list of primitives placed in INCHES
// on the 13.33 x 7.5 slide. Two backends consume it — deck-pptx.ts writes a real PowerPoint,
// deck-svg.ts draws a picture of the same scene. That is deliberate: every preview anyone
// judges is rendered from the SAME composition code that builds the file, so a design cannot
// look good in review and wrong on the learner's machine.

import type { DeckArt } from "./deck-art";

export const SLIDE_W = 13.33;
export const SLIDE_H = 7.5;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The preset shapes worth having; each maps to an OOXML preset PowerPoint already knows. */
export type SceneShapeKind =
  | "rect"
  | "roundRect"
  | "ellipse"
  | "triangle"
  | "rtTriangle"
  | "line"
  | "chevron"
  | "donut"
  | "blockArc";

export interface SceneShape {
  kind: "shape";
  shape: SceneShapeKind;
  box: Box;
  fill?: string;
  /** 0 = solid, 100 = invisible. PowerPoint's own sense of transparency. */
  alpha?: number;
  line?: { color: string; width: number };
  /** roundRect corner radius, 0..1 of the shorter side. */
  radius?: number;
  rotate?: number;
}

export interface SceneText {
  kind: "text";
  text: string;
  box: Box;
  font: string;
  /** Points, as type is always measured. */
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  /** Letter spacing in points — what makes a small kicker read as a kicker. */
  spacing?: number;
  lineSpacing?: number;
  caps?: boolean;
}

export interface SceneBullets {
  kind: "bullets";
  items: string[];
  box: Box;
  font: string;
  size: number;
  color: string;
  /** Space after each item, in points. */
  gap?: number;
  /** The mark in front of each line; omit for none. */
  bullet?: "dash" | "dot" | "none";
  lineSpacing?: number;
}

export interface SceneImage {
  kind: "image";
  box: Box;
  /** A data URI — icons today, painted art where a design asks for it. */
  data: string;
}

export type SceneItem = SceneShape | SceneText | SceneBullets | SceneImage;

export interface Scene {
  background: { color: string; art?: DeckArt };
  items: SceneItem[];
}

// ── Geometry helpers, so compositions read like design instructions ──────────────────────────

export const box = (x: number, y: number, w: number, h: number): Box => ({ h, w, x, y });

/** The band down one edge of the slide. */
export const edgeBand = (side: "left" | "right", width: number): Box =>
  side === "left" ? box(0, 0, width, SLIDE_H) : box(SLIDE_W - width, 0, width, SLIDE_H);

/** The band across the top or bottom. */
export const crossBand = (side: "top" | "bottom", height: number): Box =>
  side === "top" ? box(0, 0, SLIDE_W, height) : box(0, SLIDE_H - height, SLIDE_W, height);

/** Split the slide vertically at a fraction, returning both halves. */
export const vSplit = (at: number): [Box, Box] => [
  box(0, 0, SLIDE_W * at, SLIDE_H),
  box(SLIDE_W * at, 0, SLIDE_W * (1 - at), SLIDE_H),
];

/** Shrink a box on every side. */
export const inset = (b: Box, by: number): Box => box(b.x + by, b.y + by, b.w - by * 2, b.h - by * 2);

/** Lay out n cells over a box: one row while they fit, then a grid. Four cells become 2x2 and
 *  five become 3-over-2, because a row of five on a 13in slide is unreadable. */
export function cells(b: Box, n: number, gap: number): Box[] {
  if (n <= 3) return n <= 2 ? rows(b, Math.max(n, 1), gap) : columns(b, 3, gap);
  const top = n === 4 ? 2 : 3;
  const [upper, lower] = rows(b, 2, gap);
  if (!upper || !lower) return columns(b, n, gap);
  return [...columns(upper, top, gap), ...columns(lower, n - top, gap)];
}

/** Divide a box into n stacked rows with a gap between them. */
export function rows(b: Box, n: number, gap: number): Box[] {
  const h = (b.h - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => box(b.x, b.y + i * (h + gap), b.w, h));
}

/** Divide a box into n columns with a gap between them. */
export function columns(b: Box, n: number, gap: number): Box[] {
  const w = (b.w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => box(b.x + i * (w + gap), b.y, w, b.h));
}

/** "01", "02" … the numeral a lot of designed decks lean on. */
export const ordinal = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
