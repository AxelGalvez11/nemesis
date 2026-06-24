// WORKAROUND PROBE: can DeepSeek V4 thinking mode reliably fill our REAL complex compose_answer
// form via tool_choice:"auto" (the model chooses to call it) instead of FORCED (which 400s in
// thinking mode)? V3's flakiness was INTERMITTENT, so we run N trials on the actual tool schema +
// real system prompt and report the success rate + whether thinking actually happened.
// Run: deno run --allow-net --allow-env --env-file=<repo>/supabase/functions/.env \
//   scripts/diag/deepseek-v4-thinking-workaround.ts
import { generateSystem, generateTool, INTENTS } from "../../supabase/functions/ask/prompts.ts";

const KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
if (!KEY) { console.log("no DEEPSEEK_API_KEY"); Deno.exit(1); }
const BASE = "https://api.deepseek.com";
const N = 5;

// deno-lint-ignore no-explicit-any
const intent: any = INTENTS.find((i) => i === "drug_info") ?? INTENTS[0];
const tool = generateTool(intent);
const system = generateSystem(intent, "thorough");

const question = "What does the evidence say about semaglutide for weight loss, and what are the main side effects?";
const sources = [
  `[1] (pubmed, Abstract) Once-weekly semaglutide 2.4 mg reduced mean body weight by 14.9% vs 2.4% with placebo over 68 weeks in adults with obesity (STEP 1, randomized controlled trial).`,
  `[2] (pubmed, Abstract) The most common adverse events with semaglutide were gastrointestinal: nausea, diarrhea, vomiting, and constipation, mostly mild-to-moderate and transient during dose escalation.`,
  `[3] (openfda, Label) Semaglutide carries a boxed warning for thyroid C-cell tumors based on rodent studies; contraindicated with a personal or family history of medullary thyroid carcinoma or MEN 2.`,
];
const userContent =
  `Question: ${question}\n\nSources (cite by [n]; use ONLY these — do not use outside knowledge):\n${sources.join("\n\n")}` +
  `\n\nCompose the answer using compose_answer. Every factual sentence must carry the [n] tag(s) that support it.`;

// deno-lint-ignore no-explicit-any
function validShape(obj: any): { ok: boolean; why: string } {
  if (!obj || typeof obj !== "object") return { ok: false, why: "not an object" };
  const bl = obj.bottom_line;
  const blText = typeof bl === "string" ? bl : bl?.text;
  if (!blText || typeof blText !== "string") return { ok: false, why: "no bottom_line text" };
  if (!obj.evidence_grade) return { ok: false, why: "no evidence_grade" };
  const wk = Array.isArray(obj.what_we_know) ? obj.what_we_know : [];
  // deno-lint-ignore no-explicit-any
  const anyCite = (bl?.citations?.length ?? 0) > 0 || wk.some((p: any) => (p?.citations?.length ?? 0) > 0);
  if (!anyCite) return { ok: false, why: "no [n] citations anywhere" };
  return { ok: true, why: `bottom_line + ${wk.length} what_we_know pts, cited` };
}

async function trial(i: number) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      max_tokens: 6144,
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }],
      tool_choice: "auto",
      messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
    }),
  });
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) { console.log(`#${i} HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`); return { ok: false, reasoning: false }; }
  const j = await res.json();
  const msg = j.choices?.[0]?.message;
  const reasoning = typeof msg?.reasoning_content === "string" && msg.reasoning_content.length > 0;
  // deno-lint-ignore no-explicit-any
  const call = msg?.tool_calls?.find((c: any) => c.function?.name === "compose_answer");
  if (!call) { console.log(`#${i} (${ms}ms) reasoning=${reasoning} — NO tool_call (prose instead), finish=${j.choices?.[0]?.finish_reason}`); return { ok: false, reasoning }; }
  // deno-lint-ignore no-explicit-any
  let parsed: any;
  try { parsed = JSON.parse(call.function.arguments); }
  catch { console.log(`#${i} (${ms}ms) reasoning=${reasoning} — tool_call but INVALID JSON: ${String(call.function.arguments).slice(0, 120)}`); return { ok: false, reasoning }; }
  const v = validShape(parsed);
  console.log(`#${i} (${ms}ms) reasoning=${reasoning} tool_call=yes json=valid shape=${v.ok ? "OK" : "BAD(" + v.why + ")"}`);
  return { ok: v.ok, reasoning, sample: v.ok ? parsed : undefined };
}

console.log(`Workaround A — deepseek-v4-pro THINKING + tool_choice:"auto", REAL compose_answer schema, ${N} trials.\n`);
const results = [];
for (let i = 1; i <= N; i++) results.push(await trial(i));
const ok = results.filter((r) => r.ok).length;
const reasoned = results.filter((r) => r.reasoning).length;
console.log(`\nSUMMARY: ${ok}/${N} returned our VALID structured answer; ${reasoned}/${N} actually used thinking.`);
// deno-lint-ignore no-explicit-any
const sample: any = results.find((r) => r.ok)?.sample;
if (sample) {
  const bl = typeof sample.bottom_line === "string" ? sample.bottom_line : sample.bottom_line?.text;
  console.log(`\nSample bottom_line:\n  ${bl}`);
  if (Array.isArray(sample.what_we_know) && sample.what_we_know[0]) {
    console.log(`Sample what_we_know[0]:\n  ${JSON.stringify(sample.what_we_know[0])}`);
  }
}
