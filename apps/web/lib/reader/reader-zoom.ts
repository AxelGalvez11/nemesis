// Zoom, fit-width and fit-page — the arithmetic behind the reader's − 100% +
// controls, kept out of the component so it can be tested without a browser.
//
// "Fit" is a MODE, not a number: a window resize has to re-fit, so the reader
// stores `{ mode: "fit-width" }` and recomputes the scale from the current
// container. Storing the computed number instead is what makes a reader stop
// fitting the moment the sidebar opens.

export type ZoomMode = { kind: "fixed"; scale: number } | { kind: "fit-width" } | { kind: "fit-page" };

export const FIT_WIDTH: ZoomMode = { kind: "fit-width" };
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 6;

/** Steps a person expects from a zoom button — not a blind ×1.1. */
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6] as const;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function zoomIn(scale: number): number {
  const next = STEPS.find((step) => step > scale + 1e-6);
  return clampScale(next ?? MAX_SCALE);
}

export function zoomOut(scale: number): number {
  const previous = [...STEPS].reverse().find((step) => step < scale - 1e-6);
  return clampScale(previous ?? MIN_SCALE);
}

export interface FitInput {
  /** Natural page size at scale 1, in CSS pixels. */
  pageWidth: number;
  pageHeight: number;
  /** Space the page has to live in, gutters already subtracted. */
  containerWidth: number;
  containerHeight: number;
}

/** The scale a mode resolves to right now. Returns 1 for a container that has
 *  not been measured yet (width 0 during the first paint) rather than Infinity,
 *  which would flash a page the size of the sun before the layout settles. */
export function resolveScale(mode: ZoomMode, fit: FitInput): number {
  if (mode.kind === "fixed") return clampScale(mode.scale);
  const { pageWidth, pageHeight, containerWidth, containerHeight } = fit;
  if (pageWidth <= 0 || pageHeight <= 0 || containerWidth <= 0) return 1;
  if (mode.kind === "fit-width") return clampScale(containerWidth / pageWidth);
  if (containerHeight <= 0) return clampScale(containerWidth / pageWidth);
  return clampScale(Math.min(containerWidth / pageWidth, containerHeight / pageHeight));
}

/** "125%" — what the control shows. */
export function formatZoom(scale: number): string {
  return `${Math.round(clampScale(scale) * 100)}%`;
}

/** Device-pixel-ratio-aware raster scale, capped so a 400% zoom on a retina
 *  display does not ask for a canvas the browser refuses to allocate (Safari
 *  gives up somewhere above ~16M pixels and returns a blank canvas, silently). */
const MAX_CANVAS_PIXELS = 8_000_000;

export function rasterScale(cssScale: number, pageWidth: number, pageHeight: number, devicePixelRatio: number): number {
  const wanted = clampScale(cssScale) * Math.min(Math.max(devicePixelRatio || 1, 1), 3);
  const pixels = pageWidth * wanted * (pageHeight * wanted);
  if (pixels <= MAX_CANVAS_PIXELS || pixels <= 0) return wanted;
  return wanted * Math.sqrt(MAX_CANVAS_PIXELS / pixels);
}
