/**
 * Turning a vision model's boxes into occlusion masks you can trust.
 *
 * Owner asked for auto-occlusion from slides: point at a labelled diagram and
 * get cards that hide each label. The model does the looking; this module does
 * the part that has to be exactly right.
 *
 * 🔴 THE UNITS ARE THE WHOLE FEATURE. `OcclusionShape` is stored in NATURAL
 * IMAGE PIXELS, and a vision model does not reliably know how many pixels wide
 * an image is — it will happily invent 1024 for a 3024-wide photo. If it were
 * allowed to return pixels, every box would land in the wrong place and the
 * failure would look like "the AI is bad at this" rather than a units bug that
 * is trivially fixable.
 *
 * So the contract is one-directional and non-negotiable:
 *
 *   THE MODEL RETURNS FRACTIONS OF THE IMAGE, 0 TO 1.
 *   THE CLIENT MEASURES THE REAL IMAGE AND MULTIPLIES.
 *
 * Nothing the model says about width or height is ever believed. `scaleBoxes`
 * takes the true dimensions from the caller, which got them by loading the
 * actual image.
 */

import { MIN_OCCLUSION_SIZE, type OcclusionShape } from "./study-occlusion.ts";

/** One box as the model is asked to give it: fractions of the image, 0–1. */
export interface SuggestedBox {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** No student wants ninety cards from one diagram, and no model reliably finds
 *  ninety real labels — past this point it is inventing them. */
export const MAX_SUGGESTED_BOXES = 20;

function finite(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reject a whole response whose numbers are plainly not fractions.
 *
 * Models answer this question in three different scales depending on the day:
 * 0–1 (asked for), 0–100 (percentages), and 0–1000 (a normalisation some
 * training sets use). Silently accepting the wrong one puts every box in the
 * top-left corner or far off the canvas.
 *
 * 🔴 THIS REFUSES RATHER THAN RESCALING, deliberately. "Everything is ≤100 so
 * it must be percentages" is wrong for a genuinely tiny set of 0–1 boxes, and
 * guessing wrong here means confidently misplaced masks — the same failure the
 * student would blame on the feature. A refusal costs one retry.
 */
export function looksNormalized(boxes: readonly SuggestedBox[]): boolean {
  if (boxes.length === 0) return false;
  return boxes.every((box) => {
    const values = [box.x, box.y, box.w, box.h].map(finite);
    if (values.some((value) => value === null)) return false;
    // A fraction can be slightly out of range from rounding; wildly out is a
    // different scale entirely.
    return values.every((value) => (value as number) >= -0.02 && (value as number) <= 1.02);
  });
}

/** Parse whatever JSON the model produced into boxes, dropping unusable rows. */
export function parseSuggestedBoxes(value: unknown): SuggestedBox[] {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray((value as { boxes?: unknown } | null)?.boxes)
      ? (value as { boxes: unknown[] }).boxes
      : [];
  const out: SuggestedBox[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const x = finite(record.x);
    const y = finite(record.y);
    const w = finite(record.w ?? record.width);
    const h = finite(record.h ?? record.height);
    if (x === null || y === null || w === null || h === null) continue;
    const label = typeof record.label === "string" ? record.label.trim().slice(0, 120) : "";
    out.push({ h, label, w, x, y });
  }
  return out;
}

export interface ScaleResult {
  shapes: OcclusionShape[];
  /** How many boxes were thrown away, and why — surfaced, never silent. */
  dropped: { offImage: number; tooSmall: number; overlapping: number; overLimit: number };
}

function overlaps(a: OcclusionShape, b: OcclusionShape): boolean {
  const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (overlapW <= 0 || overlapH <= 0) return false;
  const area = overlapW * overlapH;
  // More than half of the SMALLER box covered means they are testing the same
  // spot; two masks over one label makes two cards with the same answer.
  return area > 0.5 * Math.min(a.w * a.h, b.w * b.h);
}

/**
 * Fractions in, real masks out.
 *
 * `width`/`height` MUST be the image's true pixel size, measured by the caller
 * from the actual image. Never pass anything the model reported.
 */
export function scaleBoxes(
  boxes: readonly SuggestedBox[],
  width: number,
  height: number,
  makeId: (index: number) => string,
): ScaleResult {
  const dropped = { offImage: 0, overLimit: 0, overlapping: 0, tooSmall: 0 };
  if (!(width > 0) || !(height > 0)) return { dropped, shapes: [] };
  const kept: OcclusionShape[] = [];

  for (const box of boxes) {
    // Clamp into the image first: a box hanging off the edge is usually a good
    // box the model nudged, not a bad one, so trim rather than discard.
    const x0 = Math.max(0, Math.min(1, box.x));
    const y0 = Math.max(0, Math.min(1, box.y));
    const x1 = Math.max(0, Math.min(1, box.x + box.w));
    const y1 = Math.max(0, Math.min(1, box.y + box.h));
    if (x1 <= x0 || y1 <= y0) {
      dropped.offImage += 1;
      continue;
    }
    const shape: OcclusionShape = {
      h: Math.round((y1 - y0) * height),
      id: makeId(kept.length),
      label: box.label,
      w: Math.round((x1 - x0) * width),
      x: Math.round(x0 * width),
      y: Math.round(y0 * height),
    };
    // The same floor the hand-drawn editor enforces — a two-pixel mask is
    // invisible, so the card would ask about nothing.
    if (shape.w < MIN_OCCLUSION_SIZE || shape.h < MIN_OCCLUSION_SIZE) {
      dropped.tooSmall += 1;
      continue;
    }
    if (kept.some((existing) => overlaps(existing, shape))) {
      dropped.overlapping += 1;
      continue;
    }
    if (kept.length >= MAX_SUGGESTED_BOXES) {
      dropped.overLimit += 1;
      continue;
    }
    kept.push(shape);
  }
  return { dropped, shapes: kept };
}

/** One line for the student when some boxes did not survive. Empty when all did. */
export function droppedSummary(dropped: ScaleResult["dropped"]): string {
  const total = dropped.offImage + dropped.overLimit + dropped.overlapping + dropped.tooSmall;
  if (total === 0) return "";
  const parts: string[] = [];
  if (dropped.overlapping) parts.push(`${dropped.overlapping} overlapping`);
  if (dropped.tooSmall) parts.push(`${dropped.tooSmall} too small`);
  if (dropped.offImage) parts.push(`${dropped.offImage} off the image`);
  if (dropped.overLimit) parts.push(`${dropped.overLimit} over the limit of ${MAX_SUGGESTED_BOXES}`);
  return `Skipped ${total} suggested box${total === 1 ? "" : "es"}: ${parts.join(", ")}.`;
}

/** The instruction the vision model is given. Exported so a test can assert the
 *  contract is actually stated, rather than trusting it was written once. */
export const OCCLUSION_VISION_PROMPT = [
  "You are given one image, usually a slide, diagram, or textbook figure.",
  "Find the LABELLED PARTS a student would be tested on: the text labels naming structures,",
  "components, axes, stages, or regions. Ignore titles, page numbers, logos, captions and body paragraphs.",
  "",
  "Return ONLY JSON, no prose and no code fence, in exactly this shape:",
  '{"boxes":[{"label":"mitochondrion","x":0.12,"y":0.34,"w":0.08,"h":0.05}]}',
  "",
  "COORDINATES MUST BE FRACTIONS OF THE IMAGE, BETWEEN 0 AND 1.",
  "x,y is the TOP-LEFT corner of the box; w,h are its width and height.",
  "Do NOT use pixels. Do NOT use percentages. Do NOT report the image's size.",
  "",
  "Box only the label text itself, tightly. One box per label. Do not let boxes overlap.",
  `Return at most ${MAX_SUGGESTED_BOXES} boxes, the most useful ones first.`,
  "If the image has no labelled parts worth testing, return {\"boxes\":[]}.",
].join("\n");
