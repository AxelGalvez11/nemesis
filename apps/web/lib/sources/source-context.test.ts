import assert from "node:assert/strict";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { capabilitiesOfStored, deriveCapabilities, parsedPageCount, parseQuality } from "./source-capabilities";
import {
  anchorInUnit,
  buildSourceContext,
  quoteAnchor,
  readableUnits,
  resolveQuote,
  sectionOf,
} from "./source-context";

function block(over: Partial<DocBlock>): DocBlock {
  return { headingPath: [], id: "b", kind: "paragraph", text: "text", unit: 0, ...over } as DocBlock;
}

function model(blocks: DocBlock[], units = 1): DocumentModel {
  return {
    blocks,
    format: "pdf",
    title: "A document",
    units: Array.from({ length: units }, (_, index) => ({ index, kind: "page" as const })),
  };
}

/** A row exactly as production stores it: an envelope, round-tripped through JSON. */
const stored = (m?: DocumentModel, text = "Some words.") =>
  JSON.parse(JSON.stringify(structureEnvelope({ model: m, text, title: "A document" })));

/**
 * The production corpus's REAL measured shape, as of 2026-08-11.
 *
 * 🔴 THESE NUMBERS COME FROM THE DATABASE, NOT FROM IMAGINATION — 165 paragraphs each carrying a
 * heading path and a rect, 29 headings of which only 2 carry a path, 3 figures, 26 pages, and no
 * tables at all. They are reproduced here so the derivation is pinned to a document that actually
 * exists. See scripts/source-context-acceptance.mts, which runs the same code against the live
 * rows.
 */
function productionShapedModel(): DocumentModel {
  const blocks: DocBlock[] = [];
  for (let i = 0; i < 165; i += 1) {
    blocks.push(block({
      headingPath: ["A section"],
      id: `p${i}`,
      rect: { height: 0.02, width: 0.8, x: 0.1, y: 0.1 },
      text: `paragraph ${i}`,
      unit: i % 26,
    } as Partial<DocBlock>));
  }
  for (let i = 0; i < 29; i += 1) {
    blocks.push(block({
      // Only 2 of 29 headings carry a path — measured, and the reason the next test exists.
      headingPath: i < 2 ? ["A section"] : [],
      id: `h${i}`,
      kind: "heading",
      rect: { height: 0.03, width: 0.8, x: 0.1, y: 0.05 },
      text: `heading ${i}`,
      unit: i % 26,
    } as Partial<DocBlock>));
  }
  for (let i = 0; i < 3; i += 1) {
    blocks.push(block({ headingPath: ["A section"], id: `f${i}`, kind: "figure", text: "", unit: i } as Partial<DocBlock>));
  }
  return { blocks, format: "pdf", title: "A document", units: Array.from({ length: 26 }, (_, index) => ({ index, kind: "page" as const })) };
}

test("🔴 the real structured production document yields the capabilities it actually has", () => {
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "pdf", structure: stored(productionShapedModel()) });
  assert.equal(context.quality, "full");
  assert.deepEqual(context.capabilities, {
    figures: true,
    geometry: true,
    headings: true,
    hierarchy: true,
    pageAnchors: true,
    semanticUnits: true,
    tables: false, // 🔴 NOT A GAP IN THE CODE — there is no table anywhere in the corpus.
    text: true,
  });
  // The 3 figures carry no text, so they are not readable units — 194 of 197, which is exactly
  // what the acceptance script reports against the live row.
  assert.equal(readableUnits(context).length, 194);
});

test("🔴 headings:true is NOT hierarchy:true, and the real document is why", () => {
  // On the live row, 29 blocks are headings but only 2 carry a heading path. The hierarchy is
  // supplied by the 165 PARAGRAPHS. Derive one flag from the other and a caller gets told a
  // document has section containment when its headings are a flat list of bold lines.
  const headingsOnly = model([
    block({ id: "h1", kind: "heading", text: "Looks like a heading" }),
    block({ id: "h2", kind: "heading", text: "So does this" }),
    block({ id: "p1", text: "And this belongs to nothing." }),
  ]);
  const capabilities = deriveCapabilities(headingsOnly);
  assert.equal(capabilities.headings, true);
  assert.equal(capabilities.hierarchy, false);
});

test("🔴 a legacy flat row still produces a usable context, and never invents a page", () => {
  // Six of these exist in production. A citation reading "page 3" because a number was plausible
  // is worse than one saying only "this sentence, in this source": the second is checkable.
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "pdf", structure: stored(undefined, "Exam 1 is soon.") });
  assert.equal(context.units.length, 1);
  assert.equal(context.units[0]!.type, "text");
  assert.equal(context.units[0]!.anchor.page, undefined);
  assert.equal(context.units[0]!.anchor.headingPath, undefined);
  assert.equal(context.capabilities.text, true);
  assert.equal(context.capabilities.semanticUnits, false);
  assert.equal(anchorInUnit(context.units[0]!, "Exam 1").page, undefined);
});

