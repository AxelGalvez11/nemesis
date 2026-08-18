/**
 * What the PDF router actually measures, on real files, before any threshold is trusted.
 *
 * 🔴 THE OWNER'S INSTRUCTION, RUN RATHER THAN QUOTED: *"Do not invent thresholds before collecting
 * data"* and *"Benchmark before changing production routing."* This script is that benchmark. It
 * takes every PDF it is pointed at through the REAL structural reader — the same
 * `readPdfStructure` production runs, with the same lattice table detection — and prints the
 * signals `preflightPdf` would see plus the verdict it would reach.
 *
 * 🔴 NOTHING HERE CALLS A VENDOR. The whole point is to find out how often we would not have to.
 * Running Mistral across a corpus to produce a comparison column would be the most expensive
 * number in this repository, and the quality comparison that DOES need a vendor is the bounded
 * shadow sample in `parse-shadow.ts`, which runs on a fraction of production traffic instead.
 *
 * Run from apps/web:
 *   npx tsx scripts/preflight-calibrate.mts lib/notebooks/fixtures/preflight lib/notebooks/fixtures
 *   npx tsx scripts/preflight-calibrate.mts <dir…> --jsonl out.jsonl
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

import { preflightPdf, type NativePdfEvidence } from "../lib/pdf/preflight.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";
import { unitTexts } from "../../../packages/shared/src/document-model.ts";

const args = process.argv.slice(2);
const jsonlAt = args.indexOf("--jsonl");
const jsonlPath = jsonlAt >= 0 ? args[jsonlAt + 1] : null;
const dirs = (jsonlAt >= 0 ? args.slice(0, jsonlAt) : args).filter(Boolean);

if (dirs.length === 0) {
  console.error("usage: preflight-calibrate.mts <dir…> [--jsonl out.jsonl]");
  process.exit(2);
}

function pdfsUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...pdfsUnder(path));
      continue;
    }
    if (extname(entry).toLowerCase() === ".pdf") out.push(path);
  }
  return out.sort();
}

const files = dirs.flatMap(pdfsUnder);
const rows: Record<string, unknown>[] = [];

for (const file of files) {
  const bytes = new Uint8Array(readFileSync(file));
  const started = Date.now();

  let evidence: NativePdfEvidence;
  let structureMs = 0;
  try {
    // Identical options to the production native lane, so the signals are the production signals.
    const structural = await readPdfStructure(new Uint8Array(bytes), {
      captureFigures: false,
      detectTables: true,
    });
    structureMs = Date.now() - started;
    evidence = {
      declaredUnits: structural.declaredUnits,
      pageTexts: unitTexts(structural.model),
      structureFailed: false,
      tableRegionsUnreadByUnit: structural.tableRegionsUnreadByUnit,
      tablesRejected: structural.tablesRejected,
      unitsWithContent: [...new Set(structural.model.blocks.map((block) => block.unit))],
      // Calibration measures the ROUTER, not the ledger, so the cheap page lane is assumed able to
      // pay for everything. That is the conservative direction: it can only ever move a document
      // towards `native`, never towards a vendor call this script would then under-report.
      visionAffordablePages: Number.MAX_SAFE_INTEGER,
    };
  } catch (cause) {
    structureMs = Date.now() - started;
    evidence = {
      declaredUnits: 0,
      pageTexts: [],
      structureFailed: true,
      tableRegionsUnreadByUnit: [],
      tablesRejected: {},
      unitsWithContent: [],
      visionAffordablePages: Number.MAX_SAFE_INTEGER,
    };
    console.warn(`  ! ${file}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  const verdict = preflightPdf(evidence);
  rows.push({
    bytes: bytes.byteLength,
    detail: verdict.detail,
    file,
    reason: verdict.reason,
    route: verdict.route,
    structure_ms: structureMs,
    ...verdict.signals,
  });
}

const pad = (value: unknown, width: number) => String(value).padEnd(width);
console.log(
  [pad("file", 46), pad("route", 8), pad("reason", 30), pad("pgs", 5), pad("thin", 5), pad("words", 8), pad("corrupt%", 10), pad("scar%", 8), pad("tblLost", 8)].join(""),
);
for (const row of rows) {
  console.log(
    [
      pad(String(row.file).split("/").slice(-2).join("/"), 46),
      pad(row.route, 8),
      pad(row.reason, 30),
      pad(row.pages, 5),
      pad(row.thinPages, 5),
      pad(row.words, 8),
      pad((Number(row.corruptShare) * 100).toFixed(3), 10),
      pad((Number(row.scarShare) * 100).toFixed(3), 8),
      pad(row.tablesUnread, 8),
    ].join(""),
  );
}

const vendor = rows.filter((row) => row.route === "vendor").length;
console.log(
  `\n${rows.length} file(s): ${rows.length - vendor} native (${(((rows.length - vendor) / Math.max(rows.length, 1)) * 100).toFixed(1)}%), ${vendor} escalated`,
);
const byReason = new Map<string, number>();
for (const row of rows) byReason.set(String(row.reason), (byReason.get(String(row.reason)) ?? 0) + 1);
for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${pad(reason, 32)}${n}`);

// The gap the thresholds sit in, printed rather than asserted, so a person reads it before a
// constant is edited.
const cleanCorrupt = rows.filter((row) => row.route === "native").map((row) => Number(row.corruptShare));
const cleanScar = rows.filter((row) => row.route === "native").map((row) => Number(row.scarShare));
const dirtyScar = rows.filter((row) => row.reason === "glyph-substitution").map((row) => Number(row.scarShare));
console.log(
  `\nnative corrupt share  max ${Math.max(0, ...cleanCorrupt).toFixed(5)}` +
    `\nnative scar share     max ${Math.max(0, ...cleanScar).toFixed(5)}` +
    `\nescalated scar share  min ${dirtyScar.length ? Math.min(...dirtyScar).toFixed(5) : "n/a"}`,
);

if (jsonlPath) {
  writeFileSync(jsonlPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  console.log(`\nwrote ${jsonlPath}`);
}
