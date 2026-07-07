// Throwaway probe: how different are Fast (plain) vs Thorough on the SAME evidence + question, through the
// REAL generate()? Isolates the PROMPT/register lever (the retrieval lever is the same MATCH_COUNT either
// way — see index.ts:91-93). Fetches the real Mounjaro openFDA label for authentic grounding.
//
// Run: deno run --env-file=supabase/functions/.env --allow-env --allow-net scripts/diag/mode-compare-probe.ts

import { generate } from "../../supabase/functions/ask/generate.ts";
import { llmApiKey } from "../../supabase/functions/ask/llm.ts";
import type { RetrievedChunk } from "../../supabase/functions/ask/citation.ts";

const KEY = llmApiKey();
const OPENFDA_KEY = Deno.env.get("OPENFDA_API_KEY") ?? "";

function clip(s: string, n = 1200): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

async function fetchChunks(): Promise<RetrievedChunk[]> {
  const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:%22Mounjaro%22&limit=1` +
    (OPENFDA_KEY ? `&api_key=${OPENFDA_KEY}` : "");
  const r = (await (await fetch(url)).json()).results?.[0];
  const ofda = r.openfda ?? {};
  const generic = (ofda.generic_name ?? []).join(", ");
  const get = (k: string): string => Array.isArray(r[k]) ? r[k].join(" ") : "";
  let n = 1;
  const mk = (section: string, text: string): RetrievedChunk => ({
    tag: String(n++), chunk_id: `c${n}`, source_id: `s${n}`, provider: "openfda",
    title: `Mounjaro (${generic}) label`, section, url: null, license: null,
    published_date: "2024-11-01", retrieved_at: "2026-06-21", similarity: 0.5, chunk_text: clip(text),
  });
  return [
    mk("identification", `Brand: ${(ofda.brand_name ?? []).join(", ")}. Generic: ${generic}. Manufacturer: ${(ofda.manufacturer_name ?? []).join(", ")}. Route: ${(ofda.route ?? []).join(", ")}.`),
    mk("indications_and_usage", get("indications_and_usage")),
    mk("mechanism_of_action", get("mechanism_of_action") || get("clinical_pharmacology")),
    mk("dosage_and_administration", get("dosage_and_administration")),
    mk("adverse_reactions", get("adverse_reactions") || get("warnings_and_cautions")),
  ].filter((c) => c.chunk_text);
}

function show(label: string, raw: any) {
  console.log(`\n${"=".repeat(78)}\n${label}\n${"=".repeat(78)}`);
  const cite = (p: any) => (p?.citations?.length ? ` [${p.citations.join("][")}]` : "");
  const wordCount = [raw.bottom_line?.text, ...(raw.what_we_know ?? []).map((p: any) => p.text), ...(raw.safety_notes ?? []).map((p: any) => p.text)].join(" ").split(/\s+/).filter(Boolean).length;
  console.log(`\n[~${wordCount} words | what_we_know: ${(raw.what_we_know ?? []).length} | dont_know: ${(raw.what_we_do_not_know ?? []).length} | safety: ${(raw.safety_notes ?? []).length} | grade: ${raw.evidence_grade}]`);
  console.log(`\nBOTTOM LINE: ${raw.bottom_line?.text ?? "(none)"}${cite(raw.bottom_line)}`);
  console.log(`\nWHAT WE KNOW:`);
  for (const p of raw.what_we_know ?? []) console.log(`  • ${p.text}${cite(p)}`);
  if (raw.what_we_do_not_know?.length) { console.log(`\nWHAT WE DON'T KNOW:`); for (const p of raw.what_we_do_not_know) console.log(`  • ${p.text}${cite(p)}`); }
  if (raw.safety_notes?.length) { console.log(`\nSAFETY NOTES:`); for (const p of raw.safety_notes) console.log(`  • ${p.text}${cite(p)}`); }
}

async function main() {
  if (!KEY) throw new Error("no LLM key");
  const chunks = await fetchChunks();
  for (const question of ["Does Mounjaro cause nausea?", "Is Mounjaro used for weight loss?"]) {
    console.log(`\n\n########## QUESTION: ${question} ##########`);
    const fast = await generate({ question, intent: "drug_overview", chunks, healthContext: null, apiKey: KEY, style: "plain" });
    show("FAST (plain)", fast.raw);
    const thorough = await generate({ question, intent: "drug_overview", chunks, healthContext: null, apiKey: KEY, style: "thorough" });
    show("THOROUGH (thorough)", thorough.raw);
  }
}

main().catch((e) => { console.error("PROBE FAILED:", e.message); Deno.exit(1); });
