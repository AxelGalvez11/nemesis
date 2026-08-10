/**
 * A PDF page as pixels.
 *
 * 🔴 NEMESIS HAS NEVER HAD A RASTERIZER, AND THAT IS WHY THE FIGURE WORK COULD
 * ONLY EVER LOOK AT EMBEDDED IMAGES. `readPage` pulls decoded image XObjects
 * out of the operator list, which finds a photograph pasted onto a slide and
 * finds nothing at all on a page whose content is drawn — a chart made of
 * vectors, a table made of ruled lines, a scanned page stored as one big image
 * we then have no way to hand to anything. Layout analysis needs the page as it
 * LOOKS, not as it is stored, so it needs this.
 *
 * pdf.js does the drawing; `@napi-rs/canvas` is the surface it draws onto. Both
 * already ship prebuilt binaries for darwin-arm64 (local) and linux-x64 (the
 * deployment target), so this adds no build step.
 *
 * 🔴 THE PIXEL BUDGET IS A REAL BOUND, NOT A FORMALITY. Cost here is area, and
 * area is quadratic in scale: a 200-DPI render of an A4 page is 4.9 megapixels
 * and ~20 MB of RGBA before PNG encoding. A poster-sized page — real, in
 * academic PDFs — at the same DPI is 100+ megapixels and would take the worker
 * out. So the scale is whatever fits the budget, and the caller is told what it
 * actually got rather than what it asked for.
 */

/**
 * 🔴 LOADED DYNAMICALLY, AND THE BUILD IS THE REASON — NOT TASTE.
 *
 * `@napi-rs/canvas` is a native addon, and a top-level `import` of it puts a
 * `.node` binary into the route's static module graph. Turbopack then fails the
 * whole production build outright:
 *
 *     ./node_modules/@napi-rs/canvas/js-binding.js
 *     non-ecmascript placeable asset — not placeable in ESM chunks
 *       rasterize.ts -> structure.ts -> app/api/documents/parse/worker/route.ts
 *
 * A dynamic import keeps it out of the graph and turns "the deploy is broken"
 * into "this one lane is unavailable", which is what a disabled feature should
 * cost. `layout-onnx.ts` loads `onnxruntime-node` the same way for the same
 * reason. Both are also named in `serverExternalPackages` so Next leaves them
 * as runtime requires instead of trying to bundle them at all.
 */
type CanvasModule = typeof import("@napi-rs/canvas");
let canvasPromise: Promise<CanvasModule> | null = null;

async function canvasLib(): Promise<CanvasModule> {
  canvasPromise ??= import("@napi-rs/canvas").catch((cause) => {
    // Never cache a failed load: one transient fault would otherwise disable
    // rasterization for the life of the process.
    canvasPromise = null;
    throw cause;
  });
  return canvasPromise;
}

/**
 * What the layout model wants. It resizes to 640x640 internally, so rendering
 * far beyond this buys nothing for detection — it only costs memory. 200 DPI is
 * the ceiling rather than the target.
 */
export const LAYOUT_DPI = 200;

/**
 * Most pixels one page may occupy. 8 MP is a 200-DPI render of a page up to
 * about 17x14 inches, which covers letter, A4, and the landscape decks and
 * fold-out charts that appear in real course material.
 */
export const MAX_PAGE_PIXELS = 8_000_000;

export interface RasterPage {
  png: Buffer;
  /** Pixel dimensions actually rendered. */
  width: number;
  height: number;
  /** Points-per-pixel actually used, after any downscale to fit the budget. */
  scale: number;
  /** True when the pixel budget forced a smaller render than `dpi` asked for. */
  downscaled: boolean;
}

/** The pdf.js page surface this needs. Structural, so tests need no real PDF. */
export interface RenderablePage {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: unknown;
    viewport: { width: number; height: number };
    canvas?: unknown;
  }) => { promise: Promise<void> };
}

/**
 * The scale that renders this page at `dpi` without exceeding the pixel budget.
 *
 * PURE, and exported so the bound is testable without rendering anything.
 */
