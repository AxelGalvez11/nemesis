// Throwaway probe (Task #15): does a PROSE-nudged generate prompt actually produce ChatGPT/Claude-style
// flowing answers instead of one-sentence bullet points — on REAL source text, through the REAL model?
//
// Side-effect-free: fetches the public Mounjaro openFDA label for authentic grounding (no prod DB, no
// trace writes, no auth). Runs the SAME callTool the real generate() uses, twice on identical chunks:
//   A = CURRENT generateSystem("drug_overview","plain")  (the live "one idea per sentence" plain register)
//   B = PROSE VARIANT (same prompt with the bullet-forcing line swapped for connected-paragraph guidance,
//       and POINT_SCHEMA.text asking for a short paragraph)
// Prints both structured answers so we can LOOK before editing prompts.ts / PointItems.
//
// Run: deno run --env-file=supabase/functions/.env --allow-env --allow-net scripts/diag/prose-formatting-probe.ts

import { callTool, llmApiKey } from "../../supabase/functions/ask/llm.ts";
import { generateSystem, generateTool, PROMPT_VERSION } from "../../supabase/functions/ask/prompts.ts";

const MODEL = Deno.env.get("LLM_GENERATE_MODEL") ?? "deepseek-chat";
const KEY = llmApiKey();
const OPENFDA_KEY = Deno.env.get("OPENFDA_API_KEY") ?? "";

interface Chunk { tag: string; provider: string; section: string | null; title: string | null; chunk_text: string; }

function clip(s: string, n = 1200): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

async function fetchMounjaroChunks(): Promise<Chunk[]> {
  const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:%22Mounjaro%22&limit=1` +
    (OPENFDA_KEY ? `&api_key=${OPENFDA_KEY}` : "");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`openFDA ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const r = (await res.json()).results?.[0];
  if (!r) throw new Error("no label result");
  const ofda = r.openfda ?? {};
  const brand = (ofda.brand_name ?? []).join(", ");
  const generic = (ofda.generic_name ?? []).join(", ");
  const get = (k: string): string => Array.isArray(r[k]) ? r[k].join(" ") : "";
  const chunks: Chunk[] = [];
  let n = 1;
  const push = (section: string, text: string) => {
    if (text && text.trim()) chunks.push({ tag: String(n++), provider: "openfda", section, title: `Mounjaro (${generic}) label`, chunk_text: clip(text) });
  };
  // The openfda block itself proves the brand→generic identity (grounded, no fabrication).
  push("identification", `Brand name: ${brand}. Generic (active ingredient) name: ${generic}. Manufacturer: ${(ofda.manufacturer_name ?? []).join(", ")}. Route: ${(ofda.route ?? []).join(", ")}.`);
  push("indications_and_usage", get("indications_and_usage"));
  push("mechanism_of_action", get("mechanism_of_action") || get("clinical_pharmacology"));
  push("dosage_and_administration", get("dosage_and_administration"));
  push("adverse_reactions", get("adverse_reactions") || get("warnings_and_cautions"));
  return chunks;
}

function sourcesBlock(chunks: Chunk[]): string {
  return chunks.map((c) => `[${c.tag}] (${c.provider}${c.section ? `, ${c.section}` : ""})${c.title ? ` ${c.title}` : ""}\n${c.chunk_text}`.trim()).join("\n\n");
}

// PROSE VARIANT system: take the live plain system and swap the one bullet-forcing instruction.
function proseSystem(): string {
  const cur = generateSystem("drug_overview", "plain");
  const before = "  Short sentences, everyday words, one idea per sentence.";
  const after = [
    "  Everyday words, plain phrasing. Write the body as 1–3 SHORT CONNECTED PARAGRAPHS (about 2–4",
    "  sentences each) — the way a knowledgeable person explains something out loud, NOT a list of",
    "  one-sentence facts. Combine related facts into flowing sentences with connective phrasing",
    "  (\"because\", \"which\", \"and in trials\"); a single point may span a few sentences. Each",
    "  what_we_know entry is one such paragraph (not one sentence), and carries the [n] tags for every",
    "  claim inside it.",
  ].join("\n");
  if (!cur.includes(before)) throw new Error("anchor line not found — PLAIN_STYLE changed; update probe");
  return cur.replace(before, after);
}

