/**
 * Which vision lane would production choose for this PDF — and would it call
 * anything at all?
 *
 * 🔴 THIS SPENDS NOTHING AND DECIDES WHETHER THE MINI-TEST SPENDS ANYTHING.
 * `planPdfRead` is the gate in front of every PDF vision call in
 * `parse-document.ts`. It reads per-page text length and returns:
 *
 *   "text"   every page has >= THIN_PAGE_CHARS (120) characters
 *            -> readPdfWithVision / readPdfPagesWithVision are NEVER CALLED
 *   "pages"  some pages are thin  -> vision reads those pages
 *   "whole"  every page is thin   -> vision reads the whole file
 *
 * So the cost projection for a vision arm is not "20 documents times a page
 * price": it is the price of the documents that are not "text". Printing this
 * BEFORE the run is the difference between a projection and a guess.
 *
 * It imports the production functions and calls no network at all.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/vision-route-probe.mts <file.pdf> [...]
 * Prints one JSON object per file on stdout.
 */

import { readFileSync } from "node:fs";

import { extractPdfText } from "../lib/pdf/extract.ts";
import { planPdfRead, thinPages, THIN_PAGE_CHARS } from "../lib/pdf/pages.ts";

for (const file of process.argv.slice(2)) {
  const name = file.split("/").pop() ?? file;
  try {
    // A defensive copy: pdf.js detaches the buffer it is handed.
    const bytes = new Uint8Array(readFileSync(file));
    const read = await extractPdfText(bytes);
    const plan = planPdfRead(read.pageTexts);
    const thin = thinPages(read.pageTexts);
    process.stdout.write(
      JSON.stringify({
        file: name,
        ok: true,
        pages: read.pageTexts.length,
        // The gate's own verdict, not a re-derivation of it.
        plan: plan.kind,
        visionWouldCall: plan.kind !== "text",
        // Pages vision would be asked to read. "whole" sends the file itself.
        pagesVisionWouldRead: plan.kind === "whole" ? read.pageTexts.length : plan.kind === "pages" ? plan.needed.length : 0,
        thinPages: thin.length,
        thinThreshold: THIN_PAGE_CHARS,
        charsPerPage: read.pageTexts.map((t) => t.trim().length),
      }) + "\n",
    );
  } catch (cause) {
    process.stdout.write(
      JSON.stringify({
        file: name,
        ok: false,
        reason: cause instanceof Error ? `${cause.name}: ${cause.message.slice(0, 200)}` : String(cause).slice(0, 200),
      }) + "\n",
    );
  }
}
