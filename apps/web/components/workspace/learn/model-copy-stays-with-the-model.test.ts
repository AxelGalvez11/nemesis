import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 🔴🔴🔴 `coverageNoticeForModel` IS AN INSTRUCTION ADDRESSED TO A MODEL, AND IT HAS NOW REACHED A
// LEARNER TWICE, THROUGH TWO DIFFERENT DOORS.
//
//   2026-09-03, morning — the sources panel rendered `coverageNote` verbatim: *"Incomplete source:
//   8 pictures were not read. If the student's question depends on what is missing, say so plainly
//   rather than answering as though you read the whole document."* In a 10px amber label, about the
//   reader, in the third person. Fixed by adding `coverageLabel`, the learner's rendering.
//
//   2026-09-03, evening — the SAME string, through the FALLBACK that fix left behind
//   (`coverageLabel ?? coverageNote`). The owner ruled picture counts out of the learner's copy, so
//   `coverageLabel` correctly became null for a picture-only gap, and three of his lecture rows
//   started showing "Source read in full: the te…" in amber instead. Caught on production.
//
// A fallback whose job is "show something when the learner's copy is empty" cannot be right, because
// empty IS the learner's copy for every gap we have decided not to report.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PANEL = strip(read("./canvas-controls.tsx"));
const CANVAS = strip(read("./learning-canvas.tsx"));

test("🔴🔴🔴 no learner-facing surface falls back to the model's copy", () => {
  // Calibration: restore `source.coverageLabel ?? source.coverageNote` anywhere and this reddens.
  for (const [name, code] of [["the sources panel", PANEL], ["the canvas", CANVAS]] as const) {
    assert.ok(
      !/coverageLabel \?\? source\.coverageNote|coverageLabel \?\? .*coverageNote/.test(code),
      `${name} falls back to the model's sentence when the learner's is empty`,
    );
  }
});

test("🔴 the panel renders the learner's label and nothing else", () => {
  assert.match(PANEL, /\{source\.coverageLabel && \(/, "the panel's disclosure is no longer gated on the learner's copy");
  assert.match(PANEL, /\{source\.coverageLabel\}/, "the panel stopped rendering the learner's copy");
  // 🔴 AND THE "did not read at all" WARNING BESIDE IT KEYS ON THE SAME FIELD. Two gates reading
  // different fields is how a row shows both marks, or neither.
  assert.match(PANEL, /\{!source\.coverageLabel && sourceReadWarning\(source\)/, "the two disclosures read different fields again");
});

test("🔴 the model is still told — this is about the audience, not the fact", () => {
  // The whole point of the learner's copy existing is that ONE parsed record renders two ways. If
  // the model's rendering ever went quiet too, an answer could describe a figure nobody read.
  const shared = strip(read("../../../../../packages/shared/src/extraction-coverage.ts"));
  const forModel = shared.slice(shared.indexOf("export function coverageNoticeForModel"));
  assert.match(forModel, /picture/, "the model's notice stopped naming the pictures");
});
