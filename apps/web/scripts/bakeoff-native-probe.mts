/**
 * Does the native-text probe actually tell a scan from an ordinary PDF?
 *
 * The Docling lane has no OCR signal of its own, so `doclingCoverage` gets the
 * native/vision split from `probePdfNativeText`. That is only worth wiring if
 * the probe is right about real files, so this runs it over every PDF in the
 * corpus and checks it against the one population where the answer is known
 * from an independent measurement: the files our own parser could barely read
 * and Docling read fully.
 *
 * The scan set is derived HERE, from the two benchmark runs, rather than taken
 * from `corpus.jsonl`'s own `likely_scanned` flag — using that flag to validate
 * a probe and then reporting agreement with it would be circular. The flag is
 * compared against afterwards, and disagreements are printed.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-native-probe.mts <scratchDir> [outJsonl]
 *
 * expects <scratchDir>/{corpus,nemesis_results,docling_results}.jsonl and
 * <scratchDir>/docling_json/.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { adaptDoclingDocument, doclingCoverage } from "../../../packages/shared/src/docling-adapter.ts";
import { nativeTextMap, probePdfNativeText } from "../lib/pdf/native-probe.ts";
import { THIN_PAGE_CHARS } from "../lib/pdf/pages.ts";

const scratch = process.argv[2];
const outPath = process.argv[3] ?? join(scratch ?? ".", "native_probe.jsonl");
if (!scratch) throw new Error("usage: bakeoff-native-probe.mts <scratchDir> [outJsonl]");

const readJsonl = (name: string): Map<string, Record<string, unknown>> => {
  const rows = new Map<string, Record<string, unknown>>();
  for (const line of readFileSync(join(scratch, name), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as Record<string, unknown>;
    rows.set(String(row.file), row);
  }
  return rows;
};

const corpus = readJsonl("corpus.jsonl");
const ours = readJsonl("nemesis_results.jsonl");
const theirs = readJsonl("docling_results.jsonl");

/**
 * A scan, defined from the measurements alone.
 *
 * Two conditions, because either on its own is wrong: a big ratio can just mean
 * Docling reads tables better, and a low character count can just mean a title
 * slide. Both together is a file whose words are only reachable from pixels.
 *
 * The floor is THIN_PAGE_CHARS — the same constant the predicate uses — applied
 * to the file's average page, so the scan set and the probe are not calibrated
 * against two different ideas of "thin".
 */
const SCAN_CHARS_PER_PAGE = THIN_PAGE_CHARS; // our side did not clear the floor
const SCAN_RATIO = 5; // ...and Docling got multiples of it

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const files = [...corpus.entries()].filter(([, row]) => row.ext === "pdf");
const results: Record<string, unknown>[] = [];

