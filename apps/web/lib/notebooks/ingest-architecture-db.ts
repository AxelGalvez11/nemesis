/**
 * A Postgres small enough to read: the source-indexing schema, in memory.
 *
 * TEST INFRASTRUCTURE for `ingest-architecture.test.ts`. Nothing in the app
 * imports it, and nothing should — it exists so the architectural promises can be
 * asserted against the SAME rules the database enforces.
 *
 * WHY IT IS WORTH THE LINES. Most of what `20260805040000_source_indexing.sql`
 * guarantees is kept by the schema, not by application code: the unique index is
 * what makes two simultaneous uploads produce one parse, the ON DELETE CASCADE is
 * what makes chunk cleanup complete, and the one-origin CHECK is what stops a row
 * claiming to be both a note and a source. A fake that accepted every write would
 * make every test that uses it vacuous.
 *
 * So this models the applied migration and the `library_chunks` table it alters:
 * the same NOT NULLs, DEFAULTs and CHECKs, the same unique indexes — including the
 * partial one and Postgres's NULLS DISTINCT rule — the same foreign-key actions,
 * and per-user read scoping standing in for RLS. `supabaseFacade` puts it behind
 * the slice of the PostgREST client surface `ingest-pipeline.ts` uses, so the
 * production statements run unmodified.
 *
 * It is NOT a Postgres. No transactions, no isolation levels, single-threaded: a
 * "race" here is two calls interleaved by the test, which is enough to prove that
 * the LOSER of a unique-index conflict joins rather than duplicates, and not
 * enough to prove anything about real concurrency.
 */

export type Row = Record<string, unknown>;

/** Real SQLSTATEs, so a test can say WHICH rule stopped a write rather than just
 *  "it threw" — and so the pipeline's own `error.code === "23505"` branch sees
 *  what it would see in production. */
export const UNIQUE_VIOLATION = "23505";
export const CHECK_VIOLATION = "23514";
export const NOT_NULL_VIOLATION = "23502";
export const FOREIGN_KEY_VIOLATION = "23503";

export class DatabaseError extends Error {
  constructor(
    readonly code: string,
    readonly constraint: string,
  ) {
    super(`${code}: ${constraint}`);
    this.name = "DatabaseError";
  }
}

const DOC_KINDS = ["pdf", "pptx", "docx", "xlsx", "image", "text", "html"];
const PARSE_STATES = ["pending", "parsing", "parsed", "chunking", "chunked", "embedding", "ready", "failed"];
const FAILED_STAGES = ["parse", "chunk", "embed"];
const UNIT_KINDS = ["page", "slide", "sheet", "section", "document"];

/** `library_chunks.embedding` is `extensions.vector(1024)`. A dimension mismatch
 *  fails SILENTLY in retrieval, so the fake treats the type as a constraint. */
export const EMBEDDING_DIMENSIONS = 1024;

interface UniqueIndex {
  readonly name: string;
  readonly columns: readonly string[];
  /** Partial-index predicate: `where origin_type = 'source'`. */
  readonly where?: (row: Row) => boolean;
}

interface CheckConstraint {
  readonly name: string;
  readonly ok: (row: Row) => boolean;
}

interface ForeignKey {
  readonly column: string;
  readonly parent: string;
  readonly onDelete: "cascade" | "setNull";
}

interface TableSchema {
  /** Column defaults, applied before the NOT NULL check — exactly like the real
   *  table, where `claimParse` inserts five columns and gets a whole row. */
  readonly defaults: Row;
  readonly notNull: readonly string[];
  readonly checks: readonly CheckConstraint[];
  readonly unique: readonly UniqueIndex[];
  readonly foreignKeys: readonly ForeignKey[];
  /** jsonb columns round-trip through JSON on write, exactly as the real column
   *  does — an `undefined` field does not survive, and a test that assumed it did
   *  would pass here and fail in production. */
  readonly jsonb: readonly string[];
}

const oneOf = (values: readonly string[], column: string) => (row: Row) => {
  const value = row[column];
  return typeof value === "string" && values.includes(value);
};

