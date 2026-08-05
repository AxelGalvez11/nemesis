// The pipeline's EFFECTS, exercised against a fake PostgREST builder: the state
// machine's order, retry safety, the seam where the embedder is missing, and the
// provenance that actually reaches a chunk row. The decisions it makes are pure
// and tested in ./ingest-plan.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";

import type { DocumentParser, ParsedDocument } from "@nemesis/shared";

import { EMBEDDING_VERSION, ingestSource, type DocumentChunker, type IngestDb } from "./ingest-pipeline";

/** A one-page parse. Its contents do not matter here — the chunker is faked —
 *  only that it round-trips through `structure` intact. */
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

// ─── the pipeline, against a fake database ───────────────────────────────────

interface Filter {
  column: string;
  value: unknown;
  op: "eq" | "is" | "notis";
}

interface Call {
  table: string;
  op: "select" | "insert" | "upsert" | "update" | "delete";
  payload: unknown;
  filters: Filter[];
  head: boolean;
  single: boolean;
  limit: number | null;
}

type Row = Record<string, unknown>;

/** Enough of PostgREST's fluent builder to exercise the pipeline: every method
 *  used by ingest-pipeline.ts, and nothing else. Thenable, so `await` on any
 *  chain resolves through the store below. */
class FakeBuilder {
  constructor(private readonly call: Call, private readonly run: (call: Call) => unknown) {}

  select(_columns: string, options?: { count?: string; head?: boolean }) {
    if (this.call.op !== "insert" && this.call.op !== "upsert") this.call.op = "select";
    if (options?.head) this.call.head = true;
    return this;
  }
  insert(payload: unknown) {
    this.call.op = "insert";
    this.call.payload = payload;
    return this;
  }
  upsert(payload: unknown) {
    this.call.op = "upsert";
    this.call.payload = payload;
    return this;
  }
  update(payload: unknown) {
    this.call.op = "update";
    this.call.payload = payload;
    return this;
  }
  delete() {
    this.call.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.call.filters.push({ column, value, op: "eq" });
    return this;
  }
  is(column: string, value: unknown) {
    this.call.filters.push({ column, value, op: "is" });
    return this;
  }
  not(column: string, _operator: string, value: unknown) {
    this.call.filters.push({ column, value, op: "notis" });
    return this;
  }
  order(_column: string, _options?: unknown) {
    return this;
  }
  limit(count: number) {
    this.call.limit = count;
    return this;
  }
  maybeSingle() {
    this.call.single = true;
    return this;
  }
  then<T>(onFulfilled: (value: unknown) => T, onRejected?: (reason: unknown) => T) {
    return Promise.resolve()
      .then(() => this.run(this.call))
      .then(onFulfilled, onRejected);
  }
}

class FakeDb {
  readonly tables: Record<string, Row[]> = { parsed_documents: [], library_chunks: [], library_sources: [] };
  readonly calls: Call[] = [];
  private nextId = 1;

  get client(): IngestDb {
    return {
      from: (table: string) => {
        const call: Call = { table, op: "select", payload: null, filters: [], head: false, single: false, limit: null };
        this.calls.push(call);
        return new FakeBuilder(call, (c) => this.execute(c));
      },
    } as unknown as IngestDb;
  }

  /** Every state the parse row passed through, in order. */
  get states(): string[] {
    return this.calls
      .filter((c) => c.table === "parsed_documents" && c.op === "update")
      .map((c) => String((c.payload as Row).state));
  }

  private matches(row: Row, filters: Filter[]): boolean {
    return filters.every((f) => {
      if (f.op === "is") return (row[f.column] ?? null) === f.value;
      if (f.op === "notis") return (row[f.column] ?? null) !== null;
      return row[f.column] === f.value;
    });
  }

  private execute(call: Call): unknown {
    const table = this.tables[call.table] ?? [];
    const hit = table.filter((row) => this.matches(row, call.filters));

    switch (call.op) {
      case "upsert": {
        // ON CONFLICT DO NOTHING: the identity index decides, exactly as the
        // real one does — a duplicate insert affects nothing and errors not.
        const incoming = call.payload as Row;
        const clash = table.some(
          (row) =>
            row.user_id === incoming.user_id &&
            row.content_hash === incoming.content_hash &&
            row.parser_version === incoming.parser_version,
        );
        if (!clash) table.push({ id: `parse-${this.nextId++}`, attempts: 0, failed_stage: null, ...incoming });
        return { error: null };
      }
      case "insert": {
        const rows = (Array.isArray(call.payload) ? call.payload : [call.payload]) as Row[];
        for (const row of rows) table.push({ id: `chunk-${this.nextId++}`, embedding: null, ...row });
        return { error: null };
      }
      case "update": {
        for (const row of hit) Object.assign(row, call.payload as Row);
        return { error: null };
      }
      case "delete": {
        for (const row of hit) table.splice(table.indexOf(row), 1);
        return { error: null };
      }
      case "select": {
        if (call.head) return { count: hit.length, error: null };
        if (call.single) return { data: hit[0] ?? null, error: null };
        return { data: call.limit === null ? hit : hit.slice(0, call.limit), error: null };
      }
    }
  }
}

