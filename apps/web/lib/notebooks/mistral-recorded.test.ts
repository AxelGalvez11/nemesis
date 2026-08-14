/**
 * The recorded vendor response, all the way to knowledge.
 *
 * 🔴🔴 THIS FILE EXISTS BECAUSE THE OTHER TEST FILE COULD NOT HAVE CAUGHT THE BUG THAT SHIPPED IN
 * THE FIRST DRAFT. Those tests hand `modelFromMistral` markdown containing a literal `<table>`,
 * because that is the input a test writer finds convenient. Mistral does not do that. It writes
 * `[tbl-0.html](tbl-0.html)` into the page markdown and puts the HTML somewhere else — so the
 * mapper lost every table in a 24-page document while thirteen green tests said the tables
 * survived. A guard whose input arrives the way a test constructs it, rather than the way the
 * producer delivers it, tests the function and lies about the wiring.
 *
 * So the fixture here is a RECORDING. `fixtures/mistral-ocr-recorded.json` holds real
 * `POST /v1/ocr` responses, unmodified in shape, captured 2026-08-13 from two files in the owner's
 * own course folder: a one-page instruction sheet and two pages of a 24-page drug chart. Re-record
 * it — do not hand-edit it — if the vendor's shape changes.
 *
 * The last test is the acceptance path the whole integration exists for: a vendor response becomes
 * knowledge objects a learner can be asked about.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { cellText, documentToText, storedDocumentModel, structureEnvelope } from "@nemesis/shared";

import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import { sourceContextFromModel } from "@/lib/sources/source-context";
import { modelFromMistral, titleFromMistral } from "./mistral-model";
import { parseMistralResponse } from "./mistral-ocr";
import type { MistralOcrResponse } from "./mistral-ocr";

const RECORDED = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "mistral-ocr-recorded.json"), "utf8"),
) as Record<string, unknown>;

/** A recording, read through the same validator production uses — so a fixture that would be
 *  rejected in production cannot quietly pass here. */
function recorded(name: "instructions" | "drug_charts" | "diagram"): MistralOcrResponse {
  const parsed = parseMistralResponse(RECORDED[name]);
  assert.ok(parsed, `the recorded ${name} response must satisfy the production reader`);
  return parsed;
}

test("🔴 the recorded table document keeps its tables — the defect the hand-built fixtures missed", () => {
  const response = recorded("drug_charts");
  const model = modelFromMistral(response, "pdf", titleFromMistral(response));
  assert.ok(model);

  const tables = model.blocks.filter((block) => block.kind === "table");
  assert.ok(tables.length >= 2, `expected the recorded tables, got ${tables.length}`);

  // 🔴 THE SHAPE OF THE BUG, ASSERTED DIRECTLY. A markdown-first reader produces a paragraph whose
  // text is the reference id and no table at all.
  const leaked = model.blocks.filter((block) => /^tbl-\d+\.html$/.test(block.text.trim()));
  assert.deepEqual(leaked, [], "a table reference must become a grid, never a paragraph naming a file");

  // The grid is real: a drug the chart lists is findable in a cell, not merely somewhere in prose.
  const cells = tables.flatMap((block) => block.table?.rows.flat() ?? []);
  assert.ok(
    cells.some((cell) => /albuterol/i.test(cell)),
    "a drug named in the chart must be reachable as a table cell",
  );
});

test("the recorded page's header and footer are recognised, not read as body prose", () => {
  const model = modelFromMistral(recorded("drug_charts"), "pdf", null);
  const kinds = new Set(model?.blocks.map((block) => block.kind));
  assert.ok(kinds.has("pageHeader"), "the running header is a header");
  assert.ok(kinds.has("pageFooter"), "the version footer is a footer");
  // A running header repeated on every page must not become a paragraph the learner is taught.
  const header = model?.blocks.find((block) => block.kind === "pageHeader");
  assert.match(header?.text ?? "", /IPPE/);
});

test("every labelled region of the recorded page carries a rectangle", () => {
  const model = modelFromMistral(recorded("instructions"), "pdf", null);
  assert.ok(model);
  const placed = model.blocks.filter((block) => block.rect);
  assert.equal(placed.length, model.blocks.length, "the vendor located every block; so must we");
  for (const block of placed) {
    const { height, width, x, y } = block.rect!;
    // 🔴 UNIT-RELATIVE, NOT PIXELS. The recorded page is 791x1023, so an unconverted box would be
    // in the hundreds and every one of these would fail.
    for (const value of [x, y, width, height]) {
      assert.ok(value >= 0 && value <= 1, `rect out of 0..1: ${JSON.stringify(block.rect)}`);
    }
    assert.ok(width > 0 && height > 0);
  }
});

