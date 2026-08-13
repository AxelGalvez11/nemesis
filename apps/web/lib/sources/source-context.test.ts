import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCoverage, buildDocument, structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { capabilitiesOfStored, deriveCapabilities, parsedPageCount, parseQuality } from "./source-capabilities";
import {
  anchorInUnit,
  buildSourceContext,
  cellAtRef,
  sourceContextFromModel,
  unitContent,
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
    // Follows `tables`: with no table there is no cell model, and that is UNKNOWN
    // rather than "this document has no merged cells".
    mergedCells: false,
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

// ── PARSER-001: content integrity crosses the boundary as a value ──────────
//
// 🔴 THE ACTUAL BOUNDARY. `SourceContext.quality` is derived from `structure`
// alone; `contentIntegrity` is the field that also needs `coverage`, a
// DIFFERENT stored column `buildSourceContext` did not receive before this.
// Every test below builds `coverage` the way `buildCoverage` actually
// produces it and round-trips it through JSON, the way `canvas-sources.ts`'s
// Supabase select hands the raw jsonb column to this function — a
// hand-assembled `ExtractionCoverage` object would not exercise the same
// `readCoverage` parse that a real stored row goes through.

/** A coverage record exactly as `parsed_documents.coverage` stores it. */
function storedCoverage(input: Parameters<typeof buildCoverage>[0]): unknown {
  const built = buildCoverage(input);
  if (typeof built === "string") throw new Error(`test fixture coverage does not add up: ${built}`);
  return JSON.parse(JSON.stringify(built));
}

test("no coverage column selected yields 'unknown', never a guessed-healthy verdict", () => {
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "pdf", structure: stored(model([block({ id: "p1" })])) });
  assert.equal(context.contentIntegrity, "unknown");
});

test("a clean parse with real text and nothing lost is 'intact'", () => {
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({ id: "p1", text: "Ordinary prose." })])),
    coverage: storedCoverage({ unitKind: "page", units: 1, unitsNative: 1 }),
  });
  assert.equal(context.contentIntegrity, "intact");
});

test("🔴 unreadableRegions makes an otherwise-fine parse 'lossy' — the fragment-table case", () => {
  // The shape Brain measured: a workbook read fine (text exists, units resolve) but
  // a region the parser saw could not be turned into content. The text that DID
  // come through may be a fragment, not a sentence — "we could not reliably read
  // this" must stay visible even though `capabilities.text` is true.
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "xlsx",
    structure: stored(model([block({ id: "p1", text: "31" })])),
    coverage: storedCoverage({
      unitKind: "sheet",
      units: 1,
      unitsNative: 1,
      unreadableKinds: [{ count: 1, kind: "unsupported-number-format" }],
    }),
  });
  assert.equal(context.contentIntegrity, "lossy");
});

test("an unread unit makes the parse 'lossy', but an unexamined figure does NOT", () => {
  // The exact exclusion `parseQuality` already documents and this function must
  // repeat: a figure nobody looked at does not corrupt the TEXT next to it.
  const lossy = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({ id: "p1", text: "Some of it." })])),
    coverage: storedCoverage({ unitKind: "page", units: 2, unitsNative: 1, unitsUnread: 1 }),
  });
  assert.equal(lossy.contentIntegrity, "lossy");

  const figureOnly = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({ id: "p1", text: "Complete prose." })])),
    coverage: storedCoverage({
      unitKind: "page",
      units: 1,
      unitsNative: 1,
      figures: { described: 0, found: 3, reasons: { "not-examined": 3 }, skipped: 3 },
    }),
  });
  assert.equal(figureOnly.contentIntegrity, "intact", "an undescribed figure does not make the surrounding text unreliable");

  // The exclusion is total, not just the one reason exercised above — the
  // function never reads `coverage.figures` at all, whatever the reason says.
  const everyReason = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({ id: "p1", text: "Complete prose." })])),
    coverage: storedCoverage({
      unitKind: "page",
      units: 1,
      unitsNative: 1,
      figures: {
        described: 0,
        found: 4,
        reasons: { "over-cap": 1, "unreadable-format": 1, "vision-unavailable": 1, "examined-empty": 1 },
        skipped: 4,
      },
    }),
  });
  assert.equal(everyReason.contentIntegrity, "intact", "no figure-loss reason downgrades this verdict, only region/unit/truncation loss does");
});

