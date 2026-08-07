/**
 * Phase 4 acceptance: do chunks enter and leave the index correctly?
 *
 * 🔴 AGAINST A REAL POSTGRES, BECAUSE A MOCK WOULD PROVE NOTHING. The claims
 * being made here are all claims about SQL — that a CHECK constraint permits the
 * row, that a unique index makes re-indexing idempotent, that a LEFT JOIN is
 * what lets a source chunk out, that a source outranks a note at equal
 * similarity. An in-memory fake would agree with whatever this file asserted.
 *
 * The harness builds the same schema production has (verified column by column
 * against the live database on 2026-08-07), then applies THE REAL MIGRATION
 * FILE. If the migration would not apply, this fails here rather than in a
 * deploy.
 *
 * What it still does not prove: that the migration applies to PRODUCTION, whose
 * table already holds 158 note rows. That is queued as a deferred check.
 *
 * Requires a local Postgres with pgvector:
 *   brew install pgvector && createdb nemesis_docindex
 *   psql -d nemesis_docindex -c 'create extension vector; create extension pgcrypto'
 *
 * Run from apps/web:
 *   npx tsx scripts/phase4-index-roundtrip.mts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildDocument } from "../../../packages/shared/src/document-model.ts";
import { chunkDocument } from "../../../packages/shared/src/document-chunks.ts";
import { chunkRowsFor, CHUNKER_VERSION } from "../lib/notebooks/source-chunks.ts";

const DB = process.env.PHASE4_DB ?? "nemesis_docindex";
const repoRoot = join(import.meta.dirname, "..", "..", "..");

function sql(statement: string): string {
  const file = join(tmpdir(), `phase4-${Math.abs(hash(statement))}.sql`);
  writeFileSync(file, statement);
  let out: string;
  try {
    out = execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tA", "-f", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (caught) {
    // psql's stderr carries the whole failing statement. The first ERROR line
    // is the part a person needs; dumping the rest buries it.
    const stderr = String((caught as { stderr?: Buffer }).stderr ?? "");
    const first = stderr.split("\n").find((line) => line.includes("ERROR:")) ?? stderr.slice(0, 200);
    throw new Error(first.trim());
  }
  // psql prints a completion tag ("INSERT 0 1") alongside returned rows, and an
  // id with a tag stuck to it is not a uuid. Strip the tags, keep the data.
  return out
    .split("\n")
    .filter((line) => !/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|COMMENT|GRANT|REVOKE|SET|BEGIN|COMMIT|DO)\b/.test(line))
    .join("\n")
    .trim();
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  return h;
}

const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => checks.push({ detail, name, ok });

// ── The schema production actually has ──────────────────────────────────────
// Column types, nullability and constraints copied from the live database, so a
// row this harness accepts is a row production accepts.
sql(`
drop table if exists library_chunks cascade;
drop table if exists parsed_documents cascade;
drop table if exists readable_library_documents cascade;

create table readable_library_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  deleted boolean not null default false
);

create table parsed_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  content_hash text not null,
  doc_kind text not null,
  parser_version text not null,
  structure jsonb not null default '{}'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  unit_count integer not null default 0,
  visual_count integer not null default 0,
  table_count integer not null default 0,
  state text not null default 'pending',
  failed_stage text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unreferenced_at timestamptz,
  complete boolean not null default false
);

create table library_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_id uuid references readable_library_documents(id) on delete cascade,
  path text not null,
  title text not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(1024),
  created_at timestamptz not null default now(),
  origin_type text not null default 'note' check (origin_type in ('source','note')),
  parsed_document_id uuid references parsed_documents(id) on delete cascade,
  unit_kind text check (unit_kind is null or unit_kind in ('page','slide','sheet','section','document')),
  unit_index integer,
  unit_label text,
  cell_range text,
  heading_path text[],
  parser_version text,
  chunker_version text,
  embedding_version text,
  constraint library_chunks_one_origin check (
    (origin_type = 'note'   and document_id is not null and parsed_document_id is null)
    or
    (origin_type = 'source' and parsed_document_id is not null and document_id is null)
  )
);
`);

// ── The real migration, applied unmodified ──────────────────────────────────
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260807030000_source_chunk_retrieval.sql"),
  "utf8",
)
  // The harness has no Supabase roles. Everything else — the functions, the
  // indexes, the join, the ordering — is applied exactly as written.
  .replace(/^\s*(revoke|grant)\b[\s\S]*?;\s*$/gim, "");
sql(migration);
check("the migration applies", true);

// ── A document, chunked by the real chunker ─────────────────────────────────
const model = buildDocument({
  blocks: [
    { headingPath: [], kind: "heading", level: 1, text: "Commerce power", unit: 0 },
    { headingPath: ["Commerce power"], kind: "paragraph", text: "The substantial effects test asks whether an activity, in the aggregate, substantially affects interstate commerce.", unit: 0 },
    { headingPath: ["Commerce power"], kind: "paragraph", text: "Wickard v. Filburn is the high-water mark of the aggregation principle.", unit: 1 },
    { headingPath: ["Commerce power"], kind: "table", table: { headerRows: 1, rows: [["Case", "Year"], ["Lopez", "1995"]] }, text: "", unit: 1 },
  ],
  format: "pdf",
  title: "Con Law week 4",
  units: [
    { index: 0, kind: "page" },
    { index: 1, kind: "page" },
  ],
});

const chunks = chunkDocument(model);
const userId = sql(`select gen_random_uuid()`);
const parseId = sql(`
insert into parsed_documents (user_id, content_hash, doc_kind, parser_version, state, complete)
values ('${userId}', repeat('a', 64), 'pdf', 'test-parser', 'parsed', true)
returning id;
`);

// A fake but correctly-shaped embedding: this measures plumbing, not relevance.
const vector = (seed: number) =>
  `[${Array.from({ length: 1024 }, (_, i) => (i === seed % 1024 ? 1 : 0)).join(",")}]`;

const rows = chunkRowsFor(model, chunks).map((row, index) => ({ ...row, embedding: vector(index) }));
const written = sql(`
select replace_source_chunks(
  '${parseId}'::uuid, '${userId}'::uuid,
  'Constitutional law/Commerce power', 'Con Law week 4',
  'test-parser', '${CHUNKER_VERSION}', 'test-embed',
  $json$${JSON.stringify(rows)}$json$::jsonb
);
`);
check("chunks are written", Number(written) === rows.length, `${written} of ${rows.length}`);

// ── ENTER: does every provenance column survive the write? ──────────────────
const stored = JSON.parse(
  sql(`
select coalesce(json_agg(row_to_json(t)), '[]')::text from (
  select chunk_index, origin_type, unit_kind, unit_index, heading_path,
         parsed_document_id is not null as has_parse,
         document_id is null as no_note,
         embedding is not null as has_embedding,
         length(content) as chars
    from library_chunks where parsed_document_id = '${parseId}' order by chunk_index
) t;
`),
) as Record<string, unknown>[];

check("every chunk is a source chunk", stored.every((r) => r.origin_type === "source"));
check("every chunk points at its parse", stored.every((r) => r.has_parse === true && r.no_note === true));
check("every chunk carries an embedding", stored.every((r) => r.has_embedding === true));
check(
  "every chunk carries a locator",
  stored.every((r) => typeof r.unit_kind === "string" && typeof r.unit_index === "number"),
  JSON.stringify(stored.map((r) => [r.unit_kind, r.unit_index])),
);
check(
  "the heading path survives as an array",
  stored.some((r) => Array.isArray(r.heading_path) && (r.heading_path as string[]).includes("Commerce power")),
);
check(
  "no chunk lost its text",
  stored.every((r) => Number(r.chars) > 0),
);

// ── LEAVE: does retrieval return them, with the locator intact? ─────────────
const hits = JSON.parse(
  sql(`
select coalesce(json_agg(row_to_json(t)), '[]')::text from (
  select * from match_document_chunks('${vector(1)}'::vector, 5, -1, null)
) t;
`),
) as Record<string, unknown>[];

check("retrieval returns source chunks", hits.length > 0, `${hits.length} hits`);
check(
  "a result still knows where it came from",
  hits.every((h) => h.unit_kind !== null && h.unit_index !== null && h.parsed_document_id !== null),
);
check(
  "a result carries the heading trail",
  hits.some((h) => Array.isArray(h.heading_path) && (h.heading_path as string[]).length > 0),
);

// ── The original outranks a note that matches equally well ──────────────────
const noteId = sql(`
insert into readable_library_documents (user_id) values ('${userId}') returning id;
`);
sql(`
insert into library_chunks (user_id, document_id, origin_type, path, title, chunk_index, content, embedding, embedding_version)
values ('${userId}', '${noteId}', 'note', 'notes/con-law', 'Notes', 0,
        'A restatement of the substantial effects test.', '${vector(0)}'::vector, 'test-embed');
`);
const ranked = JSON.parse(
  sql(`
select coalesce(json_agg(row_to_json(t)), '[]')::text from (
  select origin_type, similarity from match_document_chunks('${vector(0)}'::vector, 5, -1, null)
) t;
`),
) as { origin_type: string; similarity: number }[];
check(
  // A genuine tie: the note carries the SAME vector as the source chunk, so
  // nothing but the origin preference can separate them.
  "the original outranks a note that matches comparably",
  ranked[0]?.origin_type === "source",
  JSON.stringify(ranked.map((r) => [r.origin_type, r.similarity.toFixed(3)])),
);
check(
  "a live note is still retrievable",
  ranked.some((r) => r.origin_type === "note"),
);

// 🔴 AND THE PREFERENCE MUST NOT BECOME AN OVERRIDE. The first ordering sorted
// sources first outright, and this check is what caught it: a source at
// similarity 0.000 ranked above a note at 1.000 — a perfect answer buried under
// an irrelevant one, which is worse than the notes-only search it replaces.
sql(`update library_chunks set embedding = '${vector(700)}'::vector where origin_type = 'note';`);
const noteWins = JSON.parse(
  sql(`
select coalesce(json_agg(row_to_json(t)), '[]')::text from (
  select origin_type, similarity from match_document_chunks('${vector(700)}'::vector, 5, -1, null)
) t;
`),
) as { origin_type: string; similarity: number }[];
check(
  "a clearly better note still wins",
  noteWins[0]?.origin_type === "note",
  JSON.stringify(noteWins.map((r) => [r.origin_type, r.similarity.toFixed(3)])),
);

// A deleted note must vanish; a source has no note to be deleted.
sql(`update readable_library_documents set deleted = true where id = '${noteId}';`);
const afterDelete = JSON.parse(
  sql(`
select coalesce(json_agg(row_to_json(t)), '[]')::text from (
  select origin_type from match_document_chunks('${vector(0)}'::vector, 5, -1, null)
) t;
`),
) as { origin_type: string }[];
check(
  "deleting a note hides its chunks and leaves the source alone",
  !afterDelete.some((r) => r.origin_type === "note") && afterDelete.some((r) => r.origin_type === "source"),
);

// ── Idempotency: re-indexing must not double the document ───────────────────
sql(`
select replace_source_chunks(
  '${parseId}'::uuid, '${userId}'::uuid,
  'Constitutional law/Commerce power', 'Con Law week 4',
  'test-parser', '${CHUNKER_VERSION}', 'test-embed',
  $json$${JSON.stringify(rows)}$json$::jsonb
);
`);
check(
  "re-indexing replaces rather than duplicates",
  Number(sql(`select count(*) from library_chunks where parsed_document_id = '${parseId}'`)) === rows.length,
);

// A NEW embedding generation writes alongside, so a re-embed does not blind the
// search while it runs.
sql(`
select replace_source_chunks(
  '${parseId}'::uuid, '${userId}'::uuid, 'p', 't', 'test-parser',
  '${CHUNKER_VERSION}', 'test-embed-v2', $json$${JSON.stringify(rows)}$json$::jsonb
);
`);
check(
  "a new embedding generation lands beside the old one",
  Number(sql(`select count(*) from library_chunks where parsed_document_id = '${parseId}'`)) === rows.length * 2,
);

// ── The queue ───────────────────────────────────────────────────────────────
const queuedBefore = Number(
  sql(`select count(*) from list_unchunked_parses('${CHUNKER_VERSION}', 'test-embed', 50)`),
);
const queuedNew = Number(sql(`select count(*) from list_unchunked_parses('${CHUNKER_VERSION}', 'brand-new', 50)`));
check("a fully indexed parse leaves the queue", queuedBefore === 0, `${queuedBefore} still queued`);
check("a new embedding version re-queues everything", queuedNew === 1, `${queuedNew} queued`);

// ── The one-origin rule is the database's, not the writer's ────────────────
let refused = false;
try {
  sql(`
insert into library_chunks (user_id, document_id, parsed_document_id, origin_type, path, title, chunk_index, content)
values ('${userId}', '${noteId}', '${parseId}', 'source', 'p', 't', 99, 'both at once');
`);
} catch {
  refused = true;
}
check("a chunk cannot claim to be both a note and a source", refused);

// ── Report ──────────────────────────────────────────────────────────────────
const failed = checks.filter((c) => !c.ok);
console.log("");
for (const c of checks) console.log(`${c.ok ? "  ok  " : "  FAIL"} ${c.name}${c.detail ? `  — ${c.detail}` : ""}`);
console.log(`\n${checks.length - failed.length} of ${checks.length} passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
