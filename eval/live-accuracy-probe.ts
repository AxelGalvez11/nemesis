// PROVENANCE PROBE (the verification dimension the safety-gate / guardrail / smoke all MISSED).
// Runs the FIXED full live pipeline locally — classify -> gather (field-scoped) -> rerank ->
// generate — over investigational AND approved drugs, and gates on SOURCE PROVENANCE:
//   1. an investigational drug must pull ZERO openFDA labels (it has none; a non-zero count means
//      the fraudulent name-drop products leaked back in — the exact bug this guards);
//   2. each live SOURCE's on-drug rate, surfaced per provider (PubMed/EuropePMC/CT/FAERS too).
// Then it prints the ANSWER for a human eyeball.
//
// Deliberately NO LLM fact-judge: a frozen-weight model can't adjudicate a LIVE-sourced fact (the
// source is newer than the judge — it false-flagged the real Zepbound-OSA / Wegovy-MASH approvals),
// and faithfulness wouldn't catch this bug anyway (the junk answer was faithful to its fake sources).
// Provenance is the gate; entailment-vs-source-text would be a separate, later check.
//
//   deno run --allow-net --allow-env --allow-read --allow-write=/tmp --env-file=supabase/functions/.env eval/live-accuracy-probe.ts
import { gatherLiveCandidates, liveToChunk } from "../supabase/functions/ask/live-sources.ts";
import { rerankChunks } from "../supabase/functions/ask/rerank.ts";
import { classify } from "../supabase/functions/ask/classify.ts";
import { generate } from "../supabase/functions/ask/generate.ts";
import { llmApiKey } from "../supabase/functions/ask/llm.ts";
import type { RetrievedChunk } from "../supabase/functions/ask/citation.ts";

const MATCH_COUNT = 8;
const apiKey = llmApiKey();
if (!apiKey) { console.error("no LLM key"); Deno.exit(2); }

interface BasketItem { q: string; drug: string; synonyms: string[]; investigational: boolean }
const BASKET: BasketItem[] = [
  { q: "What is retatrutide?", drug: "retatrutide", synonyms: ["ly3437943"], investigational: true },
  { q: "What is BPC-157 used for?", drug: "BPC-157", synonyms: ["bpc 157", "bpc157"], investigational: true },
  { q: "What is tirzepatide?", drug: "tirzepatide", synonyms: ["mounjaro", "zepbound"], investigational: false },
  { q: "What are the warnings for metformin?", drug: "metformin", synonyms: ["glucophage"], investigational: false },
  { q: "What is semaglutide approved for?", drug: "semaglutide", synonyms: ["ozempic", "wegovy", "rybelsus"], investigational: false },
];

// Cheap deterministic tripwire: approval/established-use phrasing in an INVESTIGATIONAL drug's answer.
// Informational only (warn) — it's a crude string match, not a fact oracle.
const APPROVAL_ASSERTION =
  /\b(is|are)\s+(a|an)\s+(prescription\s+)?(medication|drug|medicine)\s+(used|indicated|approved|prescribed)\s+(to|for)\b|\bfda[- ]approved\b|\bis approved (to|for|by)\b/i;

function onDrug(text: string, item: BasketItem): boolean {
  const hay = text.toLowerCase();
  return hay.includes(item.drug.toLowerCase()) || item.synonyms.some((s) => hay.includes(s));
}

const report: unknown[] = [];
let issues = 0;

for (const item of BASKET) {
  const cls = await classify(item.q, apiKey);
  const live = await gatherLiveCandidates({ query: cls.entity_mentions.join(" ") || item.q, mentions: cls.entity_mentions, perSourceMax: 8 });

  const byOrigin: Record<string, { n: number; offDrug: string[] }> = {};
  for (const c of live) {
    const o = byOrigin[c.origin] ??= { n: 0, offDrug: [] };
    o.n++;
    if (!onDrug(`${c.title} ${c.text.slice(0, 400)}`, item)) o.offDrug.push(c.title.slice(0, 60));
  }

  const combined = live.map((c, i) => liveToChunk(c, String(i + 1)));
  let ordered: RetrievedChunk[] = combined;
  try { ordered = await rerankChunks(item.q, combined); } catch { /* keep order */ }
  const top = ordered.slice(0, MATCH_COUNT).map((c, i) => ({ ...c, tag: String(i + 1) }));

  const gen = await generate({ question: item.q, intent: cls.intent, chunks: top, healthContext: null, apiKey });
  const summary = gen.raw.bottom_line.text;
  const fullAnswer = [summary, ...gen.raw.what_we_know.map((p) => p.text)].join("  ");

  const openfdaN = byOrigin.openfda?.n ?? 0;
  const offDrugSources = Object.entries(byOrigin).flatMap(([o, v]) => v.offDrug.map((t) => `${o}:${t}`));

  // HARD provenance gate: an investigational drug must pull ZERO openFDA labels (the fraudulent
  // name-drop-product guard). SOFT/informational: off-title rate (class-adjacent papers + dev-code
  // trials like LY3437943 legitimately don't string-match) and the approval-phrasing tripwire.
  const checks: string[] = [];
  if (item.investigational && openfdaN > 0) { issues++; checks.push(`✗ investigational but ${openfdaN} openFDA labels (fraudulent name-drop products leaked back)`); }
  if (item.investigational && APPROVAL_ASSERTION.test(fullAnswer)) checks.push(`⚠ approval-style phrasing in an investigational answer — eyeball it`);
  if (offDrugSources.length > Math.ceil(live.length * 0.34)) checks.push(`⚠ ${offDrugSources.length}/${live.length} sources off-title (class-adjacent/dev-code — informational)`);

  const sourceLine = Object.entries(byOrigin).map(([o, v]) => `${o}:${v.n}${v.offDrug.length ? `(off:${v.offDrug.length})` : ""}`).join(" ") || "(none)";
  console.log(`\n${"─".repeat(70)}\n${item.investigational ? "🧪 INVESTIGATIONAL" : "✅ APPROVED"}  ${item.drug}  (intent=${cls.intent})`);
  console.log(`  sources: ${sourceLine}`);
  console.log(`  answer:  ${summary.slice(0, 200)}`);
  if (checks.length) checks.forEach((c) => console.log(`  ${c}`));
  else console.log(`  ✓ provenance clean`);

  report.push({ drug: item.drug, investigational: item.investigational, intent: cls.intent, mentions: cls.entity_mentions, sources: byOrigin, summary, what_we_know: gen.raw.what_we_know.map((p) => p.text) });
}

await Deno.writeTextFile("/tmp/accuracy-basket.json", JSON.stringify(report, null, 2));
console.log(`\n${"═".repeat(70)}`);
console.log(issues === 0 ? "✅ PROVENANCE GATE CLEAN (investigational drugs pull 0 openFDA; eyeball answers above)" : `✗ ${issues} provenance issue(s)`);
console.log("→ wrote /tmp/accuracy-basket.json");
if (issues > 0) Deno.exit(1);