export function scaleForPage(
  pointsWide: number,
  pointsHigh: number,
  dpi: number,
  maxPixels: number,
): { scale: number; downscaled: boolean } {
  const wanted = dpi / 72;
  const area = pointsWide * pointsHigh * wanted * wanted;
  if (!(area > maxPixels) || !(pointsWide > 0) || !(pointsHigh > 0)) {
    return { downscaled: false, scale: wanted };
  }
  // Area scales with the square, so the linear correction is the square root.
  const shrunk = wanted * Math.sqrt(maxPixels / area);
  return { downscaled: true, scale: shrunk };
}

/**
 * Render one page to a PNG.
 *
 * Not pure — it draws — but it takes a page rather than a document, so the
 * caller keeps ownership of the pdf.js lifecycle and this cannot leak a worker.
 */
export async function rasterizePage(
  page: RenderablePage,
  options: { dpi?: number; maxPixels?: number } = {},
): Promise<RasterPage> {
  const dpi = options.dpi ?? LAYOUT_DPI;
  const maxPixels = options.maxPixels ?? MAX_PAGE_PIXELS;
  const base = page.getViewport({ scale: 1 });
  const { scale, downscaled } = scaleForPage(base.width, base.height, dpi, maxPixels);

  const { createCanvas } = await canvasLib();
  const viewport = page.getViewport({ scale });
  const width = Math.max(1, Math.round(viewport.width));
  const height = Math.max(1, Math.round(viewport.height));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  // A PDF page has no background of its own; without this, anything the page
  // does not paint stays transparent and encodes as black, which inverts the
  // page for every downstream reader.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  return { downscaled, height, png: canvas.toBuffer("image/png"), scale, width };
}

/**
 * The page as the square of raw RGB bytes the layout model consumes.
 *
 * 🔴 STRETCHED TO A SQUARE ON PURPOSE, NOT LETTERBOXED. The model resizes its
 * input to 640x640 regardless, and it reports boxes back in whatever original
 * size it is told — so distorting here and declaring the true page size is what
 * makes the returned coordinates land on the real page. Padding to preserve the
 * aspect ratio would put bars in the image and shift every box by the padding.
 *
 * Deliberately does NOT go through PNG. Encoding and re-decoding a page purely
 * to hand it to a model in the same process is pure waste — this reads the
 * pixels straight off the canvas.
 */
export async function pageToModelRgb(
  page: RenderablePage,
  options: { size?: number; dpi?: number; maxPixels?: number } = {},
): Promise<{ rgb: Uint8Array; width: number; height: number }> {
  const size = options.size ?? 640;
  const dpi = options.dpi ?? LAYOUT_DPI;
  const { createCanvas } = await canvasLib();
  const base = page.getViewport({ scale: 1 });
  const { scale } = scaleForPage(base.width, base.height, dpi, options.maxPixels ?? MAX_PAGE_PIXELS);
  const viewport = page.getViewport({ scale });
  const width = Math.max(1, Math.round(viewport.width));
  const height = Math.max(1, Math.round(viewport.height));

  const full = createCanvas(width, height);
  const fullCtx = full.getContext("2d");
  fullCtx.fillStyle = "#ffffff";
  fullCtx.fillRect(0, 0, width, height);
  await page.render({ canvas: full, canvasContext: fullCtx, viewport }).promise;

  const square = createCanvas(size, size);
  const ctx = square.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  // @napi-rs/canvas accepts a canvas as a drawImage source.
  ctx.drawImage(full as unknown as never, 0, 0, size, size);

  const rgba = ctx.getImageData(0, 0, size, size).data;
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    rgb[o] = rgba[i]!;
    rgb[o + 1] = rgba[i + 1]!;
    rgb[o + 2] = rgba[i + 2]!;
  }
  // The page's TRUE size in points at scale 1 — the space every other
  // coordinate in the parser lives in — not the raster's pixel size.
  return { height: base.height, rgb, width: base.width };
}
