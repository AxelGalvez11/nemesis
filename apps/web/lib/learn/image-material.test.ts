import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { IMAGE_EXTENSIONS } from "@/lib/workspace/chat-attachments";

import { ACCEPTED_MATERIAL } from "./canvas-tasks";

// 🔴 REPORTED 2026-08-20: *"nemesis does not accept any images unfortunately."*
//
// It accepts them perfectly. Driven in a browser with a real PNG, the vision reader described the
// picture accurately — so the upload, the bucket, the vision pass and the canvas write all worked.
// What the learner SAW was a chip reading:
//
//     [An illustration of three solid black horizontal bars of varying lengths stacked vertica…
//
// Their own photo, described back at them in brackets and truncated. That reads as a failure, and
// it is the same shape as the drawing this product once sent back to be proofread: answering a
// picture with prose about the picture.

test("🔴🔴 the picker offers every image the reader can actually read", () => {
  // 🔴 `.heif` WAS MISSING AND IT IS WHAT AN IPHONE WRITES. `IMAGE_EXTENSIONS` has listed both all
  // along; this list had only `.heic`, so the OS dialog greyed out half a camera roll and the
  // refusal happened before any code of ours ran — invisible from every log we keep.
  //
  // Derived from the reader's own list rather than restated, so the two cannot drift again.
  const offered = ACCEPTED_MATERIAL.split(",");
  for (const extension of IMAGE_EXTENSIONS) {
    assert.ok(offered.includes(extension), `${extension} is readable but the picker will not offer it`);
  }
});

test("🔴 the accept list is a superset, not a copy — documents are still offered", () => {
  // A fix that made this list images-only would satisfy the test above and break every upload.
  for (const extension of [".pdf", ".docx", ".pptx", ".md", ".txt", ".xlsx", ".csv"]) {
    assert.ok(ACCEPTED_MATERIAL.includes(extension), extension);
  }
});

test("🔴🔴 an image is named by its FILE, never by what a model saw in it", () => {
  // Calibration: send the image branch through the extractor's title and this reddens.
  //
  // 🔴 TWO CLAIMS, NOT ONE LITERAL. This matched the whole expression as a string, so the
  // 2026-08-26 title work — which changed only the DOCUMENT half — reddened a test about IMAGES.
  // A guard that fails for the thing it is not about teaches people to edit guards.
  const session = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
  const code = session.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /title: extracted\.kind === "image" \? file\.name :/, "an image is named by something other than its file again");
  assert.ok(!/extracted\.title \?\? file\.name/.test(code), "the extractor's title is being taken unchecked again");
  // The other half: a document IS named from the extractor's offer, once that offer has passed the
  // shape tests in `document-title.ts` (a table header row is not a title).
  assert.match(code, /documentTitle\(extracted\.title, file\.name\)/, "a document no longer gets its name checked");
});

test("🔴 and the description is KEPT, because it is the source's content", () => {
  // The vision read is what the canvas learns from — it must not be thrown away along with the
  // title. A fix that dropped it would make an image attach and teach nothing, which is a worse
  // version of the reported bug wearing its fix's clothes.
  const session = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
  assert.match(session, /extractFile\(file, id, \{ folderPath: CANVAS_FILING_FOLDER, keep: true \}\)/);
  assert.ok(!/kind === "image"[\s\S]{0,200}?continue/.test(session), "an image is being skipped rather than attached");
});
