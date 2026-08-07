/**
 * Turning a figure pdf.js decoded into bytes a vision model can read. PURE.
 *
 * 🔴 THIS IS WHAT MAKES THE VISUAL HALF OF PHASE 2 POSSIBLE WITHOUT A CANVAS.
 * Rendering a whole page needs a rasterizer — `@napi-rs/canvas` or similar — and
 * a native binary whose loading in a deployed function cannot be checked while
 * the build cap holds. But the FIGURES are already decoded: pdf.js hands back
 * raw sample data for every image XObject it painted, and the repo already owns
 * a PNG encoder (`emf-bitmap.ts`, written for EMF recovery). Composing the two
 * closes the 1,089 unexamined figures with no new dependency at all.
 *
 * What this deliberately does NOT do is invent pixels. A figure pdf.js could not
 * decode, or decoded in a form not covered here, comes back as `null` with a
 * reason — and a figure with a stated reason is a disclosed decision, which is a
 * different fact from an undisclosed gap. Only the second counts as lost.
 */

import { downscaleRgb, encodePng } from "@/lib/notebooks/emf-bitmap";

/**
 * pdf.js's decoded image, as it appears in `page.objs`.
 *
 * `kind` is pdf.js's `ImageKind`: 1 = GRAYSCALE_1BPP, 2 = RGB_24BPP,
 * 3 = RGBA_32BPP. Verified against pdfjs-dist 6 on a real course PDF — a
 * 972×870 figure arrives as kind 2 with exactly 972 × 870 × 3 bytes.
 */
export interface PdfImageData {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray | null;
}

export const GRAYSCALE_1BPP = 1;
export const RGB_24BPP = 2;
export const RGBA_32BPP = 3;

/**
 * The largest figure we will encode, in pixels.
 *
 * Shared with the EMF path deliberately — a vision model gains nothing from a
 * 12-megapixel scan of a bar chart, and the encode cost is linear in pixels on
 * a thread that also holds the document.
 */
export const MAX_FIGURE_PIXELS = 2_200_000;

/**
 * Below this, a figure is not worth a call.
 *
 * Not the same test as `SMALL_FIGURE_AREA` in `structure.ts`, which measures a
 * figure's share of the PAGE. This one measures its own resolution: a 4×4 icon
 * scaled across half a page is large on the page and still holds nothing.
 */
export const MIN_FIGURE_PIXELS = 64 * 64;

export type FigureImageResult =
  | { ok: true; png: Uint8Array; width: number; height: number }
  /** Stated, never silent. Each of these becomes a `skipped` reason on the block. */
  | { ok: false; reason: "undecoded" | "unsupported-kind" | "too-small" | "malformed" };

/**
 * Convert one decoded figure to a PNG, or say why not.
 *
 * The alpha channel is composited over WHITE rather than dropped. A diagram
 * drawn as dark strokes on a transparent background becomes dark-on-black if
 * alpha is merely discarded, which is unreadable — and unreadable in a way that
 * looks like a bad diagram rather than like a bad conversion.
 */
export function figureToPng(image: PdfImageData | null | undefined): FigureImageResult {
  if (!image) return { ok: false, reason: "undecoded" };
  const { width, height } = image;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: "malformed" };
  }
  if (width * height < MIN_FIGURE_PIXELS) return { ok: false, reason: "too-small" };
  const data = image.data;
  // pdf.js populates `data` only for images it actually decoded. A figure whose
  // bytes never arrived is UNEXAMINED, which the coverage layer already counts —
  // reporting it as figure-free would be the flattering answer.
  if (!data || data.length === 0) return { ok: false, reason: "undecoded" };

  const converted = toRgb(data, width, height, image.kind);
  if ("reason" in converted) return { ok: false, reason: converted.reason };
  const rgb = converted.rgb;

  // Integer factors only: `downscaleRgb` box-averages, which keeps thin plot
  // lines and axis labels legible in a way that dropping pixels does not.
  const factor = Math.max(1, Math.ceil(Math.sqrt((width * height) / MAX_FIGURE_PIXELS)));
  const scaled = downscaleRgb(rgb, width, height, factor);
  return {
    height: scaled.height,
    ok: true,
    png: encodePng(scaled.rgb, scaled.width, scaled.height),
    width: scaled.width,
  };
}

/**
 * Normalise every kind pdf.js emits into packed 8-bit RGB.
 *
 * 🔴 "I DO NOT HANDLE THIS FORMAT" AND "THIS BUFFER IS THE WRONG SIZE" ARE
 * DIFFERENT FACTS. The first is a gap in this file and the second is a damaged
 * or unexpected input; collapsing them into one `null` would make a decoding bug
 * indistinguishable from an unsupported colour space in the coverage numbers.
 */
type RgbConversion = { rgb: Uint8Array } | { reason: "unsupported-kind" | "malformed" };

function toRgb(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  kind: number | undefined,
): RgbConversion {
  const pixels = width * height;

  if (kind === RGB_24BPP || (kind === undefined && data.length === pixels * 3)) {
    if (data.length < pixels * 3) return { reason: "malformed" };
    return { rgb: new Uint8Array(data.buffer, data.byteOffset, pixels * 3) };
  }

  if (kind === RGBA_32BPP || (kind === undefined && data.length === pixels * 4)) {
    if (data.length < pixels * 4) return { reason: "malformed" };
    const out = new Uint8Array(pixels * 3);
    for (let i = 0; i < pixels; i += 1) {
      const a = data[i * 4 + 3]! / 255;
      // Over white. See the note on `figureToPng`.
      out[i * 3] = Math.round(data[i * 4]! * a + 255 * (1 - a));
      out[i * 3 + 1] = Math.round(data[i * 4 + 1]! * a + 255 * (1 - a));
      out[i * 3 + 2] = Math.round(data[i * 4 + 2]! * a + 255 * (1 - a));
    }
    return { rgb: out };
  }

  if (kind === GRAYSCALE_1BPP) {
    // One BIT per pixel, packed MSB-first, rows padded to a byte boundary. A
    // set bit is BLACK in pdf.js's grayscale convention — inverting this is how
    // a scanned page becomes a solid black rectangle.
    const rowBytes = Math.ceil(width / 8);
    if (data.length < rowBytes * height) return { reason: "malformed" };
    const out = new Uint8Array(pixels * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const byte = data[y * rowBytes + (x >> 3)]!;
        const on = (byte >> (7 - (x & 7))) & 1;
        const value = on ? 0 : 255;
        const at = (y * width + x) * 3;
        out[at] = value;
        out[at + 1] = value;
        out[at + 2] = value;
      }
    }
    return { rgb: out };
  }

  return { reason: "unsupported-kind" };
}