function fakeParser(calls: { count: number }): DocumentParser {
  return {
    kind: "pdf",
    version: "pdf@1",
    parse: async () => {
      calls.count += 1;
      return PARSE;
    },
  };
}

const fakeChunker = (texts: string[]): DocumentChunker => ({
  version: "chunk@1",
  chunk: () => texts.map((text, i) => ({ text, locator: { kind: "page" as const, index: i + 1 } })),
});

const fakeEmbed = (calls: { texts: number }) => async (texts: string[]) => {
  calls.texts += texts.length;
  return texts.map(() => [0.1, 0.2, 0.3]);
};

const INPUT = {
  userId: "user-1",
  bytes: new TextEncoder().encode("%PDF-1.7 fake"),
  fileName: "Lecture 8.pdf",
  mimeType: "application/pdf",
  sourceId: "source-1",
};

test("a fresh file runs parse -> chunk -> embed and lands ready", async () => {
  const db = new FakeDb();
  db.tables.library_sources?.push({ id: "source-1", user_id: "user-1" });
  const parses = { count: 0 };
  const embeds = { texts: 0 };

  const outcome = await ingestSource(INPUT, {
    db: db.client,
    parsers: { pdf: fakeParser(parses) },
    chunker: fakeChunker(["alpha", "beta"]),
    embed: fakeEmbed(embeds),
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.state, "ready");
  assert.equal(outcome.chunkCount, 2);
  assert.equal(outcome.embeddedCount, 2);
  assert.deepEqual(db.states, ["parsing", "parsed", "chunking", "chunked", "embedding", "ready"]);
  assert.equal(parses.count, 1);
  assert.equal(embeds.texts, 2);

  // (e) provenance really reached the rows.
  const chunks = db.tables.library_chunks ?? [];
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.origin_type, "source");
  assert.equal(chunks[0]?.document_id, null);
  assert.equal(chunks[0]?.unit_kind, "page");
  assert.equal(chunks[0]?.unit_index, 1);
  assert.equal(chunks[0]?.embedding_version, EMBEDDING_VERSION);
  assert.notEqual(chunks[0]?.embedding, null);

  // (f) the placement points at the parse and remembers the bytes.
  const placement = db.tables.library_sources?.[0];
  assert.equal(placement?.parsed_document_id, "parse-1");
  assert.equal(String(placement?.content_hash).length, 64);
});

test("re-running the same bytes joins the parse and does no work", async () => {
  const db = new FakeDb();
  const parses = { count: 0 };
  const embeds = { texts: 0 };
  const deps = {
    db: db.client,
    parsers: { pdf: fakeParser(parses) },
    chunker: fakeChunker(["alpha", "beta"]),
    embed: fakeEmbed(embeds),
  };

  await ingestSource(INPUT, deps);
  const second = await ingestSource(INPUT, deps);

  assert.equal(second.ok, true);
  assert.equal(second.plan?.stage, null);
  // ONE parse row, ONE chunk set, no second parse and no second embedding spend.
  assert.equal(db.tables.parsed_documents?.length, 1);
  assert.equal(db.tables.library_chunks?.length, 2);
  assert.equal(parses.count, 1);
  assert.equal(embeds.texts, 2);
});

