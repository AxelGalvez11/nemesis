/**
 * The acceptance test for the whole ingestion path, run against PRODUCTION.
 *
 * 🔴 WHY THIS IS A SCRIPT AND NOT A CHECKLIST. The source indexer was dead from
 * the day it shipped, and every individual step reported success the entire
 * time: pg_cron logged 812 `succeeded` runs, the scheduler returned a number
 * that also means "nothing to do", and the skip reason read as "old data". The
 * lesson is that a step's own exit code proves nothing — so this asserts the
 * STATE TRANSITIONS, in order, and names the one that broke.
 *
 * It takes no arguments and invents no data: it finds the most recent parse and
 * walks it forward. Read-only apart from nothing — it writes nothing at all.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/index-acceptance.mts [phrase]
 *
 * `phrase` is a distinctive string from the uploaded document; step 9 checks it
 * survived into a stored chunk. Omit it and step 9 reports SKIPPED — never
 * passed, because "we did not check" and "it works" are the exact two things
 * this incident proves must stay apart.
 *
 * 🔴 STEPS 1-10 ALL READ THE DATABASE, AND THAT IS NOT THE PRODUCT. They prove
 * a document was parsed, chunked, embedded and stored with usable locators.
 * They do NOT prove a student can find it: nothing here embeds a query, runs the
 * vector search, or exercises the ranking that decides what reaches a model.
 * Steps 11-12 name that gap and report NOT COVERED rather than letting a green
 * run imply it. An earlier version of this script called step 9 "semantic
 * retrieval finds the document", which was an overstatement of a substring match.
 */

import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const phrase = process.argv[2] ?? null;

type Step = { n: number; name: string; ok: boolean | null; detail: string };
const steps: Step[] = [];
const step = (n: number, name: string, ok: boolean | null, detail: string) => {
  steps.push({ detail, n, name, ok });
};

// 1-2. A parse exists, and it carries STRUCTURE rather than a flat string.
const { data: parses } = await db
  .from("parsed_documents")
  .select("id,doc_kind,parser_version,structure,unit_count,created_at")
  .order("created_at", { ascending: false })
  .limit(1);
const parse = parses?.[0];
if (!parse) {
  console.error("No parsed_documents row at all — upload a document first.");
  process.exit(1);
}
step(1, "upload produced a parse row", true, `${parse.id} (${parse.doc_kind}, ${parse.created_at})`);

const structure = parse.structure as { shape?: string; v?: number; model?: { units?: unknown[]; blocks?: unknown[] } } | null;
const shape = structure?.shape ?? "(none)";
const isV2 = shape === "units-blocks";
step(
  2,
  "parser persisted a structured model",
  isV2,
  isV2
    ? `v${structure?.v} ${shape}: ${structure?.model?.units?.length ?? 0} units, ${structure?.model?.blocks?.length ?? 0} blocks`
    : `shape="${shape}" — a flat string, so nothing downstream can index it`,
);

// 3. Eligible for indexing, by the SAME predicate the indexer uses.
const { data: queue } = await db.rpc("list_unchunked_parses", {
  p_chunker_version: "units-blocks-1",
  p_embedding_version: "voyage-3-large-1024",
  p_limit: 50,
});
const queued = (queue as { parsed_document_id: string }[] | null) ?? [];
const isQueued = queued.some((row) => row.parsed_document_id === parse.id);

// 4-8. Chunks and embeddings actually landed.
const { count: chunkCount } = await db
  .from("library_chunks")
  .select("id", { count: "exact", head: true })
  .eq("parsed_document_id", parse.id);
const chunks = chunkCount ?? 0;
const indexed = chunks > 0;

step(3, "became eligible for indexing", isQueued || indexed, isQueued ? "in the queue" : indexed ? "already drained from the queue" : "NOT in the queue and not indexed");

const { data: runs } = await db
  .from("source_index_runs")
  .select("ran_at,pending,claimed,indexed,skipped,chunks_embedded,skip_reasons,error")
  .order("ran_at", { ascending: false })
  .limit(5);
const recent = (runs as Record<string, unknown>[] | null) ?? [];
step(4, "cron dispatched and a run was recorded", recent.length > 0, recent.length ? `${recent.length} recent run(s); latest indexed=${recent[0]!.indexed} skipped=${recent[0]!.skipped}` : "no run telemetry at all");
step(5, "source-index received the document", indexed || recent.some((r) => Number(r.claimed) > 0), indexed ? "yes" : `latest claimed=${recent[0]?.claimed ?? 0}`);
step(6, "chunks were generated", indexed, `${chunks} chunk(s) for this parse`);