test("a page read by vision instead of its text layer is not treated as loss", () => {
  // unitsVision/unitsBoth mean the text was recovered by a different method, not
  // that it is incomplete. Only unitsUnread (nothing came back either way) counts.
  const visionRead = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({ id: "p1", text: "What vision read off the scan." })])),
    coverage: storedCoverage({ unitKind: "page", units: 3, unitsBoth: 1, unitsNative: 1, unitsVision: 1 }),
  });
  assert.equal(visionRead.contentIntegrity, "intact");
});

test("no text at all is 'unreadable', regardless of what coverage says", () => {
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(undefined, ""),
    coverage: storedCoverage({ unitKind: "page", units: 3, unitsNative: 0, unitsUnread: 3 }),
  });
  assert.equal(context.contentIntegrity, "unreadable");
});

test("text cut at extraction is 'lossy' even with every unit accounted for", () => {
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({ id: "p1", text: "What made it through." })])),
    coverage: storedCoverage({
      unitKind: "page",
      units: 1,
      unitsNative: 1,
      truncation: [{ dropped: 500, kept: 1000, limit: 1000, stage: "extract" }],
    }),
  });
  assert.equal(context.contentIntegrity, "lossy");
});

test("the in-memory fallback path never claims 'intact' — it has no coverage to check", () => {
  // 🔴 `sourceContextFromModel` exists for a model that has not been written yet, so
  // there is no `parsed_documents.coverage` row to read. Landing on "intact" here
  // would be exactly the collapse Brain warned about: "we have not checked" must
  // not read the same as "we checked and it's fine".
  const context = sourceContextFromModel({ sourceId: "s1", sourceKind: "pdf", model: model([block({ id: "p1", text: "Prose." })]) });
  assert.equal(context.contentIntegrity, "unknown");

  const empty = sourceContextFromModel({ sourceId: "s1", sourceKind: "pdf", model: model([block({ id: "p1", text: "" })]) });
  assert.equal(empty.contentIntegrity, "unreadable", "no text is knowable without coverage at all");
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

// ── tables survive the boundary ─────────────────────────────────────────────
//
// 🔴 THE DEFECT THESE PIN. Every canonical table builder in the codebase — pdf/structure.ts,
// pptx-model.ts, docx-model.ts, docling-adapter.ts — writes `text: ""` on a table block, because
// the grid is the content and `blockToText` renders it from `block.table`. This boundary copied
// `block.text` verbatim, so every table arrived with empty text and `readableUnits` dropped it
// entirely. Not flattened — INVISIBLE. Restore the old `text: block.text` line and both of these
// fail, which is the only reason to trust them.

const KEY_TERMS: string[][] = [
  ["Term", "Definition"],
  ["Photosynthesis", "Conversion of light energy into chemical energy."],
  ["Chlorophyll", "Pigment that absorbs light."],
];

function tableModel(): DocumentModel {
  return model([
    block({ headingPath: [], id: "h1", kind: "heading", text: "Key Terms" }),
    block({
      headingPath: ["Key Terms"],
      id: "t1",
      kind: "table",
      table: { headerRows: 1, rows: KEY_TERMS },
      // As production stores it. A table's text is empty; the grid is the content.
      text: "",
    } as Partial<DocBlock>),
  ]);
}

test("a table reaches an extractor as a readable unit rather than vanishing", () => {
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "pdf", structure: stored(tableModel()) });
  const tables = readableUnits(context).filter((unit) => unit.type === "table");
  assert.equal(tables.length, 1, "the table must survive readableUnits()");
  assert.match(tables[0]!.text ?? "", /Photosynthesis/);
});

