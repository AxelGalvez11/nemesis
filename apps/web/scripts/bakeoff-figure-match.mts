/**
 * Does geometry actually join Docling's figures to our pixels? Measure it.
 *
 * 🔴 THIS SCRIPT EXISTS TO MAKE ONE CONSTANT HONEST. `MIN_CONTAINMENT` in
 * `lib/pdf/figure-match.ts` decides which Docling picture gets which decoded
 * image, and a threshold set by taste is a threshold that can quietly hand a
 * vision model the wrong picture. A wrong description is worse than a missing
 * one, because nothing downstream can tell it is wrong — the model will write a
 * confident paragraph about an image that belongs to a different figure.
 *
 * For every PDF with a saved DoclingDocument, this adapts the Docling JSON into
 * our canonical model, reads the SAME pdf with `readPdfStructure` and figure
 * capture on, and scores every Docling figure against our figures on the same
 * page. One JSONL row per Docling figure, so every number in the report can be
 * re-derived without re-running the corpus.
 *
 * THREE THINGS PRODUCE "MASS AT ZERO" AND ONLY ONE OF THEM IS A REAL FINDING,
 * so all three are measured separately rather than left to blur together:
 *   - a coordinate-frame bug (checked with a vertical-flip control and a
 *     per-file page-aspect comparison),
 *   - a page our reader never read (`MAX_UNITS_PER_PARSE` truncation), and
 *   - genuine disagreement about where the figures are.
 *
 * It also records `sourceArea / targetArea` for every pairing, because
 * `containment` normalises by the SMALLER rectangle and is therefore scale
 * blind: a tiny icon drawn inside a large Docling picture box scores a perfect
 * 1.0. If that is common, no threshold fixes it and the honest answer is that
 * the metric needs a second guard, not a different number.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-figure-match.mts <doclingJsonDir> <docling_results.jsonl> <outPrefix>
 *
 * Writes <outPrefix>.jsonl (per figure), <outPrefix>-files.jsonl (per file),
 * and <outPrefix>-summary.json (the distribution).
 *
 * There is a second mode, because an aggregate cannot show you a SWAP — a
 * document where every figure is confidently paired with its neighbour's image
 * scores identically to one where every pairing is right:
 *   npx tsx scripts/bakeoff-figure-match.mts --inspect <doclingJson> <file.pdf> [unit]
 * prints both rect sets on a page, the full containment matrix, and the pairing
 * greedy actually chose, so it can be checked by eye.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { adaptDoclingDocument } from "../../../packages/shared/src/docling-adapter.ts";
import type { DocRect, DocumentModel } from "../../../packages/shared/src/document-model.ts";
import { containment, matchFigureImages } from "../lib/pdf/figure-match.ts";
import { WORTH_LOOKING_AREA } from "../lib/pdf/figure-routing.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";

/** Thresholds scored side by side. The winner has to beat its neighbours. */
const CANDIDATE_THRESHOLDS = [0.25, 0.4, 0.5, 0.6, 0.75, 0.9] as const;

/**
 * 🔴 A HUNG FILE MUST NOT COST THE CORPUS. One real PDF stalls `readPdfStructure`
 * forever — the process sat at 0% CPU on it, awaiting a promise pdf.js never
 * settles — and without this the run stops at that file with no result and no
 * error. Timing out records the refusal as a fact and moves on, which is the
 * difference between "163 measured, 1 unreadable" and "133 measured, unknown".
 */
const PER_FILE_TIMEOUT_MS = 90_000;

