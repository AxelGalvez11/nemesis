// HEAD-TO-HEAD: current provider (OpenAI baseline) vs DeepSeek V4-pro THINKING, on IDENTICAL fixed
// sources, scored with the engine's OWN citation-faithfulness check (attachSupport: a point counts as
// "supported" only when its cited source verbatim-backs the claim). Holding sources constant isolates
// the writer. Sources are representative abstract-style fixtures (real, well-established findings) —
// the faithfulness metric compares each claim to the PROVIDED source, so the comparison is fair.
// Run: deno run --allow-net --allow-env --env-file=<repo>/supabase/functions/.env \
//   scripts/diag/deepseek-vs-openai-headtohead.ts
import { generateSystem, generateTool, INTENTS } from "../../supabase/functions/ask/prompts.ts";
import { callTool } from "../../supabase/functions/ask/llm.ts";
import { attachSupport } from "../../supabase/functions/ask/support-span.ts";

const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
const BASELINE_KEY = Deno.env.get("LLM_API_KEY") ?? "";
const BASELINE_BASE = Deno.env.get("LLM_BASE_URL") ?? "https://api.openai.com/v1";
const BASELINE_MODEL = Deno.env.get("LLM_GENERATE_MODEL") ?? "gpt-4.1-mini";
const DEEPSEEK_BASE = "https://api.deepseek.com";
if (!DEEPSEEK_KEY || !BASELINE_KEY) { console.log("missing a key (need DEEPSEEK_API_KEY + LLM_API_KEY)"); Deno.exit(1); }

// deno-lint-ignore no-explicit-any
const intent: any = INTENTS.find((i) => i === "drug_info") ?? INTENTS[0];
const tool = generateTool(intent);
const system = generateSystem(intent, "thorough");

const BUNDLES = [
  {
    question: "Does semaglutide cause side effects, and how much weight do people lose on it?",
    sources: [
      `[1] (pubmed, Abstract) In the STEP 1 randomized controlled trial, adults with obesity receiving once-weekly subcutaneous semaglutide 2.4 mg plus lifestyle intervention lost a mean of 14.9% of baseline body weight over 68 weeks, versus 2.4% with placebo.`,
      `[2] (pubmed, Abstract) Across the semaglutide obesity program, the most frequently reported adverse events were gastrointestinal — nausea, diarrhea, vomiting, and constipation — generally mild to moderate and most common during dose escalation.`,
      `[3] (openfda, Label) Semaglutide carries a boxed warning for thyroid C-cell tumors based on rodent carcinogenicity studies; it is contraindicated in patients with a personal or family history of medullary thyroid carcinoma or MEN 2.`,
    ],
  },
  {
    question: "What are the main downsides of metformin?",
    sources: [
      `[1] (pubmed, Abstract) Gastrointestinal adverse effects — diarrhea, nausea, and abdominal discomfort — are the most common reasons for metformin intolerance and are reduced by slow titration and extended-release formulations.`,
      `[2] (pubmed, Abstract) Long-term metformin use is associated with reduced serum vitamin B12 concentrations; periodic monitoring is recommended in patients with risk factors for deficiency.`,
      `[3] (openfda, Label) Lactic acidosis is a rare but serious metformin-associated risk, occurring chiefly in the setting of renal impairment, acute illness, or hypoxemia; metformin is contraindicated below an eGFR of 30 mL/min/1.73m2.`,
    ],
  },
  {
    question: "Is it safe to stop taking sertraline suddenly?",
    sources: [
      `[1] (pubmed, Abstract) Abrupt discontinuation of SSRIs including sertraline can precipitate a discontinuation syndrome — dizziness, nausea, sensory disturbances, insomnia, and irritability — typically within days and usually self-limiting.`,
      `[2] (pubmed, Abstract) Gradual tapering of SSRIs reduces the incidence and severity of discontinuation symptoms compared with abrupt cessation; tapering schedules should be individualized.`,
      `[3] (openfda, Label) Sertraline carries a boxed warning for increased risk of suicidal thinking and behavior in children, adolescents, and young adults; patients should be monitored when starting or changing therapy.`,
    ],
  },
  {
    question: "Do statins cause muscle problems?",
    sources: [
      `[1] (pubmed, Abstract) Muscle symptoms (myalgia) are the most commonly reported statin adverse effect in clinical practice, though randomized trials and re-challenge studies indicate the majority of reported cases are not caused by the statin itself.`,
      `[2] (pubmed, Abstract) Rhabdomyolysis is a rare but serious statin complication; risk rises with higher doses and with drug interactions that raise statin blood levels.`,
      `[3] (pubmed, Abstract) In blinded randomized trials the excess rate of muscle symptoms attributable to statins versus placebo is small, suggesting a substantial nocebo component in real-world reports.`,
    ],
  },
];

