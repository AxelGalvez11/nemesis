// Demo: unified retrieval — library + live PubMed + live ClinicalTrials, reranked together.
// Proves the architecture the owner asked for: EVERY query hits the library AND both live
// APIs, and the cross-encoder reranker (today's PR1 win) ranks all three source types in one
// list by relevance. No deploy — this calls the same providers /ask would use.
//
// Run:  deno run --allow-net --allow-env --allow-read --env-file=.env eval/live-retrieval-demo.ts "your question"
//
// Output: the unified top-K with an [origin] tag per row, so you can see live results
// interleave with library chunks by relevance (not by source).
import { embedQuery, rerankRows } from "./lib/voyage.ts";
import { matchChunks, mintUser, readEnv, teardownUser } from "./lib/corpus.ts";
import { gatherLiveCandidates } from "../supabase/functions/ask/live-sources.ts";

interface Cand {
  origin: "library" | "pubmed" | "clinicaltrials";
  provider: string;
  ref: string; // source_id (library) | PMID/NCT (live)
  title: string;
  url: string;
  chunk_text: string; // reranked field
}

const TOP_K = 12;
const LIBRARY_POOL = 30;

const query = Deno.args[0] ?? "What are the latest cardiovascular outcomes for tirzepatide?";
const env = readEnv();
const user = await mintUser(env);

try {
  // 1. Library (dense ANN over the embedded corpus).
  const emb = await embedQuery(query);
  const libRows = await matchChunks(env, user.jwt, emb, LIBRARY_POOL, 0);
  const library: Cand[] = libRows.map((r) => ({
    origin: "library",
    provider: r.provider,
    ref: r.source_id.slice(0, 8),
    title: "(library chunk)",
    url: "",
    chunk_text: r.chunk_text,
  }));

  // 2. Live PubMed + ClinicalTrials (parallel, fault-tolerant).
  const live = await gatherLiveCandidates({ query });
  const liveCands: Cand[] = live.map((c) => ({
    origin: c.origin,
    provider: c.provider,
    ref: c.provider_id,
    title: c.title,
    url: c.url,
    chunk_text: c.text,
  }));

  console.log(`\nQuery: ${query}`);
  console.log(`Candidates → library:${library.length}  pubmed:${liveCands.filter((c) => c.origin === "pubmed").length}  clinicaltrials:${liveCands.filter((c) => c.origin === "clinicaltrials").length}`);

  // 3. Rerank ALL source types together — the reranker reads text, so it ranks a PubMed
  //    abstract, a trial summary, and a library chunk on one scale.
  const all = [...library, ...liveCands];
  const ranked = await rerankRows(query, all);

  console.log(`\nUnified top-${TOP_K} (reranked across all sources):`);
  ranked.slice(0, TOP_K).forEach((c, i) => {
    const label = c.origin === "library" ? `library/${c.provider}` : `LIVE/${c.origin}`;
    const head = c.title === "(library chunk)" ? c.chunk_text.slice(0, 72).replace(/\n/g, " ") : c.title.slice(0, 72);
    console.log(`${String(i + 1).padStart(2)}. [${label}] ${c.ref}  ${head}`);
  });

  const liveInTop = ranked.slice(0, TOP_K).filter((c) => c.origin !== "library").length;
  console.log(`\n→ ${liveInTop}/${TOP_K} of the top results are LIVE (not in the library) — evidence the app couldn't cite today.`);
} finally {
  await teardownUser(env, user.userId);
}
