import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocument, documentToText } from "./document-model.ts";
import {
  readDocumentModel,
  readStructureEnvelope,
  storedDocumentModel,
  structureEnvelope,
} from "./document-envelope.ts";

/** A model shaped like the ones really written: a deck whose slide carries its own title. */
function deck() {
  return buildDocument({
    format: "pptx",
    title: "Renal pharmacology",
    units: [
      { index: 0, kind: "slide", label: "Clearance", size: { width: 960, height: 540 } },
      { index: 1, kind: "slide" },
    ],
    blocks: [
      { headingPath: [], kind: "paragraph", text: "GFR falls with age.", unit: 0 },
      { headingPath: [], kind: "paragraph", text: "Dose by weight.", unit: 1 },
    ],
  });
}

/** What actually sits in `parsed_documents.structure`, after a round trip through jsonb. */
function storedColumn() {
  const model = deck();
  return JSON.parse(
    JSON.stringify(structureEnvelope({ model, text: documentToText(model), title: model.title })),
  ) as unknown;
}

test("the stored column is an envelope, and a bare-model reader cannot read one", () => {
  // 🔴 THE REGRESSION THIS FILE EXISTS FOR. `source-index` called
  // `readDocumentModel(parse.structure)` on exactly this value. An envelope has no
  // top-level `format`, so the validator returned null for every row and no uploaded
  // document was ever chunked, embedded or indexed — reported as "predates the
  // canonical model", which reads as a healthy backlog rather than an outage.
  const stored = storedColumn();
  assert.equal(readDocumentModel(stored), null, "an envelope is not a model");
  assert.notEqual(storedDocumentModel(stored), null, "but the model inside it is reachable");
});

test("storedDocumentModel recovers the blocks from a v2 envelope", () => {
  const model = storedDocumentModel(storedColumn());
  assert.equal(model?.blocks.length, 2);
  assert.equal(model?.format, "pptx");
  assert.equal(model?.blocks[0]?.text, "GFR falls with age.");
});

test("a unit's own label survives validation", () => {
  // 🔴 It did not. The validator rebuilt each unit from `index` and `kind` alone, so
  // `library_chunks.unit_label` — which `source-index` fills from exactly this field —
  // would have been NULL for every slide, and no retrieval result could name the slide
  // it came from. LATENT rather than active: the envelope bug above meant nothing was
  // ever indexed, so no such row exists to go looking for. It would have surfaced the
  // moment that was fixed, which is why both are fixed together.
  const model = storedDocumentModel(storedColumn());
  assert.equal(model?.units[0]?.label, "Clearance");
});

test("a block keeps its grid and its rectangle — checked, then kept whole", () => {
  // 🔴 The counterpart to the unit branch, and the asymmetry is deliberate. Rebuilding
  // blocks from a field list the way units are rebuilt is what would drop `table` and
  // `rect`, which is the bug the unit branch actually had.
  const model = buildDocument({
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
    blocks: [
      {
        headingPath: [],
        kind: "table",
        rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.25 },
        table: { headerRows: 1, rows: [["Drug", "Dose"], ["Carvedilol", "3.125 mg"]] },
        text: "",
        unit: 0,
      },
    ],
  });
  const read = storedDocumentModel(JSON.parse(JSON.stringify(model)));
  assert.deepEqual(read?.blocks[0]?.table?.rows[1], ["Carvedilol", "3.125 mg"]);
  assert.deepEqual(read?.blocks[0]?.rect, { x: 0.1, y: 0.2, width: 0.5, height: 0.25 });
});

test("a unit's size survives validation, because a rect without it cannot become a crop", () => {
  const model = storedDocumentModel(storedColumn());
  assert.deepEqual(model?.units[0]?.size, { width: 960, height: 540 });
});

test("a unit that genuinely has no label does not acquire one", () => {
  const model = storedDocumentModel(storedColumn());
  assert.equal(model?.units[1]?.label, undefined);
});

test("a v1 text-only envelope has no model, and that null is honest", () => {
  const stored = JSON.parse(
    JSON.stringify(structureEnvelope({ text: "Just words.", title: "Old parse" })),
  ) as unknown;
  assert.equal(readStructureEnvelope(stored)?.shape, "text-only");
  assert.equal(storedDocumentModel(stored), null);
});

test("storedDocumentModel still accepts a bare model, for a caller that already unwrapped", () => {
  const bare = JSON.parse(JSON.stringify(deck())) as unknown;
  assert.equal(storedDocumentModel(bare)?.blocks.length, 2);
});

test("a block pointing at a unit that is not there is refused", () => {
  const broken = { ...deck(), units: [{ index: 0, kind: "slide" }] };
  assert.equal(readDocumentModel(JSON.parse(JSON.stringify(broken))), null);
});

test("junk is refused rather than half-typed", () => {
  assert.equal(storedDocumentModel(null), null);
  assert.equal(storedDocumentModel("a string"), null);
  assert.equal(storedDocumentModel({ format: "pdf" }), null);
});
