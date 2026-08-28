import assert from "node:assert/strict";
import test from "node:test";

import { cropFileName, fileFromDataUrl } from "./region-crop";

// A 1×1 transparent PNG, as a canvas would hand one back.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test("🔴 a canvas data URL becomes a real file the chat can attach", async () => {
  const file = fileFromDataUrl(PNG, "diagram (marked area).png");
  assert.ok(file, "the crop did not survive as a file");
  assert.equal(file.type, "image/png");
  assert.equal(file.name, "diagram (marked area).png");
  // The bytes are the PNG's, not the base64 text: a File built from the string would be silently
  // wrong — the right size on the chip and unreadable to anything that opens it.
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], "the file does not start with a PNG signature");
});

test("🔴 anything that is not base64 data returns null rather than an empty file", () => {
  // A cross-origin image taints the canvas and `toDataURL` throws, so this path exists. Returning
  // an empty File instead of null would attach a 0-byte picture and let the message claim one
  // travelled — the failure mode the prompt's fallback wording exists to avoid.
  assert.equal(fileFromDataUrl("", "x.png"), null);
  assert.equal(fileFromDataUrl("data:image/png,notbase64", "x.png"), null);
  assert.equal(fileFromDataUrl("data:image/png;base64,", "x.png"), null);
  assert.equal(fileFromDataUrl("https://example.com/a.png", "x.png"), null);
});

test("the cut-out is named after the document and the page it came from", () => {
  // Three marks on three pages otherwise arrive as three identical chips.
  assert.equal(cropFileName("Week 4 handout.pdf", "page", 12), "Week 4 handout page 12 (marked area).png");
  assert.equal(cropFileName("diagram.png", "image", null), "diagram (marked area).png");
  // Path separators in a stored filename must not become directories in an attachment name.
  assert.equal(cropFileName("notes/term one.pdf", "page", 1), "notes-term one page 1 (marked area).png");
  assert.ok(cropFileName("", "page", null).startsWith("document"));
});
