/**
 * What does the production route actually DO, over a corpus nobody in this project chose?
 *
 * 🔴🔴 THIS IS THE MEASUREMENT THE ROUTING DECISIONS DID NOT HAVE. The cheap-first router was
 * calibrated against eight PDF fixtures and eight Office fixtures that this project GENERATED — and
 * a fixture written by the same author as the detector is a test of whether the code does what it
 * was written to do, never a test of whether the world looks like that. 76.9% of the fixtures
 * avoided the paid parser. That number was never evidence about real documents.
 *
 * 🔴 NOTHING HERE SPENDS A PENNY. `vendorAllowed: false` forces the production router down its
 * cheap path and records the reason it WOULD have escalated, so the escalation rate is measured
 * without paying for the escalations. Two consequences worth being explicit about:
 *   - it can be run over hundreds of documents, repeatedly, by anyone, for free;
 *   - it measures what the router DECIDES, not whether the vendor would have done better. That
 *     second question needs vendor keys and the owner's money, and this script deliberately cannot
 *     ask it.
 *
 * 🔴 EXCEPT FOR COLUMN INTERLEAVE, WHICH IS A REAL QUALITY FAILURE VISIBLE WITHOUT A SECOND
 * OPINION. `columnInterleave` reads the parse's own geometry and counts how often the reading order
 * crosses a column gutter. A page read across the gutter has every word and the wrong sequence — a
 * defect the whole count-based apparatus is blind to, and the one piece of genuine quality evidence
 * available here for nothing.
 *
 * Run from apps/web (after scripts/corpus-fetch.mts):
 *   npx tsx scripts/corpus-measure.mts [--dir <path>] [--limit N] [--json out.json]
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

// Imported from the modules rather than the package index, matching the other scripts here:
// tsx runs these directly and the workspace index is not built for them.
import { documentToText } from "../../../packages/shared/src/document-model.ts";

import { kindFor, parseDocument } from "../lib/notebooks/parse-document.ts";
import { columnInterleave } from "../lib/notebooks/parse-fidelity.ts";

/**
 * Where `corpus-fetch.mts` puts the corpus.
 *
 * 🔴 DUPLICATED RATHER THAN IMPORTED, ON PURPOSE. `corpus-fetch.mts` does its work at module
 * scope, so importing it for one string would re-clone four repositories every time this script
 * runs. One shared constant is not worth a side effect that large.
 */
const DEFAULT_CORPUS_DIR = "/workspace/nemesis-corpus";

/** Past this a file is not a lecture, it is a stress test of the machine. */
const MAX_BYTES = 24 * 1024 * 1024;

/** Git LFS leaves a pointer stub where a file should be; it is not a document. */
const LFS_STUB_MAX = 512;

const EXTENSIONS = new Set([".pdf", ".docx", ".pptx", ".xlsx"]);

/** Reasons `preflight.ts` and `office-preflight.ts` emit when they want to spend money. */
const VENDOR_REASONS = new Set([
  "structure-unavailable", "corrupt-text-layer", "glyph-substitution", "table-not-recovered",
  "no-text-layer", "pages-beyond-vision-budget", "speaker-notes", "tables", "figures",
  "nothing-readable",
]);

const MIME: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(name);
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === ".git" || entry === "node_modules") continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(extname(entry).toLowerCase()) && stat.size > LFS_STUB_MAX && stat.size <= MAX_BYTES) {
      out.push(full);
    }
  }
  return out;
}

interface Row {
  readonly file: string;
  readonly source: string;
  readonly kind: string;
  readonly bytes: number;
  readonly ok: boolean;
  readonly reason: string;
  /** The route the production router chose, with spending forbidden. */
  readonly route: "native" | "vendor" | "failed";
  readonly units: number;
  readonly chars: number;
  readonly tables: number;
  readonly figures: number;
  readonly twoColumnUnits: number;
  readonly interleavedUnits: number;
  readonly fullWidthOnTwoColumn: number;
  readonly ms: number;
}

const root = arg("--dir", DEFAULT_CORPUS_DIR);
const limit = Number(arg("--limit", "0")) || Number.POSITIVE_INFINITY;
const jsonOut = arg("--json", "");

const files = walk(root).sort().slice(0, limit === Number.POSITIVE_INFINITY ? undefined : limit);
console.info(`${files.length} documents under ${root}\n`);

