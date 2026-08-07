/**
 * The end-to-end benchmark: original file -> parse -> blocks -> chunks ->
 * retrieval -> citation, both ways, on questions whose answers depend on
 * structure.
 *
 * 🔴 EXTRACTION COUNTS ARE NOT ANSWER QUALITY, AND THIS FILE EXISTS BECAUSE THE
 * BAKE-OFF ONLY MEASURED THE FIRST. "Docling found 349 tables and we found 0" is
 * a fact about parsers. Whether a student asking "what percentage is the final
 * worth?" gets the right number is a fact about the whole pipeline, and a parser
 * can win the first and lose the second — by producing a table nothing chunks
 * atomically, or a locator that points at the wrong page.
 *
 * 🔴 THE RETRIEVAL METRIC IS DELIBERATELY NOT AN EMBEDDING SEARCH, AND THAT IS A
 * DESIGN DECISION RATHER THAN A LIMITATION TO APOLOGISE FOR. Production
 * retrieval is pgvector cosine over `library_chunks`. The embedder is IDENTICAL
 * on both paths, so it cannot discriminate between them: any difference it
 * showed would be noise from where chunk boundaries happened to fall. What
 * differs between parsers is exactly two things, and both are measured here:
 *
 *   1. whether the span that answers the question survives INTACT inside one
 *      chunk, or is split across two so that neither can answer alone
 *   2. whether the chunk that holds it carries a locator that points at the
 *      right page or slide
 *
 * A chunk that fails either of those cannot produce a correct cited answer no
 * matter how good the embedding model is. A chunk that passes both is
 * retrievable by any competent retriever. So this measures the parser's actual
 * contribution to retrieval, and it does so without a network call.
 *
 * 🔴 GROUND TRUTH COMES FROM THE DOCUMENTS, NOT FROM EITHER PARSER. The question
 * file is built by reading the originals. Deriving it from a parser's output
 * would score each parser against its own reading, which is not a comparison.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-answers.mts <allowlist.jsonl> <questions.jsonl> <doclingJsonDir> <out.jsonl>
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import { parseDocument, type ParsedDocument } from "../lib/notebooks/parse-document.ts";
import { buildDoclingParse } from "../lib/notebooks/parse-docling.ts";
import { nativeTextMap, probePdfNativeText } from "../lib/pdf/native-probe.ts";
import { chunkDocument, type DocumentChunk } from "../../../packages/shared/src/document-chunks.ts";
import type { DocumentModel } from "../../../packages/shared/src/document-model.ts";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

interface AllowRow {
  file: string;
  name: string;
  ext: string;
  archetype: string;
  pages?: number;
}

interface Question {
  id: string;
  file: string;
  name: string;
  archetype: string;
  question: string;
  answer: string;
  answer_variants?: string[];
  evidence_quote: string;
  locator?: { unit_kind: string; unit: number };
  structure_dependent?: boolean;
  common_wrong_answer?: string;
  expects_disclosure?: boolean;
  confidence?: string;
}

/**
 * Text as a comparison sees it.
 *
 * 🔴 THE NORMALISATION IS THE MEASUREMENT'S WEAKEST JOINT, so it is deliberately
 * aggressive and identical for both paths. Two parsers reading the same PDF
 * disagree about soft hyphens, ligatures, non-breaking spaces, curly quotes and
 * where a line ends — none of which a student would call a difference. Leaving
 * those in would score typography instead of structure. Applying it to only one
 * path would be the same bug, but invisible.
 */
function normalise(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[­​-‍﻿]/g, "") // soft hyphen, zero-width
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

/** Significant tokens, in order. Short function words are kept — dropping them
 *  would let "step 4" match "step 14" through a looser sieve. */
function tokens(s: string): string[] {
  return normalise(s).split(" ").filter(Boolean);
}

/** Does `haystack` contain every token of `needle`, in order, without gaps that
 *  swallow a whole other sentence? Tolerates a parser's own separators (a table
 *  pipe, a bullet) without tolerating a match assembled from across the page. */