test("the recorded instruction sheet keeps its nested bullets as list items", () => {
  const model = modelFromMistral(recorded("instructions"), "pdf", null);
  const items = model?.blocks.filter((block) => block.kind === "listItem") ?? [];
  // The vendor's own `o` and ▪ glyphs are not markdown markers — a syntax-only reader files them
  // as prose, and the structure of a study checklist is exactly its nesting.
  assert.ok(items.length >= 8, `expected the checklist to survive as items, got ${items.length}`);
  assert.ok(items.some((item) => (item.depth ?? 0) > 0), "and its nesting to survive too");
  assert.ok(
    items.some((item) => /convert lbs to kg/i.test(item.text)),
    "including a nested item that uses the vendor's own bullet glyph",
  );
});

test("🔴 a recorded diagram page locates its figure — the parameter that silently suppressed them", () => {
  const model = modelFromMistral(recorded("diagram"), "pdf", null);
  assert.ok(model);
  const figures = model.blocks.filter((block) => block.kind === "figure");

  // 🔴 A PROPERTY GUARD, AND DELIBERATELY NOT A MECHANISM ONE. Three paths in the mapper can turn
  // an image into a figure — the labelled `image` branch, the markdown reader's `imageRefOf`, and
  // `locatedFigures` for pictures the prose never names — so disabling any single one leaves this
  // green. That was tried, twice, before this comment was written. What it does assert is the thing
  // a learner would notice: a recorded page with a diagram on it yields a located figure. The
  // parameter that decides whether figures arrive AT ALL is guarded on the request instead, in
  // `mistral-model.test.ts`, which is the one place that defect is representable.
  assert.ok(figures.length > 0, "a recorded page with a diagram on it must produce a figure block");

  const placed = figures.filter((block) => block.rect);
  assert.equal(placed.length, figures.length, "and every figure must carry where it is");
  for (const block of placed) {
    const { height, width, x, y } = block.rect!;
    for (const value of [x, y, width, height]) {
      assert.ok(value >= 0 && value <= 1, `figure rect out of 0..1: ${JSON.stringify(block.rect)}`);
    }
  }
  // Located, and honestly unexamined — absent description is what lets a later vision pass enrich
  // this document instead of believing someone already looked.
  assert.equal(figures[0]?.figure?.description, undefined);
});

test("🔴 recorded response → model → stored → read back → KNOWLEDGE OBJECTS", () => {
  const response = recorded("drug_charts");
  const model = modelFromMistral(response, "pdf", titleFromMistral(response));
  assert.ok(model);

  // Exactly how production persists and reloads it.
  const stored = JSON.parse(
    JSON.stringify(structureEnvelope({ model, text: documentToText(model), title: model.title })),
  ) as unknown;
  const read = storedDocumentModel(stored);
  assert.ok(read, "the recorded document must survive the persistence envelope");

  const table = read.blocks.find((block) => block.kind === "table")?.table;
  assert.ok(table, "and its tables must survive with it");
  assert.ok(cellText(table, 0, 0).length > 0, "a cell still resolves after the round trip");

  // 🔴 THE HOP THE WHOLE INTEGRATION IS FOR. `extractKnowledgeObjects` reads two-column tables into
  // knowledge objects; everything upstream of it is plumbing. This asserts the plumbing DELIVERS.
  const context = sourceContextFromModel({ model: read, sourceId: "recorded", sourceKind: "pdf" });
  const extraction = extractKnowledgeObjects(context);
  assert.notEqual(extraction.outcome, "failed", "a real vendor parse must not read as a failed one");
  assert.ok(context.units.length > 0, "the canonical source must carry units the extractor can read");
  // What it produced is reported rather than asserted at a number: this recording is two pages of a
  // twenty-four page file, and pinning a count here would make the guard about the fixture.
  console.log(
    `      knowledge objects from 2 recorded pages: ${extraction.objects.length}` +
      ` (units ${context.units.length}, refusals ${extraction.refusals.length})`,
  );
});
