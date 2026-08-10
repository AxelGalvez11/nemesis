/**
 * Does the table lane help, and does it double-emit?
 *
 * Runs `readPdfStructure` twice on the same file — lane off, lane on — through
 * the REAL parse path, and compares. The load-bearing check is the character
 * count: the text a table consumes is removed from the paragraph flow, so the
 * total should stay in the same neighbourhood. A materially larger document is
 * the signature of the same cells being emitted twice, once as a grid and once
 * as the flattened prose it replaced — and because a table is atomic to the
 * chunker, that duplicate would land in its own chunk that retrieval can still
 * find. Bigger AND worse, silently.
 *
 * Run from apps/web:
 *   DOCLING_LAYOUT_ONNX=/path/model.onnx npx tsx scripts/pdf-tables-check.mts <file.pdf> [page]
 */
import { readFileSync } from "node:fs";

// The workspace alias resolves to built types, which tsx does not run from —
// scripts here import the source directly, as `bakeoff-answers.mts` does.
import { documentToText } from "../../../packages/shared/src/document-model.ts";

import { readPdfStructure } from "../lib/pdf/structure.ts";

const file = process.argv[2]!;
const showPage = Number(process.argv[3] ?? "2");
const bytes = readFileSync(file);

const rssMb = () => Math.round(process.memoryUsage.rss() / 1048576);

async function run(detectTables: boolean) {
  const t0 = Date.now();
  // A fresh copy each time: pdf.js takes ownership of the buffer it is handed.
  const out = await readPdfStructure(new Uint8Array(bytes), { detectTables });
  const ms = Date.now() - t0;
  const kinds: Record<string, number> = {};
  for (const b of out.model.blocks) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
  const text = documentToText(out.model);
  const cells = out.model.blocks
    .filter((b) => b.kind === "table")
    .reduce((n, b) => n + (b.table?.rows.flat().filter((c) => c.trim()).length ?? 0), 0);
  return { cells, kinds, model: out.model, ms, rss: rssMb(), tableRegionsUnread: out.tableRegionsUnread, text };
}

const off = await run(false);
const on = await run(true);

const row = (label: string, a: string | number, b: string | number) =>
  console.log(`  ${label.padEnd(24)} ${String(a).padStart(12)}   ${String(b).padStart(12)}`);

console.log(`\n${file.split("/").pop()}\n`);
console.log(`  ${"".padEnd(24)} ${"lane OFF".padStart(12)}   ${"lane ON".padStart(12)}`);
row("blocks", off.model.blocks.length, on.model.blocks.length);
row("tables", off.kinds.table ?? 0, on.kinds.table ?? 0);
row("filled cells", off.cells, on.cells);
row("paragraphs", off.kinds.paragraph ?? 0, on.kinds.paragraph ?? 0);
row("headings", off.kinds.heading ?? 0, on.kinds.heading ?? 0);
row("characters", off.text.length, on.text.length);
row("regions unread", off.tableRegionsUnread, on.tableRegionsUnread);
row("parse ms", off.ms, on.ms);
row("RSS MB after", off.rss, on.rss);

const growth = off.text.length > 0 ? on.text.length / off.text.length : 0;
console.log(
  `\n  character ratio on/off: ${growth.toFixed(3)}  ` +
  (growth > 1.35 ? "🔴 INFLATED — text is very likely emitted twice" : "OK — no sign of double emission"),
);

const table = on.model.blocks.find((b) => b.kind === "table" && b.unit === showPage - 1);
if (table?.rect) {
  const r = table.rect;
  console.log(
    `\n  page ${showPage} first table rect: ` +
    `x=${r.x.toFixed(3)} y=${r.y.toFixed(3)} w=${r.width.toFixed(3)} h=${r.height.toFixed(3)}`,
  );
  // 🔴 A RECT BUILT FROM RASTER PIXELS INSTEAD OF POINTS SHRINKS BY THE RENDER
  // SCALE — at 200 DPI that is 2.78x, so a full-width table would report a
  // width near 0.32 and every citation would point at a sliver of the page.
  const ok = r.width > 0.5 && r.x + r.width <= 1.001 && r.y + r.height <= 1.001;
  console.log(`  ${ok ? "OK" : "🔴 SUSPECT"} — a full-width table should read w>0.5 and stay inside the page`);
}