const SCHEMA: Record<string, TableSchema> = {
  parsed_documents: {
    defaults: {
      structure: {},
      coverage: {},
      unit_count: 0,
      visual_count: 0,
      table_count: 0,
      state: "pending",
      failed_stage: null,
      error: null,
      attempts: 0,
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
    },
    notNull: [
      "user_id",
      "content_hash",
      "doc_kind",
      "parser_version",
      "structure",
      "coverage",
      "unit_count",
      "visual_count",
      "table_count",
      "state",
      "attempts",
    ],
    checks: [
      { name: "parsed_documents_content_hash_check", ok: (r) => typeof r.content_hash === "string" && r.content_hash.length === 64 },
      { name: "parsed_documents_doc_kind_check", ok: oneOf(DOC_KINDS, "doc_kind") },
      { name: "parsed_documents_state_check", ok: oneOf(PARSE_STATES, "state") },
      { name: "parsed_documents_failed_stage_check", ok: (r) => r.failed_stage == null || oneOf(FAILED_STAGES, "failed_stage")(r) },
    ],
    // 🔴 The concurrency guarantee itself. Two simultaneous uploads race here.
    unique: [{ name: "parsed_documents_identity", columns: ["user_id", "content_hash", "parser_version"] }],
    foreignKeys: [],
    jsonb: ["structure", "coverage"],
  },

  library_sources: {
    defaults: {
      folder_path: "",
      mime_type: null,
      size_bytes: null,
      content_hash: null,
      parsed_document_id: null,
      deleted: false,
      created_at: "2026-08-05T00:00:00.000Z",
    },
    notNull: ["user_id", "folder_path", "file_name", "storage_path", "deleted"],
    checks: [{ name: "library_sources_file_name_check", ok: (r) => typeof r.file_name === "string" && r.file_name.length <= 512 }],
    unique: [],
    // ON DELETE SET NULL, never cascade: collecting a parse must not silently take
    // the placement row with it.
    foreignKeys: [{ column: "parsed_document_id", parent: "parsed_documents", onDelete: "setNull" }],
    jsonb: [],
  },

  library_chunks: {
    // 🔴 `path` has NO default and is NOT NULL — a leftover from the note era, and
    // the reason a source chunk has to say something about a placement it does not
    // have. `title` defaults to '', `origin_type` to 'note'.
    defaults: {
      title: "",
      origin_type: "note",
      document_id: null,
      parsed_document_id: null,
      embedding: null,
      unit_kind: null,
      unit_index: null,
      unit_label: null,
      cell_range: null,
      heading_path: null,
      parser_version: null,
      chunker_version: null,
      embedding_version: null,
      created_at: "2026-08-05T00:00:00.000Z",
    },
    notNull: ["user_id", "path", "title", "chunk_index", "content", "origin_type"],
    checks: [
      { name: "library_chunks_origin_type_check", ok: oneOf(["source", "note"], "origin_type") },
      {
        // 🔴 Exactly one origin, structurally. Not a convention anyone remembers.
        name: "library_chunks_one_origin",
        ok: (r) =>
          (r.origin_type === "note" && r.document_id != null && r.parsed_document_id == null) ||
          (r.origin_type === "source" && r.parsed_document_id != null && r.document_id == null),
      },
      { name: "library_chunks_unit_kind_check", ok: (r) => r.unit_kind == null || oneOf(UNIT_KINDS, "unit_kind")(r) },
      {
        name: "library_chunks_embedding_dimensions",
        ok: (r) => r.embedding == null || (Array.isArray(r.embedding) && r.embedding.length === EMBEDDING_DIMENSIONS),
      },
    ],
    unique: [
      // The legacy note index. `document_id` is NULL on every source chunk, and
      // Postgres treats NULLs as distinct, so it never fires for them — which is
      // the only reason source chunks can share this table with note chunks.
      { name: "library_chunks_document_id_chunk_index_key", columns: ["document_id", "chunk_index"] },
      // Idempotency and retry safety: one row per (parse, chunker, embedding, index).
      {
        name: "library_chunks_source_identity",
        columns: ["parsed_document_id", "chunker_version", "embedding_version", "chunk_index"],
        where: (r) => r.origin_type === "source",
      },
    ],
    foreignKeys: [
      { column: "parsed_document_id", parent: "parsed_documents", onDelete: "cascade" },
      { column: "document_id", parent: "readable_library_documents", onDelete: "cascade" },
    ],
    jsonb: [],
  },

  readable_library_documents: {
    defaults: {},
    notNull: ["user_id"],
    checks: [],
    unique: [],
    foreignKeys: [],
    jsonb: [],
  },

  // Not in the migration: the private bucket holding the originals. Modelled
  // because "cleanup is complete" is a claim about the bytes too, not only rows.
  storage_objects: {
    defaults: {},
    notNull: ["user_id", "path"],
    checks: [],
    unique: [{ name: "storage_objects_path_key", columns: ["path"] }],
    foreignKeys: [],
    jsonb: [],
  },
};

