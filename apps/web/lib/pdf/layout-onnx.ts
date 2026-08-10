/**
 * Where the things on a page are: Docling's layout model, running in Node.
 *
 * 🔴 THIS IS THE PART WE COULD NOT DO, AND IT TURNED OUT NOT TO NEED PYTHON.
 * Our own PDF lane finds 0 tables and 0 list items across every corpus PDF,
 * because a PDF states where ink goes and never states what the arrangement
 * means. Docling recovers that with a trained layout model — and publishes it
 * as ONNX (`docling-project/docling-layout-heron-onnx`, Apache-2.0, 171 MB),
 * which `onnxruntime-node` runs directly.
 *
 * Measured on a real 24-page course document (8-column drug charts):
 *   model load 468 ms · 702 ms/page · peak RSS 541 MB · 28 tables
 * against Python docling's 28 tables, 97 s, and 2.4-6.2 GB. The multi-gigabyte
 * figure was always PyTorch's runtime, never the model.
 *
 * It answers WHERE a table is, not what is in it. Cell contents come from
 * `table-grid.ts` (the ruled lines the PDF already draws) plus the exact text
 * pdf.js already gives us — so no model is ever asked to re-read a character we
 * already have, and a wrong number cannot be invented.
 */

import type { DocRect } from "@nemesis/shared";

/** RT-DETRv2's classes, in the order `config.json` assigns them. */
export const LAYOUT_LABELS = [
  "caption", "footnote", "formula", "list_item", "page_footer", "page_header",
  "picture", "section_header", "table", "text", "title", "document_index",
  "code", "checkbox_selected", "checkbox_unselected", "form", "key_value_region",
] as const;

export type LayoutLabel = (typeof LAYOUT_LABELS)[number];

/** The square the model resizes every page to. Fixed by the export. */
const INPUT_SIZE = 640;

/** Below this the detector is guessing; Docling's own default. */
export const LAYOUT_SCORE_THRESHOLD = 0.5;

export interface LayoutRegion {
  label: LayoutLabel;
  score: number;
  /** Pixel box in the rasterized page: [x0, y0, x1, y1], top-left origin. */
  box: [number, number, number, number];
}

export interface LayoutResult {
  regions: LayoutRegion[];
  ms: number;
}

/**
 * Minimal structural views of the runtime, so the assembly logic can be tested
 * without a 171 MB model or a native addon on the test machine.
 */
export interface OnnxTensorLike { data: ArrayLike<number | bigint>; }
export interface OnnxSessionLike {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OnnxTensorLike>>;
}

/** Where the weights live. Absent means the lane is simply off. */
export function layoutModelPath(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.DOCLING_LAYOUT_ONNX ?? "").trim();
  return raw || null;
}

let sessionPromise: Promise<OnnxSessionLike> | null = null;

/**
 * The one loaded model, shared across pages.
 *
 * 🔴 LOADED ONCE PER PROCESS, DELIBERATELY. Loading costs ~470 ms and ~370 MB;
 * doing it per page would dominate a 24-page document and multiply the memory
 * by the page count. The worker parses one document per invocation, so a
 * module-level handle is exactly the right lifetime.
 */
export async function layoutSession(path: string): Promise<OnnxSessionLike> {
  sessionPromise ??= (async () => {
    const ort = await import("onnxruntime-node");
    return (await ort.InferenceSession.create(path)) as unknown as OnnxSessionLike;
  })();
  return sessionPromise;
}

/** Test seam: install a fake session, or clear the cached real one. */
export function __setLayoutSession(session: OnnxSessionLike | null): void {
  sessionPromise = session ? Promise.resolve(session) : null;
}

/**
 * Turn an RGB raster into the tensor the graph wants.
 *
 * 🔴 uint8, NOT float32, AND THE CONFIG SAYS SO IF YOU READ IT CAREFULLY.
 * `preprocessor_config.json` carries `do_rescale: false` and
 * `do_normalize: false` — not because the model wants raw magnitudes, but
 * because the quantized export folds the /255 and the ImageNet mean/std into
 * the graph. Handing it float32 throws outright ("expected: (tensor(uint8))"),
 * which is the good kind of mistake: impossible to make silently.
 *
 * PURE. HWC bytes in, CHW bytes out.
 */
