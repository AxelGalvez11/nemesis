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
  // was NULL for every slide, and no retrieval result could name the slide it came from.
  const model = storedDocumentModel(storedColumn());
  assert.equal(model?.units[0]?.label, "Clearance");
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
