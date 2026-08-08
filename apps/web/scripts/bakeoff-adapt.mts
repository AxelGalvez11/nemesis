/**
 * Run the Docling adapter over every saved DoclingDocument and emit the SAME
 * metric shape as `bakeoff-nemesis.mts`.
 *
 * 🔴 THIS IS THE THIRD COLUMN, AND IT EXISTS BECAUSE THE FIRST TWO WOULD LIE
 * TOGETHER. "Docling found 47 tables" and "Nemesis found 0" is not yet an
 * argument for Docling: what matters is how many of those 47 survive the
 * crossing into our model. Scoring Docling's raw output against Nemesis's final
 * output would credit Docling for anything our own adapter then dropped.
 *
 *   docling_results.jsonl  what Docling detected
 *   adapter_results.jsonl  what survived into DocumentModel   <- this file
 *   nemesis_results.jsonl  what we produce today
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-adapt.mts <doclingJsonDir> <docling_results.jsonl> <out.jsonl>
 */
import { readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import { adaptDoclingDocument } from "../../../packages/shared/src/docling-adapter.ts";
import type { DocFormat, DocumentModel } from "../../../packages/shared/src/document-model.ts";

function summarize(model: DocumentModel) {
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
    labels: blocks.reduce<Record<string, number>>((acc, b) => {
      acc[b.kind] = (acc[b.kind] ?? 0) + 1;
      return acc;
    }, {}),
    headings: headings.length,
    heading_levels: [...new Set(headings.map((b) => b.level).filter((l) => l != null))].sort(),
    list_items: listItems.length,
    list_markers: listItems.filter((b) => b.marker).length,
    equations: by("equation").length,
    captions: by("caption").length,
    notes: by("note").length,
    tables: tables.length,
    table_cells: tableCells,
    table_header_cells: tableHeaderCells,
    pictures: figures.length,
    pictures_described: figures.filter((b) => b.figure?.description).length,
    pictures_with_rect: figures.filter((b) => b.rect).length,
    blocks_with_rect: blocks.filter((b) => b.rect).length,
    heading_path_depth_max: blocks.reduce((n, b) => Math.max(n, b.headingPath.length), 0),
  };
}

async function main(): Promise<void> {
  const [dir, doclingJsonl, outPath] = process.argv.slice(2);
  if (!dir || !doclingJsonl || !outPath) throw new Error("usage: <jsonDir> <docling.jsonl> <out.jsonl>");

  // Join on the saved filename so each adaptation keeps its source file's identity.
  const byFullJson = new Map<string, Record<string, unknown>>();
  for (const line of readFileSync(doclingJsonl, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as Record<string, unknown>;
    if (typeof rec.full_json === "string") byFullJson.set(rec.full_json, rec);
  }

  writeFileSync(outPath, "");
  const names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  process.stderr.write(`[adapt] ${names.length} docling outputs\n`);

  let adapted = 0;
  for (const name of names) {
    const source = byFullJson.get(name);
    const file = (source?.file as string) ?? name;
    const ext = ((source?.ext as string) ?? "").toLowerCase();
    const format: DocFormat = ext === "docx" ? "docx" : ext === "pptx" ? "pptx" : "pdf";
    const rec: Record<string, unknown> = { file, name: (source?.name as string) ?? name, ext };

    try {
      const raw = JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown;
      const started = Date.now();
      const { model, observations } = adaptDoclingDocument(raw, {
        format,
        status: (source?.status as string) ?? undefined,
      });
      rec.ok = true;
      rec.adapt_seconds = Number(((Date.now() - started) / 1000).toFixed(3));
      Object.assign(rec, summarize(model));
      rec.obs_unmapped_labels = observations.unmappedLabels;
      rec.obs_dangling_refs = observations.danglingRefs;
      rec.obs_dropped_furniture = observations.droppedFurniture;
      // Where the nodes that did not become blocks went. A retention percentage
      // is only honest next to the receipts for the remainder.
      rec.obs_pictures_dropped_furniture = observations.picturesDroppedAsFurniture;
      rec.obs_pictures_inside_tables = observations.picturesInsideTables;
      rec.obs_list_items_inside_tables = observations.listItemsInsideTables;
      rec.obs_table_captions = observations.tableCaptions;
      rec.obs_table_footnotes = observations.tableFootnotes;
      rec.obs_equations_unreadable = observations.equationsUnreadable;
      rec.obs_dropped_empty_text = observations.droppedEmptyText;
      rec.obs_declared_units = observations.declaredUnits;
      rec.obs_units_with_content = observations.unitsWithContent;
      adapted += 1;
    } catch (err) {
      rec.ok = false;
      rec.error = String(err instanceof Error ? `${err.name}: ${err.message}` : err).slice(0, 300);
    }
    appendFileSync(outPath, `${JSON.stringify(rec)}\n`);
  }
  process.stderr.write(`[adapt] adapted ${adapted}/${names.length}\n`);
}

void main();
