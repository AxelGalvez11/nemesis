/**
 * The CLI ParseBench's Nemesis provider shells out to.
 *
 * 🔴 IT CALLS `parseDocument`, THE PRODUCTION ENTRY POINT — not a benchmark
 * parser, and not `readPdfStructure` directly. The upload route and the document
 * worker both go through `parseDocument`, so this measures the lane a student's
 * file actually travels. The only thing after it is `toParseBench`, which renames
 * facts and computes nothing.
 *
 * 🔴 THE VISION LANE'S STATE IS REPORTED, NEVER ASSUMED. `parseDocument` falls
 * back to a vision model for pages with no text layer. With no key configured
 * that fallback cannot run, so a scanned page yields nothing — which is a REAL
 * result for the native lane and must be visible in the output rather than
 * discovered later as a mystery. `visionConfigured` travels with every result.
 *
 * 🔴 A CRASH IS NOT AN EMPTY PARSE. The two are reported as different outcomes
 * (`ok: false` with a reason, versus `ok: true` with zero pages) because a
 * benchmark that scores a crash as "extracted nothing" turns a broken parser
 * into a merely bad one, and averages it away.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/parsebench-parse.mts <file.pdf>
 * Prints one JSON object on stdout. Diagnostics go to stderr.
 */

import { readFileSync } from "node:fs";

import { toParseBench } from "../lib/pdf/parsebench-output.ts";
import { parseDocument } from "../lib/notebooks/parse-document.ts";
import { visionConfigured } from "../lib/vision/gemini.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: parsebench-parse.mts <file.pdf>");
  process.exit(2);
}

const started = Date.now();
let bytes: Uint8Array;
try {
  bytes = new Uint8Array(readFileSync(file));
} catch (cause) {
  process.stdout.write(JSON.stringify({
    ok: false,
    reason: "unreadable-file",
    detail: cause instanceof Error ? cause.message.slice(0, 300) : String(cause).slice(0, 300),
  }));
  process.exit(0);
}

try {
  const outcome = await parseDocument(bytes, file.split("/").pop() ?? "document.pdf", "application/pdf");

  if (!outcome.ok) {
    // A verdict about the file, not an exception: "empty" means the parser ran
    // and found nothing readable. Distinct from the catch below.
    process.stdout.write(JSON.stringify({
      ok: true,
      empty: true,
      reason: outcome.reason,
      visionConfigured: visionConfigured(),
      pages: [],
      layout_pages: [],
      markdown: "",
      ms: Date.now() - started,
    }));
    process.exit(0);
  }

  const model = outcome.document.model;
  if (!model) {
    // The structural reader could not open it and the flat fallback produced
    // text. Reported as its own outcome: there are no pages to ground against,
    // and pretending otherwise would silently score a degraded lane as the
    // structural one.
    process.stdout.write(JSON.stringify({
      ok: true,
      structural: false,
      visionConfigured: visionConfigured(),
      pages: [{ page_index: 0, markdown: outcome.document.text }],
      layout_pages: [],
      markdown: outcome.document.text,
      ms: Date.now() - started,
    }));
    process.exit(0);
  }

  const rendered = toParseBench(model);
  process.stdout.write(JSON.stringify({
    ok: true,
    structural: true,
    visionConfigured: visionConfigured(),
    readBy: outcome.document.readBy ?? null,
    coverageState: outcome.document.coverage.state,
    units: model.units.length,
    blocks: model.blocks.length,
    ...rendered,
    ms: Date.now() - started,
  }));
} catch (cause) {
  // 🔴 A CRASH, SAID OUT LOUD. Exit 0 with `ok: false` so the provider can tell
  // this apart from a transport failure and record it as a parser crash.
  process.stdout.write(JSON.stringify({
    ok: false,
    reason: "parser-crash",
    detail: cause instanceof Error ? `${cause.name}: ${cause.message.slice(0, 300)}` : String(cause).slice(0, 300),
    ms: Date.now() - started,
  }));
}