export interface WriteEntry {
  readonly op: "insert" | "update" | "delete";
  readonly table: string;
  readonly id: string;
  /** `cascade` means the DATABASE did it. Cleanup depends on being able to tell
   *  the difference between a foreign key doing the work and an application
   *  remembering to. */
  readonly by: "application" | "cascade";
}

interface ScopedReader {
  select(table: string, match?: Row): Row[];
}

export interface FakeDatabase {
  insert(table: string, row: Row): Row;
  /** `insert ... on conflict do nothing`: null when someone else won the race. */
  insertOnConflictDoNothing(table: string, row: Row): Row | null;
  update(table: string, id: string, patch: Row): Row;
  remove(table: string, match: (row: Row) => boolean): Row[];
  /** Service-role read: no RLS, used by tests to inspect ground truth. */
  rows(table: string): Row[];
  /** The authenticated read path. RLS is `auth.uid() = user_id` on all three tables. */
  as(userId: string): ScopedReader;
  mark(): number;
  writesSince(mark: number): WriteEntry[];
}

export function createFakeDatabase(): FakeDatabase {
  const tables = new Map<string, Row[]>(Object.keys(SCHEMA).map((name) => [name, []]));
  const journal: WriteEntry[] = [];
  let sequence = 0;

  const schemaOf = (table: string): TableSchema => {
    const schema = SCHEMA[table];
    if (!schema) throw new Error(`no such table: ${table}`);
    return schema;
  };
  const rowsOf = (table: string): Row[] => tables.get(table) ?? [];

  const normalise = (table: string, row: Row, withDefaults: boolean): Row => {
    const schema = schemaOf(table);
    const next: Row = withDefaults ? { ...schema.defaults, ...row } : { ...row };
    for (const column of schema.jsonb) {
      if (next[column] !== undefined) next[column] = JSON.parse(JSON.stringify(next[column])) as unknown;
    }
    return next;
  };

  const validate = (table: string, row: Row, ignoreId?: string): void => {
    const schema = schemaOf(table);
    for (const column of schema.notNull) {
      if (row[column] === null || row[column] === undefined) throw new DatabaseError(NOT_NULL_VIOLATION, `${table}.${column}`);
    }
    for (const check of schema.checks) {
      if (!check.ok(row)) throw new DatabaseError(CHECK_VIOLATION, check.name);
    }
    for (const fk of schema.foreignKeys) {
      const value = row[fk.column];
      if (value == null) continue;
      if (!rowsOf(fk.parent).some((parent) => parent.id === value)) throw new DatabaseError(FOREIGN_KEY_VIOLATION, `${table}_${fk.column}_fkey`);
    }
    for (const index of schema.unique) {
      if (index.where && !index.where(row)) continue;
      const key = index.columns.map((column) => row[column]);
      // NULLS DISTINCT (the Postgres default): a key with a NULL never conflicts.
      if (key.some((value) => value === null || value === undefined)) continue;
      const clash = rowsOf(table).some(
        (other) =>
          other.id !== ignoreId && (!index.where || index.where(other)) && index.columns.every((column) => other[column] === row[column]),
      );
      if (clash) throw new DatabaseError(UNIQUE_VIOLATION, index.name);
    }
  };

  /** Foreign keys pointing AT `table`, so a delete can apply their actions. */
  const childrenOf = (table: string): { child: string; fk: ForeignKey }[] =>
    Object.entries(SCHEMA).flatMap(([child, schema]) => schema.foreignKeys.filter((fk) => fk.parent === table).map((fk) => ({ child, fk })));

  const removeRows = (table: string, match: (row: Row) => boolean, by: WriteEntry["by"]): Row[] => {
    const doomed = rowsOf(table).filter(match);
    if (doomed.length === 0) return [];
    tables.set(
      table,
      rowsOf(table).filter((row) => !doomed.includes(row)),
    );
    for (const row of doomed) journal.push({ op: "delete", table, id: String(row.id), by });
    for (const { child, fk } of childrenOf(table)) {
      const ids = new Set(doomed.map((row) => row.id));
      if (fk.onDelete === "cascade") {
        removeRows(child, (row) => ids.has(row[fk.column]), "cascade");
        continue;
      }
      for (const row of rowsOf(child).filter((candidate) => ids.has(candidate[fk.column]))) {
        const next = { ...row, [fk.column]: null };
        tables.set(
          child,
          rowsOf(child).map((candidate) => (candidate.id === row.id ? next : candidate)),
        );
        journal.push({ op: "update", table: child, id: String(row.id), by: "cascade" });
      }
    }
    return doomed.map((row) => ({ ...row }));
  };

  return {
    insert(table, row) {
      const prepared = normalise(table, { id: row.id ?? `${table}-${++sequence}`, ...row }, true);
      validate(table, prepared);
      tables.set(table, [...rowsOf(table), prepared]);
      journal.push({ op: "insert", table, id: String(prepared.id), by: "application" });
      return { ...prepared };
    },

    insertOnConflictDoNothing(table, row) {
      try {
        return this.insert(table, row);
      } catch (error) {
        if (error instanceof DatabaseError && error.code === UNIQUE_VIOLATION) return null;
        throw error;
      }
    },

    update(table, id, patch) {
      const current = rowsOf(table).find((row) => row.id === id);
      if (!current) throw new Error(`${table}: no row ${id}`);
      const next = normalise(table, { ...current, ...patch }, false);
      validate(table, next, id);
      tables.set(
        table,
        rowsOf(table).map((row) => (row.id === id ? next : row)),
      );
      journal.push({ op: "update", table, id, by: "application" });
      return { ...next };
    },

    remove(table, match) {
      return removeRows(table, match, "application");
    },

    rows(table) {
      return rowsOf(table).map((row) => ({ ...row }));
    },

    as(userId) {
      return {
        select(table, match) {
          return rowsOf(table)
            .filter((row) => row.user_id === userId)
            .filter((row) => Object.entries(match ?? {}).every(([column, value]) => row[column] === value))
            .map((row) => ({ ...row }));
        },
      };
    },

    mark() {
      return journal.length;
    },

    writesSince(mark) {
      return journal.slice(mark);
    },
  };
}

