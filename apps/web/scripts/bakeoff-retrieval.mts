/**
 * Retrieval PROXY, and a clean speed measurement.
 *
 * 🔴 THIS IS A PROXY AND THE WORD IS LOAD-BEARING. Real retrieval quality needs
 * embeddings and a live index, and `20260807030000_source_chunk_retrieval` is
 * NOT APPLIED — `match_document_chunks` does not exist in production and the
 * source index has never run. Embedding 345 files to produce a benchmark column
 * would also start real spend on the one primitive with no entitlement and no
 * cache. So what is measured here is what retrieval is BUILT FROM: how the two
 * models chunk, and whether a chunk can say where it came from.
 *
 * A chunk that knows its heading path retrieves with context. A chunk whose
 * blocks carry geometry can be cited down to a region rather than a whole page.
 * Neither is retrieval quality; both are prerequisites for it, and unlike
 * retrieval quality they can be measured without a model's opinion.
 *
 * Speed here IS clean: one file at a time, one parser at a time, nothing else
 * running. The bulk-run timings are contended and must not be quoted.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-retrieval.mts <manifest> <doclingJsonDir> <docling.jsonl> <out.jsonl>
 */
import { readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import { parseDocument } from "../lib/notebooks/parse-document.ts";
import { adaptDoclingDocument } from "../../../packages/shared/src/docling-adapter.ts";
import { chunkDocument } from "../../../packages/shared/src/document-chunks.ts";
import type { DocFormat, DocumentModel } from "../../../packages/shared/src/document-model.ts";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function chunkStats(model: DocumentModel) {
  const chunks = chunkDocument(model);
  const rectBlocks = new Set(model.blocks.filter((b) => b.rect).map((b) => b.id));
  return {
    chunks: chunks.length,
    chunk_chars: chunks.reduce((n, c) => n + c.text.length, 0),
    // A chunk that knows its section retrieves with context instead of floating.
    chunks_with_heading: chunks.filter((c) => c.headingPath.length > 0).length,
    // A chunk that can point INSIDE a unit supports a region citation, not just
    // "somewhere on page 7".
    chunks_with_geometry: chunks.filter((c) => c.blockIds.some((id) => rectBlocks.has(id))).length,
    chunks_oversized: chunks.filter((c) => c.oversized).length,
    chunks_spanning_units: chunks.filter((c) => c.unitEnd > c.unitStart).length,
  };
}

async function main(): Promise<void> {
  const [manifest, jsonDir, doclingJsonl, outPath] = process.argv.slice(2);
  if (!manifest || !jsonDir || !doclingJsonl || !outPath) {
    throw new Error("usage: <manifest> <jsonDir> <docling.jsonl> <out.jsonl>");
  }

  const doclingByFile = new Map<string, Record<string, unknown>>();
  for (const line of readFileSync(doclingJsonl, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Record<string, unknown>;
    doclingByFile.set(String(r.file), r);
  }
  const available = new Set(readdirSync(jsonDir));

  const files = readFileSync(manifest, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  writeFileSync(outPath, "");
  process.stderr.write(`[retrieval] ${files.length} files\n`);

  for (const file of files) {
    const name = file.split("/").pop() ?? file;
    const ext = (name.split(".").pop() ?? "").toLowerCase();
    const format: DocFormat = ext === "docx" ? "docx" : ext === "pptx" ? "pptx" : "pdf";
    const rec: Record<string, unknown> = { file, name, ext };

    // --- Nemesis, timed cleanly ---
    try {
      const bytes = new Uint8Array(readFileSync(file));
      rec.bytes = bytes.byteLength;
      const t = Date.now();
      const outcome = await parseDocument(bytes, name, MIME[ext] ?? "application/octet-stream", {
        lookAtFigures: false,
      });
      rec.nem_seconds = Number(((Date.now() - t) / 1000).toFixed(3));
      if (outcome.ok && outcome.document.model) {
        const s = chunkStats(outcome.document.model);
        for (const [k, v] of Object.entries(s)) rec[`nem_${k}`] = v;
        rec.nem_ok = true;
      } else {
        rec.nem_ok = false;
        rec.nem_note = outcome.ok ? "no structural model" : `refused:${outcome.reason}`;
      }
    } catch (err) {
      rec.nem_ok = false;
      rec.nem_note = String(err).slice(0, 160);
    }

    // --- Docling, from the saved conversion (its own clean timing is measured
    //     separately by the Python side; re-converting here would need the
    //     service running and would not be comparable anyway) ---
    const src = doclingByFile.get(file);
    const jsonName = typeof src?.full_json === "string" ? src.full_json : null;
    if (jsonName && available.has(jsonName)) {
      try {
        const raw = JSON.parse(readFileSync(join(jsonDir, jsonName), "utf8")) as unknown;
        const { model } = adaptDoclingDocument(raw, { format, status: String(src?.status ?? "") });
        const s = chunkStats(model);
        for (const [k, v] of Object.entries(s)) rec[`doc_${k}`] = v;
        rec.doc_ok = true;
        rec.doc_seconds = src?.seconds ?? null;
      } catch (err) {
        rec.doc_ok = false;
        rec.doc_note = String(err).slice(0, 160);
      }
    } else {
      rec.doc_ok = false;
      rec.doc_note = "no docling conversion available";
    }

    appendFileSync(outPath, `${JSON.stringify(rec)}\n`);
    process.stderr.write(
      `  ${String(rec.nem_seconds ?? "-").padStart(8)}s nem  ` +
        `chunks ${String(rec.nem_chunks ?? "-").padStart(4)} vs ${String(rec.doc_chunks ?? "-").padStart(4)}  ` +
        `${name.slice(0, 46)}\n`,
    );
  }
  process.stderr.write("[retrieval] done\n");
}

void main();