for (const [file, row] of files) {
  const ourChars = num(ours.get(file)?.plain_text_chars);
  const theirChars = num(theirs.get(file)?.text_chars);
  const declared = num(row.pages) || 1;
  const perPage = ourChars / declared;
  const ratio = ourChars === 0 ? (theirChars > 0 ? Infinity : 0) : theirChars / ourChars;
  const scanLike = perPage < SCAN_CHARS_PER_PAGE && ratio >= SCAN_RATIO && theirChars > 0;

  let probed: Awaited<ReturnType<typeof probePdfNativeText>> | null = null;
  let error: string | null = null;
  const started = Date.now();
  try {
    // A COPY: pdf.js detaches the buffer it is handed.
    probed = await probePdfNativeText(new Uint8Array(readFileSync(file)));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  const seconds = (Date.now() - started) / 1000;

  // The end-to-end answer: what coverage does the Docling lane report for this
  // file with the probe, and what did it report without it?
  let split: Record<string, unknown> | null = null;
  // Every page the split now calls `vision`, with the two character counts that
  // decide whether that word is certain or merely the best available answer.
  const visionPages: { probe: number; docling: number }[] = [];
  const jsonName = theirs.get(file)?.full_json;
  if (probed && typeof jsonName === "string") {
    const raw = JSON.parse(readFileSync(join(scratch, "docling_json", jsonName), "utf8"));
    const { model, observations } = adaptDoclingDocument(raw, { format: "pdf" });
    const before = doclingCoverage(observations, { format: "pdf", unitsInModel: model.units.length });
    const after = doclingCoverage(observations, {
      format: "pdf",
      unitsInModel: model.units.length,
      nativeText: nativeTextMap(probed),
    });
    split = {
      before: typeof before === "string" ? { error: before } : pick(before),
      after: typeof after === "string" ? { error: after } : pick(after),
    };
    const doclingChars = new Map<number, number>();
    for (const block of model.blocks) {
      doclingChars.set(block.unit, (doclingChars.get(block.unit) ?? 0) + block.text.length);
    }
    for (const page of probed.pages) {
      if (page.native || !(observations.unitIndexesWithContent ?? []).includes(page.index)) continue;
      visionPages.push({ probe: page.chars, docling: doclingChars.get(page.index) ?? 0 });
    }
  }

  results.push({
    name: String(row.name),
    declaredPages: declared,
    probedPages: probed?.pages.length ?? 0,
    probeDeclared: probed?.declaredPages ?? 0,
    pagesNative: probed?.pages.filter((p) => p.native).length ?? 0,
    pagesNoText: probed?.pages.filter((p) => !p.native).length ?? 0,
    // The probe's OWN character count per page, which is not the same measure as
    // `plain_text_chars` in either benchmark run — those come from an assembled
    // model, this is the raw text layer. Kept for the boundary files, where the
    // difference between the two decides the classification.
    probeChars: probed?.pages.slice(0, 12).map((p) => p.chars) ?? [],
    ourChars,
    theirChars,
    ratio: ratio === Infinity ? null : Number(ratio.toFixed(2)),
    charsPerPage: Number(perPage.toFixed(1)),
    scanLike,
    corpusLikelyScanned: row.likely_scanned === true,
    seconds: Number(seconds.toFixed(2)),
    error,
    split,
    visionPages,
  });
}

function pick(coverage: { units: number; unitsNative: number; unitsVision: number; unitsBoth: number; unitsUnread: number; state: string }) {
  return {
    units: coverage.units,
    native: coverage.unitsNative,
    vision: coverage.unitsVision,
    both: coverage.unitsBoth,
    unread: coverage.unitsUnread,
    state: coverage.state,
  };
}

writeFileSync(outPath, results.map((r) => JSON.stringify(r)).join("\n") + "\n");

const scans = results.filter((r) => r.scanLike);
const ordinary = results.filter((r) => !r.scanLike);
const sum = (rows: Record<string, unknown>[], key: string) => rows.reduce((t, r) => t + num(r[key]), 0);
const share = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "n/a");

console.log(`PDFs probed: ${results.length}  errors: ${results.filter((r) => r.error).length}`);
console.log(`probe wall time: ${sum(results, "seconds").toFixed(1)}s over ${sum(results, "probedPages")} pages`);
console.log(
  `\nrule: ours < ${SCAN_CHARS_PER_PAGE} chars/page AND docling/ours >= ${SCAN_RATIO}x  ->  ${scans.length} scans`,
);
// Every file either rule calls a scan, so a disagreement is visible rather than
// filtered out by whichever rule is being defended.
const suspects = results.filter((r) => r.scanLike || r.corpusLikelyScanned);
console.log("\n--- every scan candidate, by both rules (probe result per file) ---");
suspects.forEach((r, i) => {
  const s = r.split as { after?: { native: number; vision: number; unread: number; state: string } } | null;
  console.log(
    `SCAN-${i + 1}  pages=${r.declaredPages} native=${r.pagesNative} noText=${r.pagesNoText}` +
      `  probeChars=[${(r.probeChars as number[]).join(",")}]` +
      `  ours=${r.ourChars} docling=${r.theirChars} ratio=${r.ratio ?? "inf"}` +
      `  ratioRule=${r.scanLike} corpusFlag=${r.corpusLikelyScanned}` +
      (s?.after ? `  coverage(native/vision/unread)=${s.after.native}/${s.after.vision}/${s.after.unread} ${s.after.state}` : ""),
  );
});

