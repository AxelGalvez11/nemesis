/**
 * Documents, parsers, chunkers and an embedder for the architecture suite.
 *
 * TEST INFRASTRUCTURE for `ingest-architecture.test.ts`. Nothing in the app
 * imports it.
 *
 * 🔴 THE FIXTURES ARE A LEASE, AN INVOICE WORKBOOK, A SCANNED FORM AND A SERVICE
 * MANUAL, ON PURPOSE. This layer is universal — a contract, an invoice, a filing,
 * a manual, a resume and a lecture deck are the same thing to it — and a suite
 * made only of lecture decks would quietly teach it to be a school.
 *
 * Every locator these parsers emit is one they "measured": the lease's front
 * matter really is printed `iii`, the workbook's table really does occupy
 * B14:F21, and the scanned form really has no subdivision, so it gets `document`
 * rather than an invented page 1. Parsers, the chunker and the embedder are seams
 * in the real pipeline, and these are what get wired into them.
 *
 * The counters are the other half of the point: several promises are about work
 * NOT happening, and "the parser did not run" is only assertable if something
 * counts.
 */

import assert from "node:assert/strict";

import { walkBlocks, type DocKind, type DocTable, type DocUnit, type Locator, type ParsedDocument } from "@nemesis/shared";

import { EMBEDDING_DIMENSIONS, createFakeDatabase, supabaseFacade, type FakeDatabase, type Row } from "./ingest-architecture-db";
import {
  EMBEDDING_VERSION,
  ingestSource,
  sha256Hex,
  type DocChunk,
  type DocumentChunker,
  type EmbedTexts,
  type IngestDb,
  type IngestDeps,
} from "./ingest-pipeline";

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

export const LEASE = bytesOf("a lease agreement, as bytes");
export const INVOICES = bytesOf("an invoice register, as bytes");
export const FORM = bytesOf("a scanned application form, as bytes");
export const MANUAL = bytesOf("a service manual long enough to need two embedding batches");

/** How many pages the manual has. More than one embedding batch (128), so a crash
 *  mid-embed leaves REAL progress behind and "resume" is observable. */
const MANUAL_PAGES = 150;

const counts = { parser: 0, embeddedTexts: 0, embedder: 0 };

/** A snapshot, so a test cannot accidentally hold a live reference and compare a
 *  number with itself. */
export const calls = (): { parser: number; embeddedTexts: number; embedder: number } => ({ ...counts });

/**
 * The stand-in parsers.
 *
 * `parse-2` reads one page more than `parse-1` (a page that used to be a
 * picture): a parser bump shows up as MORE measured content, never as a different
 * belief about the same content.
 */
export async function parseFixture(kind: DocKind, bytes: Uint8Array, parserVersion: string): Promise<ParsedDocument> {
  counts.parser += 1;
  const contentHash = await sha256Hex(bytes);
  const base = { contentHash, parserVersion, tables: [] as DocTable[], visuals: [] };

  if (kind === "pdf" && bytes.length === MANUAL.length) {
    const units: DocUnit[] = Array.from({ length: MANUAL_PAGES }, (_, index) => ({
      locator: { kind: "page", index: index + 1, headingPath: ["Service manual", `Procedure ${index + 1}`] },
      blocks: [{ id: `m${index}`, kind: "paragraph", ordinal: 0, text: `Step ${index + 1}: torque to 40 Nm.`, method: "textLayer" }],
    }));
    return {
      ...base,
      kind,
      title: "Service manual",
      units,
      coverage: {
        unitsFound: MANUAL_PAGES,
        unitsRead: MANUAL_PAGES,
        visualsFound: 0,
        visualsKept: 0,
        visualsUnreadable: 0,
        tablesFound: 0,
      },
    };
  }

  if (kind === "pdf") {
    const units: DocUnit[] = [
      {
        locator: { kind: "page", index: 1, printedLabel: "iii", headingPath: ["Front matter"] },
        blocks: [
          { id: "b1", kind: "heading", ordinal: 0, depth: 1, text: "Lease agreement", method: "textLayer" },
          { id: "b2", kind: "paragraph", ordinal: 1, text: "Between the landlord and the tenant.", method: "textLayer" },
        ],
      },
      {
        locator: { kind: "page", index: 7, headingPath: ["Article 4", "Termination"] },
        blocks: [
          { id: "b3", kind: "heading", ordinal: 0, depth: 2, text: "Termination", method: "textLayer" },
          { id: "b4", kind: "paragraph", ordinal: 1, text: "Either party may terminate on sixty days notice.", method: "textLayer" },
        ],
      },
    ];
    if (parserVersion === "parse-2") {
      units.push({
        locator: { kind: "page", index: 8, headingPath: ["Article 4", "Schedule of fees"] },
        blocks: [{ id: "b5", kind: "paragraph", ordinal: 0, text: "Late fee: 2% per month.", method: "vision" }],
      });
    }
    return {
      ...base,
      kind,
      title: "Lease agreement",
      units,
      coverage: { unitsFound: units.length, unitsRead: units.length, visualsFound: 0, visualsKept: 0, visualsUnreadable: 0, tablesFound: 0 },
    };
  }

  if (kind === "xlsx") {
    // A named sheet carries its NAME, not an ordinal: doc-model says index is
    // absent for a unit whose position is not meaningfully ordered.
    const summary: Locator = { kind: "sheet", label: "Summary" };
    const detail: Locator = { kind: "sheet", label: "Sheet2" };
    return {
      ...base,
      kind,
      title: "Invoice register",
      units: [
        { locator: summary, blocks: [{ id: "c1", kind: "paragraph", ordinal: 0, text: "Total invoiced: 412,900", method: "cell" }] },
        { locator: detail, blocks: [{ id: "c2", kind: "heading", ordinal: 0, depth: 1, text: "Q3 detail", method: "cell" }] },
      ],
      tables: [
        {
          id: "t1",
          locator: { kind: "sheet", label: "Sheet2", range: "B14:F21" },
          title: "Q3 by region",
          method: "cell",
          rows: [
            [
              { row: 0, col: 0, text: "Region", ref: "B14", header: true },
              { row: 0, col: 1, text: "Q3", ref: "C14", header: true },
            ],
            [
              { row: 1, col: 0, text: "North", ref: "B15" },
              { row: 1, col: 1, text: "88,120", ref: "C15", formula: "=SUM(C2:C9)" },
            ],
          ],
        },
      ],
      coverage: { unitsFound: 2, unitsRead: 2, visualsFound: 0, visualsKept: 0, visualsUnreadable: 0, tablesFound: 1 },
    };
  }

  // An image has no meaningful subdivision. Inventing "page 1" would be a lie.
  return {
    ...base,
    kind,
    units: [
      {
        locator: { kind: "document" },
        transcribed: true,
        blocks: [{ id: "f1", kind: "formField", ordinal: 0, text: "Applicant name: ____", method: "ocr", confidence: 0.71 }],
      },
    ],
    coverage: { unitsFound: 1, unitsRead: 1, visualsFound: 1, visualsKept: 1, visualsUnreadable: 0, tablesFound: 0 },
  };
}

