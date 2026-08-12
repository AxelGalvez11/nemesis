/**
 * WHERE DOES THE TRUTH DISAPPEAR?
 *
 *   npx tsx scripts/degradation-matrix.mts          (cwd MUST be apps/web)
 *
 * 🔴 CHARACTERIZATION, NOT IMPROVEMENT (owner, 2026-08-12). Nothing here changes
 * a parser. It takes one real file per case through the WHOLE chain and records
 * what is knowable at each boundary:
 *
 *   parser outcome → coverage → canonical model → persisted envelope →
 *   capabilities → source context → what a learning consumer can see
 *
 * and then asks, for every fact the parser knew, whether it still exists at the
 * far end — and if not, WHICH KIND of loss it was. The owner's five classes,
 * because they need different fixes:
 *
 *   never-recovered   the parser never had it. A parser problem.
 *   discarded         recovered, then thrown away before storage. A boundary bug.
 *   hidden            recovered AND persisted, but the consumer's narrower
 *                     representation cannot express it. A boundary DESIGN issue —
 *                     the row is right and the reader is too narrow.
 *   stale-summary     persisted correctly, but a derived/summary column reports
 *                     something else. A field problem.
 *   retained-refusal  explicitly unsupported and correctly carried as such.
 *                     Not a bug at all — the target behaviour.
 *
 * 🔴 EVERY READING COMES FROM THE PERSISTED ENVELOPE, not from the in-memory
 * parse, except where the point is to compare the two. That comparison is the
 * whole instrument: a fact present before the boundary and absent after it is
 * the finding.
 */

import { readFileSync } from "node:fs";

import {
  readDocumentModel,
  structureEnvelope,
  type DocumentModel,
  type ExtractionCoverage,
} from "../../../packages/shared/src/document-envelope.ts";
import { parseDocument } from "../lib/notebooks/parse-document.ts";
import { capabilitiesOfStored, parseQuality, needsVision } from "../lib/sources/source-capabilities.ts";
import { buildSourceContext, readableUnits, unitContent } from "../lib/sources/source-context.ts";

interface Case {
  id: string;
  file: string;
  mime: string;
  /** What a person would say this document is, before any code runs. */
  truth: string;
}

