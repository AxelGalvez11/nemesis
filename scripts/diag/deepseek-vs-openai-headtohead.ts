// HEAD-TO-HEAD MATRIX: current OpenAI baseline vs DeepSeek V4 (flash + pro, non-thinking + thinking),
// plus a "tight-cite" variant that adds a citation-discipline instruction to test whether DeepSeek's
// verbatim citation hold-up improves. Identical fixed sources per question; scored with the engine's
// own attachSupport (a cited point counts only when its source verbatim-backs the claim).
// Run: deno run --allow-net --allow-env --env-file=<repo>/supabase/functions/.env \
//   scripts/diag/deepseek-vs-openai-headtohead.ts
import { generateSystem, generateTool, INTENTS } from "../../supabase/functions/ask/prompts.ts";
import { callTool } from "../../supabase/functions/ask/llm.ts";
import { attachSupport } from "../../supabase/functions/ask/support-span.ts";

const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
const BASELINE_KEY = Deno.env.get("LLM_API_KEY") ?? "";
const BASELINE_BASE = Deno.env.get("LLM_BASE_URL") ?? "https://api.openai.com/v1";
const BASELINE_MODEL = Deno.env.get("LLM_GENERATE_MODEL") ?? "gpt-4.1-mini";
const DS = "https://api.deepseek.com";
if (!DEEPSEEK_KEY || !BASELINE_KEY) { console.log("missing a key"); Deno.exit(1); }

// deno-lint-ignore no-explicit-any
const intent: any = INTENTS.find((i) => i === "drug_info") ?? INTENTS[0];
const tool = generateTool(intent);
const system = generateSystem(intent, "thorough");

const TIGHT = `\n\nCITATION DISCIPLINE: attach [n] ONLY to a sentence whose claim is stated directly by that cited source. Do NOT cite a general, combined, or inferred statement, and do not over-cite. Prefer fewer, tightly-supported points over many.`;

// Targeted re-run: the NON-thinking DeepSeek candidates (the Fast-mode options) that the earlier run
// mis-tested, plus the OpenAI baseline for reference. Thinking configs were measured in the prior run.
const CONFIGS = [
  { name: "OpenAI gpt-4.1-mini (now)", base: BASELINE_BASE, key: BASELINE_KEY, model: BASELINE_MODEL, thinking: false, tight: false },
  { name: "v4-flash non-thinking", base: DS, key: DEEPSEEK_KEY, model: "deepseek-v4-flash", thinking: false, tight: false },
  { name: "v4-pro non-thinking", base: DS, key: DEEPSEEK_KEY, model: "deepseek-v4-pro", thinking: false, tight: false },
];

const BUNDLES = [
  { question: "Does semaglutide cause side effects, and how much weight do people lose on it?", sources: [
    `[1] (pubmed, Abstract) In the STEP 1 randomized controlled trial, adults with obesity receiving once-weekly subcutaneous semaglutide 2.4 mg plus lifestyle intervention lost a mean of 14.9% of baseline body weight over 68 weeks, versus 2.4% with placebo.`,
    `[2] (pubmed, Abstract) Across the semaglutide obesity program, the most frequently reported adverse events were gastrointestinal — nausea, diarrhea, vomiting, and constipation — generally mild to moderate and most common during dose escalation.`,
    `[3] (openfda, Label) Semaglutide carries a boxed warning for thyroid C-cell tumors based on rodent carcinogenicity studies; it is contraindicated in patients with a personal or family history of medullary thyroid carcinoma or MEN 2.`,
  ] },
  { question: "What are the main downsides of metformin?", sources: [
    `[1] (pubmed, Abstract) Gastrointestinal adverse effects — diarrhea, nausea, and abdominal discomfort — are the most common reasons for metformin intolerance and are reduced by slow titration and extended-release formulations.`,
    `[2] (pubmed, Abstract) Long-term metformin use is associated with reduced serum vitamin B12 concentrations; periodic monitoring is recommended in patients with risk factors for deficiency.`,
    `[3] (openfda, Label) Lactic acidosis is a rare but serious metformin-associated risk, occurring chiefly with renal impairment, acute illness, or hypoxemia; metformin is contraindicated below an eGFR of 30 mL/min/1.73m2.`,
  ] },
  { question: "Is it safe to stop taking sertraline suddenly?", sources: [
    `[1] (pubmed, Abstract) Abrupt discontinuation of SSRIs including sertraline can precipitate a discontinuation syndrome — dizziness, nausea, sensory disturbances, insomnia, and irritability — typically within days and usually self-limiting.`,
    `[2] (pubmed, Abstract) Gradual tapering of SSRIs reduces the incidence and severity of discontinuation symptoms compared with abrupt cessation; tapering schedules should be individualized.`,
    `[3] (openfda, Label) Sertraline carries a boxed warning for increased risk of suicidal thinking and behavior in children, adolescents, and young adults; patients should be monitored when starting or changing therapy.`,
  ] },
  { question: "Do statins cause muscle problems?", sources: [
    `[1] (pubmed, Abstract) Muscle symptoms (myalgia) are the most commonly reported statin adverse effect in practice, though randomized and re-challenge studies indicate most reported cases are not caused by the statin itself.`,
    `[2] (pubmed, Abstract) Rhabdomyolysis is a rare but serious statin complication; risk rises with higher doses and with drug interactions that raise statin blood levels.`,
    `[3] (pubmed, Abstract) In blinded randomized trials the excess rate of muscle symptoms attributable to statins versus placebo is small, suggesting a substantial nocebo component in real-world reports.`,
  ] },
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
  return { cited: cited.length, supported: supported.length };
}