function tokensInOrder(needle: string[], haystack: string[], maxGap = 6): boolean {
  if (needle.length === 0) return false;
  // Try every place the first token appears. A single scan would let one
  // coincidental early token anchor the whole search and then fail, reporting
  // "absent" for evidence that is plainly there a paragraph later.
  for (let start = 0; start < haystack.length; start += 1) {
    if (haystack[start] !== needle[0]) continue;
    let i = 1;
    let at = start;
    for (let h = start + 1; h < haystack.length && i < needle.length; h += 1) {
      if (haystack[h] !== needle[i]) continue;
      // A gap wider than this is a different passage. Without the bound, a
      // match could be assembled from tokens scattered across a whole page,
      // which is not evidence of anything.
      if (h - at - 1 > maxGap) break;
      at = h;
      i += 1;
    }
    if (i >= needle.length) return true;
  }
  return false;
}

type EvidenceMatch = "exact" | "tokens" | "split" | "absent";

interface Located {
  match: EvidenceMatch;
  chunkIndex: number | null;
  /** How many chunks the evidence's tokens are spread over, when not in one. */
  chunksSpanned: number;
  unitStart: number | null;
  unitEnd: number | null;
  unitKind: string | null;
  /** The chunk text, for the blind answering step. Empty when nothing matched. */
  context: string;
}

/**
 * Where the answering evidence ended up.
 *
 * 🔴 "SPLIT" IS A DISTINCT OUTCOME FROM "ABSENT", AND CONFLATING THEM WOULD HIDE
 * THE MOST INTERESTING FAILURE. Text that a parser extracted perfectly but that
 * the chunker then cut in half produces two chunks, neither of which answers the
 * question — a row of numbers in one and its column headers in the other. That
 * retrieves confidently and answers wrongly, which is worse than retrieving
 * nothing, and it is invisible to any character-count comparison.
 */
function locate(quote: string, chunks: readonly DocumentChunk[]): Located {
  const needle = tokens(quote);
  const exactNeedle = normalise(quote);
  const miss: Located = { match: "absent", chunkIndex: null, chunksSpanned: 0, unitStart: null, unitEnd: null, unitKind: null, context: "" };
  if (needle.length === 0) return miss;

  const hit = (chunk: DocumentChunk, match: EvidenceMatch): Located => ({
    match,
    chunkIndex: chunk.index,
    chunksSpanned: 1,
    unitStart: chunk.unitStart,
    unitEnd: chunk.unitEnd,
    unitKind: chunk.unitKind,
    context: chunk.text,
  });

  for (const chunk of chunks) {
    if (normalise(chunk.text).includes(exactNeedle)) return hit(chunk, "exact");
  }
  for (const chunk of chunks) {
    if (tokensInOrder(needle, tokens(chunk.text))) return hit(chunk, "tokens");
  }

  // Not in any one chunk. Is it in the document at all, split across chunks?
  const whole = chunks.map((c) => c.text).join("\n");
  if (tokensInOrder(needle, tokens(whole))) {
    const touched = chunks.filter((c) => needle.some((t) => tokens(c.text).includes(t)));
    return {
      match: "split",
      chunkIndex: touched[0]?.index ?? null,
      chunksSpanned: touched.length,
      unitStart: touched[0]?.unitStart ?? null,
      unitEnd: touched.at(-1)?.unitEnd ?? null,
      unitKind: touched[0]?.unitKind ?? null,
      // The concatenation of the touched chunks, which is what a retriever
      // returning several results would actually hand a model.
      context: touched.map((c) => c.text).join("\n\n"),
    };
  }
  return miss;
}

/** What the model itself contains, so fidelity is reported beside answerability. */
function shapeOf(model: DocumentModel | undefined) {
  const blocks = model?.blocks ?? [];
  const by = (kind: string) => blocks.filter((b) => b.kind === kind);
  const tables = by("table");
  return {
    blocks: blocks.length,
    units: model?.units.length ?? 0,
    headings: by("heading").length,
    listItems: by("listItem").length,
    listMarkers: by("listItem").filter((b) => b.marker).length,
    tables: tables.length,
    tableCells: tables.reduce((n, b) => n + (b.table?.rows.reduce((m, r) => m + r.length, 0) ?? 0), 0),
    tableHeaderRows: tables.reduce((n, b) => n + (b.table?.headerRows ?? 0), 0),
    equations: by("equation").length,
    figures: by("figure").length,
    figuresDescribed: by("figure").filter((b) => b.figure?.description).length,
    withRect: blocks.filter((b) => b.rect).length,
    notes: by("note").length,
  };
}

