import assert from "node:assert/strict";
import { test } from "node:test";

import type { ParsedDocument } from "@nemesis/shared";

import {
  asParsedDocument,
  docKindFor,
  EMBEDDING_VERSION,
  planWork,
  sha256Hex,
  sourceChunkRows,
  toParseRow,
  type ChunkGeneration,
  type DocChunk,
  type ParseRow,
  type PipelineVersions,
} from "./ingest-plan";

const VERSIONS: PipelineVersions = { parser: "pdf@1", chunker: "chunk@1", embedding: EMBEDDING_VERSION };

const row = (patch: Partial<ParseRow> = {}): ParseRow => ({
  id: "parse-1",
  state: "ready",
  parserVersion: VERSIONS.parser,
  failedStage: null,
  attempts: 0,
  ...patch,
});

const counts = (total: number, embedded: number): ChunkGeneration => ({ total, embedded });

// ─── identity ────────────────────────────────────────────────────────────────

test("sha256Hex matches the published digest for 'abc'", async () => {
  const digest = await sha256Hex(new TextEncoder().encode("abc"));
  assert.equal(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sha256Hex hashes the view, not the buffer behind it", async () => {
  // An upload is routinely a slice of a bigger buffer. Digesting the whole
  // buffer would give the same file two different identities depending on how
  // it was read — the one bug that would break dedupe silently.
  const backing = new Uint8Array([1, 2, 3, 97, 98, 99, 4, 5]);
  const view = backing.subarray(3, 6);
  assert.equal(await sha256Hex(view), await sha256Hex(new TextEncoder().encode("abc")));
});

test("empty input still has an identity", async () => {
  const digest = await sha256Hex(new Uint8Array());
  assert.equal(digest, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

// ─── routing ─────────────────────────────────────────────────────────────────

test("docKindFor reads the extension first", () => {
  assert.equal(docKindFor("Lecture 8.pdf"), "pdf");
  assert.equal(docKindFor("deck.PPTX"), "pptx");
  assert.equal(docKindFor("lease agreement.docx"), "docx");
  assert.equal(docKindFor("Q3 budget.xlsx"), "xlsx");
  assert.equal(docKindFor("scan.HEIC"), "image");
  assert.equal(docKindFor("notes.md"), "text");
  assert.equal(docKindFor("archive.html"), "html");
});

test("docKindFor falls back to MIME when there is no usable extension", () => {
  assert.equal(docKindFor("blob"), null);
  assert.equal(docKindFor("blob", "application/pdf"), "pdf");
  assert.equal(docKindFor("blob", "text/plain; charset=utf-8"), "text");
  assert.equal(docKindFor("blob", "image/avif"), "image");
});

test("docKindFor trusts the extension over a generic MIME", () => {
  // Every browser drop and phone share sheet sends octet-stream for something.
  assert.equal(docKindFor("contract.pdf", "application/octet-stream"), "pdf");
});

test("docKindFor refuses what no parser can read", () => {
  // Legacy binary Office is a different container; audio belongs to
  // transcription, not to this pipeline.
  assert.equal(docKindFor("old deck.ppt"), null);
  assert.equal(docKindFor("thesis.doc"), null);
  assert.equal(docKindFor("lecture.m4a", "audio/mp4"), null);
  assert.equal(docKindFor("mystery"), null);
});

// ─── planWork ────────────────────────────────────────────────────────────────

test("nothing claimed yet needs everything", () => {
  const plan = planWork(null, VERSIONS, counts(0, 0));
  assert.deepEqual(
    [plan.needsParse, plan.needsChunk, plan.needsEmbed, plan.stage],
    [true, true, true, "parse"],
  );
});

test("a different parser build is a different parse", () => {
  const plan = planWork(row({ parserVersion: "pdf@0" }), VERSIONS, counts(12, 12));
  assert.equal(plan.needsParse, true);
  assert.match(plan.reason, /pdf@0/);
});

test("a row stuck in 'parsing' is a crashed run, not a live one", () => {
  const plan = planWork(row({ state: "parsing" }), VERSIONS, counts(0, 0));
  assert.equal(plan.needsParse, true);
});

test("failing at parse re-parses; failing later does not", () => {
  const atParse = planWork(row({ state: "failed", failedStage: "parse" }), VERSIONS, counts(0, 0));
  assert.equal(atParse.needsParse, true);

  // The expensive stage already succeeded. Re-extracting to fix a chunking bug
  // would pay for the parse twice.
  const atChunk = planWork(row({ state: "failed", failedStage: "chunk" }), VERSIONS, counts(0, 0));
  assert.deepEqual([atChunk.needsParse, atChunk.needsChunk, atChunk.stage], [false, true, "chunk"]);

  const atEmbed = planWork(row({ state: "failed", failedStage: "embed" }), VERSIONS, counts(30, 12));
  assert.deepEqual([atEmbed.needsParse, atEmbed.needsChunk, atEmbed.needsEmbed], [false, false, true]);
});

test("a parsed row with no chunks of this generation chunks and embeds", () => {
  const plan = planWork(row({ state: "parsed" }), VERSIONS, counts(0, 0));
  assert.deepEqual([plan.needsParse, plan.needsChunk, plan.needsEmbed], [false, true, true]);
});

test("a half-embedded generation resumes embedding only", () => {
  const plan = planWork(row({ state: "embedding" }), VERSIONS, counts(64, 40));
  assert.deepEqual([plan.needsParse, plan.needsChunk, plan.needsEmbed, plan.stage], [false, false, true, "embed"]);
  assert.match(plan.reason, /40\/64/);
});

test("a complete generation needs nothing", () => {
  const plan = planWork(row(), VERSIONS, counts(64, 64));
  assert.deepEqual([plan.needsParse, plan.needsChunk, plan.needsEmbed, plan.stage], [false, false, false, null]);
});

test("bumping the embedder rebuilds chunk rows but never re-parses", () => {
  // embedding_version is part of a chunk row's identity, so the new generation
  // counts zero — chunking is cheap and deterministic, and the parse survives.
  const plan = planWork(row(), { ...VERSIONS, embedding: "voyage-4@2048" }, counts(0, 0));
  assert.deepEqual([plan.needsParse, plan.needsChunk, plan.needsEmbed], [false, true, true]);
});

// ─── chunk rows ──────────────────────────────────────────────────────────────

const chunk = (text: string, locator: DocChunk["locator"]): DocChunk => ({ text, locator });

test("sourceChunkRows carries every measured position into its own column", () => {
  const rows = sourceChunkRows({
    userId: "user-1",
    parsedDocumentId: "parse-1",
    title: "Mechanics of Materials",
    versions: VERSIONS,
    chunks: [
      chunk("Shear stress rises with...", {
        kind: "page",
        index: 7,
        headingPath: ["Chapter 6", "Torsion"],
      }),
      chunk("Revenue by region", { kind: "sheet", label: "Q3", range: "B14:F21" }),
      chunk("A photographed form", { kind: "document" }),
    ],
  });

  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    user_id: "user-1",
    origin_type: "source",
    parsed_document_id: "parse-1",
    document_id: null,
    path: "",
    title: "Mechanics of Materials",
    chunk_index: 0,
    content: "Shear stress rises with...",
    unit_kind: "page",
    unit_index: 7,
    unit_label: null,
    cell_range: null,
    heading_path: ["Chapter 6", "Torsion"],
    parser_version: "pdf@1",
    chunker_version: "chunk@1",
    embedding_version: EMBEDDING_VERSION,
  });

  assert.equal(rows[1]?.unit_kind, "sheet");
  assert.equal(rows[1]?.unit_label, "Q3");
  assert.equal(rows[1]?.cell_range, "B14:F21");
  assert.equal(rows[1]?.unit_index, null);

  // `document` is the honest unit for a file with no subdivision — no invented
  // page 1, so no invented index.
  assert.equal(rows[2]?.unit_kind, "document");
  assert.equal(rows[2]?.unit_index, null);
  assert.equal(rows[2]?.heading_path, null);
});

test("empty chunks are dropped WITHOUT renumbering the rest", () => {
  const rows = sourceChunkRows({
    userId: "user-1",
    parsedDocumentId: "parse-1",
    title: "",
    versions: VERSIONS,
    chunks: [
      chunk("first", { kind: "slide", index: 1 }),
      chunk("   \n ", { kind: "slide", index: 2 }),
      chunk("third", { kind: "slide", index: 3 }),
    ],
  });
  // The index still points at the chunker's own element 2, so two runs of the
  // same chunker over the same parse produce identical rows.
  assert.deepEqual(rows.map((r) => r.chunk_index), [0, 2]);
  assert.deepEqual(rows.map((r) => r.content), ["first", "third"]);
});

test("the chunker's own chunkIndex wins over the array position", () => {
  // doc-chunk.ts declares chunkIndex DOCUMENT-GLOBAL, and it is part of the chunk
  // row's identity — so it is copied, never recomputed.
  const rows = sourceChunkRows({
    userId: "user-1",
    parsedDocumentId: "parse-1",
    title: "",
    versions: VERSIONS,
    chunks: [
      { text: "a", locator: { kind: "page", index: 1 }, chunkIndex: 40 },
      { text: "b", locator: { kind: "page", index: 1 }, chunkIndex: 41 },
    ],
  });
  assert.deepEqual(rows.map((r) => r.chunk_index), [40, 41]);
});

test("a nonsense chunkIndex falls back to the array position", () => {
  const rows = sourceChunkRows({
    userId: "user-1",
    parsedDocumentId: "parse-1",
    title: "",
    versions: VERSIONS,
    chunks: [
      { text: "a", locator: { kind: "page", index: 1 }, chunkIndex: -1 },
      { text: "b", locator: { kind: "page", index: 1 }, chunkIndex: 1.5 },
    ],
  });
  assert.deepEqual(rows.map((r) => r.chunk_index), [0, 1]);
});

test("blank heading steps never become a heading path", () => {
  const rows = sourceChunkRows({
    userId: "user-1",
    parsedDocumentId: "parse-1",
    title: "",
    versions: VERSIONS,
    chunks: [chunk("body", { kind: "section", headingPath: ["", "  "] })],
  });
  assert.equal(rows[0]?.heading_path, null);
});

// ─── structure round trip ────────────────────────────────────────────────────

const PARSE: ParsedDocument = {
  contentHash: "a".repeat(64),
  kind: "pdf",
  parserVersion: "pdf@1",
  title: "Lecture 8",
  units: [{ locator: { kind: "page", index: 1 }, blocks: [] }],
  tables: [],
  visuals: [],
  coverage: { unitsFound: 1, unitsRead: 1, visualsFound: 0, visualsKept: 0, visualsUnreadable: 0, tablesFound: 0 },
};

test("asParsedDocument accepts a real parse and rejects everything else", () => {
  assert.equal(asParsedDocument(JSON.parse(JSON.stringify(PARSE)))?.title, "Lecture 8");
  assert.equal(asParsedDocument(null), null);
  assert.equal(asParsedDocument({}), null);
  assert.equal(asParsedDocument([PARSE]), null);
  assert.equal(asParsedDocument({ ...PARSE, units: "many" }), null);
  assert.equal(asParsedDocument({ ...PARSE, coverage: null }), null);
});


// ─── reading a row back ──────────────────────────────────────────────────────

test("toParseRow rejects a row it cannot trust and normalises the rest", () => {
  assert.equal(toParseRow(null), null);
  assert.equal(toParseRow({ id: 1, state: "ready", parser_version: "pdf@1" }), null);
  // A state the enum does not know is not a state. Better to refuse the row than
  // to plan work from a value nothing here can reason about.
  assert.equal(toParseRow({ id: "p", state: "elsewhere", parser_version: "pdf@1" }), null);
  assert.deepEqual(toParseRow({ id: "p", state: "failed", parser_version: "pdf@1", failed_stage: "nowhere" }), {
    id: "p",
    state: "failed",
    parserVersion: "pdf@1",
    failedStage: null,
    attempts: 0,
  });
  assert.equal(toParseRow({ id: "p", state: "ready", parser_version: "pdf@1", attempts: 3 })?.attempts, 3);
});
