/**
 * The figure half of the vendor quality gate, and the coverage record it produces.
 *
 * 🔴 NOT IN `mistral-quality.test.ts`, WHERE `judgeFigureAccounting` LIVES, AND THAT IS NOT A
 * PREFERENCE. That file crashes during module evaluation under this project's own test command
 * (`tsx --test`): it builds a path from `import.meta.dirname`, which is `undefined` once tsx has
 * transformed the file to CommonJS, so not one of its assertions has ever run — including the
 * ones guarding the PPTX figure gate. Ten-odd files across the app share the defect. Reviving
 * them is a separate change; putting new tests inside a file that cannot execute would mean
 * shipping a guard that is green because nothing ran it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { mistralCoverage } from "./extract-coverage";
import { judgeFigureAccounting } from "./mistral-quality";

test("a read that accounts for every painted region passes", () => {
  // The measured shape of the owner's diabetes lecture: 9 regions, 4 back as figures, 5 back as
  // the tables they were screenshots of, none missing.
  const verdict = judgeFigureAccounting({ absent: 0, regions: new Array(9).fill(null) });
  assert.equal(verdict.ok, true);
});

test("🔴 a region that arrived in no form at all is rejected, and the reason names figures", () => {
  // Calibrated against production geometry, not this fixture: stripping the figure blocks out of
  // that same lecture's stored vendor model — the `image_limit: 0` failure — takes `absent` from
  // 0 to 3. See `scripts/bakeoff-vendor-figures.ts --strip-figures`.
  const verdict = judgeFigureAccounting({ absent: 3, regions: new Array(9).fill(null) });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.missing, "figures");
  assert.match(verdict.ok === false ? verdict.detail : "", /3 of them arrived in no form/);
});

test("🔴 the gate never fires on a document that paints nothing worth reading", () => {
  // The immunology lecture measured: 5 painted images, every one below the furniture line, so
  // there is no region to account for and nothing to refuse. A gate that rejected here would
  // send every text-only PDF back to the slower reader for no reason.
  assert.equal(judgeFigureAccounting({ absent: 0, regions: [] }).ok, true);
});

test("🔴 coverage stops fabricating `not-examined` once something has actually looked", () => {
  // The defect this replaces: `mistralCoverage` could only build its figures block from a COUNT,
  // so it wrote `described: 0` and `not-examined: N` unconditionally. That was true while the
  // vendor lane examined no figure ever, and would have gone on being written afterwards — a
  // coverage record contradicting the model stored beside it.
  const coverage = mistralCoverage({
    figureCoverage: { described: 3, found: 8, reasons: { "not-examined": 5 }, skipped: 5 },
    unitKind: "page",
    units: 17,
    unitsRead: 17,
  });

  assert.equal(coverage.figures?.described, 3, "the descriptions the model actually holds");
  assert.equal(coverage.figures?.reasons?.["not-examined"], 5);
});

test("a count alone still reports every figure unexamined — that is what a count can say", () => {
  const coverage = mistralCoverage({ figures: 8, unitKind: "page", units: 17, unitsRead: 17 });
  assert.equal(coverage.figures?.found, 8);
  assert.equal(coverage.figures?.described, 0);
  assert.equal(coverage.figures?.reasons?.["not-examined"], 8);
});