const rows: Row[] = [];
for (const [index, file] of files.entries()) {
  const rel = relative(root, file);
  const source = rel.split("/")[0] ?? "?";
  const extension = extname(file).toLowerCase();
  const bytes = readFileSync(file);
  const started = Date.now();

  let row: Row;
  try {
    const outcome = await parseDocument(new Uint8Array(bytes), file, MIME[extension] ?? "", {
      // 🔴 THE WHOLE POINT. The router runs exactly as it does in production and is refused the
      // money, so it records the escalation it wanted without anyone paying for it.
      vendorAllowed: false,
      lookAtFigures: false,
    });

    if (!outcome.ok) {
      row = {
        bytes: bytes.length, chars: 0, figures: 0, file: rel, fullWidthOnTwoColumn: 0, interleavedUnits: 0,
        kind: kindFor(file, MIME[extension] ?? "") ?? extension.slice(1), ms: Date.now() - started,
        ok: false, reason: outcome.reason, route: "failed", source, tables: 0, twoColumnUnits: 0, units: 0,
      };
    } else {
      const doc = outcome.document;
      const model = doc.model;
      const columns = model ? columnInterleave(model) : null;
      const text = model ? documentToText(model) : doc.text;
      const blocks = model?.blocks ?? [];
      const reason = doc.routeReason ?? "unrecorded";
      row = {
        bytes: bytes.length,
        chars: text.length,
        figures: blocks.filter((b) => b.kind === "figure").length,
        file: rel,
        fullWidthOnTwoColumn: columns?.fullWidthOnTwoColumnUnits ?? 0,
        interleavedUnits: columns?.interleavedUnits ?? 0,
        kind: doc.kind,
        ms: Date.now() - started,
        ok: true,
        reason,
        // With spending forbidden, a recorded vendor reason IS the escalation the router wanted.
        route: VENDOR_REASONS.has(reason) ? "vendor" : "native",
        source,
        tables: blocks.filter((b) => b.kind === "table").length,
        twoColumnUnits: columns?.twoColumnUnits ?? 0,
        units: model?.units.length ?? 0,
      };
    }
  } catch (cause) {
    row = {
      bytes: bytes.length, chars: 0, figures: 0, file: rel, fullWidthOnTwoColumn: 0, interleavedUnits: 0,
      kind: extension.slice(1), ms: Date.now() - started, ok: false,
      reason: cause instanceof Error ? `threw:${cause.message.slice(0, 60)}` : "threw",
      route: "failed", source, tables: 0, twoColumnUnits: 0, units: 0,
    };
  }

  rows.push(row);
  if ((index + 1) % 25 === 0) console.info(`  ${index + 1}/${files.length}`);
}


// ── Report ─────────────────────────────────────────────────────────────────────────────────────

const pct = (n: number, of: number) => (of === 0 ? "—" : `${((n / of) * 100).toFixed(1)}%`);

console.info("\n── Route, by format ──────────────────────────────────────────");
const kinds = [...new Set(rows.map((r) => r.kind))].sort();
console.info("kind      files   native   vendor   failed   native share");
for (const kind of kinds) {
  const of = rows.filter((r) => r.kind === kind);
  const native = of.filter((r) => r.route === "native").length;
  const vendor = of.filter((r) => r.route === "vendor").length;
  const failed = of.filter((r) => r.route === "failed").length;
  console.info(
    `${kind.padEnd(9)} ${String(of.length).padStart(5)} ${String(native).padStart(8)} ${String(vendor).padStart(8)} ${String(failed).padStart(8)}   ${pct(native, of.length - failed)}`,
  );
}
const parsed = rows.filter((r) => r.route !== "failed");
console.info(
  `\nALL       ${String(rows.length).padStart(5)} ${String(rows.filter((r) => r.route === "native").length).padStart(8)} ${String(rows.filter((r) => r.route === "vendor").length).padStart(8)} ${String(rows.filter((r) => r.route === "failed").length).padStart(8)}   ${pct(rows.filter((r) => r.route === "native").length, parsed.length)}`,
);

console.info("\n── Why it would have escalated ───────────────────────────────");
const reasons = new Map<string, number>();
for (const row of rows) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.info(`  ${String(count).padStart(4)}  ${reason}`);
}

console.info("\n── Reading order (needs no vendor, so it is free) ────────────");
// 🔴 BROKEN OUT BY FORMAT, BECAUSE A SLIDE IS NOT A PAGE. Two side-by-side text boxes on a slide
// are a LAYOUT, and no order between them is canonically wrong. Two columns on a printed page have
// exactly one correct reading. Pooling the two would let ordinary deck design inflate a defect rate
// about documents.
for (const kind of kinds) {
  const of = rows.filter((r) => r.kind === kind && r.twoColumnUnits > 0);
  if (of.length === 0) continue;
  const bad = of.filter((r) => r.interleavedUnits > 0);
  const label = kind === "pdf" ? "two-column pages" : "side-by-side units";
  console.info(`  ${kind}: ${of.length} document(s) with ${label}, ${bad.length} read across (${pct(bad.length, of.length)})`);
}
for (const row of rows.filter((r) => r.kind === "pdf" && r.interleavedUnits > 0).slice(0, 15)) {
  console.info(`    ${row.interleavedUnits}/${row.twoColumnUnits} pages  ${row.file}`);
}

// 🔴 THE OTHER HALF OF THE COLUMN STORY, AND THE REPOSITORY'S OWN HISTORY SAYS IT IS THE BIGGER
// HALF. `docs/column-segmentation.md` found that what looked like a reading-order defect was
// overwhelmingly column FUSION — two columns welded into one line before ordering ever ran — and
// records the fix as improving it without eliminating it. A full-width block on a two-column page
// is either a legitimate banner or a weld, and this cannot tell them apart. It is an upper bound.
const fusionSuspects = rows.filter((r) => r.kind === "pdf" && r.fullWidthOnTwoColumn > 0);
const totalFullWidth = fusionSuspects.reduce((sum, r) => sum + r.fullWidthOnTwoColumn, 0);
console.info(`\n  full-width blocks on two-column PDF pages: ${totalFullWidth} across ${fusionSuspects.length} document(s)`);
console.info("  (an UPPER BOUND on column fusion — a banner title is legitimately this wide)");

console.info("\n── Speed ────────────────────────────────────────────────────");
const times = parsed.map((r) => r.ms).sort((a, b) => a - b);
const at = (q: number) => times[Math.min(times.length - 1, Math.floor(times.length * q))] ?? 0;
console.info(`  median ${at(0.5)} ms · p90 ${at(0.9)} ms · slowest ${at(1)} ms`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ generatedFrom: root, rows }, null, 2));
  console.info(`\nrows written to ${jsonOut}`);
}
