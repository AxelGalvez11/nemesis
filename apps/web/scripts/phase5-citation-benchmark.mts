/**
 * Phase 5: does a citation reopen the right place, and how often does it refuse?
 *
 * 🔴 WHAT THIS MEASURES, AND WHAT IT DOES NOT.
 *
 * It measures the VERIFIER: given a quote that genuinely came from a document,
 * does `citeQuote` return the block it came from? Ground truth is mechanical and
 * therefore trustworthy — a quote is lifted from a known block, so the correct
 * answer is known exactly, with no human labelling and no judgement call.
 *
 * It does NOT measure whether a model cites well. That needs a model in the
 * loop, a corpus of questions, and a judgement about whether cited evidence
 * supports a claim — a separate, paid measurement. Reporting this number as
 * "citation accuracy" would be the designed-versus-proven confusion again, one
 * layer up. The two numbers are not interchangeable and this file only produces
 * the first.
 *
 * Four populations, because they fail differently:
 *
 *   EXACT     a whole block quoted verbatim — the easy case, and the one a
 *             retrieval hit produces
 *   PARTIAL   a sentence from the middle of a block — what a model actually
 *             quotes
 *   SHORT     a quote below MIN_QUOTE_CHARS, which MUST be refused: a short
 *             string matches in many places, which looks exactly like matching
 *             correctly
 *   ABSENT    a plausible sentence that is not in the document at all — the
 *             hallucination case, which MUST be refused
 *
 * Run from apps/web:
 *   npx tsx scripts/phase5-citation-benchmark.mts <dir> [maxFiles]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describeLocator, type DocumentModel } from "../../../packages/shared/src/document-model.ts";
import { citeQuote, MIN_QUOTE_CHARS } from "../../../packages/shared/src/document-citations.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";
import { extractDocxModel } from "../lib/notebooks/office.ts";

function walk(root: string, depth = 0): string[] {
  if (depth > 3) return [];
  let entries: string[] = [];
  try { entries = readdirSync(root); } catch { return []; }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".") || entry.startsWith("~$")) continue;
    const full = join(root, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(full, depth + 1));
    else if (/\.(pdf|docx)$/i.test(entry) && s.size < 60 * 1024 * 1024) out.push(full);
  }
  return out;
}

/** Deterministic sampling: the same corpus must give the same number twice. */
function pick<T>(items: readonly T[], count: number, seed: number): T[] {
  if (items.length <= count) return [...items];
  const step = Math.max(1, Math.floor(items.length / count));
  const out: T[] = [];
  for (let i = seed % step; i < items.length && out.length < count; i += step) out.push(items[i]!);
  return out;
}

const dir = process.argv[2] ?? `${process.env.HOME}/Downloads`;
const files = walk(dir).slice(0, Number(process.argv[3] ?? "200"));

const tally = {
  absent: { refused: 0, total: 0, wrongly_cited: 0 },
  exact: { correct: 0, refused_ambiguous: 0, refused_other: 0, total: 0, wrong_block: 0 },
  partial: { correct: 0, refused_ambiguous: 0, refused_other: 0, total: 0, wrong_block: 0 },
  short: { cited_anyway: 0, refused: 0, total: 0 },
};
let read = 0, failed = 0, withText = 0;
const wrongExamples: string[] = [];

async function modelFor(file: string): Promise<DocumentModel | null> {
  const bytes = new Uint8Array(readFileSync(file));
  if (/\.pdf$/i.test(file)) return (await readPdfStructure(bytes)).model;
  return extractDocxModel(bytes);
}

