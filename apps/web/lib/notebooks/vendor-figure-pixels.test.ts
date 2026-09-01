/**
 * A drawn chart is a picture too.
 *
 * 🔴 THE DEFECT, MEASURED ON THE OWNER'S PHARMACOKINETICS DECK 2026-09-01. Our structural reader
 * found 15 image regions; the vendor's model listed 27 figures; 15 reported
 * `skipped: "unsupported"`. That reason reads as "a format we cannot open", and I reported it to
 * the owner as exactly that — wrongly. One-image PDFs in DeviceGray, Indexed, DeviceCMYK and
 * DCTDecode all decode cleanly, so the decoder was never the problem.
 *
 * The truth is that ~13 of those "figures" are not images in the file at all: concentration-time
 * curves drawn as axes, lines and labels, the way Excel and PowerPoint draw a chart. There was
 * never a picture to extract. `readPdfStructure` was right to find nothing.
 *
 * The vendor rasterises the page in order to read it, so for a drawn figure it is the only party
 * in the process that can supply pixels — which is why `include_image_base64` flipped to true.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_VENDOR_FIGURE_BYTES,
  vendorFigurePixels,
  withVendorPixels,
} from "./vendor-figure-pixels";
import type { MistralOcrResponse } from "./mistral-ocr";
import type { CapturedFigure } from "@/lib/pdf/structure";

/** Big enough to clear the "a handful of bytes is not a picture" floor. */
const png = (seed: number) => Buffer.from(new Uint8Array(600).fill(seed)).toString("base64");

function reply(images: { id: string; b64: string | null; box?: number[] }[], unit = 0): MistralOcrResponse {
  return {
    model: "mistral-ocr-latest",
    pages: [{
      dimensions: { dpi: 72, height: 792, width: 612 },
      images: images.map((i) => ({
        bottom_right_x: i.box?.[2] ?? 300,
        bottom_right_y: i.box?.[3] ?? 250,
        id: i.id,
        image_base64: i.b64,
        top_left_x: i.box?.[0] ?? 100,
        top_left_y: i.box?.[1] ?? 50,
      })),
      index: unit,
      markdown: "# Bending stress",
    }],
    usage_info: { pages_processed: 1 },
  } as unknown as MistralOcrResponse;
}

test("🔴 a drawn figure the vendor rasterised comes back, keyed by the ref its own model uses", () => {
  // 🔴 `unit:id` AND NO GEOMETRY, WHICH IS THE ADVANTAGE OVER OUR OWN PIXELS. These arrive from the
  // same reader that produced the figure blocks, already carrying the id those blocks use as their
  // ref, so they cannot be mispaired. Our own decode comes from a different reader with different
  // names and has to be matched by where the ink is — and a mispairing there means a figure
  // DESCRIBED as one picture and SHOWING another.
  const out = vendorFigurePixels(reply([{ b64: png(1), id: "img-0" }, { b64: png(2), id: "img-1" }]));
  assert.deepEqual([...out.keys()], ["0:img-0", "0:img-1"]);
  assert.equal(out.get("0:img-0")!.png.byteLength, 600);
  // The region's own box, which is all that is needed to decide how big to render it.
  assert.deepEqual([out.get("0:img-0")!.width, out.get("0:img-0")!.height], [200, 200]);
});

test("🔴 anything that is not really a picture is dropped rather than stored", () => {
  // base64 decoding NEVER throws on garbage — it drops what it does not recognise and returns
  // whatever it managed. Storage accepts a 4-byte object without complaint and every later render
  // shows it as a broken frame, which is worse than showing no picture at all.
  const out = vendorFigurePixels(reply([
    { b64: null, id: "no-pixels" },
    { b64: "", id: "empty" },
    { b64: "Zm9v", id: "tiny" },
    { b64: png(3), id: "real" },
  ]));
  assert.deepEqual([...out.keys()], ["0:real"]);
});

test("🔴 a data URL and a bare payload both decode", () => {
  const out = vendorFigurePixels(reply([{ b64: `data:image/png;base64,${png(4)}`, id: "img-0" }]));
  assert.equal(out.get("0:img-0")?.png.byteLength, 600);
});

test("🔴 the total is capped, and the cap TRUNCATES rather than failing the parse", () => {
  // These are page-resolution rasters and base64 inflates by 4/3, so a pathological document could
  // hand back tens of megabytes into a thread that already holds the file and its model. Figures
  // past the ceiling are simply not taken, which leaves them exactly as they were before this
  // existed — a truthful `skipped`, not a failed read.
  const oneMb = Buffer.alloc(1024 * 1024).toString("base64");
  const many = Array.from({ length: 40 }, (_, i) => ({ b64: oneMb, id: `img-${i}` }));
  const out = vendorFigurePixels(reply(many));
  const total = [...out.values()].reduce((sum, f) => sum + f.png.byteLength, 0);
  assert.ok(total <= MAX_VENDOR_FIGURE_BYTES, "the ceiling was crossed");
  assert.ok(out.size > 0, "the ceiling refused everything");
  assert.ok(out.size < many.length, "the ceiling refused nothing");
});

test("🔴🔴 OUR pixels win every contest — the vendor's only fill gaps", () => {
  // Not a preference. Our copy is decoded from the original file at the resolution it was authored;
  // the vendor's is its own render of a page region, good enough to read and never better than the
  // source. Preferring the vendor's would trade quality for nothing on exactly the figures that
  // already worked, and would pay a base64 round trip to do it.
  const ours: CapturedFigure = { height: 9, png: new Uint8Array([1, 2, 3]), width: 9 };
  const merged = withVendorPixels(
    new Map([["0:img-0", ours]]),
    vendorFigurePixels(reply([{ b64: png(5), id: "img-0" }, { b64: png(6), id: "img-1" }])),
  );
  assert.equal(merged.get("0:img-0"), ours, "a vendor render replaced our own decode");
  assert.equal(merged.get("0:img-1")?.png.byteLength, 600, "the gap was not filled");
  assert.equal(merged.size, 2);
});

test("🔴 the request actually asks for them — the flag is the whole feature", async () => {
  // Everything above is dead code if the response never carries an image. The two flags that look
  // alike here are pinned in `mistral-model.test.ts`; this is the one-line reminder that the
  // pipeline depends on one of them.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./mistral-ocr.ts", import.meta.url), "utf8");
  assert.match(source, /include_image_base64: true/, "the vendor is not being asked for its pixels");
});
