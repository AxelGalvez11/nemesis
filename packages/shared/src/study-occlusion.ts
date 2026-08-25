// Pure geometry and payload logic for Anki-style image occlusion ("image
// cloze") cards — you cover parts of a picture with boxes, and each box becomes
// its own card that asks what is underneath it.
//
// 🔴 ONE COPY, SHARED. This lived twice — apps/web and apps/mobile — with the
// mobile one labelled "PORTED VERBATIM" and warning that "a payload one client
// accepts and the other rejects is a card that only exists on one device". By
// 2026-07-31 the two files had already drifted (comments only, code still
// identical — caught by diffing them before adding to either). Adding the
// AI-suggested-box validation to one copy is exactly how that warning comes
// true, so both were replaced by this single module first.
//
// Every card made from one image carries the image and the FULL mask list;
// each card points at the single mask it tests via targetId.
//
// Dependency-free, so it Deno-tests alongside the other pure modules.

export type OcclusionMode = "hide-all" | "hide-one";

export interface OcclusionShape {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface OcclusionPayload {
  kind: "occlusion";
  /** Storage path (`userId/uuid.png`) or an inline data:/http(s) URL. */
  image: string;
  /** Natural image size in pixels — the coordinate space for every shape. */
  width: number;
  height: number;
  mode: OcclusionMode;
  shapes: OcclusionShape[];
  targetId: string;
}

/** Smallest useful mask edge, in natural-image pixels. */
export const MIN_OCCLUSION_SIZE = 6;

export interface OcclusionPoint {
  x: number;
  y: number;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

/**
 * Turns a drag between two corners (any direction) into a mask rect clamped
 * to the image bounds. Returns null when the result is too small to cover
 * anything — a stray click instead of a drag.
 */
export function normalizeOcclusionRect(
  a: OcclusionPoint,
  b: OcclusionPoint,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  const x1 = clamp(Math.min(a.x, b.x), width);
  const x2 = clamp(Math.max(a.x, b.x), width);
  const y1 = clamp(Math.min(a.y, b.y), height);
  const y2 = clamp(Math.max(a.y, b.y), height);
  const rect = { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
  if (rect.w < MIN_OCCLUSION_SIZE || rect.h < MIN_OCCLUSION_SIZE) return null;
  return rect;
}

/** Keeps a moved or resized shape fully inside the image. */
export function clampOcclusionShape(shape: OcclusionShape, width: number, height: number): OcclusionShape {
  const w = Math.round(Math.min(Math.max(shape.w, MIN_OCCLUSION_SIZE), width));
  const h = Math.round(Math.min(Math.max(shape.h, MIN_OCCLUSION_SIZE), height));
  return {
    ...shape,
    x: Math.round(clamp(shape.x, width - w)),
    y: Math.round(clamp(shape.y, height - h)),
    w,
    h,
  };
}

/**
 * The box under a point, or null for bare image.
 *
 * Owner 2026-07-31: "allow users to select boxes instead of only creating them."
 * The editor's drag always started a NEW rectangle, so a box put down slightly
 * wrong could only be deleted and drawn again — and on a dense diagram the new
 * one usually landed on top of the old one, which is worse than either.
 *
 * TOPMOST WINS, and topmost means LAST DRAWN: boxes paint in array order, so the
 * one the finger appears to be on is the last match, not the first. Searching
 * forwards would grab whatever is underneath and move the wrong thing — the kind
 * of bug that only shows up once two boxes overlap.
 *
 * Coordinates are the picture's own pixels, like every other number here.
 */
export function occlusionShapeAt(
  shapes: readonly OcclusionShape[],
  x: number,
  y: number,
): OcclusionShape | null {
  for (let index = shapes.length - 1; index >= 0; index -= 1) {
    const shape = shapes[index]!;
    if (x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h) return shape;
  }
  return null;
}

export type OcclusionMaskState = "covered" | "target-covered" | "target-revealed" | "clear";

/**
 * What a cover is painted with, and what the part being ASKED ABOUT is painted with instead.
 *
 * 🔴🔴🔴 OWNER, 2026-08-25, WITH A SCREENSHOT OF A LABELLED HEART: *"when user is being asked to
 * recall occlusion, it should be yellow or more distinctive because i had trouble finding which
 * part it was covering."* He is looking at fourteen identical dark rectangles.
 *
 * 🔴 IT WAS MARKED, AND THE MARKING WAS INVISIBLE. The target already took a heavier stroke in
 * `hsl(var(--destructive))`, which resolves to `hsl(8 62% 47%)`: a dark brick red, drawn two and a
 * half pixels wide, on a `#52525b` dark grey fill. Two dark colours against each other, at the size
 * a mask actually renders. The rule was right and the contrast was not there.
 *
 * 🔴 A FILL, NOT A BORDER. A border has to be found before it can be read; a differently coloured
 * rectangle is seen without looking. Hide-all-guess-one puts every part under a cover, so the one
 * question the picture has to answer at a glance is WHICH cover, and that is worth the strongest
 * signal available rather than the most tasteful one.
 *
 * 🔴 IT STILL HIDES. Amber is opaque, so the part underneath is as covered as any other. The colour
 * says "this one", never "here is the answer".
 *
 * 🔴 FIXED HEX, LIKE THE COVERS BESIDE THEM. These are drawn over a retrieved photograph on a white
 * plate, not over the page, so they answer to the picture rather than to the theme. Shared here so
 * the study deck and the course lane cannot drift into two different ideas of "the one being asked
 * about" — they already had two.
 */
export const OCCLUSION_COVER_FILL = "#52525b";
export const OCCLUSION_COVER_STROKE = "#3f3f46";
export const OCCLUSION_TARGET_FILL = "#facc15";
export const OCCLUSION_TARGET_STROKE = "#78350f";

/**
 * Review-time state of one mask. Anki semantics: in hide-all mode the other
 * masks stay covered even after the answer shows; in hide-one mode only the
 * target is ever covered.
 */
export function occlusionMaskState(
  shapeId: string,
  payload: Pick<OcclusionPayload, "mode" | "targetId">,
  revealed: boolean,
): OcclusionMaskState {
  if (shapeId === payload.targetId) return revealed ? "target-revealed" : "target-covered";
  return payload.mode === "hide-all" ? "covered" : "clear";
}

/** Card front text for the mask at `index` — the label when one was given. */
export function occlusionCardFront(label: string, index: number): string {
  return label.trim() || `Mask ${index + 1}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toShape(raw: unknown): OcclusionShape | null {
  if (!isObject(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (!finite(raw.x) || !finite(raw.y) || !finite(raw.w) || !finite(raw.h)) return null;
  if (raw.w <= 0 || raw.h <= 0) return null;
  return { id: raw.id, x: raw.x, y: raw.y, w: raw.w, h: raw.h, label: typeof raw.label === "string" ? raw.label : "" };
}

/**
 * Validates a jsonb payload from the database. Malformed shapes are dropped;
 * the whole payload is rejected when the card's own target mask is missing,
 * because such a card cannot be reviewed.
 */
export function parseOcclusionPayload(raw: unknown): OcclusionPayload | null {
  if (!isObject(raw) || raw.kind !== "occlusion") return null;
  if (typeof raw.image !== "string" || !raw.image) return null;
  if (!finite(raw.width) || !finite(raw.height) || raw.width <= 0 || raw.height <= 0) return null;
  const mode: OcclusionMode = raw.mode === "hide-one" ? "hide-one" : "hide-all";
  if (!Array.isArray(raw.shapes) || typeof raw.targetId !== "string") return null;
  const shapes = raw.shapes.flatMap((shape) => {
    const parsed = toShape(shape);
    return parsed ? [parsed] : [];
  });
  if (shapes.length === 0 || !shapes.some((shape) => shape.id === raw.targetId)) return null;
  return { kind: "occlusion", image: raw.image, width: raw.width, height: raw.height, mode, shapes, targetId: raw.targetId };
}