for (const file of files) {
  try {
    const model = await modelFor(file);
    // Only prose blocks: a figure has no text to quote, and a heading is short
    // enough that quoting it is the SHORT case by construction.
    const quotable = model.blocks.filter(
      (block) => block.kind === "paragraph" && block.text.trim().length >= 80,
    );
    if (quotable.length === 0) continue;
    withText += 1;

    for (const block of pick(quotable, 6, block_seed(file))) {
      const text = block.text.trim();

      // EXACT — the whole block.
      tally.exact.total += 1;
      score(citeQuote(model, text), block.id, tally.exact, file);

      // PARTIAL — a sentence from the middle, which is what a model quotes.
      const mid = text.slice(Math.floor(text.length / 4), Math.floor(text.length / 4) + 90).trim();
      if (mid.length >= MIN_QUOTE_CHARS) {
        tally.partial.total += 1;
        score(citeQuote(model, mid), block.id, tally.partial, file);
      }

      // SHORT — must be refused.
      tally.short.total += 1;
      const short = citeQuote(model, text.slice(0, MIN_QUOTE_CHARS - 4));
      if (short.ok) tally.short.cited_anyway += 1;
      else tally.short.refused += 1;

      // ABSENT — a sentence built to look like the document and not be in it.
      tally.absent.total += 1;
      const absent = citeQuote(
        model,
        `${text.slice(0, 40)} — and this clause was never written in this document at all.`,
      );
      if (absent.ok) tally.absent.wrongly_cited += 1;
      else tally.absent.refused += 1;
    }
    read += 1;
  } catch (error) {
    // 🔴 COUNTED ONLY ON SUCCESS. An earlier version incremented `read` before
    // the work and `failed` in the catch, so a file that threw was reported as
    // both — 200 read and 168 failed out of 200 files, which is how a broken
    // run looked like a partially successful one.
    failed += 1;
    if (failed <= 3) console.log(`  ! ${file.split("/").pop()}: ${(error as Error).message.slice(0, 90)}`);
  }
}

function block_seed(file: string): number {
  let h = 0;
  for (let i = 0; i < file.length; i += 1) h = (Math.imul(31, h) + file.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function score(
  result: ReturnType<typeof citeQuote>,
  expectedBlockId: string,
  bucket: { correct: number; refused_ambiguous: number; refused_other: number; wrong_block: number },
  file: string,
) {
  if (!result.ok) {
    if (result.refusal === "ambiguous") bucket.refused_ambiguous += 1;
    else bucket.refused_other += 1;
    return;
  }
  if (result.locator.blockId === expectedBlockId) {
    bucket.correct += 1;
    return;
  }
  bucket.wrong_block += 1;
  if (wrongExamples.length < 5) {
    wrongExamples.push(
      `${file.split("/").pop()}: expected ${expectedBlockId}, got ${describeLocator(result.locator)}`,
    );
  }
}

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

console.log(`
FILES     ${read} read, ${failed} failed, ${withText} with quotable prose

EXACT     ${tally.exact.total} quotes of a whole block
          ${tally.exact.correct} resolved to the right block  (${pct(tally.exact.correct, tally.exact.total)})
          ${tally.exact.wrong_block} resolved to the WRONG block   <- the number that must be 0
          ${tally.exact.refused_ambiguous} refused as ambiguous, ${tally.exact.refused_other} refused otherwise

PARTIAL   ${tally.partial.total} quotes of a sentence inside a block
          ${tally.partial.correct} resolved to the right block  (${pct(tally.partial.correct, tally.partial.total)})
          ${tally.partial.wrong_block} resolved to the WRONG block   <- must be 0
          ${tally.partial.refused_ambiguous} refused as ambiguous, ${tally.partial.refused_other} refused otherwise

SHORT     ${tally.short.total} quotes below ${MIN_QUOTE_CHARS} characters
          ${tally.short.refused} refused  (${pct(tally.short.refused, tally.short.total)})
          ${tally.short.cited_anyway} cited anyway   <- must be 0

ABSENT    ${tally.absent.total} quotes that are not in the document
          ${tally.absent.refused} refused  (${pct(tally.absent.refused, tally.absent.total)})
          ${tally.absent.wrongly_cited} given a location anyway   <- must be 0
`);

for (const example of wrongExamples) console.log(`  wrong: ${example}`);
