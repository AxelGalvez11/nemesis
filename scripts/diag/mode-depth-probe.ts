// Throwaway probe: do Fast vs Thorough genuinely differ on a RESEARCH-RICH question (label + real PubMed
// abstracts), and does giving Thorough MORE chunks (matchCount 12 -> 18) make it deeper? Tests BOTH levers
// on the right question type (efficacy, where depth has something to add). Reuses the real generate() so it
// picks up whatever prompts.ts currently says — run it before AND after the prompt edit to see the shift.
//
// Run: deno run --env-file=supabase/functions/.env --allow-env --allow-net scripts/diag/mode-depth-probe.ts

import { generate } from "../../supabase/functions/ask/generate.ts";
import { llmApiKey } from "../../supabase/functions/ask/llm.ts";
import { fetchPubMedOA } from "../../supabase/functions/core-source-sync/providers/pubmed.ts";
import type { RetrievedChunk } from "../../supabase/functions/ask/citation.ts";

const KEY = llmApiKey();
const OPENFDA_KEY = Deno.env.get("OPENFDA_API_KEY") ?? "";
const QUESTION = "How effective is tirzepatide for weight loss, and what does the evidence show?";

function clip(s: string, n = 1400): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

async function buildPool(): Promise<RetrievedChunk[]> {
  let n = 0;
  const mk = (provider: string, section: string | null, title: string, text: string): RetrievedChunk => ({
    tag: String(++n), chunk_id: `c${n}`, source_id: `s${n}`, provider, title, section,
    url: null, license: null, published_date: "2023-01-01", retrieved_at: "2026-06-22", similarity: 0.5, chunk_text: clip(text),
  });

  // Real PubMed abstracts first (research leads the slice, as the reranker would order an efficacy query).
  let research: RetrievedChunk[] = [];
  try {
    const pm = await fetchPubMedOA({ query: "tirzepatide weight loss randomized trial", retmax: 14, oaOnly: false });
    research = pm.filter((s) => s.content_text).map((s) => mk("pubmed_oa", null, s.title, s.content_text));
    console.log(`fetched ${research.length} real PubMed abstracts`);
  } catch (e) {
    console.warn(`PubMed fetch failed (${(e as Error).message}) — research chunks will be sparse`);
  }

  // Real openFDA label chunks (label family — capped at 4 in the real cited slice).
  let label: RetrievedChunk[] = [];
  try {
    const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:%22Mounjaro%22&limit=1` + (OPENFDA_KEY ? `&api_key=${OPENFDA_KEY}` : "");
    const r = (await (await fetch(url)).json()).results?.[0];
    const get = (k: string): string => Array.isArray(r[k]) ? r[k].join(" ") : "";
    label = [
      mk("openfda", "indications_and_usage", "Mounjaro (tirzepatide) label", get("indications_and_usage")),
      mk("openfda", "mechanism_of_action", "Mounjaro (tirzepatide) label", get("mechanism_of_action") || get("clinical_pharmacology")),
      mk("openfda", "adverse_reactions", "Mounjaro (tirzepatide) label", get("adverse_reactions")),
    ].filter((c) => c.chunk_text);
  } catch (e) {
    console.warn(`label fetch failed (${(e as Error).message})`);
  }
  const pool = [...research, ...label];
  console.log(`pool = ${pool.length} chunks (${research.length} pubmed + ${label.length} label)\n`);
  return pool;
}

function show(label: string, raw: any) {
  const cite = (p: any) => (p?.citations?.length ? ` [${p.citations.join("][")}]` : "");
  const allText = [raw.bottom_line?.text, ...(raw.what_we_know ?? []).map((p: any) => p.text), ...(raw.what_we_do_not_know ?? []).map((p: any) => p.text), ...(raw.safety_notes ?? []).map((p: any) => p.text)].join(" ");
  const words = allText.split(/\s+/).filter(Boolean).length;
  const cited = new Set([...(raw.what_we_know ?? []), ...(raw.safety_notes ?? [])].flatMap((p: any) => p.citations ?? []));
  const hasNumbers = /\b\d+(\.\d+)?\s?(%|kg|mg|weeks?|months?)\b/i.test(allText);
  console.log(`\n${"=".repeat(80)}\n${label}\n${"=".repeat(80)}`);
  console.log(`[~${words} words | wk:${(raw.what_we_know ?? []).length} dont_know:${(raw.what_we_do_not_know ?? []).length} safety:${(raw.safety_notes ?? []).length} | distinct sources cited:${cited.size} | has numbers/effect-sizes:${hasNumbers} | grade:${raw.evidence_grade}]`);
  console.log(`\nBOTTOM LINE: ${raw.bottom_line?.text}${cite(raw.bottom_line)}`);
  console.log(`\nWHAT WE KNOW:`);
  for (const p of raw.what_we_know ?? []) console.log(`  • ${p.text}${cite(p)}`);
  if (raw.what_we_do_not_know?.length) { console.log(`\nWHAT WE DON'T KNOW:`); for (const p of raw.what_we_do_not_know) console.log(`  • ${p.text}${cite(p)}`); }
  if (raw.safety_notes?.length) { console.log(`\nSAFETY NOTES:`); for (const p of raw.safety_notes) console.log(`  • ${p.text}${cite(p)}`); }
}

async function gen(style: "plain" | "thorough", chunks: RetrievedChunk[]) {
  return (await generate({ question: QUESTION, intent: "drug_overview", chunks, healthContext: null, apiKey: KEY, style })).raw;
}

async function main() {
  if (!KEY) throw new Error("no LLM key");
  console.log(`QUESTION: ${QUESTION}\n`);
  const pool = await buildPool();
  if (pool.length < 6) throw new Error(`pool too small (${pool.length}) — PubMed likely throttled; rerun or add a key`);
  const slice12 = pool.slice(0, 12);
  const slice18 = pool.slice(0, 18);
  show(`FAST (plain) — ${slice12.length} chunks`, await gen("plain", slice12));
  show(`THOROUGH (thorough) — ${slice12.length} chunks [current MATCH_COUNT]`, await gen("thorough", slice12));
  show(`THOROUGH (thorough) — ${slice18.length} chunks [engine lever: bigger slice]`, await gen("thorough", slice18));
}

main().catch((e) => { console.error("PROBE FAILED:", e.message); Deno.exit(1); });
