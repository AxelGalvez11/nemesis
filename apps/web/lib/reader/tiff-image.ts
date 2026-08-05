// Making TIFF pictures visible.
//
// 🔴 Why this exists. No browser draws TIFF, and real lecture decks are full of
// it — a scientific figure pasted from a microscope, a scanned plate, an
// engineering drawing all arrive as .tif. Measured on a real 37-slide
// immunology lecture: 61 of its 71 pictures are TIFF, so 25 slides showed no
// picture at all. Decoding is the difference between that lecture being usable
// in Nemesis and not.
//
// Two deliberate boundaries:
//
//  1. **This is a SEPARATE path from `officeImageUrl`, not a widening of it.**
//     That function's contract is "null for anything a browser cannot draw, so
//     the caller can say so" (office-zip.ts), and `resolveSlidePictures` now
//     depends on it. Handing back a URL that might fail would put broken-image
//     icons exactly where the honest placeholder belongs. A decode that fails
//     falls back to that placeholder.
//  2. **Pixels and canvas are split.** `decodeTiffPixels` is pure and runs
//     anywhere, so the format handling is testable without a DOM;
//     `tiffObjectUrl` is the thin browser half.

import UTIF, { type UtifImage } from "utif";

/** The long edge a decoded picture is drawn at. A real deck holds 2560×1810
 *  scans, which are 18 MB of RGBA each — far more than a slide-sized thumbnail
 *  needs, and 29 of them at once is real memory. Downscaling happens on the
 *  canvas, after decoding, because the decoder needs the whole image either
 *  way. */
export const MAX_DRAWN_EDGE = 1600;

/** Refuse anything whose pixel count alone would be hostile. 80 megapixels is
 *  well past any lecture figure and ~320 MB of RGBA. */
const MAX_PIXELS = 80_000_000;

/** Is this archive entry a TIFF? Extension only — the bytes are checked by the
 *  decoder itself, which fails safely. */
export function isTiff(name: string): boolean {
  const extension = name.split(".").pop()?.toLocaleLowerCase() ?? "";
  return extension === "tif" || extension === "tiff";
}

export interface TiffPixels {
  width: number;
  height: number;
  /** Straight RGBA, four bytes per pixel. Alpha is preserved when the file
   *  carries it — a figure with a transparent background must not gain a black
   *  or white box behind it. */
  rgba: Uint8Array;
}

/** Decode the FIRST image in a TIFF. Multi-page TIFFs exist (a scanned packet
 *  is often one file per stack) but a slide only ever places one picture, and
 *  guessing which page was meant would be worse than showing the first.
 *
 *  Returns null rather than throwing: an undecodable picture is an expected
 *  outcome the caller already has an honest answer for. */
export function decodeTiffPixels(bytes: ArrayBuffer | Uint8Array): TiffPixels | null {
  try {
    // A dense copy with an ArrayBuffer of its own. `fflate` returns views onto
    // one shared archive buffer, so handing the decoder `bytes.buffer` would
    // give it the whole archive starting at the wrong offset. Copying also
    // sidesteps the SharedArrayBuffer half of the `.buffer` type.
    const copy = new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const buffer = copy.buffer;
    const pages = UTIF.decode(buffer) as UtifImage[];
    const first = pages[0];
    if (!first) return null;

    // 🔴 `width`/`height` do not exist until `decodeImage` runs — before that
    // the size lives only in the raw tags (256 = ImageWidth, 257 = ImageLength).
    // Reading the convenience fields first meant every valid TIFF looked like a
    // zero-sized one and was refused. The size has to be known BEFORE decoding
    // so a hostile header cannot make us allocate first and check afterwards.
    const declaredWidth = Number(first.t256?.[0] ?? 0);
    const declaredHeight = Number(first.t257?.[0] ?? 0);
    if (!Number.isFinite(declaredWidth) || !Number.isFinite(declaredHeight)) return null;
    if (declaredWidth <= 0 || declaredHeight <= 0) return null;
    if (declaredWidth * declaredHeight > MAX_PIXELS) return null;

    UTIF.decodeImage(buffer, first, pages);
    const width = Number(first.width ?? declaredWidth);
    const height = Number(first.height ?? declaredHeight);
    if (width <= 0 || height <= 0) return null;

    const rgba = UTIF.toRGBA8(first);
    // A decoder that produced nothing usable is a failure, not an empty image.
    if (!rgba || rgba.length < width * height * 4) return null;
    return { width, height, rgba: new Uint8Array(rgba.buffer, rgba.byteOffset, width * height * 4) };
  } catch {
    return null;
  }
}

/** How big to draw a decoded picture: never enlarged, shrunk only when it is
 *  bigger than a slide could show. */
export function drawnSize(width: number, height: number, maxEdge = MAX_DRAWN_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** A decoded TIFF as an object URL the page can draw, or null when it could not
 *  be decoded. Browser only — the caller revokes the URL. */
export async function tiffObjectUrl(bytes: ArrayBuffer | Uint8Array): Promise<string | null> {
  const pixels = decodeTiffPixels(bytes);
  if (!pixels) return null;

  const full = document.createElement("canvas");
  full.width = pixels.width;
  full.height = pixels.height;
  // 🔴 Default context, WITH its alpha channel. The reader already has the scar
  // from `{ alpha: false }`: an opaque canvas renders anything that does not
  // paint every pixel as solid black.
  const context = full.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(pixels.width, pixels.height);
  image.data.set(pixels.rgba);
  context.putImageData(image, 0, 0);

  const target = drawnSize(pixels.width, pixels.height);
  let source: HTMLCanvasElement = full;
  if (target.width !== pixels.width || target.height !== pixels.height) {
    const scaled = document.createElement("canvas");
    scaled.width = target.width;
    scaled.height = target.height;
    const scaledContext = scaled.getContext("2d");
    if (!scaledContext) return null;
    scaledContext.imageSmoothingQuality = "high";
    scaledContext.drawImage(full, 0, 0, target.width, target.height);
    source = scaled;
  }

  // PNG, not JPEG: a JPEG would flatten the alpha this whole path preserves.
  const blob = await new Promise<Blob | null>((resolve) => source.toBlob(resolve, "image/png"));
  return blob ? URL.createObjectURL(blob) : null;
}