function coverageOf(parsed: ParsedDocument | null) {
  const c = parsed?.coverage as unknown as Record<string, unknown> | undefined;
  if (!c) return null;
  return {
    state: c.state,
    unitKind: c.unitKind,
    units: c.units,
    unitsNative: c.unitsNative,
    unitsVision: c.unitsVision,
    unitsBoth: c.unitsBoth,
    unitsUnread: c.unitsUnread,
    figures: c.figures,
    truncation: c.truncation,
  };
}

/**
 * Docling's saved conversion for this file, if the bake-off produced one.
 *
 * 🔴 MATCHED ON A NORMALISED PREFIX, AND BOTH HALVES OF THAT ARE LOAD-BEARING.
 * The batch wrote `NNNN_<slug>.json`, the slug dropped whatever characters the
 * filesystem dislikes, AND it truncated the name at 64 characters. An exact
 * comparison therefore finds nothing for every file with a long name — which is
 * most course material, since a syllabus is called things like
 * "Fall-2026-PHCY-2105-01-Interprofessional-Education-and-Clinical-Simulation".
 * The first version of this function did exactly that and reported four files as
 * "no saved docling conversion" when all four had converted successfully. A
 * missing input that looks like a parser failure is the worst kind of bug in a
 * benchmark, because it reads as evidence.
 *
 * Ambiguity is refused rather than resolved: if a truncated stem is a prefix of
 * two different documents, matching either would be a coin toss.
 */
function doclingJsonFor(dir: string, name: string): unknown | null {
  const key = (s: string) => s.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const want = key(name);
  const keyed = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, key: key(f.replace(/^\d+_/, "")) }));
  const exact = keyed.filter((k) => k.key === want);
  const prefixed = exact.length ? exact : keyed.filter((k) => k.key.length >= 24 && want.startsWith(k.key));
  if (prefixed.length !== 1) return null;
  const file = prefixed[0]!.file;
  if (!file) return null;
  try {
    return JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch {
    return null;
  }
}

const rssMb = () => Math.round(process.memoryUsage.rss() / (1024 * 1024));

