// DEEP RESEARCH test: does v4-pro THINKING write better research reports than the current OpenAI
// synthesis? Uses the REAL compose_report tool + synthesis system, on research-style questions with
// several sources. Arms: OpenAI gpt-4.1-mini (current, forced non-thinking) vs v4-pro thinking
// (callTool's auto+fallback). Scores faithfulness (attachSupport over the report's cited points) and
// prints the summary + a sample point so the prose can be read.
// Run: deno run --allow-net --allow-env --env-file=<repo>/supabase/functions/.env \
//   scripts/diag/deepseek-deepresearch-test.ts
import { REPORT_TOOL, synthesisSystemForMode } from "../../supabase/functions/ask/research/synthesize.ts";
import { callTool } from "../../supabase/functions/ask/llm.ts";
import { attachSupport } from "../../supabase/functions/ask/support-span.ts";

const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
const BASELINE_KEY = Deno.env.get("LLM_API_KEY") ?? "";
const BASELINE_BASE = Deno.env.get("LLM_BASE_URL") ?? "https://api.openai.com/v1";
const BASELINE_MODEL = Deno.env.get("LLM_GENERATE_MODEL") ?? "gpt-4.1-mini";
const DS = "https://api.deepseek.com";
if (!DEEPSEEK_KEY || !BASELINE_KEY) { console.log("missing a key"); Deno.exit(1); }

const system = synthesisSystemForMode(undefined);

const BUNDLES = [
  {
    question: "What does the evidence say about semaglutide for weight management in adults with obesity — efficacy, durability, and main safety concerns?",
    outline: "1. How much weight loss? 2. Is it durable / what happens on stopping? 3. Cardiovascular effects? 4. Main adverse effects and warnings?",
    sources: [
      `[1] (pubmed) STEP 1 RCT: adults with obesity on once-weekly semaglutide 2.4 mg plus lifestyle lost a mean 14.9% of body weight over 68 weeks vs 2.4% with placebo.`,
      `[2] (pubmed) STEP 4 withdrawal RCT: switching from semaglutide to placebo at week 20 led to substantial weight regain over the following 48 weeks, indicating continued treatment is needed to maintain loss.`,
      `[3] (pubmed) SELECT trial: in adults with overweight/obesity and established cardiovascular disease but without diabetes, semaglutide 2.4 mg reduced major adverse cardiovascular events by about 20% vs placebo.`,
      `[4] (pubmed) The most common adverse events were gastrointestinal — nausea, diarrhea, vomiting, constipation — usually mild to moderate and most frequent during dose escalation.`,
      `[5] (openfda) Label: boxed warning for thyroid C-cell tumors based on rodent studies; contraindicated with personal/family history of medullary thyroid carcinoma or MEN 2.`,
    ],
  },
  {
    question: "How does tirzepatide compare to semaglutide for type 2 diabetes glycemic control and weight, and what are the trade-offs?",
    outline: "1. Glycemic (HbA1c) effect? 2. Weight effect? 3. Head-to-head data? 4. Safety/tolerability trade-offs?",
    sources: [
      `[1] (pubmed) SURPASS-2 head-to-head RCT: in type 2 diabetes, tirzepatide (5/10/15 mg) reduced HbA1c more than semaglutide 1 mg at 40 weeks across all doses.`,
      `[2] (pubmed) In SURPASS-2, tirzepatide also produced greater weight reduction than semaglutide 1 mg, with a dose-dependent effect.`,
      `[3] (pubmed) Tirzepatide is a dual GIP/GLP-1 receptor agonist, whereas semaglutide is a selective GLP-1 receptor agonist; the added GIP activity is hypothesized to contribute to its greater effect.`,
      `[4] (pubmed) Both agents share a gastrointestinal adverse-effect profile (nausea, diarrhea, vomiting); rates were broadly similar and mostly transient during titration.`,
      `[5] (openfda) Both carry a boxed warning for thyroid C-cell tumors and are contraindicated with a personal or family history of medullary thyroid carcinoma or MEN 2.`,
    ],
  },
];