const scanPages = sum(scans, "probedPages");
const ordPages = sum(ordinary, "probedPages");
console.log(
  `\nSCANS      pages=${scanPages}  native=${sum(scans, "pagesNative")} (${share(sum(scans, "pagesNative"), scanPages)})` +
    `  noText=${sum(scans, "pagesNoText")} (${share(sum(scans, "pagesNoText"), scanPages)})`,
);
console.log(
  `NON-SCANS  pages=${ordPages}  native=${sum(ordinary, "pagesNative")} (${share(sum(ordinary, "pagesNative"), ordPages)})` +
    `  noText=${sum(ordinary, "pagesNoText")} (${share(sum(ordinary, "pagesNoText"), ordPages)})`,
);

// The false-positive surface: ordinary files the probe still calls mostly
// pictures. Nobody has measured this before, and it is what would make the
// vision column overstate itself on the Docling lane.
const mostlyNoText = ordinary.filter((r) => num(r.probedPages) > 0 && num(r.pagesNoText) / num(r.probedPages) > 0.5);
console.log(`\nnon-scan PDFs the probe calls >50% no-text: ${mostlyNoText.length}`);
for (const r of mostlyNoText) {
  console.log(
    `  pages=${r.probedPages} noText=${r.pagesNoText} ours=${r.ourChars} docling=${r.theirChars} ratio=${r.ratio ?? "inf"}  ${String(r.name).slice(0, 52)}`,
  );
}

const disagree = results.filter((r) => r.scanLike !== r.corpusLikelyScanned);
console.log(`\ndisagreements with corpus.jsonl likely_scanned: ${disagree.length}`);
for (const r of disagree) {
  console.log(
    `  ratioRule=${r.scanLike} corpusFlag=${r.corpusLikelyScanned} pages=${r.declaredPages} native=${r.pagesNative} noText=${r.pagesNoText} ours=${r.ourChars} docling=${r.theirChars}  ${String(r.name).slice(0, 46)}`,
  );
}

// Files where the two lanes now report a different read, which is the whole
// point of the change.
type Split = { before?: { native: number; unread: number }; after?: { native: number; vision: number; unread: number } };
const withSplit = results.filter((r) => (r.split as Split | null)?.after);
const changed = withSplit.filter((r) => {
  const s = r.split as Split;
  return s.before!.native !== s.after!.native;
});
const movedToVision = withSplit.reduce((t, r) => t + (r.split as Split).after!.vision, 0);
const claimedNativeBefore = withSplit.reduce((t, r) => t + (r.split as Split).before!.native, 0);
const claimedNativeAfter = withSplit.reduce((t, r) => t + (r.split as Split).after!.native, 0);
console.log(`\nPDFs whose coverage split CHANGES once the probe is supplied: ${changed.length} of ${withSplit.length}`);
console.log(
  `pages reported native BEFORE: ${claimedNativeBefore}   AFTER: ${claimedNativeAfter}   moved to vision: ${movedToVision}`,
);
// The sum has to still reconcile, or buildCoverage would have refused it.
const unreadBefore = withSplit.reduce((t, r) => t + (r.split as Split).before!.unread, 0);
const unreadAfter = withSplit.reduce((t, r) => t + (r.split as Split).after!.unread, 0);
console.log(`pages reported unread BEFORE: ${unreadBefore}   AFTER: ${unreadAfter}  (must be equal)`);

/**
 * How certain is the word "vision" on each page that moved?
 *
 * A page with NO text layer at all that Docling filled can only have been read
 * from pixels. A page with a thin-but-nonzero text layer is the honest doubt:
 * Docling may have OCR'd it, or may simply have reported the same few words the
 * predicate already judged unusable. Where Docling returned far more text than
 * the layer holds, something looked at the pixels; where it returned about the
 * same, `vision` is the best available answer rather than a certain one.
 */
const allVision = results.flatMap((r) => r.visionPages as { probe: number; docling: number }[]);
const noLayer = allVision.filter((p) => p.probe === 0);
const thinLayer = allVision.filter((p) => p.probe > 0);
const thinRescued = thinLayer.filter((p) => p.docling > p.probe * 2 + 50);
console.log(`\nof ${allVision.length} pages now called vision:`);
console.log(`  ${noLayer.length} had NO text layer at all           -> certainly read from pixels`);
console.log(`  ${thinRescued.length} had a thin layer and Docling returned >2x+50 chars -> pixels almost certainly read`);
console.log(`  ${thinLayer.length - thinRescued.length} had a thin layer and Docling returned about the same -> 'vision' is a label, not a proof`);
