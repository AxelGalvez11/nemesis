#!/usr/bin/env -S deno run --allow-net --allow-env --allow-write
/**
 * Phase 1 validation — openFDA cross-entity retrieval gate.
 *
 * Proves the forked Layer-A retriever DISCRIMINATES between drugs: for each
 * seed drug, the query "<drug> contraindications" must rank that drug's own
 * openFDA label chunk #1 — not another drug's. With an openFDA-only corpus,
 * "the top hit is openfda" is trivially true and proves nothing; the real
 * signal at ~10 drugs is whether the RIGHT drug wins.
 *
 * Inspects the FULL ranked list at match_threshold=0 with raw cosine
 * similarities (NOT the thresholded RPC output) so ranking is visible, not
 * assumed. Queries are embedded with Voyage input_type=query to match the
 * asymmetric "document" mode used at ingest (embeddings.ts).
 *
 * Usage:
 *   VOYAGE_API_KEY=... SERVICE_KEY=... [SB_URL=...] \
 *     deno run --allow-net --allow-env --allow-write scripts/validate-openfda.ts [drug ...]
 */

const SB_URL = Deno.env.get("SB_URL") ?? "http://127.0.0.1:54321";
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY");

if (!SERVICE_KEY) {
  console.error("SERVICE_KEY required (local: `supabase status -o env`)");
  Deno.exit(2);
}
if (!VOYAGE_API_KEY) {
  console.error("VOYAGE_API_KEY required");
  Deno.exit(2);
}

const DEFAULT_DRUGS = [
  "lisinopril",
  "metformin",
  "atorvastatin",
  "semaglutide",
  "warfarin",
  "amoxicillin",
  "sertraline",
  "omeprazole",
  "amlodipine",
  "levothyroxine",
];
const drugs = Deno.args.length ? Deno.args : DEFAULT_DRUGS;

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "voyage-3-large",
      input: [text],
      input_type: "query",
      output_dimension: 1024,
      truncation: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

interface SourceMeta {
  id: string;
  title: string;
  provider: string;
  license: string;
  metadata: Record<string, unknown>;
}

async function loadSourceMap(): Promise<Map<string, SourceMeta>> {
  // Paginate: PostgREST caps responses at 1000 rows, and the corpus exceeds
  // that after the seed (4k+ sources), so a single fetch would silently
  // truncate the id→source map and produce false retrieval failures.
  const map = new Map<string, SourceMeta>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(
      `${SB_URL}/rest/v1/core_sources?select=id,title,provider,license,metadata&limit=${PAGE}&offset=${offset}`,
      { headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!res.ok) {
      throw new Error(
        `core_sources fetch ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    const rows = (await res.json()) as SourceMeta[];
    for (const r of rows) map.set(r.id, r);
    if (rows.length < PAGE) break;
  }
  return map;
}

interface MatchRow {
  source_id: string;
  chunk_text: string;
  section: string | null;
  provider: string;
  license: string;
  source_url: string;
  similarity: number;
}

async function match(embedding: number[]): Promise<MatchRow[]> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/match_core_source_chunks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_count: 10,
      match_threshold: 0, // inspect the full ranked list, do not pre-filter
    }),
  });
  if (!res.ok) {
    throw new Error(`rpc ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as MatchRow[];
}

/** Searchable identity string for a source: title + generic names, lowercased. */
function drugIdentity(src: SourceMeta | undefined): string {
  if (!src) return "";
  const gen = (src.metadata?.generic_names as string[] | undefined)?.join(" ") ??
    "";
  const brand = (src.metadata?.brand_names as string[] | undefined)?.join(" ") ??
    "";
  return `${src.title} ${gen} ${brand}`.toLowerCase();
}

const sourceMap = await loadSourceMap();
console.log(
  `Loaded ${sourceMap.size} core_sources; validating ${drugs.length} drugs.\n`,
);

let pass = 0;
const evidence: unknown[] = [];

for (const drug of drugs) {
  const emb = await embedQuery(`${drug} contraindications`);
  const rows = await match(emb);
  const top = rows[0];
  const topSrc = top ? sourceMap.get(top.source_id) : undefined;
  const hit = top ? drugIdentity(topSrc).includes(drug.toLowerCase()) : false;
  if (hit) pass++;

  console.log(
    `■ ${drug.padEnd(14)} ${hit ? "PASS" : "FAIL"}  top sim=${
      top?.similarity?.toFixed(3) ?? "—"
    }`,
  );
  for (const [i, r] of rows.slice(0, 3).entries()) {
    const s = sourceMap.get(r.source_id);
    console.log(
      `    ${i + 1}. sim=${r.similarity.toFixed(3)}  ${r.provider}/${
        r.section ?? "—"
      }  «${s?.title ?? r.source_id}»  [${r.license}]`,
    );
  }

  evidence.push({
    drug,
    query: `${drug} contraindications`,
    pass: hit,
    top_similarity: top?.similarity ?? null,
    ranked: rows.slice(0, 5).map((r) => ({
      sim: Number(r.similarity.toFixed(4)),
      provider: r.provider,
      section: r.section,
      license: r.license,
      source: sourceMap.get(r.source_id)?.title ?? r.source_id,
    })),
  });
}

console.log(`\n=== ${pass}/${drugs.length} drugs: right drug ranked #1 ===`);
await Deno.writeTextFile(
  "docs/phase1-openfda-validation.json",
  JSON.stringify(evidence, null, 2),
);
console.log("evidence → docs/phase1-openfda-validation.json");

if (pass < drugs.length) Deno.exit(1);