const ARMS = [
  { name: "OpenAI gpt-4.1-mini (current synthesis)", base: BASELINE_BASE, key: BASELINE_KEY, model: BASELINE_MODEL, thinking: false },
  { name: "v4-pro THINKING (auto+fallback)", base: DS, key: DEEPSEEK_KEY, model: "deepseek-v4-pro", thinking: true },
];

// deno-lint-ignore no-explicit-any
function points(arr: any): any[] {
  return (Array.isArray(arr) ? arr : []).map((p) => ({
    text: typeof p === "string" ? p : (p?.text ?? ""),
    citation_ids: (Array.isArray(p?.citations) ? p.citations : []).map((c: unknown) => String(c).replace(/[^0-9]/g, "")).filter(Boolean),
  }));
}
// deno-lint-ignore no-explicit-any
function holdUp(raw: any, chunks: Array<{ tag: string; chunk_text: string }>) {
  // deno-lint-ignore no-explicit-any
  const sec: any = { what_we_know: points(raw?.points), what_we_do_not_know: points(raw?.uncertainties), safety_notes: points(raw?.safety_notes) };
  const withS = attachSupport(sec, chunks);
  const all = [...withS.what_we_know, ...withS.what_we_do_not_know, ...withS.safety_notes];
  const cited = all.filter((p) => p.citation_ids.length > 0);
  const supported = cited.filter((p) => (p.support?.length ?? 0) > 0);
  return { points: all.length, cited: cited.length, supported: supported.length };
}

// deno-lint-ignore no-explicit-any
async function gen(arm: any, userContent: string) {
  Deno.env.set("LLM_BASE_URL", arm.base);
  const t0 = performance.now();
  // deno-lint-ignore no-explicit-any
  const { input } = await callTool<any>({
    model: arm.model, max_tokens: 8192,
    ...(arm.thinking ? { thinking: "enabled" as const, reasoningEffort: "high" } : { thinking: arm.base === DS ? "disabled" as const : undefined, temperature: 0 }),
    system, tools: [REPORT_TOOL], messages: [{ role: "user", content: userContent }],
  }, "compose_report", arm.key);
  return { input, ms: Math.round(performance.now() - t0) };
}

const agg = new Map<string, { cited: number; supported: number; points: number; ms: number; n: number }>();
for (const a of ARMS) agg.set(a.name, { cited: 0, supported: 0, points: 0, ms: 0, n: 0 });

for (const b of BUNDLES) {
  const chunks = b.sources.map((s, i) => ({ tag: String(i + 1), chunk_text: s.replace(/^\[\d+\]\s*\([^)]*\)\s*/, "") }));
  const userContent = `Question: ${b.question}\n\nPlanned sub-questions to cover (guide your sections):\n${b.outline}\n\nSources (cite by [n]; use ONLY these — do not use outside knowledge):\n${b.sources.join("\n\n")}\n\nCompose the report using compose_report. Every factual sentence must carry the [n] tag(s) that support it.`;
  console.log(`\n=== ${b.question.slice(0, 70)}... ===`);
  for (const arm of ARMS) {
    try {
      const r = await gen(arm, userContent);
      const h = holdUp(r.input, chunks);
      const a = agg.get(arm.name)!;
      a.cited += h.cited; a.supported += h.supported; a.points += h.points; a.ms += r.ms; a.n++;
      console.log(`  ${arm.name.padEnd(40)} ${String(r.ms).padStart(6)}ms  points=${h.points} hold-up=${h.supported}/${h.cited} (${h.cited ? Math.round(100 * h.supported / h.cited) : 0}%)`);
      console.log(`      summary: ${(typeof r.input?.summary === "string" ? r.input.summary : "(none)").slice(0, 300)}`);
    } catch (e) { console.log(`  ${arm.name.padEnd(40)} ERROR: ${e instanceof Error ? e.message : String(e)}`); }
  }
}

console.log(`\n================ AGGREGATE (${BUNDLES.length} research questions) ================`);
for (const arm of ARMS) {
  const a = agg.get(arm.name)!;
  console.log(`${arm.name.padEnd(40)} hold-up ${a.supported}/${a.cited} (${a.cited ? Math.round(100 * a.supported / a.cited) : 0}%), ${a.points} pts total, avg ${a.n ? Math.round(a.ms / a.n) : 0}ms`);
}
