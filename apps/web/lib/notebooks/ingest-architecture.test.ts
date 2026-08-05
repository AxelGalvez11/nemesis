/**
 * The architectural promises of source indexing, as executable acceptance criteria.
 *
 * These are the owner's thirteen guarantees for `store -> parse -> chunk -> embed`.
 * They are not unit tests of one function; they are statements about how the four
 * layers -- file, parse, chunks, placement -- are allowed to relate:
 *
 *     file       physical identity   = content_hash (sha256 of the bytes)
 *     parse      canonical form      = parsed_documents.id (user, hash, parser_version)
 *     chunks     disposable          = library_chunks (chunker_version, embedding_version)
 *     placement  where it appears    = library_sources.id (folder, title)
 *
 * WHAT IS REALLY UNDER TEST. The pipeline itself: `ingestSource`, `claimParse`,
 * `planWork`, `sourceChunkRows` and `docKindFor`, plus `walkBlocks` and
 * `citeLocator` from the shared document model. Parsers, the chunker and the
 * embedder are supplied as fixtures, because they are seams by design and because
 * these promises are about IDENTITY AND VERSIONING rather than about PDF
 * internals -- those are tested where they are built.
 *
 * The statements run against `ingest-architecture-db.ts`: an in-memory model of
 * the applied migration with the same NOT NULLs, DEFAULTs, CHECKs, unique indexes
 * and foreign-key actions, behind the slice of the PostgREST surface the pipeline
 * uses. That is what makes the schema-level promises -- one parse under a race,
 * chunks that vanish by cascade, a row that cannot claim two origins -- provable
 * rather than assumed. Its `schema fidelity` tests at the end prove the model
 * actually refuses bad writes; without them everything here would be vacuous.
 *
 * WHAT IS SPECIFIED RATHER THAN BOUND. Placement editing and collection
 * (promises 3, 4, 8, 9) have no home in `ingest-pipeline.ts` -- moving a file and
 * emptying a folder live in the Library API. The helpers in
 * `ingest-architecture-fixtures.ts` are the minimal implementation that satisfies
 * the promises against the real constraints; when that code exists, call it here
 * instead. Promise 4's teeth do not depend on it: what is asserted is that a move
 * writes ONE placement row and invokes no parser, no chunker and no embedder.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { citeLocator, type ParsedDocument } from "@nemesis/shared";

import {
  CHECK_VIOLATION,
  DatabaseError,
  FOREIGN_KEY_VIOLATION,
  NOT_NULL_VIOLATION,
  UNIQUE_VIOLATION,
  createFakeDatabase,
  shapeOf,
  type FakeDatabase,
  type Row,
} from "./ingest-architecture-db";
import {
  FORM,
  INVOICES,
  LEASE,
  MANUAL,
  blockChunker,
  boundaryOf,
  calls,
  chunkShape,
  collect,
  deletePlacement,
  depsFor,
  embedder,
  harness,
  movePlacement,
  renamePlacement,
  sourceChunks,
  unitChunker,
  upload,
  vectorFor,
} from "./ingest-architecture-fixtures";
import {
  EMBEDDING_VERSION,
  claimParse,
  docKindFor,
  ingestSource,
  planWork,
  sha256Hex,
  sourceChunkRows,
  type ParseRow,
  type PipelineVersions,
} from "./ingest-pipeline";

const VERSIONS: PipelineVersions = { parser: "parse-1", chunker: "chunk-1", embedding: EMBEDDING_VERSION };
const ready: ParseRow = { id: "p1", state: "ready", parserVersion: "parse-1", failedStage: null, attempts: 1 };

const parseOf = (db: FakeDatabase, id: string): Row => {
  const row = db.rows("parsed_documents").find((candidate) => candidate.id === id);
  assert.ok(row, `no parse ${id}`);
  return row;
};

// ─────────────────────────────────────────────────────────────────────────────
// 0. The version arithmetic, alone: the production planner over its own space
// ─────────────────────────────────────────────────────────────────────────────

test("planWork: the three axes, and what a crash left behind", () => {
  // Nothing claimed yet: everything is missing.
  assert.equal(planWork(null, VERSIONS, { total: 0, embedded: 0 }).stage, "parse");

  // A different parser build is a different parse. All three stages.
  const older = planWork({ ...ready, parserVersion: "parse-0" }, VERSIONS, { total: 9, embedded: 9 });
  assert.deepEqual([older.needsParse, older.needsChunk, older.needsEmbed], [true, true, true]);

  // A chunker or embedder bump shows up as an EMPTY generation, because both
  // versions are part of a chunk row's identity.
  const rechunk = planWork(ready, VERSIONS, { total: 0, embedded: 0 });
  assert.deepEqual([rechunk.needsParse, rechunk.needsChunk, rechunk.needsEmbed], [false, true, true]);

  // 🔴 The case most likely to regress: a run that died while EMBEDDING has a
  // complete parse. Re-extracting it would pay for the expensive stage to fix the
  // cheap one.
  const diedEmbedding = planWork({ ...ready, state: "failed", failedStage: "embed" }, VERSIONS, { total: 9, embedded: 3 });
  assert.deepEqual([diedEmbedding.needsParse, diedEmbedding.needsChunk, diedEmbedding.needsEmbed], [false, false, true]);
  assert.equal(diedEmbedding.stage, "embed");

  // A run that died while PARSING has nothing to keep.
  assert.equal(planWork({ ...ready, state: "failed", failedStage: "parse" }, VERSIONS, { total: 0, embedded: 0 }).needsParse, true);
  // And a row still claiming to be in flight is a crashed run, not a live one.
  assert.equal(planWork({ ...ready, state: "parsing" }, VERSIONS, { total: 0, embedded: 0 }).needsParse, true);

  // Complete: no stage, and therefore no work.
  const done = planWork(ready, VERSIONS, { total: 9, embedded: 9 });
  assert.deepEqual([done.needsParse, done.needsChunk, done.needsEmbed, done.stage], [false, false, false, null]);
});

test("docKindFor routes by extension, and refuses what nothing can read", () => {
  assert.equal(docKindFor("Lease.pdf"), "pdf");
  assert.equal(docKindFor("Invoices 2026.xlsx"), "xlsx");
  assert.equal(docKindFor("Application form.png"), "image");
  assert.equal(docKindFor("recording.m4a"), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1–13. The promises
// ─────────────────────────────────────────────────────────────────────────────

test("1. the same file uploaded twice in one account is parsed once and chunked once", async () => {
  const { db, deps } = harness();
  const first = await upload(db, deps);
  const after = db.mark();
  const second = await upload(db, deps, { fileName: "Lease.pdf" });

  assert.equal(second.parseId, first.parseId);
  assert.equal(db.rows("parsed_documents").length, 1);
  assert.equal(db.rows("storage_objects").length, 1);
  assert.equal(calls().parser, 1);
  assert.equal(sourceChunks(db).length, 4);
  assert.equal(calls().embeddedTexts, 4);
  // The second upload buys a placement and its link, and NOTHING else: no parse
  // row, no chunk, no embedding, not even a state update.
  assert.deepEqual(shapeOf(db.writesSince(after)), ["insert library_sources", "update library_sources"]);
});

test("2. two accounts uploading identical bytes get isolated parses and cannot see each other", async () => {
  const { db, deps } = harness();
  const a = await upload(db, deps, { userId: "user-a" });
  const b = await upload(db, deps, { userId: "user-b" });

  assert.notEqual(a.parseId, b.parseId);
  assert.equal(a.contentHash, b.contentHash, "identical bytes really do hash the same");
  assert.equal(db.rows("parsed_documents").length, 2);
  // Account-scoped identity COSTS a second parse. That is the price of not letting
  // one account learn -- directly or by timing -- what another has uploaded.
  assert.equal(calls().parser, 2);

  assert.deepEqual(
    db.as("user-b").select("parsed_documents", { content_hash: b.contentHash }).map((row) => row.id),
    [b.parseId],
  );
  assert.equal(db.as("user-a").select("parsed_documents", { content_hash: a.contentHash }).length, 1);
  assert.equal(db.as("user-b").select("library_sources").length, 1);

  const seenByB = db.as("user-b").select("library_chunks");
  assert.equal(seenByB.length, 4);
  assert.ok(seenByB.every((chunk) => chunk.parsed_document_id === b.parseId));
  assert.equal(db.as("user-b").select("storage_objects").length, 1);
});

test("3. the same file filed in two folders is two placements, one parse, one chunk set", async () => {
  const { db, deps } = harness();
  const inbox = await upload(db, deps, { folderPath: "Inbox", fileName: "Lease.pdf" });
  const before = sourceChunks(db).map(chunkShape);
  const filed = await upload(db, deps, { folderPath: "Contracts/2026", fileName: "Riverside lease.pdf" });

  assert.notEqual(filed.placementId, inbox.placementId);
  assert.equal(filed.parseId, inbox.parseId);
  assert.equal(db.rows("library_sources").length, 2);
  assert.equal(db.rows("parsed_documents").length, 1);
  assert.deepEqual(sourceChunks(db).map(chunkShape), before);

  // 🔴 No chunk may carry a placement's folder or file name. `path` and `title`
  // are NOT NULL on this table; filling them from the placement is how a move
  // would silently become a re-index. `title` is the DOCUMENT's own title -- a
  // property of the bytes, identical under every placement.
  for (const chunk of sourceChunks(db)) {
    assert.equal(chunk.path, "");
    assert.equal(chunk.title, "Lease agreement");
    const text = JSON.stringify(chunk);
    for (const word of ["Inbox", "Contracts/2026", "Lease.pdf", "Riverside lease.pdf"]) {
      assert.ok(!text.includes(word), `chunk leaked placement text: ${word}`);
    }
  }
});

test("4. moving or renaming a placement writes the placement row and nothing else", async () => {
  const { db, deps } = harness();
  const { placementId } = await upload(db, deps, { folderPath: "Inbox" });
  const chunksBefore = sourceChunks(db);
  const parsesBefore = db.rows("parsed_documents");
  const before = calls();

  const beforeMove = db.mark();
  movePlacement(db, placementId, "Contracts/2026");
  assert.deepEqual(shapeOf(db.writesSince(beforeMove)), ["update library_sources"]);

  const beforeRename = db.mark();
  renamePlacement(db, placementId, "Riverside lease.pdf");
  assert.deepEqual(shapeOf(db.writesSince(beforeRename)), ["update library_sources"]);

  // Absence of writes is the promise; unchanged counters catch a driver that
  // re-parsed and merely failed to write anything new.
  assert.deepEqual(calls(), before);
  assert.deepEqual(sourceChunks(db), chunksBefore);
  assert.deepEqual(db.rows("parsed_documents"), parsesBefore);

  const placement = db.rows("library_sources").find((row) => row.id === placementId);
  assert.equal(placement?.folder_path, "Contracts/2026");
  assert.equal(placement?.file_name, "Riverside lease.pdf");
});

test("5. a parser bump makes a new parse, new chunks and new embeddings, and keeps the old parse", async () => {
  const { db, deps } = harness();
  const first = await upload(db, deps);
  const oldChunks = sourceChunks(db, first.parseId).map(chunkShape);
  const parsedAt = calls().parser;

  // The same bytes, the same placement, a newer parser.
  const upgraded = await ingestSource(
    { userId: "user-a", bytes: LEASE, fileName: "Lease.pdf", sourceId: first.placementId },
    depsFor(db, { parserVersion: "parse-2" }),
  );

  assert.equal(upgraded.ok, true);
  assert.deepEqual([upgraded.plan?.needsParse, upgraded.plan?.needsChunk, upgraded.plan?.needsEmbed], [true, true, true]);
  assert.equal(calls().parser, parsedAt + 1);

  const parses = db.rows("parsed_documents");
  assert.equal(parses.length, 2, "the superseded parse is kept, not overwritten");
  const next = parses.find((row) => row.parser_version === "parse-2");
  assert.ok(next);
  assert.equal(next.state, "ready");
  assert.notEqual(next.id, first.parseId);

  // The placement now points at the new parse; the old one is still queryable.
  assert.equal(db.rows("library_sources").find((row) => row.id === first.placementId)?.parsed_document_id, next.id);
  assert.deepEqual(sourceChunks(db, first.parseId).map(chunkShape), oldChunks);

  const fresh = sourceChunks(db, String(next.id));
  assert.equal(fresh.length, 5, "parse-2 reads a page parse-1 could not");
  assert.ok(fresh.every((chunk) => chunk.parser_version === "parse-2"));
  assert.ok(fresh.every((chunk) => Array.isArray(chunk.embedding)));

  // And the superseded parse is NOT garbage: the file is still in the Library.
  const before = db.mark();
  assert.deepEqual(collect(db, "user-a"), []);
  assert.deepEqual(db.writesSince(before), []);
});

test("6. a chunker bump re-uses the parse and writes a new generation alongside the old", async () => {
  const { db, deps } = harness();
  const { parseId, placementId } = await upload(db, deps);
  const parsedAt = calls().parser;
  const oldGeneration = sourceChunks(db, parseId).map(chunkShape);

  const rechunked = await ingestSource(
    { userId: "user-a", bytes: LEASE, fileName: "Lease.pdf", sourceId: placementId },
    depsFor(db, { chunker: unitChunker("chunk-2") }),
  );

  assert.equal(rechunked.ok, true);
  assert.equal(rechunked.plan?.needsParse, false);
  assert.equal(rechunked.plan?.needsChunk, true);
  // 🔴 The point of the whole layering: no re-extraction, no vision spend, no
  // second read of the original bytes.
  assert.equal(calls().parser, parsedAt, "no parser runs for a chunker bump");
  assert.equal(db.rows("parsed_documents").length, 1);
  assert.equal(rechunked.parsedDocumentId, parseId);

  const kept = sourceChunks(db, parseId).filter((chunk) => chunk.chunker_version === "chunk-1");
  const rebuilt = sourceChunks(db, parseId).filter((chunk) => chunk.chunker_version === "chunk-2");
  assert.deepEqual(kept.map(chunkShape), oldGeneration, "the old generation keeps serving");
  assert.equal(kept.length, 4);
  assert.equal(rebuilt.length, 2, "chunk-2 is one chunk per page where chunk-1 was one per block");
  // New boundaries mean new text, and new text must be embedded.
  assert.ok(rebuilt.every((chunk) => chunk.embedding_version === EMBEDDING_VERSION && Array.isArray(chunk.embedding)));
});

test("7. an embedding bump keeps the parse and the chunk boundaries and only replaces the vectors", async () => {
  const { db, deps } = harness();
  const { parseId } = await upload(db, deps);
  const parsedAt = calls().parser;
  const before = sourceChunks(db, parseId);

  // 🔴 `EMBEDDING_VERSION` is a module constant, so an embedder upgrade cannot be
  // driven through `ingestSource` today -- there is no parameter to move. The new
  // generation is therefore written the way a sweep would have to write it: the
  // SAME parse and the SAME chunker, through the production row mapper.
  const doc = parseOf(db, parseId).structure as ParsedDocument;
  const nextVersions: PipelineVersions = { ...VERSIONS, embedding: "voyage-4@1024" };
  const rows = sourceChunkRows({
    userId: "user-a",
    parsedDocumentId: parseId,
    title: doc.title ?? "",
    chunks: blockChunker("chunk-1").chunk(doc),
    versions: nextVersions,
  });
  for (const row of rows) db.insert("library_chunks", { ...row, embedding: vectorFor(row.content, nextVersions.embedding) });

  assert.equal(calls().parser, parsedAt, "no parse is re-read for an embedder upgrade");
  assert.equal(db.rows("parsed_documents").length, 1);

  const rebuilt = sourceChunks(db, parseId).filter((chunk) => chunk.embedding_version === nextVersions.embedding);
  assert.equal(rebuilt.length, before.length);
  // Same boundaries, same measured provenance -- only the vector is new. A count
  // check alone would pass a chunker that quietly re-split the document.
  assert.deepEqual(rebuilt.map(boundaryOf), before.map(boundaryOf));
  for (const [index, chunk] of rebuilt.entries()) assert.notDeepEqual(chunk.embedding, before[index]?.embedding);

  // The old generation still exists: it is what serves queries during a rebuild.
  const original = sourceChunks(db, parseId).filter((chunk) => chunk.embedding_version === EMBEDDING_VERSION);
  assert.deepEqual(original.map(chunkShape), before.map(chunkShape));
});

test("8. deleting one of two placements leaves the parse and its chunks intact", async () => {
  const { db, deps } = harness();
  const inbox = await upload(db, deps, { folderPath: "Inbox" });
  await upload(db, deps, { folderPath: "Contracts/2026", fileName: "Riverside lease.pdf" });
  const chunksBefore = sourceChunks(db);

  deletePlacement(db, inbox.placementId);
  const before = db.mark();
  assert.deepEqual(collect(db, "user-a"), [], "a live placement still needs these bytes");
  assert.deepEqual(db.writesSince(before), []);

  assert.equal(db.rows("parsed_documents").length, 1);
  assert.deepEqual(sourceChunks(db), chunksBefore);
  assert.equal(db.rows("storage_objects").length, 1);
  assert.equal(db.rows("library_sources").filter((row) => row.deleted === false).length, 1);
});

test("9. deleting the final placement collects the parse by cascade, completely and repeatably", async () => {
  const { db, deps } = harness();
  const inbox = await upload(db, deps, { folderPath: "Inbox" });
  const filed = await upload(db, deps, { folderPath: "Contracts/2026", fileName: "Riverside lease.pdf" });
  deletePlacement(db, inbox.placementId);
  deletePlacement(db, filed.placementId);

  const before = db.mark();
  assert.deepEqual(collect(db, "user-a"), [inbox.parseId]);
  const writes = db.writesSince(before);

  assert.deepEqual(db.rows("parsed_documents"), []);
  assert.deepEqual(sourceChunks(db), []);
  assert.deepEqual(db.rows("storage_objects"), []);
  // 🔴 The chunks went by CASCADE. If the application had deleted them itself the
  // foreign key would be decorative, and the next code path to forget would leak.
  assert.ok(writes.some((write) => write.op === "delete" && write.table === "parsed_documents" && write.by === "application"));
  assert.ok(writes.some((write) => write.op === "delete" && write.table === "library_chunks" && write.by === "cascade"));
  assert.equal(writes.filter((write) => write.table === "library_chunks" && write.by === "application").length, 0);

  // No soft-deleted row keeps a pointer to a parse that no longer exists -- that
  // is how an "undelete" would otherwise resurrect a corpse.
  assert.ok(db.rows("library_sources").every((row) => row.parsed_document_id === null));
  assert.ok(writes.some((write) => write.table === "library_sources" && write.by === "cascade"));

  const second = db.mark();
  assert.deepEqual(collect(db, "user-a"), [], "collection is idempotent");
  assert.deepEqual(db.writesSince(second), []);
});

test("10. measured page provenance survives chunking, and nothing is invented", async () => {
  const { db, deps } = harness();
  const { parseId } = await upload(db, deps);
  const chunks = sourceChunks(db, parseId);

  const termination = chunks.find((chunk) => String(chunk.content).startsWith("Either party"));
  assert.ok(termination);
  assert.equal(termination.unit_kind, "page");
  assert.equal(termination.unit_index, 7, "page 7 was measured, so page 7 is stored");
  assert.deepEqual(termination.heading_path, ["Article 4", "Termination"]);
  assert.equal(termination.cell_range, null);
  assert.equal(
    citeLocator({ kind: "page", index: Number(termination.unit_index), headingPath: termination.heading_path as string[] }),
    "page 7",
  );

  // A scanned form has no subdivision. `document`, and unit_index STAYS NULL --
  // an invented "page 1" would be a fabricated location.
  const form = await upload(db, deps, { bytes: FORM, fileName: "Application form.png" });
  const scanned = sourceChunks(db, form.parseId);
  assert.equal(scanned.length, 1);
  assert.equal(scanned[0]?.unit_kind, "document");
  assert.equal(scanned[0]?.unit_index, null);
  assert.equal(scanned[0]?.unit_label, null);
  assert.equal(citeLocator({ kind: "document" }), "this document");

  // The printed label ("iii" on the lease's front matter) has no column on
  // library_chunks. It survives on the PARSE, and a citation renderer must read it
  // from there rather than pass the ordinal off as what the reader sees.
  const front = chunks.find((chunk) => chunk.content === "Lease agreement");
  assert.equal(front?.unit_index, 1);
  assert.equal(front?.unit_label, null);
  const structure = parseOf(db, parseId).structure as ParsedDocument;
  const printed = structure.units[0]?.locator;
  assert.ok(printed);
  assert.equal(printed.printedLabel, "iii");
  assert.equal(citeLocator(printed), "page iii");
});

test("11. an interrupted ingestion resumes without duplicate work or duplicate rows", async () => {
  // 150 chunks is more than one embedding batch (128), so the crash lands with
  // real progress already committed -- which is what makes "resume" observable
  // rather than indistinguishable from a fresh run.
  const { db } = harness();
  const crashed = await upload(db, depsFor(db, { embed: embedder({ failOnCall: 2 }) }), {
    bytes: MANUAL,
    fileName: "Service manual.pdf",
    folderPath: "Manuals",
    expectFailure: true,
  });

  const parse = db.rows("parsed_documents")[0];
  assert.ok(parse);
  assert.equal(parse.state, "failed");
  assert.equal(parse.failed_stage, "embed");
  const written = sourceChunks(db);
  assert.equal(written.length, 150, "the generation's rows are durable before any vector exists");
  assert.equal(written.filter((chunk) => chunk.embedding !== null).length, 128, "one batch landed");
  const survived = written.map(chunkShape);
  const before = calls();

  const resumed = await ingestSource(
    { userId: "user-a", bytes: MANUAL, fileName: "Service manual.pdf", sourceId: crashed.placementId },
    depsFor(db, { embed: embedder() }),
  );

  assert.equal(resumed.ok, true);
  assert.equal(resumed.parsedDocumentId, parse.id);
  assert.equal(resumed.plan?.needsParse, false, "the stored structure is re-used");
  assert.equal(resumed.plan?.needsChunk, false, "the generation's rows are already there");
  assert.equal(calls().parser, before.parser, "the parser does not run twice");
  // Only the rows still missing a vector are embedded. Re-embedding all 150 would
  // pay twice for work that survived.
  assert.equal(calls().embeddedTexts, before.embeddedTexts + 22);

  const after = sourceChunks(db);
  assert.equal(after.length, 150, "no duplicate rows");
  assert.deepEqual(
    after.map((chunk) => chunk.chunk_index),
    Array.from({ length: 150 }, (_, index) => index),
  );
  assert.deepEqual(after.slice(0, 128).map(chunkShape), survived.slice(0, 128), "the vectors that survived were not rewritten");
  assert.ok(after.every((chunk) => Array.isArray(chunk.embedding)));

  const done = db.rows("parsed_documents")[0];
  assert.equal(done?.state, "ready");
  assert.equal(done?.failed_stage, null);
  assert.equal(done?.error, null);
  assert.equal(db.rows("parsed_documents").length, 1);
});

test("12. two concurrent identical uploads produce one parse row: one inserts, one joins", async () => {
  const { db, deps } = harness();
  const contentHash = await sha256Hex(LEASE);
  const identity = { userId: "user-a", contentHash, kind: "pdf" as const, parserVersion: "parse-1" };

  // Both claims run before either has seen the other's row. The unique index --
  // not a look-before-you-insert check -- is what settles it.
  const [first, second] = await Promise.all([claimParse(deps.db, identity), claimParse(deps.db, identity)]);

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.id, second.id, "the loser joins the winner's parse");
  assert.equal(db.rows("parsed_documents").length, 1);
  assert.equal(db.writesSince(0).filter((write) => write.table === "parsed_documents" && write.op === "insert").length, 1);

  // And the loser's insert really was refused by the index, not by application logic.
  assert.throws(
    () => db.insert("parsed_documents", { user_id: "user-a", content_hash: contentHash, doc_kind: "pdf", parser_version: "parse-1" }),
    (error: unknown) => error instanceof DatabaseError && error.code === UNIQUE_VIOLATION && error.constraint === "parsed_documents_identity",
  );

  // Both callers then run the pipeline against the same row, and one parse and one
  // chunk set exist at the end of it.
  await Promise.all([
    ingestSource({ userId: "user-a", bytes: LEASE, fileName: "Lease.pdf" }, deps),
    ingestSource({ userId: "user-a", bytes: LEASE, fileName: "Lease.pdf" }, deps),
  ]);
  assert.equal(db.rows("parsed_documents").length, 1);
  assert.equal(sourceChunks(db).length, 4);
});

test("13. a spreadsheet's sheet name and cell range survive chunking as columns", async () => {
  const { db, deps } = harness();
  const { parseId } = await upload(db, deps, { bytes: INVOICES, fileName: "Invoices 2026.xlsx", folderPath: "Finance" });

  const chunks = sourceChunks(db, parseId);
  const table = chunks.find((chunk) => chunk.cell_range !== null);
  assert.ok(table, "the table chunk kept its measured range");
  assert.equal(table.unit_kind, "sheet");
  assert.equal(table.unit_label, "Sheet2");
  assert.equal(table.cell_range, "B14:F21");
  // A named sheet has no ordinal, and one is not invented for it.
  assert.equal(table.unit_index, null);
  assert.ok(String(table.content).includes("88,120"));
  assert.equal(citeLocator({ kind: "sheet", label: String(table.unit_label), range: String(table.cell_range) }), "Sheet2!B14:F21");

  // The range is a COLUMN, not a marker inside the text: retrieval must be able to
  // filter on it without reading it back out of prose.
  assert.ok(!String(table.content).includes("B14:F21"));
  const summary = chunks.find((chunk) => String(chunk.content).startsWith("Total invoiced"));
  assert.equal(summary?.unit_label, "Summary");
  assert.equal(summary?.cell_range, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema fidelity: without these, every assertion above could be vacuous
// ─────────────────────────────────────────────────────────────────────────────

const PARSE_INSERT: Row = {
  user_id: "user-a",
  content_hash: "a".repeat(64),
  doc_kind: "pdf",
  parser_version: "parse-1",
};

test("the fake refuses a chunk that claims both origins, or neither", () => {
  const db = createFakeDatabase();
  const note = db.insert("readable_library_documents", { user_id: "user-a" });
  const parse = db.insert("parsed_documents", PARSE_INSERT);
  const base = { user_id: "user-a", path: "", chunk_index: 0, content: "x" };
  const oneOrigin = (error: unknown) =>
    error instanceof DatabaseError && error.code === CHECK_VIOLATION && error.constraint === "library_chunks_one_origin";

  assert.throws(() => db.insert("library_chunks", { ...base, origin_type: "source", parsed_document_id: parse.id, document_id: note.id }), oneOrigin);
  assert.throws(() => db.insert("library_chunks", { ...base, origin_type: "source" }), oneOrigin);
  assert.throws(() => db.insert("library_chunks", { ...base, origin_type: "note" }), oneOrigin);
  assert.throws(() => db.insert("library_chunks", { ...base, origin_type: "note", document_id: note.id, parsed_document_id: parse.id }), oneOrigin);

  // Both legitimate shapes are accepted.
  db.insert("library_chunks", { ...base, origin_type: "note", document_id: note.id });
  db.insert("library_chunks", {
    ...base,
    origin_type: "source",
    parsed_document_id: parse.id,
    chunker_version: "chunk-1",
    embedding_version: EMBEDDING_VERSION,
  });
  assert.equal(db.rows("library_chunks").length, 2);
});

test("the fake enforces the partial source index, and lets NULL document_ids coexist", async () => {
  const { db, deps } = harness();
  const { parseId } = await upload(db, deps);
  const chunk = sourceChunks(db, parseId)[0];
  assert.ok(chunk);
  assert.equal(chunk.document_id, null);
  // Four source chunks all have document_id NULL: the legacy unique(document_id,
  // chunk_index) does not fire, because Postgres treats NULLs as distinct.
  assert.equal(sourceChunks(db).length, 4);

  assert.throws(
    () => db.insert("library_chunks", chunkShape(chunk)),
    (error: unknown) => error instanceof DatabaseError && error.code === UNIQUE_VIOLATION && error.constraint === "library_chunks_source_identity",
  );
  // The same chunk_index under a DIFFERENT generation is allowed -- that is what
  // makes rebuilding alongside the live set possible.
  db.insert("library_chunks", { ...chunkShape(chunk), embedding_version: "voyage-4@1024" });
  assert.equal(sourceChunks(db).length, 5);
});

test("the fake enforces the parse row's own checks, including the vector dimension", () => {
  const db = createFakeDatabase();
  const code = (expected: string) => (error: unknown) => error instanceof DatabaseError && error.code === expected;

  assert.throws(() => db.insert("parsed_documents", { ...PARSE_INSERT, content_hash: "short" }), code(CHECK_VIOLATION));
  assert.throws(() => db.insert("parsed_documents", { ...PARSE_INSERT, doc_kind: "csv" }), code(CHECK_VIOLATION));
  assert.throws(() => db.insert("parsed_documents", { ...PARSE_INSERT, state: "indexing" }), code(CHECK_VIOLATION));
  assert.throws(() => db.insert("parsed_documents", { ...PARSE_INSERT, failed_stage: "upload" }), code(CHECK_VIOLATION));
  assert.throws(() => db.insert("parsed_documents", { ...PARSE_INSERT, parser_version: null }), code(NOT_NULL_VIOLATION));

  const parse = db.insert("parsed_documents", PARSE_INSERT);
  // The defaults the migration declares are what make a five-column claim legal.
  assert.equal(parse.state, "pending");
  assert.equal(parse.attempts, 0);
  assert.deepEqual(parse.structure, {});

  const chunk = {
    user_id: "user-a",
    path: "",
    chunk_index: 0,
    content: "x",
    origin_type: "source",
    parsed_document_id: parse.id,
    chunker_version: "chunk-1",
    embedding_version: EMBEDDING_VERSION,
  };
  assert.throws(() => db.insert("library_chunks", { ...chunk, unit_kind: "paragraph" }), code(CHECK_VIOLATION));
  assert.throws(() => db.insert("library_chunks", { ...chunk, embedding: [0.1, 0.2] }), code(CHECK_VIOLATION));
  assert.throws(() => db.insert("library_chunks", { ...chunk, parsed_document_id: "parsed_documents-999" }), code(FOREIGN_KEY_VIOLATION));
  // `path` is NOT NULL with NO default: a source chunk must say something.
  const { path: _path, ...pathless } = chunk;
  assert.throws(() => db.insert("library_chunks", pathless), code(NOT_NULL_VIOLATION));
  db.insert("library_chunks", { ...chunk, embedding: vectorFor("x", EMBEDDING_VERSION) });
  assert.equal(db.rows("library_chunks").length, 1);
});
