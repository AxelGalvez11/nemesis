// Demo: unified retrieval — library + live PubMed + ClinicalTrials + openFDA labels, reranked
// together; with --save, the top live results are written back into the library (read-through-
// ingest) so you can watch the library grow.
//
// Run (read-only):  deno run --allow-net --allow-env --allow-read --env-file=.env eval/live-retrieval-demo.ts "your question"
// Run (grow lib):   deno run --allow-net --allow-env --allow-read --env-file=.env eval/live-retrieval-demo.ts "your question" --save
import { embedQuery, rerankRows } from "./lib/voyage.ts";
import { matchChunks, mintUser, readEnv, teardownUser } from "./lib/corpus.ts";
import { gatherLiveCandidates, type LiveCandidate } from "../supabase/functions/ask/live-sources.ts";
import { saveToLibrary } from "../supabase/functions/ask/live-ingest.ts";

interface Cand {
  origin: "library" | string;
  provider: string;
  ref: string;
  title: string;
  chunk_text: string; // reranked field
  live?: LiveCandidate; // present for live rows → carries the full source for save-back
}

const TOP_K = 12;
const LIBRARY_POOL = 30;
const SAVE = Deno.args.includes("--save");
const query = Deno.args.find((a) => !a.startsWith("--")) ?? "What are the latest cardiovascular outcomes for tirzepatide?";

const env = readEnv();

async function countSources(): Promise<number> {
  const res = await fetch(`${env.SB_URL}/rest/v1/core_sources?select=id`, {
    method: "HEAD",
    headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = res.headers.get("content-range");
  return cr ? Number(cr.split("/")[1]) : -1;
}

const user = await mintUser(env);
try {
  // 1. Library (dense ANN over the embedded corpus).
  const emb = await embedQuery(query);
  const libRows = await matchChunks(env, user.jwt, emb, LIBRARY_POOL, 0);
  const library: Cand[] = libRows.map((r) => ({
    origin: "library", provider: r.provider, ref: r.source_id.slice(0, 8), title: "(library chunk)", chunk_text: r.chunk_text,
  }));

  // 2. Live: every registered source, concurrently + fault-tolerantly.
  const live = await gatherLiveCandidates({ query });
  const liveCands: Cand[] = live.map((c) => ({
    origin: c.origin, provider: c.provider, ref: c.provider_id, title: c.title, chunk_text: c.text, live: c,
  }));
  const byOrigin = (o: string) => liveCands.filter((c) => c.origin === o).length;

  console.log(`\nQuery: ${query}`);
  console.log(`Candidates → library:${library.length}  pubmed:${byOrigin("pubmed")}  europepmc:${byOrigin("europepmc")}  clinicaltrials:${byOrigin("clinicaltrials")}  openfda:${byOrigin("openfda")}  faers:${byOrigin("faers")}`);

  // 3. Rerank ALL source types together (the reranker reads text → one scale).
  const ranked = await rerankRows(query, [...library, ...liveCands]);
  const top = ranked.slice(0, TOP_K);

  console.log(`\nUnified top-${TOP_K} (reranked across all sources):`);
  top.forEach((c, i) => {
    const label = c.origin === "library" ? `library/${c.provider}` : `LIVE/${c.origin}`;
    const head = c.title === "(library chunk)" ? c.chunk_text.slice(0, 70).replace(/\n/g, " ") : c.title.slice(0, 70);
    console.log(`${String(i + 1).padStart(2)}. [${label}] ${c.ref}  ${head}`);
  });
  console.log(`\n→ ${top.filter((c) => c.origin !== "library").length}/${TOP_K} of the top results are LIVE (not in the library).`);

  // 4. Optional read-through-ingest: save the live results that made the top-K into the library.
  if (SAVE) {
    const toSave = top.filter((c) => c.live).map((c) => c.live!.source);
    if (toSave.length === 0) {
      console.log("\n[--save] No live results in the top-K to save.");
    } else {
      const before = await countSources();
      console.log(`\n[--save] Library has ${before} sources. Saving ${toSave.length} live result(s) back...`);
      const r = await saveToLibrary(toSave);
      const after = await countSources();
      console.log(`[--save] newly embedded: ${r.newlyEmbedded}  chunks: ${r.chunksInserted}  already had (dedupe): ${r.alreadyHad}  failed/license-gated: ${r.failed}`);
      console.log(`[--save] Library grew ${before} → ${after} sources (+${after - before}). Next time this question is asked, these are served from the library — no API call.`);
    }
  }
} finally {
  await teardownUser(env, user.userId);
}