// Variant tool: POINT_SCHEMA.text asks for a short paragraph instead of one sentence.
function proseTool() {
  const t = generateTool("drug_overview");
  const props = (t.parameters as any).properties;
  const paraText = { type: "string", description: "A short paragraph (1–3 connected sentences) in plain English." };
  const paraPoint = { type: "object", properties: { text: paraText, citations: props.what_we_know.items.properties.citations }, required: ["text", "citations"] };
  (t.parameters as any).properties = {
    ...props,
    bottom_line: { ...props.bottom_line, description: "One-sentence plain-English summary. MUST cite >=1 source tag." },
    what_we_know: { type: "array", items: paraPoint },
    what_we_do_not_know: { type: "array", items: paraPoint },
    safety_notes: { type: "array", items: paraPoint },
  };
  return t;
}

function userContent(question: string, chunks: Chunk[]): string {
  return `Question: ${question}\n\nSources (cite by [n]; use ONLY these — do not use outside knowledge):\n${sourcesBlock(chunks)}` +
    `\n\nCompose the answer using compose_answer. Every factual sentence must carry the [n] tag(s) that support it.`;
}

function show(label: string, raw: any) {
  console.log(`\n${"=".repeat(78)}\n${label}\n${"=".repeat(78)}`);
  const cite = (p: any) => (p?.citations?.length ? ` [${p.citations.join("][")}]` : "");
  console.log(`\nBOTTOM LINE:\n  ${raw.bottom_line?.text ?? "(none)"}${cite(raw.bottom_line)}`);
  console.log(`\nWHAT WE KNOW (${(raw.what_we_know ?? []).length} ${(raw.what_we_know ?? []).length === 1 ? "entry" : "entries"}):`);
  for (const p of raw.what_we_know ?? []) console.log(`  • ${p.text}${cite(p)}`);
  if (raw.what_we_do_not_know?.length) { console.log(`\nWHAT WE DON'T KNOW:`); for (const p of raw.what_we_do_not_know) console.log(`  • ${p.text}${cite(p)}`); }
  if (raw.safety_notes?.length) { console.log(`\nSAFETY NOTES:`); for (const p of raw.safety_notes) console.log(`  • ${p.text}${cite(p)}`); }
  if (raw.questions_to_ask?.length) { console.log(`\nQUESTIONS TO ASK:`); for (const q of raw.questions_to_ask) console.log(`  • ${q}`); }
  console.log(`\nEVIDENCE GRADE: ${raw.evidence_grade}`);
}

async function main() {
  if (!KEY) throw new Error("no LLM key in env");
  console.log(`probe: model=${MODEL} prompt_version=${PROMPT_VERSION}`);
  const question = "What is Mounjaro?";
  const chunks = await fetchMounjaroChunks();
  console.log(`\nfetched ${chunks.length} real openFDA label chunks: ${chunks.map((c) => c.section).join(", ")}`);

  const a = await callTool<any>({ model: MODEL, max_tokens: 4096, temperature: 0, system: generateSystem("drug_overview", "plain"), tools: [generateTool("drug_overview")], messages: [{ role: "user", content: userContent(question, chunks) }] }, "compose_answer", KEY);
  show("A — CURRENT plain register (live: 'one idea per sentence')", a.input);

  const b = await callTool<any>({ model: MODEL, max_tokens: 4096, temperature: 0, system: proseSystem(), tools: [proseTool()], messages: [{ role: "user", content: userContent(question, chunks) }] }, "compose_answer", KEY);
  show("B — PROSE VARIANT (connected paragraphs)", b.input);
}

main().catch((e) => { console.error("PROBE FAILED:", e.message); Deno.exit(1); });