test("a table keeps its cells, not just a rendering of them", () => {
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "pdf", structure: stored(tableModel()) });
  const table = context.units.find((unit) => unit.type === "table");
  // 🔴 The rows are what an association extractor reads. A markdown rendering it would have to
  // re-split on pipe characters is the flattening this boundary exists to prevent.
  assert.deepEqual(table?.table?.rows, KEY_TERMS);
  assert.equal(table?.table?.headerRows, 1);
});

test("a figure nobody examined is not turned into citable evidence", () => {
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({ id: "f1", kind: "figure", text: "" } as Partial<DocBlock>)])),
  });
  // "[Figure — not examined]" is OUR disclosure, not the document's content.
  assert.deepEqual(readableUnits(context), []);
});

test("a figure's caption and what a model said about it stay distinguishable", () => {
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({
      figure: { description: "The curve flattens." },
      id: "f1",
      kind: "figure",
      text: "Figure 1 - rate against intensity",
    } as Partial<DocBlock>)])),
  });
  const figure = readableUnits(context).find((unit) => unit.type === "figure");
  assert.match(figure?.text ?? "", /Figure 1 - rate against intensity/);
  assert.match(figure?.text ?? "", /The curve flattens\./);
});

// ── unitContent: the one question a semantic consumer asks ──────────────────

test("a table's content is its cells, and asking for it never requires knowing that", () => {
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "pdf", structure: stored(tableModel()) });
  const unit = context.units.find((u) => u.type === "table")!;
  const content = unitContent(unit);
  assert.equal(content.kind, "table");
  if (content.kind !== "table") return;
  assert.deepEqual(content.rows, KEY_TERMS);
  assert.match(content.rendered, /Photosynthesis/);
});

/**
 * 🔴 A GRID WITHOUT ITS ORIGIN IS ADDRESSABLE ONLY BY ACCIDENT.
 *
 * This boundary copies `DocTable` field by field so that layout — rectangles, cell
 * spans — cannot silently start being reasoned about downstream. That rule was
 * right, and it also dropped the one field a spreadsheet citation cannot work
 * without: a sheet whose data begins at C5 has that cell at `rows[0][0]`, so a
 * consumer resolving "E7" against a grid it believes starts at A1 reads two
 * columns and four rows away — or, as here, off the end of a four-row grid and
 * finds nothing at all. Nothing throws either way.
 *
 * Written against a grid that does NOT start at A1, because one that does passes
 * whether the field crosses or not.
 */
test("🔴 a grid that does not start at A1 arrives knowing where it starts", () => {
  const offset = model([
    block({
      headingPath: [],
      id: "t1",
      kind: "table",
      table: { headerRows: 1, origin: { column: 2, row: 4 }, rows: KEY_TERMS },
      text: "",
    } as Partial<DocBlock>),
  ]);
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "xlsx", structure: stored(offset) });
  const unit = context.units.find((u) => u.type === "table")!;
  assert.deepEqual(unit.table?.origin, { column: 2, row: 4 });

  // What the origin is FOR, asked through the accessor rather than by arithmetic in
  // the caller — which is the whole point of the accessor existing.
  assert.equal(cellAtRef(unit, "C5"), KEY_TERMS[0]![0], "the top-left cell is C5, not A1");
  assert.equal(cellAtRef(unit, "D6"), KEY_TERMS[1]![1], "and the offset holds one row and column over");
  assert.equal(cellAtRef(unit, "A1"), null, "A1 is not a cell of this table at all");
  assert.equal(cellAtRef(unit, "ZZ99"), null, "nor is anything past the used range");
  assert.equal(cellAtRef(unit, "not a ref"), null);
});

test("a grid that DOES start at A1 is addressed the same way", () => {
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "pdf", structure: stored(tableModel()) });
  const unit = context.units.find((u) => u.type === "table")!;
  assert.equal(unit.table?.origin, undefined, "absent when there is nothing to correct");
  assert.equal(cellAtRef(unit, "A1"), KEY_TERMS[0]![0]);
  // 🔴 A unit that is not a table has no cells, and asking must not throw or guess.
  assert.equal(cellAtRef(context.units.find((u) => u.type === "heading")!, "A1"), null);
});