const { data: withEmbedding } = await db
  .from("library_chunks")
  .select("id,unit_kind,unit_index,unit_label,heading_path,content")
  .eq("parsed_document_id", parse.id)
  .not("embedding", "is", null)
  .limit(200);
const embedded = withEmbedding ?? [];
step(7, "embeddings were persisted", embedded.length > 0, `${embedded.length} of ${chunks} chunk(s) carry an embedding`);
step(8, "source is marked indexed", indexed && !queued.some((r) => r.parsed_document_id === parse.id), indexed ? "no longer in the unchunked queue" : "still unindexed");

// 9. The phrase survives INTO a stored chunk.
//
// 🔴 THIS IS NOT SEMANTIC RETRIEVAL, AND CALLING IT THAT WOULD BE THE EXACT
// MISTAKE THIS FILE EXISTS TO PREVENT — it is what the first version of this
// script claimed. It fetches rows already known to belong to this parse and
// substring-matches in memory. That proves the phrase survived chunking with an
// embedding written beside it, and nothing more. It never exercises the query
// embedding, the vector index, the similarity ranking, or the RPC a caller
// actually uses, so it cannot fail the way real retrieval fails: a chunk that is
// stored but never ranked highly enough to be returned passes this step and is
// useless in the product.
//
// Real retrieval is 11-12 below, reported as NOT COVERED rather than quietly
// folded into this one.
if (!phrase) {
  step(9, "the phrase survives into a stored chunk", null, "SKIPPED — pass a distinctive phrase as argv[2]");
} else {
  const hit = embedded.find((row) => String(row.content).toLowerCase().includes(phrase.toLowerCase()));
  step(
    9,
    "the phrase survives into a stored chunk (substring, NOT retrieval)",
    Boolean(hit),
    hit
      ? `found in chunk ${hit.id} — ${hit.unit_kind} ${hit.unit_index ?? "-"} ${hit.unit_label ?? ""} ${JSON.stringify(hit.heading_path)}`
      : `"${phrase}" is in no indexed chunk`,
  );
}

// 10. Locators are real, which is what makes a citation checkable — again a
//     property of the stored row, not of the application path.
const labelled = embedded.filter((row) => row.unit_label !== null).length;
const withPath = embedded.filter((row) => Array.isArray(row.heading_path) && row.heading_path.length > 0).length;
step(10, "chunks carry resolvable locators (stored metadata)", embedded.length > 0, `${labelled} with a unit label, ${withPath} with a heading path, of ${embedded.length}`);

// 🔴 THE TWO STEPS THAT WOULD ACTUALLY PROVE THE PRODUCT WORKS, AND NEITHER IS
// COVERED HERE. Steps 1-10 all read the database. A pipeline can pass every one
// of them and still return nothing to a student, because RANKING is the part
// that decides what a model gets to see.
//
//  11. query -> Voyage embedding -> the production vector-search RPC -> this
//      source comes back, ranked above the noise.
//  12. a Canvas/chat request -> the retrieval layer -> that chunk enters the
//      model's context -> the citation resolves back to the source.
//
// Both need a Voyage key and an authenticated app request, so they belong in a
// harness that has both. They are listed rather than omitted, because a test
// that silently stops short of its goal is exactly how "indexed" came to be
// mistaken for "findable".
step(11, "query embedding -> vector search returns this source", null, "NOT COVERED by this script");
step(12, "Canvas/chat retrieval puts the chunk in model context", null, "NOT COVERED by this script");

const { data: health } = await db.rpc("source_index_health", { p_runs: 3 });
const verdict = (health as { verdict?: string; stalled?: boolean; pending?: number }[] | null)?.[0];

let failed = 0;
console.log(`\nAcceptance — parse ${parse.id}\n${"─".repeat(64)}`);
for (const s of steps) {
  const mark = s.ok === null ? "SKIP" : s.ok ? "PASS" : "FAIL";
  if (s.ok === false) failed += 1;
  console.log(`${mark}  ${String(s.n).padStart(2)}. ${s.name}\n      ${s.detail}`);
}
console.log(`${"─".repeat(64)}`);
console.log(`health: ${verdict?.verdict ?? "(none)"}  [stalled=${verdict?.stalled} pending=${verdict?.pending}]`);
const unchecked = steps.filter((s) => s.ok === null).length;
console.log(
  failed === 0
    ? `\nAll checked steps passed. ${unchecked} step(s) NOT CHECKED — this is not a green pipeline.`
    : `\n${failed} step(s) FAILED — the first one is where the path breaks.`,
);
process.exit(failed === 0 ? 0 : 1);
