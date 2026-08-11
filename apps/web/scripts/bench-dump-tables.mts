/**
 * Dump what the canonical parser does with each PDF, in a form an external
 * benchmark can score — and, just as importantly, WHY it did nothing when it
 * did nothing.
 *
 * 🔴 A BENCHMARK SCORE WITHOUT A FAILURE BREAKDOWN IS THE MISTAKE THIS PROJECT
 * KEEPS MAKING. "Nemesis scored 12%" is unactionable and invites the wrong fix.
 * The three failure modes have completely different answers:
 *
 *   NO REGION PROPOSED   the lattice never saw three coexisting vertical rules,
 *                        so nothing reached the grid builder. On a table drawn
 *                        with horizontal rules only — booktabs, universal in
 *                        scientific publishing — this is expected, and it is a
 *                        SCOPE limit, not a bug.
 *   PROPOSED, REJECTED   a grid was built and the validator refused it. The
 *                        reason is recorded; this is a threshold question.
 *   RECOVERED            a table exists and can be compared cell by cell. Only
 *                        here does an accuracy number mean anything.
 *
 * Emits one JSON line per PDF. Scoring happens in Python against the official
 * GriTS implementation — nothing here computes a metric.
 *
 * Run from apps/web:
 *   npx tsx scripts/bench-dump-tables.mts <pdf-dir> <out.jsonl>
 */

import { readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import { latticeRegions, trimEmptyColumns } from "../lib/pdf/table-lattice.ts";
import { readRulings, reconstructRegion, type PlacedText } from "../lib/pdf/table-grid.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";
import { validateTable } from "../lib/pdf/table-validate.ts";

const [pdfDir, outPath] = process.argv.slice(2);
if (!pdfDir || !outPath) { console.error("usage: bench-dump-tables.mts <pdf-dir> <out.jsonl>"); process.exit(2); }

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
writeFileSync(outPath, "");

const files = readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
let done = 0;

for (const file of files) {
  const path = join(pdfDir, file);
  const bytes = readFileSync(path);
  const record: Record<string, unknown> = { pmc: file.replace(/\.pdf$/i, "") };

  // ── why, per page: proposals, rejections, acceptances ─────────────────────
  const proposals: { page: number; rejected?: string; rows?: number; cols?: number }[] = [];
  let verticalRulePages = 0;
  let pagesWithRules = 0;
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
    const limit = Math.min(doc.numPages, 40);
    for (let n = 1; n <= limit; n += 1) {
      const page = await doc.getPage(n);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: PlacedText[] = [];
        for (const item of content.items) {
          if (!("str" in item) || item.str.length === 0) continue;
          const t = pdfjs.Util.transform(viewport.transform, item.transform);
          const height = Math.hypot(t[2], t[3]) || item.height || 0;
          items.push({
            height,
            text: item.str,
            width: item.width || Math.abs(t[0]) * item.str.length * 0.5,
            x: t[4],
            y: t[5] - height,
          });
        }
        const rulings = await readRulings(pdfjs as never, page as never, viewport);
        if (rulings.length > 0) pagesWithRules += 1;
        if (rulings.some((r) => !r.horizontal)) verticalRulePages += 1;

        for (const region of latticeRegions(rulings)) {
          const built = reconstructRegion(region, rulings, items);
          if (!built) { proposals.push({ page: n, rejected: "no-grid" }); continue; }
          const trimmed = trimEmptyColumns(built.table.rows);
          const verdict = validateTable({
            grid: built.grid,
            inRegion: built.inRegion,
            page: { height: viewport.height, width: viewport.width },
            placed: built.placed,
            region,
            rulings,
            table: { headerRows: 0, rows: trimmed },
          });
          proposals.push(
            verdict.ok
              ? { cols: trimmed[0]?.length ?? 0, page: n, rows: trimmed.length }
              : { page: n, rejected: verdict.reason ?? "unknown" },
          );
        }
      } finally { page.cleanup(); }
    }
    record.pages = limit;
    record.pagesWithAnyRule = pagesWithRules;
    record.pagesWithVerticalRule = verticalRulePages;
    await doc.destroy?.();
  } catch (cause) {
    record.error = String(cause).slice(0, 120);
  }
  record.proposals = proposals;

  // ── the tables the full parser actually emits, for cell-level scoring ─────
  try {
    const { model } = await readPdfStructure(new Uint8Array(readFileSync(path)));
    record.tables = model.blocks
      .filter((b) => b.kind === "table" && b.table)
      .map((b) => ({ columns: b.table!.columns ?? null, rows: b.table!.rows, unit: b.unit }));
  } catch (cause) {
    record.parseError = String(cause).slice(0, 120);
    record.tables = [];
  }

  appendFileSync(outPath, JSON.stringify(record) + "\n");
  done += 1;
  if (done % 25 === 0) console.log(`  … ${done}/${files.length}`);
}

console.log(`dumped ${done} documents to ${outPath}`);
process.exit(0);
