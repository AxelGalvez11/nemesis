/**
 * The Nemesis half of the Docling bake-off.
 *
 * Mirrors `scratchpad/docling_batch.py` field-for-field so the two JSONL files
 * can be joined on `file` and differenced. Every number here is MECHANICAL —
 * counts, characters, seconds, bytes. Nothing in this script judges quality,
 * because a judgement we generate about our own output is exactly the kind of
 * evidence `docs/document-benchmark.md` exists to forbid.
 *
 * 🔴 `lookAtFigures` IS FALSE. Figure DETECTION is what we are comparing;
 * figure DESCRIPTION costs money on the one primitive with no entitlement and
 * no cache. Running vision across 398 real files to produce a benchmark column
 * would be the most expensive number in this repo's history.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-nemesis.mts <manifest.txt> <out.jsonl>
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

import { parseDocument } from "../lib/notebooks/parse-document.ts";
// Imported from the module rather than the package index: `@nemesis/shared`
// re-exports with `export *`, and an ambiguous name is silently dropped there.
import { lostFigures } from "../../../packages/shared/src/extraction-coverage.ts";
import type { DocumentModel } from "../../../packages/shared/src/document-model.ts";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Counts drawn from the canonical model, named to match the Docling summary. */
function summarize(model: DocumentModel | undefined) {
  if (!model) return { model_present: false };

  const blocks = model.blocks;
  const by = (kind: string) => blocks.filter((b) => b.kind === kind);
  const headings = by("heading");
  const listItems = by("listItem");
  const tables = by("table");
  const figures = by("figure");

  let tableCells = 0;
  let tableHeaderCells = 0;
  for (const b of tables) {
    const t = b.table;
    if (!t) continue;
    tableCells += t.rows.reduce((n, r) => n + r.length, 0);
    tableHeaderCells += (t.rows[0]?.length ?? 0) * t.headerRows;
  }

  return {
    model_present: true,
    units: model.units.length,
    unit_kinds: [...new Set(model.units.map((u) => u.kind))],
    blocks: blocks.length,
    text_chars: blocks.reduce((n, b) => n + b.text.length, 0),
    labels: Object.fromEntries(
      Object.entries(
        blocks.reduce<Record<string, number>>((acc, b) => {
          acc[b.kind] = (acc[b.kind] ?? 0) + 1;
          return acc;
        }, {}),
      ),
    ),
    headings: headings.length,
    heading_levels: [...new Set(headings.map((b) => b.level).filter((l) => l != null))].sort(),
    list_items: listItems.length,
    // The marker is what makes "1., 2., 3." survive a parse. Counting it
    // separately from the list item is the whole DOCX-numbering question.
    list_markers: listItems.filter((b) => b.marker).length,
    equations: by("equation").length,
    captions: by("caption").length,
    notes: by("note").length,
    tables: tables.length,
    table_cells: tableCells,
    table_header_cells: tableHeaderCells,
    pictures: figures.length,
    // Absent description means NOBODY LOOKED — not "nothing there". Counted
    // separately so the comparison never reads a detection as an examination.
    pictures_described: figures.filter((b) => b.figure?.description).length,
    pictures_with_rect: figures.filter((b) => b.rect).length,
    blocks_with_rect: blocks.filter((b) => b.rect).length,
    heading_path_depth_max: blocks.reduce((n, b) => Math.max(n, b.headingPath.length), 0),
  };
}

async function main(): Promise<void> {
  const manifest = process.argv[2];
  const outPath = process.argv[3];
  if (!manifest || !outPath) throw new Error("usage: bakeoff-nemesis.mts <manifest> <out.jsonl>");

  const files = readFileSync(manifest, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  writeFileSync(outPath, "");
  process.stderr.write(`[nemesis] ${files.length} files\n`);

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]!;
    const name = file.split("/").pop() ?? file;
    const ext = (name.split(".").pop() ?? "").toLowerCase();
    const rec: Record<string, unknown> = { file, name, ext };

    const started = Date.now();
    try {
      const bytes = new Uint8Array(readFileSync(file));
      rec.bytes = bytes.byteLength;
      const outcome = await parseDocument(bytes, name, MIME[ext] ?? "application/octet-stream", {
        lookAtFigures: false,
      });
      rec.seconds = Number(((Date.now() - started) / 1000).toFixed(2));

      if (!outcome.ok) {
        rec.ok = false;
        rec.status = `REFUSED:${outcome.reason}`;
      } else {
        const doc = outcome.document;
        rec.ok = true;
        rec.status = "SUCCESS";
        rec.title = doc.title;
        rec.plain_text_chars = doc.text.length;
        rec.read_by = doc.readBy ?? null;
        rec.skipped_figures = doc.skippedFigures;
        // Coverage is the honesty layer; it travels with every result so a
        // "success" can still be shown to be an incomplete read.
        rec.coverage_state = doc.coverage.state;
        rec.coverage_units = doc.coverage.units;
        rec.coverage_read_natively = doc.coverage.readNatively;
        rec.coverage_lost_figures = doc.coverage.figures ? lostFigures(doc.coverage.figures) : null;
        rec.coverage_figures = doc.coverage.figures ?? null;
        rec.truncated = (doc.coverage.truncation ?? []).length > 0;
        Object.assign(rec, summarize(doc.model));
      }
    } catch (err) {
      rec.seconds = Number(((Date.now() - started) / 1000).toFixed(2));
      rec.ok = false;
      rec.status = "EXCEPTION";
      rec.error = String(err instanceof Error ? `${err.name}: ${err.message}` : err).slice(0, 400);
    }
    rec.peak_rss_mb = Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1));

    appendFileSync(outPath, `${JSON.stringify(rec)}\n`);
    const flag = rec.ok ? "ok" : "FAIL";
    process.stderr.write(
      `[${i + 1}/${files.length}] ${flag} ${String(rec.seconds).padStart(7)}s ` +
        `u=${rec.units ?? "-"} tbl=${rec.tables ?? "-"} pic=${rec.pictures ?? "-"} ` +
        `rss=${rec.peak_rss_mb}MB  ${name.slice(0, 58)}\n`,
    );
  }
  process.stderr.write("[nemesis] done\n");
}

void main();