function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout after ${PER_FILE_TIMEOUT_MS}ms: ${label}`)), PER_FILE_TIMEOUT_MS);
      // Unref so a pending timer cannot hold the process open at the end.
      timer.unref?.();
    }),
  ]);
}

interface Placed {
  key: string;
  ref: string;
  unit: number;
  rect: DocRect;
  area: number;
}

function placed(model: DocumentModel): Placed[] {
  const out: Placed[] = [];
  for (const block of model.blocks) {
    if (block.kind !== "figure") continue;
    const ref = block.figure?.ref;
    if (!ref || !block.rect) continue;
    out.push({
      area: block.rect.width * block.rect.height,
      key: `${block.unit}:${ref}`,
      rect: block.rect,
      ref,
      unit: block.unit,
    });
  }
  return out;
}

/** The control for an origin bug: same rect, mirrored about the page's middle. */
function flipY(rect: DocRect): DocRect {
  return { ...rect, y: 1 - rect.y - rect.height };
}

function round(value: number, places = 4): number {
  return Number(value.toFixed(places));
}

/** Print one page's two rect sets and the pairing, for checking by eye. */
async function inspect(jsonPath: string, pdfPath: string, onlyUnit?: number): Promise<void> {
  const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
  const { model: target } = adaptDoclingDocument(raw, { format: "pdf" });
  const { model: source, figureImages } = await readPdfStructure(new Uint8Array(readFileSync(pdfPath)), {
    captureFigures: true,
  });
  const targets = placed(target);
  const sources = placed(source);
  const chosen = matchFigureImages(target, source, figureImages);

  const units = onlyUnit === undefined ? [...new Set(targets.map((t) => t.unit))] : [onlyUnit];
  const box = (r: DocRect) =>
    `x${(r.x * 100).toFixed(1)} y${(r.y * 100).toFixed(1)} w${(r.width * 100).toFixed(1)} h${(r.height * 100).toFixed(1)}`;

  for (const unit of units) {
    const ts = targets.filter((t) => t.unit === unit);
    const ss = sources.filter((s) => s.unit === unit);
    // Only pages that can actually go wrong: one figure has nothing to swap with.
    if (onlyUnit === undefined && (ts.length < 2 || ss.length < 2)) continue;
    console.log(`\n=== ${basename(pdfPath)} page ${unit + 1} — ${ts.length} docling, ${ss.length} ours`);
    for (const t of ts) console.log(`  docling ${t.ref.padEnd(16)} ${box(t.rect)}  area ${(t.area * 100).toFixed(1)}%`);
    for (const s of ss) {
      const px = figureImages.has(s.key) ? "PIXELS" : "  --  ";
      console.log(`  ours    ${s.ref.padEnd(16)} ${box(s.rect)}  area ${(s.area * 100).toFixed(1)}%  ${px}`);
    }
    console.log("  containment matrix (docling row x ours column):");
    console.log(`    ${"".padEnd(16)}${ss.map((s) => s.ref.slice(-10).padStart(11)).join("")}`);
    for (const t of ts) {
      const row = ss.map((s) => containment(t.rect, s.rect).toFixed(2).padStart(11)).join("");
      console.log(`    ${t.ref.slice(-14).padEnd(16)}${row}`);
    }
    for (const t of ts) {
      const got = chosen.images.get(t.key);
      const which = got ? [...figureImages.entries()].find(([, v]) => v === got)?.[0] : undefined;
      console.log(`    PAIRED ${t.ref} -> ${which ?? "(nothing)"}`);
    }
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === "--inspect") {
    const [jsonPath, pdfPath, unit] = process.argv.slice(3);
    if (!jsonPath || !pdfPath) throw new Error("usage: --inspect <doclingJson> <file.pdf> [unit]");
    await inspect(jsonPath, pdfPath, unit === undefined ? undefined : Number(unit));
    return;
  }

  const [dir, doclingJsonl, outPrefix] = process.argv.slice(2);
  if (!dir || !doclingJsonl || !outPrefix) {
    throw new Error("usage: bakeoff-figure-match.mts <jsonDir> <docling.jsonl> <outPrefix>");
  }

  const rows: Record<string, unknown>[] = [];
  for (const line of readFileSync(doclingJsonl, "utf8").split("\n")) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as Record<string, unknown>);
  }
  const pdfs = rows.filter(
    (r) => typeof r.full_json === "string" && String(r.ext ?? "").toLowerCase() === "pdf",
  );

  const figuresPath = `${outPrefix}.jsonl`;
  const filesPath = `${outPrefix}-files.jsonl`;

  // Resume rather than restart: a corpus pass costs half an hour, and the whole
  // reason for the timeout above is that it can be interrupted. Files already
  // recorded are skipped and both outputs are appended to.
  const alreadyDone = new Set<string>();
  if (existsSync(filesPath)) {
    for (const line of readFileSync(filesPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      alreadyDone.add(String((JSON.parse(line) as { file?: string }).file ?? ""));
    }
  } else {
    writeFileSync(filesPath, "");
    writeFileSync(figuresPath, "");
  }
  process.stderr.write(
    `[match] ${pdfs.length} PDFs with a saved DoclingDocument (${alreadyDone.size} already done)\n`,
  );

  let done = 0;
  for (const row of pdfs) {
    const file = String(row.file);
    if (alreadyDone.has(file)) continue;
    const jsonName = String(row.full_json);
    const fileRec: Record<string, unknown> = { file, json: jsonName, name: String(row.name ?? "") };

    try {
      const raw = JSON.parse(readFileSync(join(dir, jsonName), "utf8")) as Record<string, unknown>;

      // 🔴 MAPPING IS VERIFIED, NOT ASSUMED. The `NNNN_` prefix is corpus order;
      // the only claim worth trusting is Docling's own record of what it opened.
      const origin = (raw.origin ?? {}) as { filename?: string };
      fileRec.origin_filename = origin.filename ?? null;
      fileRec.mapping_ok = origin.filename === basename(file);

      const { model: target } = adaptDoclingDocument(raw, {
        format: "pdf",
        status: (row.status as string) ?? undefined,
      });
      const bytes = new Uint8Array(readFileSync(file));
      // maxCaptured left at its production default: the "gets pixels" numbers
      // have to describe the run we would actually ship, cap included.
      const { model: source, figureImages } = await withTimeout(
        readPdfStructure(bytes, { captureFigures: true }),
        basename(file),
      );

      const targets = placed(target);
      const sources = placed(source);
      const sourcesByUnit = new Map<number, Placed[]>();
      for (const s of sources) {
        const list = sourcesByUnit.get(s.unit) ?? [];
        list.push(s);
        sourcesByUnit.set(s.unit, list);
      }

      // Page geometry agreement. A rotated page read one way by pdf.js and
      // another by Docling would mis-score every figure on it, and it should
      // surface as a named file rather than diffuse into the aggregate.
      const doclingPages = (raw.pages ?? {}) as Record<
        string,
        { size?: { width?: number; height?: number } }
      >;
      let aspectMismatch = 0;
      for (const [key, page] of Object.entries(doclingPages)) {
        const w = page?.size?.width;
        const h = page?.size?.height;
        const ours = source.units[Number(key) - 1]?.size;
        if (!w || !h || !ours?.width || !ours?.height) continue;
        const a = w / h;
        const b = ours.width / ours.height;
        if (Math.abs(a - b) / Math.max(a, b) > 0.02) aspectMismatch += 1;
      }
      fileRec.pages_aspect_mismatch = aspectMismatch;
      fileRec.units_docling = Object.keys(doclingPages).length;
      fileRec.units_ours = source.units.length;
      fileRec.target_figures = target.blocks.filter((b) => b.kind === "figure").length;
      fileRec.target_placed = targets.length;
      fileRec.source_figures = source.blocks.filter((b) => b.kind === "figure").length;
      fileRec.source_captured = figureImages.size;

      // The best partner for each target, plus everything needed to tell a real
      // miss from an artefact of the frame.
      const bestByTarget = new Map<number, { score: number; source: Placed | null }>();
      for (let t = 0; t < targets.length; t += 1) {
        const tgt = targets[t]!;
        const candidates = sourcesByUnit.get(tgt.unit) ?? [];
        let best = 0;
        let bestSource: Placed | null = null;
        let second = 0;
        let bestFlipped = 0;
        const flipped = flipY(tgt.rect);
        for (const cand of candidates) {
          const score = containment(tgt.rect, cand.rect);
          if (score > best) {
            second = best;
            best = score;
            bestSource = cand;
          } else if (score > second) {
            second = score;
          }
          const scoreFlipped = containment(flipped, cand.rect);
          if (scoreFlipped > bestFlipped) bestFlipped = scoreFlipped;
        }
        bestByTarget.set(t, { score: best, source: bestSource });

        const capturedOnUnit = candidates.filter((c) => figureImages.has(c.key)).length;
        appendFileSync(
          figuresPath,
          `${JSON.stringify({
            area: round(tgt.area),
            best: round(best),
            best_area_ratio: bestSource ? round(bestSource.area / Math.max(tgt.area, 1e-9), 3) : null,
            best_flipped: round(bestFlipped),
            best_has_pixels: bestSource ? figureImages.has(bestSource.key) : false,
            best_ref: bestSource?.ref ?? null,
            file,
            name: String(row.name ?? ""),
            ref: tgt.ref,
            second: round(second),
            source_captured_on_unit: capturedOnUnit,
            source_figures_on_unit: candidates.length,
            unit: tgt.unit,
            // A page past our reader's cap was never opened. Counting its
            // figures as "geometry failed" would blame the wrong thing.
            unit_readable: tgt.unit < source.units.length,
            worth_looking: tgt.area >= WORTH_LOOKING_AREA,
          })}\n`,
        );
      }

      // Contested pages: two Docling figures whose best partner is the same
      // image. This is where a low threshold can put the wrong pixels somewhere.
      const claimCount = new Map<string, number>();
      for (const [, best] of bestByTarget) {
        if (!best.source || best.score <= 0) continue;
        claimCount.set(best.source.key, (claimCount.get(best.source.key) ?? 0) + 1);
      }
      fileRec.contested_sources = [...claimCount.values()].filter((n) => n > 1).length;

      // Run the real matcher at each candidate threshold, so the reported
      // pairing counts come from the shipped function and not a re-implementation.
      fileRec.thresholds = Object.fromEntries(
        CANDIDATE_THRESHOLDS.map((threshold) => {
          const { report } = matchFigureImages(target, source, figureImages, {
            minContainment: threshold,
          });
          return [String(threshold), report];
        }),
      );
      fileRec.ok = true;
    } catch (err) {
      fileRec.ok = false;
      fileRec.error = String(err instanceof Error ? `${err.name}: ${err.message}` : err).slice(0, 300);
    }

    appendFileSync(filesPath, `${JSON.stringify(fileRec)}\n`);
    done += 1;
    if (done % 20 === 0) process.stderr.write(`[match] ${done}/${pdfs.length}\n`);
  }

  writeFileSync(
    `${outPrefix}-summary.json`,
    `${JSON.stringify({ files: pdfs.length, figuresPath, filesPath, thresholds: CANDIDATE_THRESHOLDS }, null, 2)}\n`,
  );
  process.stderr.write(`[match] done ${done} this pass, ${pdfs.length} total\n`);
}

await main();
// A timed-out pdf.js parse leaves its promise pending forever, and node would
// wait on it rather than exit. The results are already on disk by here.
process.exit(0);
