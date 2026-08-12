import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCoverage, type ExtractionCoverage, type FigureCoverage } from "@nemesis/shared";

import { noTextMessage } from "./parse-message.ts";

function coverage(input: { units: number; figures?: FigureCoverage }): ExtractionCoverage {
  const built = buildCoverage({
    unitKind: "page",
    units: input.units,
    unitsNative: 0,
    unitsUnread: input.units,
    ...(input.figures ? { figures: input.figures } : {}),
  });
  if (typeof built === "string") throw new Error(built);
  return built;
}

const scanned = (found: number): FigureCoverage => ({
  found,
  described: 0,
  skipped: found,
  reasons: { "not-examined": found },
});

test("a scan says what is in it, and whose limitation the failure is", () => {
  const message = noTextMessage("pdf", coverage({ figures: scanned(3), units: 2 }));
  assert.match(message, /3 pictures/, "the student is told what was found");
  assert.match(message, /2 pages/, "and how much of the document it covers");
  assert.match(message, /can't read text out of images/, "and that the limit is ours, not their file's");
  // 🔴 IT MUST NOT IMPLY THE FILE IS DAMAGED. "No readable text was found" reads
  // as "your upload is broken" when the upload is a perfectly good scan.
  assert.doesNotMatch(message, /No readable text was found/);
});

test("one picture on one page reads as English, not as a template", () => {
  const message = noTextMessage("pdf", coverage({ figures: scanned(1), units: 1 }));
  assert.match(message, /1 picture\b/, "singular");
  assert.doesNotMatch(message, /pages/, "a single page is not worth counting out loud");
});

test("a PDF with no text AND no pictures keeps the old, correct sentence", () => {
  // Nothing was found, so there is nothing to describe — inventing a picture
  // count here would be the same fabrication the placeholder was.
  const message = noTextMessage("pdf", coverage({ units: 1 }));
  assert.match(message, /no selectable text/);
  assert.doesNotMatch(message, /picture/);
});

test("a photograph gets advice a person can act on, not a parser's vocabulary", () => {
  const message = noTextMessage("image", coverage({ units: 1 }));
  assert.match(message, /more light|steadier/);
});

test("an unknown kind still gets a plain sentence rather than a blank", () => {
  assert.ok(noTextMessage("txt", coverage({ units: 1 })).trim().length > 0);
});