test("🔴 capabilities describe what SURVIVED persistence, not what a parser produced", () => {
  // A parser that builds headings in memory and a serializer that drops them must report
  // hierarchy:false — downstream cannot use what is no longer stored.
  const rich = model([
    block({ id: "h", kind: "heading", text: "Section One" }),
    block({ headingPath: ["Section One"], id: "p", text: "Body." }),
  ]);
  assert.equal(deriveCapabilities(rich).hierarchy, true, "in memory");
  assert.equal(capabilitiesOfStored(stored(undefined)).hierarchy, false, "after a serializer dropped it");
});

test("🔴 unit_count must never imply structure", () => {
  // Production held rows with unit_count 24 whose entire structure was one flat string.
  const manyPagesNoStructure = { ...stored(undefined), unit_count: 24 };
  const capabilities = capabilitiesOfStored(manyPagesNoStructure);
  assert.equal(capabilities.semanticUnits, false);
  assert.equal(capabilities.pageAnchors, false, "24 pages read, not one of them citable");
  assert.equal(parsedPageCount({ unit_count: 24 }), 24, "it is a PAGE count and nothing more");
  assert.equal(parsedPageCount({}), 0);
});

test("🔴 the same capability set is healthy for a note and a regression for a PDF", () => {
  const flat = capabilitiesOfStored(stored(undefined));
  assert.equal(parseQuality({ capabilities: flat, sourceKind: "pdf" }), "degraded");
  assert.equal(parseQuality({ capabilities: flat, sourceKind: "txt" }), "full");
  assert.equal(parseQuality({ capabilities: flat, sourceKind: "transcript" }), "full");
  assert.equal(parseQuality({ capabilities: capabilitiesOfStored(null), sourceKind: "txt" }), "failed");
});

test("structure survives the boundary as units, not as one re-flattened string", () => {
  // Repairing the parser and then joining its blocks back into a blob would discard exactly what
  // was fixed — which this codebase has now done at a boundary three times.
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([
      block({ id: "h1", kind: "heading", text: "Assessment", unit: 2 }),
      block({ headingPath: ["Assessment"], id: "p1", text: "Exam 1: September 12, 2026", unit: 2 }),
    ], 3)),
  });
  assert.equal(context.units.length, 2);
  const exam = context.units[1]!;
  assert.equal(exam.anchor.page, 3, "0-based in the model, 1-based for a reader");
  assert.equal(sectionOf(exam), "Assessment");
  const anchor = anchorInUnit(exam, "September 12, 2026");
  assert.equal(anchor.quote?.exact, "September 12, 2026");
  assert.equal(anchor.page, 3);
  assert.deepEqual(anchor.headingPath, ["Assessment"]);
});

// ── quote anchors are the bridge across reparses ─────────────────────────────

test("🔴 a quote anchor still resolves after the source is reparsed", () => {
  // The durability property. Six legacy rows will be reparsed into structure eventually, and that
  // renumbers every offset. An object extracted today must not be orphaned by its source getting
  // better.
  const before = "PHYS 201\n\nExam 1: September 12, 2026\nAssignment 3 due September 18";
  const anchor = quoteAnchor(before, "September 12, 2026");
  const afterReparse = "PHYS 201\n\n\nExam 1:  September 12, 2026\n\nAssignment 3 due September 18";
  const at = resolveQuote(afterReparse, anchor);
  assert.ok(at >= 0);
  assert.equal(afterReparse.slice(at, at + 18), "September 12, 2026");
});

test("prefix and suffix pick out the right one of two identical phrases", () => {
  const text = "Exam 1: September 12\nMakeup for September 12 on request";
  const second = quoteAnchor(text, "September 12", text.indexOf("Makeup"));
  assert.equal(resolveQuote(text, second), text.indexOf("September 12", text.indexOf("Makeup")));
});

test("a quote that is genuinely gone reports that rather than guessing", () => {
  assert.equal(resolveQuote("nothing like it", { exact: "September 12" }), -1);
});

test("an unreadable structure column yields no units rather than throwing", () => {
  for (const structure of [null, undefined, {}, "nope", 42]) {
    const context = buildSourceContext({ sourceId: "s1", sourceKind: "pdf", structure });
    assert.deepEqual(context.units, []);
    assert.equal(context.quality, "failed");
  }
});