// deno-lint-ignore no-explicit-any
function toPoints(arr: any): any[] {
  return (Array.isArray(arr) ? arr : []).map((p) => ({
    text: typeof p === "string" ? p : (p?.text ?? ""),
    citation_ids: (Array.isArray(p?.citations) ? p.citations : []).map((c: unknown) => String(c).replace(/[^0-9]/g, "")).filter(Boolean),
  }));
}
// deno-lint-ignore no-explicit-any
function score(raw: any, chunks: Array<{ tag: string; chunk_text: string }>) {
  // deno-lint-ignore no-explicit-any
  const sections: any = { what_we_know: toPoints(raw?.what_we_know), what_we_do_not_know: toPoints(raw?.what_we_do_not_know), safety_notes: toPoints(raw?.safety_notes) };
  const withS = attachSupport(sections, chunks);
  const all = [...withS.what_we_know, ...withS.what_we_do_not_know, ...withS.safety_notes];
  const cited = all.filter((p) => p.citation_ids.length > 0);
  const supported = cited.filter((p) => (p.support?.length ?? 0) > 0);
  return { points: all.length, cited: cited.length, supported: supported.length };
}

async function gen(base: string, key: string, model: string, thinking: boolean, userContent: string) {
  Deno.env.set("LLM_BASE_URL", base);
  const t0 = performance.now();
  // deno-lint-ignore no-explicit-any
  const { input } = await callTool<any>({
    model, max_tokens: 6144,
    ...(thinking ? { thinking: "enabled" as const, reasoningEffort: "high" } : { temperature: 0 }),
    system, tools: [tool], messages: [{ role: "user", content: userContent }],
  }, "compose_answer", key);
  return { input, ms: Math.round(performance.now() - t0) };
}

const agg = { base: { cited: 0, supported: 0, ms: 0 }, ds: { cited: 0, supported: 0, ms: 0 } };
let firstSample = "";

for (const b of BUNDLES) {
  const chunks = b.sources.map((s, i) => ({ tag: String(i + 1), chunk_text: s.replace(/^\[\d+\]\s*\([^)]*\)\s*/, "") }));
  const userContent = `Question: ${b.question}\n\nSources (cite by [n]; use ONLY these — do not use outside knowledge):\n${b.sources.join("\n\n")}\n\nCompose the answer using compose_answer. Every factual sentence must carry the [n] tag(s) that support it.`;
  console.log(`\n=== ${b.question} ===`);
  try {
    const a = await gen(BASELINE_BASE, BASELINE_KEY, BASELINE_MODEL, false, userContent);
    const sa = score(a.input, chunks);
    agg.base.cited += sa.cited; agg.base.supported += sa.supported; agg.base.ms += a.ms;
    const blA = typeof a.input?.bottom_line === "string" ? a.input.bottom_line : a.input?.bottom_line?.text;
    console.log(`  baseline  ${BASELINE_MODEL.padEnd(16)} ${a.ms}ms  cited=${sa.cited} supported=${sa.supported} (${sa.cited ? Math.round(100 * sa.supported / sa.cited) : 0}%)`);

    const d = await gen(DEEPSEEK_BASE, DEEPSEEK_KEY, "deepseek-v4-pro", true, userContent);
    const sd = score(d.input, chunks);
    agg.ds.cited += sd.cited; agg.ds.supported += sd.supported; agg.ds.ms += d.ms;
    const blD = typeof d.input?.bottom_line === "string" ? d.input.bottom_line : d.input?.bottom_line?.text;
    console.log(`  deepseek  v4-pro/thinking   ${d.ms}ms  cited=${sd.cited} supported=${sd.supported} (${sd.cited ? Math.round(100 * sd.supported / sd.cited) : 0}%)`);

    if (!firstSample) {
      firstSample = `\n--- SAMPLE bottom_line (first question) ---\nBASELINE (${BASELINE_MODEL}):\n  ${blA}\n\nDEEPSEEK (v4-pro/thinking):\n  ${blD}`;
    }
  } catch (e) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const pct = (s: number, c: number) => (c ? Math.round(100 * s / c) : 0);
console.log(`\n================ AGGREGATE (${BUNDLES.length} questions, identical sources) ================`);
console.log(`baseline ${BASELINE_MODEL}: ${agg.base.supported}/${agg.base.cited} cited points verbatim-supported (${pct(agg.base.supported, agg.base.cited)}%), avg ${Math.round(agg.base.ms / BUNDLES.length)}ms`);
console.log(`deepseek v4-pro/thinking: ${agg.ds.supported}/${agg.ds.cited} cited points verbatim-supported (${pct(agg.ds.supported, agg.ds.cited)}%), avg ${Math.round(agg.ds.ms / BUNDLES.length)}ms`);
console.log(firstSample);
