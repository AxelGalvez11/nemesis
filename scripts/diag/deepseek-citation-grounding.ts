// LEVER TEST: does "quote-as-you-cite" grounding (a REQUIRED per-claim source_quote the model must copy
// verbatim from the cited source) + a citation-discipline prompt lift DeepSeek-flash's citation hold-up
// toward OpenAI's? Three arms on identical sources: OpenAI baseline (current), flash plain (current
// schema), flash GROUNDED (source_quote + discipline). Metrics: hold-up % (engine's attachSupport) and,
// for grounded, quote-verbatim % (is the model's source_quote actually a substring of the cited source).
// Run: deno run --allow-net --allow-env --env-file=<repo>/supabase/functions/.env \
//   scripts/diag/deepseek-citation-grounding.ts
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
const realTool = generateTool(intent);
const baseSystem = generateSystem(intent, "thorough");

// Quote-grounding: each point must carry the verbatim source sentence it cites.
const PT = {
  type: "object",
  properties: {
    text: { type: "string", description: "the claim, a faithful restatement of ONLY the source_quote" },
    citations: { type: "array", items: { type: "string" }, description: "the [n] tag(s) for this claim" },
    source_quote: { type: "string", description: "the VERBATIM sentence(s) copied from the cited source [n] that state this claim" },
  },
  required: ["text", "citations", "source_quote"],
};
const GROUNDED_TOOL = {
  name: "compose_answer",
  description: "Compose the structured, source-grounded answer. Every point must quote its source.",
  parameters: {
    type: "object",
    properties: {
      bottom_line: PT,
      what_we_know: { type: "array", items: PT },
      what_we_do_not_know: { type: "array", items: PT },
      safety_notes: { type: "array", items: PT },
      evidence_grade: { type: "string", enum: ["very_strong", "strong", "moderate", "weak", "very_weak", "unknown", "not_applicable"] },
    },
    required: ["bottom_line", "evidence_grade"],
  },
};
const GROUNDING = `\n\nGROUNDING DISCIPLINE (critical): For EACH point, FIRST find the single sentence in the cited source [n] that states the claim, copy it VERBATIM into source_quote, and write "text" as a faithful restatement of ONLY that quote. Cite [n] ONLY when that source directly states the claim; do not combine sources in one point, do not cite a general or inferred statement, and prefer fewer, tightly-grounded points over many.`;

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

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
// deno-lint-ignore no-explicit-any
function points(arr: any): any[] {
  return (Array.isArray(arr) ? arr : []).map((p) => ({
    text: typeof p === "string" ? p : (p?.text ?? ""),
    citation_ids: (Array.isArray(p?.citations) ? p.citations : []).map((c: unknown) => String(c).replace(/[^0-9]/g, "")).filter(Boolean),
    source_quote: typeof p?.source_quote === "string" ? p.source_quote : "",
  }));
}
// deno-lint-ignore no-explicit-any
function holdUp(raw: any, chunks: Array<{ tag: string; chunk_text: string }>) {
  // deno-lint-ignore no-explicit-any
  const sec: any = { what_we_know: points(raw?.what_we_know), what_we_do_not_know: points(raw?.what_we_do_not_know), safety_notes: points(raw?.safety_notes) };
  const withS = attachSupport(sec, chunks);
  const all = [...withS.what_we_know, ...withS.what_we_do_not_know, ...withS.safety_notes];
  const cited = all.filter((p) => p.citation_ids.length > 0);
  const supported = cited.filter((p) => (p.support?.length ?? 0) > 0);
  // quote-verbatim: model's source_quote actually appears in one cited source
  const byTag = new Map(chunks.map((c) => [c.tag, norm(c.chunk_text)]));
  const withQuote = cited.filter((p) => p.source_quote);
  const quoteReal = withQuote.filter((p) => p.citation_ids.some((t: string) => (byTag.get(t) ?? "").includes(norm(p.source_quote)) && norm(p.source_quote).length > 12));
  return { cited: cited.length, supported: supported.length, withQuote: withQuote.length, quoteReal: quoteReal.length };
}

// deno-lint-ignore no-explicit-any
async function gen(base: string, key: string, model: string, tool: any, system: string, userContent: string) {
  Deno.env.set("LLM_BASE_URL", base);
  const isDS = base === DS;
  const t0 = performance.now();
  // deno-lint-ignore no-explicit-any
  const { input } = await callTool<any>({
    model, max_tokens: 6144, ...(isDS ? { thinking: "disabled" as const } : {}), temperature: 0,
    system, tools: [tool], messages: [{ role: "user", content: userContent }],
  }, "compose_answer", key);
  return { input, ms: Math.round(performance.now() - t0) };
}

const ARMS = [
  { name: "OpenAI gpt-4.1-mini (baseline)", base: BASELINE_BASE, key: BASELINE_KEY, model: BASELINE_MODEL, tool: realTool, system: baseSystem, grounded: false },
  { name: "v4-flash plain (current schema)", base: DS, key: DEEPSEEK_KEY, model: "deepseek-v4-flash", tool: realTool, system: baseSystem, grounded: false },
  { name: "v4-flash GROUNDED (quote+discipline)", base: DS, key: DEEPSEEK_KEY, model: "deepseek-v4-flash", tool: GROUNDED_TOOL, system: baseSystem + GROUNDING, grounded: true },
];
const agg = new Map<string, { cited: number; supported: number; withQuote: number; quoteReal: number; ms: number }>();
for (const a of ARMS) agg.set(a.name, { cited: 0, supported: 0, withQuote: 0, quoteReal: 0, ms: 0 });

for (const b of BUNDLES) {
  const chunks = b.sources.map((s, i) => ({ tag: String(i + 1), chunk_text: s.replace(/^\[\d+\]\s*\([^)]*\)\s*/, "") }));
  const userContent = `Question: ${b.question}\n\nSources (cite by [n]; use ONLY these — do not use outside knowledge):\n${b.sources.join("\n\n")}\n\nCompose the answer using compose_answer. Every factual sentence must carry the [n] tag(s) that support it.`;
  console.log(`\n=== ${b.question} ===`);
  for (const arm of ARMS) {
    try {
      const r = await gen(arm.base, arm.key, arm.model, arm.tool, arm.system, userContent);
      const h = holdUp(r.input, chunks);
      const a = agg.get(arm.name)!;
      a.cited += h.cited; a.supported += h.supported; a.withQuote += h.withQuote; a.quoteReal += h.quoteReal; a.ms += r.ms;
      const q = arm.grounded ? `  quote-real=${h.quoteReal}/${h.withQuote}` : "";
      console.log(`  ${arm.name.padEnd(36)} ${String(r.ms).padStart(6)}ms  hold-up=${h.supported}/${h.cited} (${h.cited ? Math.round(100 * h.supported / h.cited) : 0}%)${q}`);
    } catch (e) { console.log(`  ${arm.name.padEnd(36)} ERROR: ${e instanceof Error ? e.message : String(e)}`); }
  }
}

console.log(`\n================ AGGREGATE (${BUNDLES.length} questions) ================`);
for (const arm of ARMS) {
  const a = agg.get(arm.name)!;
  const q = arm.grounded ? `, quote-verbatim ${a.quoteReal}/${a.withQuote} (${a.withQuote ? Math.round(100 * a.quoteReal / a.withQuote) : 0}%)` : "";
  console.log(`${arm.name.padEnd(36)} hold-up ${a.supported}/${a.cited} (${a.cited ? Math.round(100 * a.supported / a.cited) : 0}%), avg ${Math.round(a.ms / BUNDLES.length)}ms${q}`);
}