const parsersFor = (version: string) =>
  Object.fromEntries(
    (["pdf", "xlsx", "image"] as const).map((kind) => [kind, { kind, version, parse: (bytes: Uint8Array) => parseFixture(kind, bytes, version) }]),
  );

const renderTable = (table: DocTable): string => table.rows.map((row) => row.map((cell) => cell.text).join(" | ")).join("\n");

/** One chunk per block, walked through the shared `walkBlocks` so chunking never
 *  learns the file type. Tables are chunked whole, at their own measured range. */
export const blockChunker = (version: string): DocumentChunker => ({
  version,
  chunk(doc) {
    const chunks: DocChunk[] = [];
    for (const { block, locator } of walkBlocks(doc)) chunks.push({ text: block.text, locator });
    for (const table of doc.tables) chunks.push({ text: renderTable(table), locator: table.locator });
    return chunks;
  },
});

/** One chunk per unit: deliberately DIFFERENT boundaries, which is what a chunker
 *  bump means. */
export const unitChunker = (version: string): DocumentChunker => ({
  version,
  chunk(doc) {
    const chunks: DocChunk[] = doc.units.map((unit) => ({
      text: unit.blocks.map((block) => block.text).join("\n"),
      locator: unit.locator,
    }));
    for (const table of doc.tables) chunks.push({ text: renderTable(table), locator: table.locator });
    return chunks;
  },
});

/** A deterministic 1024-float vector. Same text + same embedding version = same
 *  vector, so "the vectors changed" is a real observation rather than noise. */
export function vectorFor(text: string, embeddingVersion: string): number[] {
  let seed = 7;
  for (const char of `${embeddingVersion}:${text}`) seed = (seed * 31 + char.charCodeAt(0)) % 100003;
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => ((seed + index * 17) % 1000) / 1000);
}

interface EmbedderOptions {
  /** Throw on this call (1-based), to crash a run mid-flight. */
  failOnCall?: number;
  version?: string;
}

export const embedder =
  (options: EmbedderOptions = {}): EmbedTexts =>
  async (texts) => {
    counts.embedder += 1;
    if (options.failOnCall === counts.embedder) throw new Error("embedding provider fell over");
    counts.embeddedTexts += texts.length;
    return texts.map((text) => vectorFor(text, options.version ?? EMBEDDING_VERSION));
  };

// ─────────────────────────────────────────────────────────────────────────────
// The harness: an account, a placement, and the pipeline behind the facade
// ─────────────────────────────────────────────────────────────────────────────

export interface DepsOptions {
  parserVersion?: string;
  chunker?: DocumentChunker;
  embed?: EmbedTexts | null;
}

export function depsFor(db: FakeDatabase, options: DepsOptions = {}): IngestDeps {
  return {
    db: supabaseFacade(db) as IngestDb,
    parsers: parsersFor(options.parserVersion ?? "parse-1"),
    chunker: options.chunker ?? blockChunker("chunk-1"),
    embed: options.embed === undefined ? embedder() : options.embed,
  };
}

