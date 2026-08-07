/**
 * Phase 1 runtime feasibility spike — can a background worker actually run the
 * parsers we already have, and can it hold a lease while doing it?
 *
 * 🔴 THE QUESTION THAT DECIDES THE ARCHITECTURE. The recording worker is a
 * Supabase Edge Function (Deno). If the document parsers run there too, Phase 1
 * reuses that pattern wholesale. If they do not, the database half of the pattern
 * (lease, backoff, cron) is still right and only the runtime changes — because the
 * one thing we may NOT do is weaken a parser to fit a runtime.
 *
 * WHAT IT MEASURES, and why each one is here rather than assumed:
 *
 *   wall time         the lease TTL has to be longer than this or a healthy
 *                     worker gets its own job stolen mid-parse
 *   peak RSS          Supabase Edge Functions cap memory. A number measured on a
 *                     real 10-13 MB lecture is the only thing that says whether
 *                     the cap is survivable. `process.resourceUsage().maxRSS` is
 *                     used rather than sampling because the sync parsers BLOCK
 *                     the event loop — a sampler cannot observe their peak.
 *   heartbeat gap     🔴 THE LOAD-BEARING ONE. `extractDocxText` and
 *                     `readPptxSlides` are SYNCHRONOUS. A `setInterval` cannot
 *                     fire while they run, so "renew the lease every N seconds"
 *                     is a promise a single-threaded worker may be unable to
 *                     keep. This counts the ticks that actually fired and the
 *                     longest silence, which is the real answer to "can it renew
 *                     its lease while parsing".
 *
 * Run:  pnpm tsx apps/web/scripts/worker-runtime-spike.mts <file> [more files...]
 */

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { extractDocxText, readPptxSlides } from "../lib/notebooks/office";
import { extractPdfText } from "../lib/pdf/extract";

/** How often a real worker would renew its lease. */
const HEARTBEAT_MS = 250;

interface Measurement {
  file: string;
  kind: string;
  bytes: number;
  ms: number;
  units: number;
  textChars: number;
  /** Ticks that fired during the parse. Zero means the lease could not be renewed. */
  beats: number;
  /** Longest silence between ticks. This is the lease TTL floor. */
  maxGapMs: number;
  rssBeforeMb: number;
  rssAfterMb: number;
  peakRssMb: number;
  error?: string;
}

const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;

/**
 * `getrusage` reports ru_maxrss in BYTES on macOS and KILOBYTES on Linux, and
 * Node passes the raw value through. Guessing wrong reports 1000x. Calibrating
 * against a known-good `rss` reading is the only portable way to tell.
 */
function peakRssBytes(current: number): number {
  const raw = process.resourceUsage().maxRSS;
  const asBytes = raw;
  const asKb = raw * 1024;
  // Peak can never be below current. Whichever interpretation satisfies that
  // and stays within an order of magnitude of it is the right one.
  if (asBytes >= current && asBytes < current * 50) return asBytes;
  return asKb;
}

function kindOf(file: string): "pdf" | "docx" | "pptx" | "unknown" {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".pptx") return "pptx";
  return "unknown";
}

async function measure(file: string): Promise<Measurement> {
  const bytes = new Uint8Array(await readFile(file));
  const kind = kindOf(file);

  // Settle the heap before reading a baseline, so the delta is the parse and not
  // whatever the file read left behind.
  if (global.gc) global.gc();
  const rssBefore = process.memoryUsage().rss;

  let beats = 0;
  let maxGapMs = 0;
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    maxGapMs = Math.max(maxGapMs, now - last);
    last = now;
    beats += 1;
  }, HEARTBEAT_MS);

  const started = Date.now();
  let units = 0;
  let textChars = 0;
  let error: string | undefined;

  try {
    if (kind === "pdf") {
      const r = await extractPdfText(bytes);
      units = r.meta.pages;
      textChars = r.text.length;
    } else if (kind === "docx") {
      const r = extractDocxText(bytes);
      units = 1; // the tag strip cannot see page boundaries — reported as one document
      textChars = r.text.length;
    } else if (kind === "pptx") {
      // `slides` is string[] — one entry per slide, blanks preserved so slide N
      // stays at index N-1.
      const deck = readPptxSlides(bytes);
      units = deck.slides.length;
      textChars = deck.slides.reduce((n, s) => n + s.length, 0);
    } else {
      error = `unsupported extension: ${extname(file)}`;
    }
  } catch (cause) {
    error = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }

  const ms = Date.now() - started;
  clearInterval(timer);
  // The final gap matters as much as the ones between ticks: a sync parse that
  // ends the run leaves its silence uncounted otherwise.
  maxGapMs = Math.max(maxGapMs, Date.now() - last);

  const rssAfter = process.memoryUsage().rss;
  return {
    beats,
    bytes: bytes.length,
    error,
    file: basename(file),
    kind,
    maxGapMs,
    ms,
    peakRssMb: mb(peakRssBytes(rssAfter)),
    rssAfterMb: mb(rssAfter),
    rssBeforeMb: mb(rssBefore),
    textChars,
    units,
  };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: worker-runtime-spike.mts <file> [more...]");
  process.exit(1);
}

const results: Measurement[] = [];
for (const f of files) results.push(await measure(f));

console.log("\n=== runtime feasibility ===");
for (const r of results) {
  console.log(
    [
      r.kind.padEnd(5),
      `${mb(r.bytes)} MB`.padStart(9),
      `${r.ms} ms`.padStart(10),
      `${r.units} units`.padStart(11),
      `${r.textChars} chars`.padStart(14),
      `beats=${r.beats}`.padStart(10),
      `maxGap=${r.maxGapMs}ms`.padStart(16),
      `peakRSS=${r.peakRssMb}MB`.padStart(18),
      r.error ? `ERROR ${r.error}` : "",
      r.file,
    ].join("  "),
  );
}
console.log(`\nheartbeat interval ${HEARTBEAT_MS}ms — maxGap is the lease-renewal floor`);
console.log(JSON.stringify(results, null, 2));