/** Write entries as `"op table"`, which is what the absence-of-writes promises
 *  actually assert on. */
export const shapeOf = (writes: readonly WriteEntry[]): string[] => writes.map((write) => `${write.op} ${write.table}`);

// ─────────────────────────────────────────────────────────────────────────────
// The PostgREST facade: the pipeline's statements, unmodified, over the fake
// ─────────────────────────────────────────────────────────────────────────────

interface FacadeError {
  message: string;
  code?: string;
}

interface FacadeResult {
  data: unknown;
  error: FacadeError | null;
  count: number | null;
}

type Operation = "select" | "insert" | "upsert" | "update" | "delete";

/** A refused write arrives as an ERROR OBJECT, never as a throw. The pipeline
 *  branches on `error.code === "23505"` to detect a lost race; a thrown exception
 *  would land in its catch-all instead and that branch would never be exercised. */
const toFacadeError = (error: unknown): FacadeError =>
  error instanceof DatabaseError ? { message: error.message, code: error.code } : { message: String(error) };

const project = (row: Row, columns: string): Row => {
  if (columns === "*") return { ...row };
  return Object.fromEntries(columns.split(",").map((column) => column.trim()).map((column) => [column, row[column]]));
};

const compare = (a: unknown, b: unknown): number => (a === b ? 0 : (a as number) < (b as number) ? -1 : 1);