const F = "lib/notebooks/fixtures";
const CASES: Case[] = [
  { file: `${F}/two-column.pdf`, id: "pdf-multicolumn", mime: "application/pdf", truth: "2 columns, 11 lines, all readable" },
  { file: `${F}/text-with-figure.pdf`, id: "pdf-unread-figure", mime: "application/pdf", truth: "6 lines of text + 1 figure nobody described" },
  { file: `${F}/image-only-page.pdf`, id: "pdf-image-only", mime: "application/pdf", truth: "1 scanned page, 1 figure, NO readable text" },
  { file: `${F}/blank-page.pdf`, id: "pdf-blank", mime: "application/pdf", truth: "genuinely nothing" },
  { file: `${F}/xlsx/with-chart.xlsx`, id: "xlsx-chart", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", truth: "a grid + a chart we cannot read" },
  { file: `${F}/csv/ambiguous-no-comma.csv`, id: "csv-ambiguous", mime: "text/csv", truth: "3 rows of text; columns REFUSED" },
  { file: `${F}/csv/ragged.csv`, id: "csv-ragged", mime: "text/csv", truth: "5 rows; row 3 has NO third cell" },
  { file: `${F}/csv/empty.csv`, id: "csv-empty", mime: "text/csv", truth: "genuinely nothing" },
];

/** Everything the far end of the chain can see, derived only from the stored row. */
function atTheFarEnd(structure: unknown, sourceKind: string) {
  const capabilities = capabilitiesOfStored(structure);
  const context = buildSourceContext({ sourceId: "characterize", sourceKind, structure });
  const readable = readableUnits(context);
  const tableUnits = readable.filter((u) => unitContent(u).kind === "table");
  return {
    capabilities,
    contextUnits: context.units.length,
    quality: parseQuality({ capabilities, sourceKind }),
    readable: readable.length,
    tableUnits: tableUnits.length,
    needsVision: needsVision(capabilities),
  };
}

function modelFacts(model: DocumentModel | undefined) {
  if (!model) return null;
  const blocks = model.blocks;
  return {
    blocks: blocks.length,
    cells: blocks.reduce((n, b) => n + (b.table?.cells?.length ?? 0), 0),
    figures: blocks.filter((b) => b.kind === "figure").length,
    tables: blocks.filter((b) => b.kind === "table").length,
    textBearing: blocks.filter((b) => b.text.trim().length > 0).length,
    units: model.units.length,
  };
}

function coverageFacts(coverage: ExtractionCoverage) {
  return {
    figuresFound: coverage.figures.found,
    figuresDescribed: coverage.figures.described,
    figuresSkipped: coverage.figures.skipped,
    reasons: Object.entries(coverage.figures.reasons ?? {}).map(([k, v]) => `${k}:${v}`).join(",") || "—",
    state: coverage.state,
    truncation: coverage.truncation.length,
    units: coverage.units,
    unitsUnread: coverage.unitsUnread,
    unreadableRegions: coverage.unreadableRegions ?? 0,
  };
}

const rows: Record<string, unknown>[] = [];

for (const testCase of CASES) {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(testCase.file));
  } catch {
    console.log(`  ⚠ ${testCase.id}: fixture missing (${testCase.file}) — skipped`);
    continue;
  }

  const outcome = await parseDocument(bytes, testCase.file.split("/").pop()!, testCase.mime);
  const kind = testCase.mime.includes("pdf") ? "pdf" : testCase.mime.includes("spreadsheet") ? "xlsx" : "csv";

  // What the PARSER knew, before anything crossed a boundary.
  const parsed = outcome.ok ? outcome.document : "document" in outcome ? outcome.document : undefined;
  const before = {
    coverage: parsed ? coverageFacts(parsed.coverage) : null,
    model: modelFacts(parsed?.model),
    outcome: outcome.ok ? "ok" : outcome.reason,
    textChars: parsed?.text.trim().length ?? 0,
  };

  // What SURVIVES: the envelope exactly as production writes it, JSON round-tripped.
  const envelope = parsed
    ? JSON.parse(JSON.stringify(structureEnvelope({ model: parsed.model, text: parsed.text, title: parsed.title })))
    : null;
  const decoded = envelope?.model ? readDocumentModel(envelope.model) : null;
  const after = envelope ? atTheFarEnd(envelope, kind) : null;

  rows.push({
    after,
    before,
    decodedModel: modelFacts(decoded ?? undefined),
    envelopeShape: envelope?.shape ?? "—",
    id: testCase.id,
    truth: testCase.truth,
  });
}

// ── report ─────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(112));
console.log("DEGRADATION CHARACTERIZATION — what each boundary still knows");
console.log("═".repeat(112));

for (const row of rows) {
  const b = row.before as ReturnType<typeof Object>;
  const a = row.after as ReturnType<typeof Object> | null;
  const dm = row.decodedModel as ReturnType<typeof modelFacts>;
  console.log(`\n▸ ${row.id}   —   ${row.truth}`);
  console.log(`   PARSER    outcome=${b.outcome}  text=${b.textChars}ch  model=${b.model ? `${b.model.units}u/${b.model.blocks}bl (text-bearing ${b.model.textBearing}, tables ${b.model.tables}, cells ${b.model.cells}, figures ${b.model.figures})` : "none"}`);
  if (b.coverage) {
    const c = b.coverage;
    console.log(`   COVERAGE  state=${c.state}  units=${c.units} unread=${c.unitsUnread}  figures found=${c.figuresFound} described=${c.figuresDescribed} skipped=${c.figuresSkipped} [${c.reasons}]  unreadableRegions=${c.unreadableRegions}  truncation=${c.truncation}`);
  }
  console.log(`   STORED    shape=${row.envelopeShape}  decoded=${dm ? `${dm.units}u/${dm.blocks}bl (tables ${dm.tables}, cells ${dm.cells}, figures ${dm.figures})` : "null"}`);
  if (a) {
    const flags = Object.entries(a.capabilities).filter(([, on]) => on).map(([k]) => k).sort().join(",") || "none";
    console.log(`   CONSUMER  quality=${a.quality}  needsVision=${a.needsVision}  contextUnits=${a.contextUnits} readable=${a.readable} tableUnits=${a.tableUnits}`);
    console.log(`             capabilities: ${flags}`);
  }
}

console.log("\n" + "═".repeat(112));
console.log(`${rows.length} cases characterized`);