// deno-lint-ignore no-explicit-any
async function gen(cfg: any, userContent: string) {
  Deno.env.set("LLM_BASE_URL", cfg.base);
  // DeepSeek V4 defaults thinking ON, so a NON-thinking DeepSeek call MUST send thinking:"disabled"
  // (the engine's routeModel does exactly this). OpenAI must NOT receive a thinking field at all.
  const isDS = cfg.base === DS;
  const thinkFields = cfg.thinking
    ? { thinking: "enabled" as const, reasoningEffort: "high" }
    : (isDS ? { thinking: "disabled" as const, temperature: 0 } : { temperature: 0 });
  const t0 = performance.now();
  // deno-lint-ignore no-explicit-any
  const { input } = await callTool<any>({
    model: cfg.model, max_tokens: 6144, ...thinkFields,
    system, tools: [tool], messages: [{ role: "user", content: userContent }],
  }, "compose_answer", cfg.key);
  return { input, ms: Math.round(performance.now() - t0) };
}

const agg = new Map<string, { cited: number; supported: number; ms: number; n: number }>();
const samples = new Map<string, string>();
for (const c of CONFIGS) agg.set(c.name, { cited: 0, supported: 0, ms: 0, n: 0 });

for (const b of BUNDLES) {
  const chunks = b.sources.map((s, i) => ({ tag: String(i + 1), chunk_text: s.replace(/^\[\d+\]\s*\([^)]*\)\s*/, "") }));
  const baseUser = `Question: ${b.question}\n\nSources (cite by [n]; use ONLY these — do not use outside knowledge):\n${b.sources.join("\n\n")}\n\nCompose the answer using compose_answer. Every factual sentence must carry the [n] tag(s) that support it.`;
  console.log(`\n=== ${b.question} ===`);
  for (const cfg of CONFIGS) {
    try {
      const r = await gen(cfg, baseUser + (cfg.tight ? TIGHT : ""));
      const s = score(r.input, chunks);
      const a = agg.get(cfg.name)!;
      a.cited += s.cited; a.supported += s.supported; a.ms += r.ms; a.n++;
      console.log(`  ${cfg.name.padEnd(30)} ${String(r.ms).padStart(6)}ms  cited=${s.cited} supported=${s.supported} (${s.cited ? Math.round(100 * s.supported / s.cited) : 0}%)`);
      if (!samples.has(cfg.name)) {
        const bl = typeof r.input?.bottom_line === "string" ? r.input.bottom_line : r.input?.bottom_line?.text;
        samples.set(cfg.name, bl ?? "(none)");
      }
    } catch (e) { console.log(`  ${cfg.name.padEnd(30)} ERROR: ${e instanceof Error ? e.message : String(e)}`); }
  }
}

console.log(`\n================ AGGREGATE (${BUNDLES.length} questions, identical sources) ================`);
for (const c of CONFIGS) {
  const a = agg.get(c.name)!;
  console.log(`${c.name.padEnd(30)} ${a.supported}/${a.cited} verbatim-supported (${a.cited ? Math.round(100 * a.supported / a.cited) : 0}%), avg ${a.n ? Math.round(a.ms / a.n) : 0}ms`);
}
console.log(`\n--- SAMPLE bottom_line (Q1) per config ---`);
for (const c of CONFIGS) console.log(`\n${c.name}:\n  ${samples.get(c.name)}`);
