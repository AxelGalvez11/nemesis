/**
 * The pictures only the vendor can give us: the ones nobody embedded.
 *
 * 🔴 THE ASSUMPTION THIS CORRECTS, IN `mistral-ocr.ts`'s OWN WORDS: *"The pixels would multiply the
 * response size for something the reader renders from the original file anyway."* That is true of
 * an embedded photo and FALSE of a drawn chart, which is precisely the figure a lecture is most
 * likely to teach with.
 *
 * Measured on the owner's pharmacokinetics deck, 2026-09-01: our structural reader found 15 image
 * regions; the vendor's model lists 27 figures. The gap is not a decoder gap — one-image PDFs in
 * DeviceGray, Indexed, DeviceCMYK and DCTDecode all decode cleanly. The gap is that ~13 of those
 * "figures" are not images in the file at all. They are concentration-time curves: axes, lines,
 * arrows and labels, drawn the way Excel and PowerPoint draw a chart. There is nothing embedded to
 * extract, so `readPdfStructure` correctly finds nothing, and every one of them reported
 * `skipped: "unsupported"` — read as "a format we cannot open" when the truth is "there was never
 * a picture here to open".
 *
 * The vendor has already rasterised the page to read it. For a drawn figure it is the only party
 * in the process that can hand over pixels at all.
 *
 * 🔴 IT FILLS THE GAP, IT DOES NOT REPLACE WHAT WORKS. Where our own decode produced a picture that
 * is the one kept: it comes from the original file at its own resolution, with no base64 round
 * trip. These are used only for figures that matched nothing, which is what keeps the added
 * response size proportional to the problem rather than paid on every document.
 */

import type { CapturedFigure } from "@/lib/pdf/structure";

import type { MistralOcrResponse } from "./mistral-ocr";

/**
 * How much vendor-supplied image data one document may contribute.
 *
 * 🔴 A CEILING ON WHAT WE ACCEPT, NOT A CLAIM ABOUT WHAT ARRIVES. base64 inflates by 4/3 and these
 * are page-resolution rasters, so a 60-figure deck could hand back tens of megabytes into a parse
 * that already holds the document and its structural model. The cap is generous enough that no
 * realistic lecture hits it and low enough that a pathological one cannot exhaust the thread.
 * Figures past it are simply not taken, which leaves them exactly as they were before this file
 * existed rather than failing the parse.
 */
export const MAX_VENDOR_FIGURE_BYTES = 24 * 1024 * 1024;

/** Prefix a data URL adds. Mistral sends both forms depending on the model. */
function decodeBase64Image(value: string): Uint8Array | null {
  const comma = value.indexOf(",");
  const payload = value.startsWith("data:") && comma > 0 ? value.slice(comma + 1) : value;
  if (!payload) return null;
  try {
    const bytes = Buffer.from(payload, "base64");
    // 🔴 base64 DECODING NEVER THROWS ON GARBAGE — it silently drops characters it does not
    // recognise and returns whatever it managed. A handful of bytes is not a picture, and storing
    // one produces an object every later render shows as a broken frame.
    return bytes.byteLength > 256 ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
}

/**
 * Pictures the vendor rasterised for us, keyed the way the vendor's own model names its figures.
 *
 * 🔴 `unit:id` IS THE KEY AND NO GEOMETRY IS INVOLVED, WHICH IS THE WHOLE ADVANTAGE HERE. These
 * pixels arrive from the same reader that produced the figure blocks, already carrying the id those
 * blocks use as their ref (`locatedFigures` in mistral-model sets `ref` from `image.id`). So unlike
 * our own decoded pixels — which come from a different reader with different names and have to be
 * paired by where the ink is — these need no matching and cannot be mispaired. A figure described
 * as one picture while showing another is the failure that pairing risks; this path does not have
 * it. PURE.
 */
export function vendorFigurePixels(response: MistralOcrResponse): Map<string, CapturedFigure> {
  const out = new Map<string, CapturedFigure>();
  let taken = 0;
  for (const page of response.pages ?? []) {
    const unit = typeof page.index === "number" ? page.index : 0;
    for (const image of page.images ?? []) {
      const id = (image.id ?? "").trim();
      if (!id || !image.image_base64) continue;
      const bytes = decodeBase64Image(image.image_base64);
      if (!bytes) continue;
      if (taken + bytes.byteLength > MAX_VENDOR_FIGURE_BYTES) return out;
      taken += bytes.byteLength;
      // 🔴 THE BOX IS IN PAGE POINTS AND IS RECORDED AS THE PIXEL SIZE ONLY AS A LAST RESORT. The
      // encoded image carries its own dimensions, but decoding a PNG or JPEG header for them is a
      // second parse of every figure; the region's own width and height are already known, are
      // proportional to the real thing, and are only ever used to decide how big to render.
      const width = Math.max(0, Math.round((image.bottom_right_x ?? 0) - (image.top_left_x ?? 0)));
      const height = Math.max(0, Math.round((image.bottom_right_y ?? 0) - (image.top_left_y ?? 0)));
      out.set(`${unit}:${id}`, { height, png: bytes, width });
    }
  }
  return out;
}

/**
 * Our pixels where we have them, the vendor's where we do not.
 *
 * 🔴 OURS WIN EVERY CONTEST, and that is not a preference. Our copy is decoded from the original
 * file at the resolution it was authored, while the vendor's is its own render of the page region —
 * good enough to read, never better than the source. Taking the vendor's over ours would trade
 * quality for nothing on exactly the figures that already worked. PURE.
 */
export function withVendorPixels(
  matched: ReadonlyMap<string, CapturedFigure>,
  vendor: ReadonlyMap<string, CapturedFigure>,
): Map<string, CapturedFigure> {
  const out = new Map(matched);
  for (const [key, figure] of vendor) if (!out.has(key)) out.set(key, figure);
  return out;
}