test("a figure's caption and what a model said about it arrive as separate fields", () => {
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({
      figure: { description: "The curve flattens." },
      id: "f1",
      kind: "figure",
      text: "Figure 1",
    } as Partial<DocBlock>)])),
  });
  const content = unitContent(context.units[0]!);
  assert.equal(content.kind, "figure");
  if (content.kind !== "figure") return;
  // 🔴 The document's words and an inference about them must never become one string here.
  assert.equal(content.caption, "Figure 1");
  assert.equal(content.description, "The curve flattens.");
});

test("a figure nobody examined has no content — our disclosure is not the document's", () => {
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([block({ id: "f1", kind: "figure", text: "" } as Partial<DocBlock>)])),
  });
  assert.equal(unitContent(context.units[0]!).kind, "empty");
});

test("🔴 a table is never 'empty', however empty its text field is", () => {
  // The defect this whole accessor exists for. Every canonical table builder writes `text: ""`, so
  // any consumer testing emptiness on that field deletes every grid in the corpus and no test
  // fails. Make `unitContent` fall through to the text branch for tables and this goes red.
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "pdf", structure: stored(tableModel()) });
  const table = context.units.find((u) => u.type === "table")!;
  assert.notEqual(unitContent(table).kind, "empty");
  assert.equal(readableUnits(context).some((u) => u.type === "table"), true);
});

test("prose, headings and equations all read as plain text", () => {
  const context = buildSourceContext({
    sourceId: "s1",
    sourceKind: "pdf",
    structure: stored(model([
      block({ id: "h1", kind: "heading", text: "A heading" }),
      block({ id: "p1", kind: "paragraph", text: "Some prose." }),
      block({ id: "e1", kind: "equation", text: "E = mc^2" } as Partial<DocBlock>),
    ])),
  });
  assert.deepEqual(context.units.map((u) => unitContent(u).kind), ["text", "text", "text"]);
  // 🔴 A heading arrives without markdown, because a "### " prefix would become part of any quote
  // anchor built from it and would then fail to match the source after a reparse.
  const heading = unitContent(context.units[0]!);
  assert.equal(heading.kind === "text" ? heading.text : null, "A heading");
});

test("🔴 mergedCells is a licence to trust a blank cell, derived from stored bytes", () => {
  // Without a cell model, a position that is empty because a neighbour spans it is
  // indistinguishable from one the document genuinely left blank — so "who teaches
  // session 3" reads as unstated when the file says otherwise. Derived from the
  // STORED envelope, like every other capability, because a parser that builds
  // cells and a serializer that drops them must yield false.
  const withCells = capabilitiesOfStored(JSON.parse(JSON.stringify(structureEnvelope({
    model: buildDocument({
      blocks: [{
        headingPath: [],
        kind: "table",
        table: {
          cells: [{ column: 0, row: 0, rowSpan: 2, text: "Dr. Farrar" }, { column: 1, row: 0, text: "A" }, { column: 1, row: 1, text: "B" }],
          headerRows: 0,
          rows: [["Dr. Farrar", "A"], ["", "B"]],
        },
        text: "",
        unit: 0,
      }],
      format: "pdf",
      title: null,
      units: [{ index: 0, kind: "page" }],
    }),
    text: "…",
    title: null,
  }))));
  assert.equal(withCells.tables, true);
  assert.equal(withCells.mergedCells, true);

  const gridOnly = capabilitiesOfStored(JSON.parse(JSON.stringify(structureEnvelope({
    model: buildDocument({
      blocks: [{ headingPath: [], kind: "table", table: { headerRows: 0, rows: [["a", "b"]] }, text: "", unit: 0 }],
      format: "pdf",
      title: null,
      units: [{ index: 0, kind: "page" }],
    }),
    text: "…",
    title: null,
  }))));
  assert.equal(gridOnly.tables, true);
  assert.equal(gridOnly.mergedCells, false, "no cell model means UNKNOWN, not 'no merges'");
});