export function toChwUint8(rgb: Uint8Array | Buffer, size = INPUT_SIZE): Uint8Array {
  const pixels = size * size;
  const out = new Uint8Array(3 * pixels);
  for (let i = 0; i < pixels; i += 1) {
    out[i] = rgb[i * 3]!;
    out[pixels + i] = rgb[i * 3 + 1]!;
    out[2 * pixels + i] = rgb[i * 3 + 2]!;
  }
  return out;
}

/**
 * Read the graph's three outputs into regions, in the raster's pixel space.
 *
 * 🔴 THE BOUNDS CHECK IS THE WHOLE REASON THIS IS A SEPARATE FUNCTION.
 * `orig_target_sizes` is (WIDTH, HEIGHT) for this export — NOT the
 * (height, width) that HuggingFace's reference RT-DETR post-processing
 * documents. Getting it backwards does not throw and does not look wrong: the
 * labels are still right, the scores are still high, the rectangles still look
 * like rectangles. It is only detectable by comparing a coordinate against the
 * page — on a 2200x1700 page the wrong order put boxes in a 1700x2200 space,
 * with y running to 2104 on a page 1700 tall. A silently transposed locator is
 * exactly the class of defect the coverage contract exists to prevent, so the
 * check is mandatory rather than defensive.
 *
 * PURE.
 */
export function readRegions(
  outputs: { labels: OnnxTensorLike; boxes: OnnxTensorLike; scores: OnnxTensorLike },
  width: number,
  height: number,
  threshold = LAYOUT_SCORE_THRESHOLD,
): LayoutRegion[] {
  const { labels, boxes, scores } = outputs;
  const regions: LayoutRegion[] = [];
  const slack = Math.max(width, height) * 0.02;   // rounding, not transposition
  for (let i = 0; i < scores.data.length; i += 1) {
    const score = Number(scores.data[i]);
    if (!(score >= threshold)) continue;
    const box: [number, number, number, number] = [
      Number(boxes.data[i * 4]),
      Number(boxes.data[i * 4 + 1]),
      Number(boxes.data[i * 4 + 2]),
      Number(boxes.data[i * 4 + 3]),
    ];
    if (!box.every(Number.isFinite)) continue;
    if (box[2] > width + slack || box[3] > height + slack) {
      throw new Error(
        `layout boxes fall outside the page (${Math.round(box[2])}x${Math.round(box[3])} on ${width}x${height}) ` +
        "— orig_target_sizes is (width, height) for this export",
      );
    }
    const label = LAYOUT_LABELS[Number(labels.data[i])];
    if (!label) continue;
    regions.push({
      box: [
        Math.max(0, box[0]),
        Math.max(0, box[1]),
        Math.min(width, box[2]),
        Math.min(height, box[3]),
      ],
      label,
      score,
    });
  }
  regions.sort((a, b) => b.score - a.score);
  return regions;
}

/** A pixel box as a unit-relative `DocRect`. PURE. */
export function boxToRect(
  box: readonly [number, number, number, number],
  width: number,
  height: number,
): DocRect | undefined {
  if (!(width > 0) || !(height > 0)) return undefined;
  const x0 = Math.max(0, Math.min(box[0], width));
  const y0 = Math.max(0, Math.min(box[1], height));
  const x1 = Math.max(0, Math.min(box[2], width));
  const y1 = Math.max(0, Math.min(box[3], height));
  if (x1 <= x0 || y1 <= y0) return undefined;
  return { height: (y1 - y0) / height, width: (x1 - x0) / width, x: x0 / width, y: y0 / height };
}

/**
 * Detect the regions on one rasterized page.
 *
 * `resizedRgb` is the page already scaled to 640x640 and stripped to RGB — the
 * caller does that because it already holds the pixels and a second decode
 * would double the cost of the cheapest step in the pipeline.
 */
export async function detectLayout(
  session: OnnxSessionLike,
  resizedRgb: Uint8Array | Buffer,
  width: number,
  height: number,
  options: { threshold?: number } = {},
): Promise<LayoutResult> {
  const ort = await import("onnxruntime-node");
  const started = Date.now();
  const outputs = await session.run({
    images: new ort.Tensor("uint8", toChwUint8(resizedRgb), [1, 3, INPUT_SIZE, INPUT_SIZE]),
    orig_target_sizes: new ort.Tensor("int64", BigInt64Array.from([BigInt(width), BigInt(height)]), [1, 2]),
  });
  const regions = readRegions(
    outputs as unknown as { labels: OnnxTensorLike; boxes: OnnxTensorLike; scores: OnnxTensorLike },
    width,
    height,
    options.threshold,
  );
  return { ms: Date.now() - started, regions };
}