export interface Harness {
  readonly db: FakeDatabase;
  readonly deps: IngestDeps;
}

/** A fresh account, a fresh database and fresh counters. Counters are reset here
 *  rather than left to accumulate so that "the parser ran once" is a statement
 *  about this test and not about the order the file happens to run in. */
export function harness(options: DepsOptions = {}): Harness {
  counts.parser = 0;
  counts.embeddedTexts = 0;
  counts.embedder = 0;
  const db = createFakeDatabase();
  return { db, deps: depsFor(db, options) };
}

export interface Upload {
  readonly placementId: string;
  readonly parseId: string;
  readonly contentHash: string;
}

export interface UploadOptions {
  userId?: string;
  bytes?: Uint8Array;
  fileName?: string;
  folderPath?: string;
  /** Skip the assertion that ingestion succeeded — for the crash tests. */
  expectFailure?: boolean;
}

/**
 * File a document and index it.
 *
 * The placement row is written by the CALLER, as it is in production: the upload
 * path owns the Library row and hands the pipeline its id, so the file's progress
 * can be shown against it while the stages run.
 */
export async function upload(db: FakeDatabase, deps: IngestDeps, options: UploadOptions = {}): Promise<Upload> {
  const userId = options.userId ?? "user-a";
  const bytes = options.bytes ?? LEASE;
  const fileName = options.fileName ?? "Lease.pdf";
  const contentHash = await sha256Hex(bytes);
  const storagePath = `${userId}/${contentHash}`;
  // One stored object per (account, bytes): a second placement re-uses it.
  if (!db.rows("storage_objects").some((object) => object.path === storagePath)) {
    db.insert("storage_objects", { user_id: userId, path: storagePath });
  }
  const placement = db.insert("library_sources", {
    user_id: userId,
    folder_path: options.folderPath ?? "Inbox",
    file_name: fileName,
    storage_path: storagePath,
    deleted: false,
  });
  const result = await ingestSource({ userId, bytes, fileName, sourceId: String(placement.id) }, deps);
  if (!options.expectFailure) {
    assert.equal(result.error, null, `ingest failed: ${result.error}`);
    assert.ok(result.parsedDocumentId);
  }
  return { placementId: String(placement.id), parseId: String(result.parsedDocumentId ?? ""), contentHash };
}

// Placement editing and collection: SPECIFIED here, against the real constraints,
// until the Library API exposes them. Moving a file and emptying a folder are not
// the pipeline's business — which is exactly the promise.
export const movePlacement = (db: FakeDatabase, id: string, folderPath: string): void => {
  db.update("library_sources", id, { folder_path: folderPath });
};

export const renamePlacement = (db: FakeDatabase, id: string, fileName: string): void => {
  db.update("library_sources", id, { file_name: fileName });
};

/** Soft delete: originals are not thrown away by a client click. */
export const deletePlacement = (db: FakeDatabase, id: string): void => {
  db.update("library_sources", id, { deleted: true });
};

/**
 * Collect what nothing references any more.
 *
 * Keyed on the BYTES rather than on one parse id, so a parser upgrade — which
 * leaves the superseded parse unreferenced on purpose — does not look like
 * garbage while the file is still in the Library.
 */
export function collect(db: FakeDatabase, userId: string): string[] {
  const live = new Set(
    db
      .rows("library_sources")
      .filter((row) => row.user_id === userId && row.deleted === false)
      .map((row) => String(row.content_hash)),
  );
  const collected = db
    .rows("parsed_documents")
    .filter((row) => row.user_id === userId && !live.has(String(row.content_hash)))
    .map((row) => String(row.id))
    .sort();
  for (const id of collected) {
    // The chunks go with it BY CASCADE. Deleting them here as well would make the
    // foreign key decorative.
    db.remove("parsed_documents", (row) => row.id === id);
  }
  for (const object of db.rows("storage_objects").filter((row) => row.user_id === userId)) {
    const referenced = db.rows("library_sources").some((row) => row.storage_path === object.path && row.deleted === false);
    if (!referenced) db.remove("storage_objects", (row) => row.id === object.id);
  }
  return collected;
}

export const sourceChunks = (db: FakeDatabase, parseId?: string): Row[] =>
  db
    .rows("library_chunks")
    .filter((chunk) => chunk.origin_type === "source" && (parseId === undefined || chunk.parsed_document_id === parseId))
    .sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index));

/** Everything about a chunk except its surrogate identity and its clock, for
 *  comparing one generation — or one moment — against another. */
export const chunkShape = (chunk: Row): Row => {
  const { id: _id, created_at: _createdAt, ...rest } = chunk;
  return rest;
};

/** The part of a chunk the CHUNKER decides: where it starts, where it stops, and
 *  where it came from. Everything except the vector. */
export const boundaryOf = (chunk: Row): Row => ({
  chunk_index: chunk.chunk_index,
  content: chunk.content,
  unit_kind: chunk.unit_kind,
  unit_index: chunk.unit_index,
  unit_label: chunk.unit_label,
  cell_range: chunk.cell_range,
  heading_path: chunk.heading_path,
});
