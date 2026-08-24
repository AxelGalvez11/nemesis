import assert from "node:assert/strict";
import { test } from "node:test";

import { deckArtPng, paintDeckArt, rgbToPng, type DeckArt } from "./deck-art";

// The art engine has to keep three promises: it produces a real PNG, it produces the SAME PNG
// on every machine (the deck is a deterministic function of plan + theme, and a download that
// differs run to run would break that), and it stays small enough that three backgrounds do
// not turn a deck into a mail attachment nobody can send.

const ART: DeckArt = {
  base: "101018",
  glows: [{ color: "cc1f33", cx: 0.7, cy: 0.3, r: 0.6, strength: 0.5 }],
  grain: 0.4,
  vignette: 0.3,
};

test("the painter emits a real PNG the file format agrees with", async () => {
  const png = await rgbToPng(paintDeckArt(ART), 360, 203);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "not a PNG signature");
  assert.equal(Buffer.from(png.subarray(12, 16)).toString("latin1"), "IHDR");
  const view = new DataView(png.buffer, png.byteOffset);
  assert.equal(view.getUint32(16), 360, "width header wrong");
  assert.equal(view.getUint32(20), 203, "height header wrong");
  assert.equal(png[24], 8, "not 8 bits per channel");
  assert.equal(png[25], 2, "not truecolour RGB");
  assert.ok(Buffer.from(png.subarray(png.length - 8)).toString("latin1").includes("IEND"), "no IEND chunk");
});

test("the same recipe paints the same pixels every time", () => {
  const a = paintDeckArt(ART);
  const b = paintDeckArt(ART);
  assert.deepEqual([...a.subarray(0, 600)], [...b.subarray(0, 600)]);
  assert.notDeepEqual(
    [...paintDeckArt({ ...ART, base: "181010" }).subarray(0, 60)],
    [...a.subarray(0, 60)],
    "a different base painted the same pixels",
  );
});

test("a background stays small enough to ship three of them", async () => {
  const uri = await deckArtPng(ART);
  assert.ok(uri.startsWith("data:image/png;base64,"), "not a data URI");
  const bytes = Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
  assert.ok(bytes.length < 120_000, `a background grew to ${bytes.length} bytes — compression is off`);
  assert.ok(bytes.length > 2_000, "suspiciously tiny — the painter probably produced a flat field");
});

test("grain varies DOWN a column, not just across", () => {
  // 2026-08-25: grain was briefly made constant per column so it would compress; at slide size
  // that read as vertical pinstripes across every cover. This is that lesson, pinned.
  const flat = paintDeckArt({ base: "202020", grain: 0.6 }, 64, 64);
  const column = 17;
  const values = new Set<number>();
  for (let y = 0; y < 64; y += 1) values.add(flat[(y * 64 + column) * 3] ?? 0);
  assert.ok(values.size > 2, "every pixel down this column is identical — grain is 1-D again");
});