test("a failed chunk stage is recorded, then retried WITHOUT re-parsing", async () => {
  const db = new FakeDb();
  const parses = { count: 0 };
  const embeds = { texts: 0 };
  const exploding: DocumentChunker = {
    version: "chunk@1",
    chunk: () => {
      throw new Error("chunker exploded");
    },
  };

  const failed = await ingestSource(INPUT, {
    db: db.client,
    parsers: { pdf: fakeParser(parses) },
    chunker: exploding,
    embed: fakeEmbed(embeds),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.failedStage, "chunk");
  const stored = db.tables.parsed_documents?.[0];
  assert.equal(stored?.state, "failed");
  assert.equal(stored?.failed_stage, "chunk");
  assert.equal(stored?.attempts, 1);

  const recovered = await ingestSource(INPUT, {
    db: db.client,
    parsers: { pdf: fakeParser(parses) },
    chunker: fakeChunker(["alpha", "beta"]),
    embed: fakeEmbed(embeds),
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state, "ready");
  // The parse survived the chunker's failure: it is not read twice.
  assert.equal(parses.count, 1);
  assert.equal(db.tables.library_chunks?.length, 2);
});

test("a new chunker builds its generation BESIDE the old one, which keeps serving", async () => {
  const db = new FakeDb();
  const parses = { count: 0 };
  const embeds = { texts: 0 };
  await ingestSource(INPUT, {
    db: db.client,
    parsers: { pdf: fakeParser(parses) },
    chunker: fakeChunker(["alpha", "beta"]),
    embed: fakeEmbed(embeds),
  });

  const upgraded: DocumentChunker = {
    version: "chunk@2",
    chunk: () => ["alpha split", "beta split"].map((text, i) => ({ text, locator: { kind: "page", index: i + 1 } })),
  };
  const rebuilt = await ingestSource(INPUT, {
    db: db.client,
    parsers: { pdf: fakeParser(parses) },
    chunker: upgraded,
    embed: fakeEmbed(embeds),
  });

  assert.equal(rebuilt.ok, true);
  assert.equal(rebuilt.state, "ready");
  // The bytes were read ONCE: a chunker upgrade re-chunks the stored parse.
  assert.equal(parses.count, 1);

  const all = db.tables.library_chunks ?? [];
  assert.equal(all.length, 4);
  const previous = all.filter((c) => c.chunker_version === "chunk@1");
  assert.equal(previous.length, 2);
  // 🔴 The old generation is untouched and still embedded, so search keeps
  // working throughout the upgrade instead of going dark while it runs.
  assert.equal(previous.every((c) => c.embedding !== null), true);
  assert.equal(all.filter((c) => c.chunker_version === "chunk@2").length, 2);
});

test("re-chunking replaces the generation instead of duplicating it", async () => {
  const db = new FakeDb();
  const parses = { count: 0 };
  const embeds = { texts: 0 };
  await ingestSource(INPUT, {
    db: db.client,
    parsers: { pdf: fakeParser(parses) },
    chunker: fakeChunker(["alpha", "beta"]),
    embed: fakeEmbed(embeds),
  });

  // Simulate a half-written generation: one row loses its vector, so the next
  // run resumes embedding rather than starting over.
  const chunks = db.tables.library_chunks ?? [];
  if (chunks[1]) chunks[1].embedding = null;

  const resumed = await ingestSource(INPUT, {
    db: db.client,
    parsers: { pdf: fakeParser(parses) },
    chunker: fakeChunker(["alpha", "beta"]),
    embed: fakeEmbed(embeds),
  });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.plan?.stage, "embed");
  assert.equal(resumed.plan?.needsChunk, false);
  assert.equal(db.tables.library_chunks?.length, 2);
  // Only the row that was missing a vector was paid for again.
  assert.equal(embeds.texts, 3);
});

test("with no embedder the run stops honestly at chunked", async () => {
  const db = new FakeDb();
  const outcome = await ingestSource(INPUT, {
    db: db.client,
    parsers: { pdf: fakeParser({ count: 0 }) },
    chunker: fakeChunker(["alpha"]),
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.state, "chunked");
  assert.match(outcome.note ?? "", /edge function/);
  // The rows exist and carry their versions; they are simply not searchable yet
  // (every match RPC filters `embedding is not null`).
  assert.equal(db.tables.library_chunks?.length, 1);
  assert.equal(db.tables.library_chunks?.[0]?.embedding, null);
  assert.equal(db.states.at(-1), "chunked");
});

test("an unreadable format claims nothing at all", async () => {
  const db = new FakeDb();
  const outcome = await ingestSource(
    { ...INPUT, fileName: "lecture.m4a", mimeType: "audio/mp4" },
    { db: db.client, parsers: { pdf: fakeParser({ count: 0 }) }, chunker: fakeChunker([]) },
  );

  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure, "unsupported");
  assert.equal(outcome.contentHash.length, 64);
  assert.equal(db.calls.length, 0);
  assert.equal(db.tables.parsed_documents?.length, 0);
});

test("a kind with no parser wired refuses instead of guessing", async () => {
  const db = new FakeDb();
  const outcome = await ingestSource(
    { ...INPUT, fileName: "budget.xlsx", mimeType: null },
    { db: db.client, parsers: { pdf: fakeParser({ count: 0 }) }, chunker: fakeChunker([]) },
  );
  assert.equal(outcome.failure, "unsupported");
  assert.match(outcome.error ?? "", /xlsx/);
});