function createQuery(db: FakeDatabase, table: string, operation: Operation, payload?: unknown, ignoreDuplicates = false) {
  const filters: ((row: Row) => boolean)[] = [];
  let columns = "*";
  let wantCount = false;
  let headOnly = false;
  let orderColumn: string | null = null;
  let ascending = true;
  let rowLimit: number | null = null;
  let single = false;

  const matches = (row: Row): boolean => filters.every((filter) => filter(row));

  const runSelect = (): FacadeResult => {
    let rows = db.rows(table).filter(matches);
    if (orderColumn) {
      const column = orderColumn;
      rows = [...rows].sort((a, b) => compare(a[column], b[column]) * (ascending ? 1 : -1));
    }
    // 🔴 The count is taken BEFORE the limit, as `count: "exact"` is: a caller
    // counting a 300-page document must not be told there are only 128 rows.
    const count = wantCount ? rows.length : null;
    if (rowLimit !== null) rows = rows.slice(0, rowLimit);
    if (headOnly) return { data: null, error: null, count };
    const projected = rows.map((row) => project(row, columns));
    if (!single) return { data: projected, error: null, count };
    if (projected.length > 1) return { data: null, error: { message: "multiple rows returned", code: "PGRST116" }, count };
    return { data: projected[0] ?? null, error: null, count };
  };

  const execute = (): FacadeResult => {
    try {
      if (operation === "select") return runSelect();
      if (operation === "insert" || operation === "upsert") {
        for (const row of (Array.isArray(payload) ? payload : [payload]) as Row[]) {
          if (operation === "upsert" && ignoreDuplicates) db.insertOnConflictDoNothing(table, row);
          else db.insert(table, row);
        }
        return { data: null, error: null, count: null };
      }
      if (operation === "update") {
        for (const row of db.rows(table).filter(matches)) db.update(table, String(row.id), payload as Row);
        return { data: null, error: null, count: null };
      }
      db.remove(table, matches);
      return { data: null, error: null, count: null };
    } catch (error) {
      return { data: null, error: toFacadeError(error), count: null };
    }
  };

  const builder = {
    select(nextColumns?: string, options?: { count?: string; head?: boolean }) {
      columns = nextColumns ?? "*";
      wantCount = Boolean(options?.count);
      headOnly = Boolean(options?.head);
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    is(column: string, value: unknown) {
      filters.push((row) => (value === null ? row[column] == null : row[column] === value));
      return builder;
    },
    not(column: string, _operator: string, value: unknown) {
      filters.push((row) => !(value === null ? row[column] == null : row[column] === value));
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orderColumn = column;
      ascending = options?.ascending ?? true;
      return builder;
    },
    limit(count: number) {
      rowLimit = count;
      return builder;
    },
    maybeSingle() {
      single = true;
      return builder;
    },
    // Thenable, because the pipeline awaits several statements without asking for
    // rows back (`update(...).eq(...).eq(...)`).
    then<T>(resolve: (value: FacadeResult) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve(execute()).then(resolve, reject);
    },
  };
  return builder;
}

/** The pipeline's database handle, honoured over the fake. Deliberately a SUBSET:
 *  exactly the statements `ingest-pipeline.ts` issues, which is why the caller
 *  casts it — a partial client is the honest shape for a test double, and any
 *  statement it does not implement fails loudly rather than silently returning
 *  nothing. */
export function supabaseFacade(db: FakeDatabase): unknown {
  return {
    from(table: string) {
      return {
        select: (columns?: string, options?: { count?: string; head?: boolean }) => createQuery(db, table, "select").select(columns, options),
        insert: (payload: unknown) => createQuery(db, table, "insert", payload),
        upsert: (payload: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
          createQuery(db, table, "upsert", payload, options?.ignoreDuplicates ?? false),
        update: (payload: unknown) => createQuery(db, table, "update", payload),
        delete: () => createQuery(db, table, "delete"),
      };
    },
  };
}