async function main() {
  const [allowPath, questionsPath, doclingDir, outPath] = process.argv.slice(2);
  if (!allowPath || !questionsPath || !doclingDir || !outPath) {
    console.error("usage: bakeoff-answers.mts <allowlist.jsonl> <questions.jsonl> <doclingJsonDir> <out.jsonl>");
    process.exit(2);
  }
  const readJsonl = <T,>(p: string): T[] =>
    readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as T);

  const allow = readJsonl<AllowRow>(allowPath);
  const questions = readJsonl<Question>(questionsPath);
  writeFileSync(outPath, "");

  const byFile = new Map<string, Question[]>();
  for (const q of questions) {
    if (!byFile.has(q.file)) byFile.set(q.file, []);
    byFile.get(q.file)!.push(q);
  }

  for (const row of allow) {
    const asked = byFile.get(row.file) ?? [];
    if (!existsSync(row.file)) {
      appendFileSync(outPath, JSON.stringify({ kind: "file", name: row.name, error: "missing" }) + "\n");
      continue;
    }
    const bytes = new Uint8Array(readFileSync(row.file));
    const mime = MIME[row.ext] ?? "application/octet-stream";

    // ── Path A: what we ship today ──────────────────────────────────────────
    //
    // 🔴 VISION IS OFF ON BOTH PATHS AND THAT IS A STATED LIMIT, NOT AN
    // OVERSIGHT. No vision key is available here, so no figure on either side is
    // ever described. It keeps the comparison fair — neither path gets to look
    // at a diagram — but it means the `figure` archetype measures whether a
    // diagram is DETECTED and DISCLOSED, never whether it is understood.
    let base: ParsedDocument | null = null;
    let baseMs = 0;
    let basePeak = rssMb();
    let baseError: string | null = null;
    {
      const t0 = Date.now();
      try {
        const outcome = await parseDocument(new Uint8Array(bytes), row.name, mime, { lookAtFigures: false });
        base = outcome.ok ? outcome.document : null;
        if (!outcome.ok) baseError = outcome.reason;
      } catch (caught) {
        baseError = caught instanceof Error ? caught.message : String(caught);
      }
      baseMs = Date.now() - t0;
      basePeak = Math.max(basePeak, rssMb());
    }

    // ── Path B: the routed lane ─────────────────────────────────────────────
    //
    // 🔴 FED FROM SAVED CONVERSIONS, NOT FROM A LIVE SIDECAR. No docling-serve
    // container exists yet, so the JSON here is what Docling produced during the
    // bake-off. That is exactly what the sidecar would return — it is the same
    // export — but it means this run measures the ADAPTER, the coverage builder
    // and the chunker, and measures NOTHING about the HTTP path, queueing or the
    // resume logic. Latency on this path is therefore not comparable.
    //
    // For DOCX and PPTX the routed path IS the built-in parser, because the
    // bake-off gave those formats to us. Reporting them as a separate column
    // would invent a difference that the architecture says does not exist.
    let routed: ParsedDocument | null = base;
    let routedMs = baseMs;
    let routedSame = true;
    let routedError: string | null = null;
    if (row.ext === "pdf") {
      routedSame = false;
      routed = null;
      const raw = doclingJsonFor(doclingDir, row.name);
      if (!raw) {
        routedError = "no saved docling conversion";
      } else {
        const t0 = Date.now();
        try {
          const probe = await probePdfNativeText(new Uint8Array(bytes));
          const outcome = buildDoclingParse({
            document: raw,
            kind: "pdf",
            status: "success",
            title: null,
            nativeText: nativeTextMap(probe),
          });
          if (outcome.ok) routed = outcome.document;
          else routedError = outcome.reason === "unreconciled" ? `unreconciled: ${outcome.detail}` : outcome.reason;
        } catch (caught) {
          routedError = caught instanceof Error ? caught.message : String(caught);
        }
        routedMs = Date.now() - t0;
      }
    }

    const baseChunks = base?.model ? chunkDocument(base.model) : [];
    const routedChunks = routedSame ? baseChunks : routed?.model ? chunkDocument(routed.model) : [];

    appendFileSync(
      outPath,
      JSON.stringify({
        kind: "file",
        name: row.name,
        ext: row.ext,
        archetype: row.archetype,
        bytes: bytes.byteLength,
        routedSame,
        baseline: {
          error: baseError,
          ms: baseMs,
          peakRssMb: basePeak,
          chunks: baseChunks.length,
          oversizedChunks: baseChunks.filter((c) => c.oversized).length,
          chars: base?.text.length ?? 0,
          coverage: coverageOf(base),
          shape: shapeOf(base?.model),
        },
        routed: {
          error: routedError,
          ms: routedMs,
          chunks: routedChunks.length,
          oversizedChunks: routedChunks.filter((c) => c.oversized).length,
          chars: routed?.text.length ?? 0,
          coverage: coverageOf(routed),
          shape: shapeOf(routed?.model),
        },
      }) + "\n",
    );

    for (const q of asked) {
      const a = locate(q.evidence_quote, baseChunks);
      const b = routedSame ? a : locate(q.evidence_quote, routedChunks);
      const cited = (l: typeof a) => {
        if (!q.locator || l.unitStart === null) return null;
        if (q.locator.unit_kind !== l.unitKind) return false;
        // 1-based in the question (a page as printed), 0-based in the model.
        const want = q.locator.unit_kind === "document" ? 0 : q.locator.unit - 1;
        return want >= l.unitStart && want <= l.unitEnd!;
      };
      appendFileSync(
        outPath,
        JSON.stringify({
          kind: "question",
          id: q.id,
          name: q.name,
          archetype: q.archetype,
          structureDependent: q.structure_dependent ?? null,
          expectsDisclosure: q.expects_disclosure ?? false,
          confidence: q.confidence ?? null,
          baseline: { ...a, citationCorrect: cited(a) },
          routed: { ...b, citationCorrect: cited(b) },
        }) + "\n",
      );
    }
    console.log(
      `${row.name.slice(0, 52).padEnd(52)} base=${baseChunks.length}c/${baseMs}ms routed=${routedChunks.length}c q=${asked.length}${routedError ? ` ROUTED_ERR=${routedError.slice(0, 40)}` : ""}`,
    );
  }
  console.log(`\nwrote ${outPath}`);
}

await main();
