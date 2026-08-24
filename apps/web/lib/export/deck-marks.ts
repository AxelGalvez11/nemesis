// The marks — iconography, drawn rather than imported.
//
// 🔴 ICONOGRAPHY RETURNS ON THE TERMS THE LAST ATTEMPT SET. deck-plan.ts records why the first
// one was removed: the model named a Lucide icon per slide, the theme rasterised it from a 97KB
// baked module, and *"a stock glyph dropped into a composed slide read as clip art every
// time"* — with the standing rule that if iconography came back it would be **drawn by the
// composer, not chosen by the model**. This file is that. Owner 2026-08-24: *"maybe some
// better icons."*
//
// 🔴 SO THESE ARE MARKS, NOT PICTURES. A lightbulb next to a bullet is clip art. A ring, a
// chevron, a bar, a bracket — set at a consistent weight and repeated down a page — is a
// typographic system, and it is what the decks the owner is comparing us to actually use. It
// also survives the standing product rule (CLAUDE.md): a picture of a test tube belongs to one
// discipline, and a ring belongs to all of them. There is no keyword list here and there never
// will be — the DESIGN owns its mark, so a law deck and a mechanical engineering deck get the
// same considered geometry.
//
// Every mark is built from the same primitives as everything else (deck-scene.ts), so it draws
// identically in the app, in a preview and inside a real .pptx, at any size, with no raster.

import { box, type Box, type SceneItem } from "./deck-scene";

export const MARK_KINDS = [
  "disc",
  "ring",
  "target",
  "square",
  "diamond",
  "chevron",
  "bar",
  "plus",
  "arrow",
  "step",
  "bracket",
  "slash",
] as const;

export type MarkKind = (typeof MARK_KINDS)[number];

/** Stroke weight as a fraction of the mark's box. Every stroked mark shares it, which is what
 *  makes twelve different shapes read as one family. */
const WEIGHT = 0.13;

const at = (b: Box, x: number, y: number, w: number, h: number): Box =>
  box(b.x + b.w * x, b.y + b.h * y, b.w * w, b.h * h);

const line = (b: Box, x1: number, y1: number, x2: number, y2: number, color: string, unit: number): SceneItem => ({
  box: box(b.x + b.w * x1, b.y + b.h * y1, b.w * (x2 - x1), b.h * (y2 - y1)),
  kind: "shape",
  line: { color, width: unit * WEIGHT },
  shape: "line",
});

/**
 * One mark, drawn to fill `b`. Pass a square box: marks are designed on a square and a squashed
 * ring is a different mark. `color` is normally the design's accent.
 */
export function mark(kind: MarkKind, b: Box, color: string): SceneItem[] {
  // Strokes are measured against the SHORTER side, so a mark keeps its weight if a caller
  // hands it a box that is a little off-square.
  const unit = Math.min(b.w, b.h);
  const fill = (x: number, y: number, w: number, h: number, shape: "rect" | "ellipse" = "rect", rotate?: number): SceneItem => ({
    box: at(b, x, y, w, h),
    fill: color,
    kind: "shape",
    ...(rotate === undefined ? {} : { rotate }),
    shape,
  });

  switch (kind) {
    case "disc":
      return [fill(0.27, 0.27, 0.46, 0.46, "ellipse")];
    case "ring":
      return [{ box: at(b, 0.12, 0.12, 0.76, 0.76), fill: color, kind: "shape", shape: "donut" }];
    case "target":
      return [
        { box: at(b, 0.06, 0.06, 0.88, 0.88), fill: color, kind: "shape", shape: "donut" },
        fill(0.36, 0.36, 0.28, 0.28, "ellipse"),
      ];
    case "square":
      return [fill(0.24, 0.24, 0.52, 0.52)];
    case "diamond":
      // A square turned 45°, which every backend can do; a diamond primitive would be a fourth
      // thing to keep in sync for no gain.
      return [fill(0.26, 0.26, 0.48, 0.48, "rect", 45)];
    case "chevron":
      return [line(b, 0.34, 0.2, 0.66, 0.5, color, unit), line(b, 0.66, 0.5, 0.34, 0.8, color, unit)];
    case "bar":
      return [fill(0.36, 0.04, 0.28, 0.92)];
    case "plus":
      return [line(b, 0.16, 0.5, 0.84, 0.5, color, unit), line(b, 0.5, 0.16, 0.5, 0.84, color, unit)];
    case "arrow":
      return [
        line(b, 0.12, 0.5, 0.84, 0.5, color, unit),
        line(b, 0.56, 0.24, 0.86, 0.5, color, unit),
        line(b, 0.86, 0.5, 0.56, 0.76, color, unit),
      ];
    case "step":
      return [fill(0.1, 0.56, 0.36, 0.34), fill(0.54, 0.1, 0.36, 0.8)];
    case "bracket":
      return [line(b, 0.22, 0.16, 0.8, 0.16, color, unit), line(b, 0.22, 0.16, 0.22, 0.84, color, unit)];
    default:
      return [line(b, 0.24, 0.82, 0.76, 0.18, color, unit)];
  }
}

/** The mark a design uses at display size — on a section break or beside a big number, where a
 *  0.2in mark would vanish. Same geometry, drawn larger and lighter. */
export const displayMark = (kind: MarkKind, b: Box, color: string): SceneItem[] => mark(kind, b, color);
