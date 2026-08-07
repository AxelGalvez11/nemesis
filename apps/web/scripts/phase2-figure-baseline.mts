/**
 * Phase 2 baseline: how much of a real course is lost on pages that are too
 * text-rich to be sent to vision.
 *
 * The production rule is `planPdfRead` -> `thinPages`, which routes a page to
 * vision only when it has fewer than THIN_PAGE_CHARS (120) characters of its
 * own. A page with three paragraphs AND a load-bearing diagram is not thin, so
 * it never reaches vision — and `pdfCoverage` has no figure field at all, so the
 * loss is not recorded either. The page is counted as fully read.
 *
 * This measures that class directly, against real files rather than a fixture:
 *
 *   text-rich   page text >= 120 chars  (production would NOT send it to vision)
 *   has figure  the page's operator list draws at least one image XObject
 *
 * The intersection is the defect. Run from apps/web:
 *   npx tsx scripts/phase2-figure-baseline.mts <dir> [maxFiles]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const THIN_PAGE_CHARS = 120;

interface FileResult {
  name: string;
  pages: number;
  thin: number;
  textRich: number;
  textRichWithFigure: number;
  figuresOnTextRichPages: number;
  error?: string;
}

async function main(): Promise<void> {
  const dir = process.argv[2] ?? `${process.env.HOME}/Downloads`;
  const max = Number(process.argv[3] ?? "40");

  // Recursive: the first run of this scanned only the top level and found 13
  // PDFs, while the real course material — the whole point of using real files —
  // sits in per-course subfolders.
  const walk = (root: string, depth = 0): string[] => {
    if (depth > 3) return [];
    let entries: string[] = [];
    try { entries = readdirSync(root); } catch { return []; }
    const out: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const full = join(root, entry);
      let s;
      try { s = statSync(full); } catch { continue; }
      if (s.isDirectory()) out.push(...walk(full, depth + 1));
      else if (entry.toLowerCase().endsWith(".pdf") && s.size < 60 * 1024 * 1024) out.push(full);
    }
    return out;
  };
  const files = walk(dir).slice(0, max);

  // pdf.js exposes the operator list; unpdf (production's extractor) does not,
  // which is precisely why production cannot see these figures.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { OPS } = pdfjs;
  const IMAGE_OPS = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);

  const results: FileResult[] = [];
  for (const file of files) {
    const name = file.split("/").pop() ?? file;
    try {
      const bytes = new Uint8Array(readFileSync(file));
      const doc = await pdfjs.getDocument({ data: bytes, disableFontFace: true }).promise;
      let thin = 0, textRich = 0, textRichWithFigure = 0, figuresOnTextRichPages = 0;

      for (let n = 1; n <= doc.numPages; n += 1) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        // Normalised the same way production normalises, so the threshold means
        // the same thing here as it does in the running code.
        const text = content.items
          .map((i) => ("str" in i ? i.str : ""))
          .join(" ")
          .replace(/[^\S\r\n]+/g, " ")
          .trim();

        const ops = await page.getOperatorList();
        let images = 0;
        for (const fn of ops.fnArray) if (IMAGE_OPS.has(fn)) images += 1;

        if (text.length < THIN_PAGE_CHARS) {
          thin += 1;               // production sends this one to vision
        } else {
          textRich += 1;
          if (images > 0) {
            textRichWithFigure += 1;
            figuresOnTextRichPages += images;
          }
        }
        page.cleanup();
      }
      // Cleanup must not be able to turn a completed measurement into a failure:
      // the first run of this script reported 13 files read AND 13 unreadable,
      // the same 13 twice, because destroy() threw after the result was pushed.
      try { await (doc as { destroy?: () => Promise<void> }).destroy?.(); } catch { /* measured already */ }
      results.push({ figuresOnTextRichPages, name, pages: doc.numPages, textRich, textRichWithFigure, thin });
    } catch (caught) {
      results.push({
        error: (caught as Error)?.message?.slice(0, 80) ?? "unknown",
        figuresOnTextRichPages: 0, name, pages: 0, textRich: 0, textRichWithFigure: 0, thin: 0,
      });
    }
  }

  const ok = results.filter((r) => !r.error);
  const sum = (pick: (r: FileResult) => number) => ok.reduce((t, r) => t + pick(r), 0);
  const pages = sum((r) => r.pages);
  const lost = sum((r) => r.textRichWithFigure);
  const figures = sum((r) => r.figuresOnTextRichPages);

  console.log(`\nfiles read           ${ok.length} of ${results.length}`);
  console.log(`pages                ${pages}`);
  console.log(`thin (vision reads)  ${sum((r) => r.thin)}`);
  console.log(`text-rich            ${sum((r) => r.textRich)}`);
  console.log(`\n🔴 text-rich pages carrying a figure: ${lost}  (${((lost / Math.max(pages, 1)) * 100).toFixed(1)}% of all pages)`);
  console.log(`🔴 figures on those pages:            ${figures}`);
  console.log(`   files with at least one:           ${ok.filter((r) => r.textRichWithFigure > 0).length}`);

  console.log(`\nworst files:`);
  for (const r of [...ok].sort((a, b) => b.textRichWithFigure - a.textRichWithFigure).slice(0, 10)) {
    if (r.textRichWithFigure === 0) break;
    console.log(`  ${String(r.textRichWithFigure).padStart(4)} pages / ${String(r.figuresOnTextRichPages).padStart(5)} figures  ${r.name.slice(0, 62)}`);
  }
  const failed = results.filter((r) => r.error);
  if (failed.length) {
    console.log(`\nunreadable (${failed.length}):`);
    for (const r of failed.slice(0, 5)) console.log(`  ${r.name.slice(0, 50)} — ${r.error}`);
  }
}

await main();
