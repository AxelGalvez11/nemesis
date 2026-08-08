/**
 * Does the adapter LOSE text, or MOVE it?
 *
 * Docling's raw `texts[]` counts every text item, including the ones that are
 * table cells. The adapter puts cell text into `DocTable.rows`, where it is not
 * `block.text`. So a naive character comparison shows the adapter "losing"
 * ~96k characters on DOCX — which would be a serious defect if it were true and
 * is a bookkeeping artefact if it is not. The difference matters: one is a bug,
 * the other is the grid doing its job.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-textcheck.mts <doclingJsonDir> <docling.jsonl>
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { adaptDoclingDocument } from "../../../packages/shared/src/docling-adapter.ts";
import type { DocFormat } from "../../../packages/shared/src/document-model.ts";

const [dir, doclingJsonl] = process.argv.slice(2);

const meta = new Map<string, Record<string, unknown>>();
for (const line of readFileSync(doclingJsonl, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line) as Record<string, unknown>;
  if (typeof r.full_json === "string") meta.set(r.full_json, r);
}

const totals: Record<string, { raw: number; blocks: number; grids: number; files: number }> = {};

for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
  const source = meta.get(name);
  if (!source || source.ok !== true) continue;
  const ext = String(source.ext ?? "");
  const format: DocFormat = ext === "docx" ? "docx" : ext === "pptx" ? "pptx" : "pdf";

  const raw = JSON.parse(readFileSync(join(dir, name), "utf8")) as { texts?: { text?: string }[] };
  const rawChars = (raw.texts ?? []).reduce((n, t) => n + (t.text ?? "").length, 0);

  const { model } = adaptDoclingDocument(raw, { format });
  const blockChars = model.blocks.reduce((n, b) => n + b.text.length, 0);
  const gridChars = model.blocks.reduce(
    (n, b) => n + (b.table?.rows.reduce((m, row) => m + row.reduce((k, c) => k + c.length, 0), 0) ?? 0),
    0,
  );

  totals[ext] ??= { raw: 0, blocks: 0, grids: 0, files: 0 };
  totals[ext]!.raw += rawChars;
  totals[ext]!.blocks += blockChars;
  totals[ext]!.grids += gridChars;
  totals[ext]!.files += 1;
}

for (const [ext, t] of Object.entries(totals)) {
  const recovered = t.blocks + t.grids;
  const pct = t.raw ? ((recovered / t.raw) * 100).toFixed(1) : "n/a";
  console.log(
    `${ext.padEnd(5)} files=${String(t.files).padStart(4)}  ` +
      `docling raw=${t.raw.toLocaleString().padStart(9)}  ` +
      `adapter blocks=${t.blocks.toLocaleString().padStart(9)}  ` +
      `+grids=${t.grids.toLocaleString().padStart(8)}  ` +
      `= ${recovered.toLocaleString().padStart(9)} (${pct}% of raw)`,
  );
}
