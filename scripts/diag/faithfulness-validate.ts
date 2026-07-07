// scripts/diag/faithfulness-validate.ts
//
// OUTCOME VALIDATION for the faithfulness judge (advisor-prescribed 2026-06-14). The pure harness tests
// verify PLUMBING; this checks a REAL judge (gpt-4.1, temp 0 — stronger than & distinct from the
// gpt-4.1-mini generator, to avoid self-preference bias) produces sensible verdicts on REAL v34 claims,
// across all THREE directions — not just the false-negatives I already believe should pass:
//   A. FALSE-NEGATIVE RECOVERY: the 3 v34 no-span claims (correct cites that missed the lexical bar) →
//      expect mostly `supported` (the judge fixes what word-overlap missed).
//   B. HAS-SPAN AGREEMENT: claims that DID get a lexical span → expect `supported` (a not_supported here
//      is a found false-positive or a judge error — both worth seeing).
//   C. NEGATIVE CONTROLS (constructed): a real claim fed an UNRELATED drug's source → the judge MUST say
//      not_supported. The single most important check: if it rubber-stamps these, the metric is worthless.
//   D. DETERMINISM: same pair judged twice at temp 0 → identical verdict (the "reproducible" claim).
//
// This is a SPOT-CHECK (sanity), NOT a calibration. Reads saved data + makes ~15 judge calls with the
// existing LLM_API_KEY (no new secret, no prod write). The full 233-claim pass is the gated step.
//
// Run: export SB_URL unneeded; set -a; . supabase/functions/.env; set +a
//      deno run --allow-read --allow-env --allow-net scripts/diag/faithfulness-validate.ts
// NOT committed (diagnostic).

import { buildJudgePrompt, parseVerdict, type Verdict } from "../../eval/lib/faithfulness.ts";

const KEY = Deno.env.get("LLM_API_KEY");
const BASE = Deno.env.get("LLM_BASE_URL") ?? "https://api.openai.com/v1";
const JUDGE_MODEL = "gpt-4.1"; // stronger than + distinct from the gpt-4.1-mini generator
if (!KEY) { console.error("LLM_API_KEY required (source supabase/functions/.env)"); Deno.exit(2); }

const oneLine = (s: string, n = 130) => s.replace(/\s+/g, " ").trim().slice(0, n);

async function judge(claim: string, sourceText: string): Promise<Verdict> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      seed: 7,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildJudgePrompt(claim, sourceText) }],
    }),
  });
  if (!res.ok) return { label: "unclear", reason: `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}` };
  const j = await res.json();
  return parseVerdict(j.choices?.[0]?.message?.content ?? "");
}

interface Pt { text: string; citation_ids?: string[]; support?: Array<{ quote?: string }> }
interface Resp { __error?: string; answer_sections?: { what_we_know?: Pt[]; safety_notes?: Pt[] }; source_texts?: Array<{ tag: string; text: string }> }
const data = JSON.parse(await Deno.readTextFile("/tmp/pharmaorb-scorecard-v34.json")) as { transcripts: Array<{ id: string; question: string; response: Resp }> };

// collect (claim, firstCitedTagText, hasSpan, id) records from all delivered answers
interface Rec { id: string; claim: string; tag: string; text: string; hasSpan: boolean }
const recs: Rec[] = [];
for (const t of data.transcripts) {
  const r = t.response;
  if (!r || r.__error || !r.source_texts?.length) continue;
  const byTag = new Map(r.source_texts.map((s) => [s.tag, s.text]));
  for (const p of [...(r.answer_sections?.what_we_know ?? []), ...(r.answer_sections?.safety_notes ?? [])]) {
    const tag = (p.citation_ids ?? [])[0];
    if (!tag) continue;
    const text = byTag.get(String(tag));
    if (!text) continue;
    recs.push({ id: t.id, claim: p.text, tag: String(tag), text, hasSpan: (p.support?.length ?? 0) > 0 });
  }
}

const noSpan = recs.filter((r) => !r.hasSpan);
const hasSpan = recs.filter((r) => r.hasSpan);

// A. all no-span claims (false-negative recovery)
const A = noSpan;
// B. a spread of has-span claims (agreement) — take 5 from distinct transcripts
const B: Rec[] = [];
const seenIds = new Set<string>();
for (const r of hasSpan) { if (!seenIds.has(r.id)) { B.push(r); seenIds.add(r.id); } if (B.length >= 5) break; }
// C. negative controls: a claim about a named drug + a source from a transcript that does NOT mention it
const DRUGS = ["semaglutide", "lisinopril", "metformin", "atorvastatin", "warfarin", "sertraline", "amoxicillin", "testosterone"];
const C: Array<{ claim: string; text: string; note: string }> = [];
for (const drug of DRUGS) {
  const claimRec = recs.find((r) => r.claim.toLowerCase().includes(drug));
  const foreign = recs.find((r) => !r.text.toLowerCase().includes(drug) && !r.claim.toLowerCase().includes(drug) && r.id !== claimRec?.id);
  if (claimRec && foreign) {
    C.push({ claim: claimRec.claim, text: foreign.text, note: `${drug} claim ⟂ ${foreign.id} source (no "${drug}")` });
    if (C.length >= 2) break;
  }
}

async function run(label: string, items: Array<{ claim: string; text: string; meta: string; expect: string }>) {
  console.log("\n" + "=".repeat(100) + `\n${label}`);
  for (const it of items) {
    const v = await judge(it.claim, it.text);
    const ok = it.expect === "any" ? "·" : v.label === it.expect ? "✅" : "❌";
    console.log(`\n ${ok} expect=${it.expect} got=${v.label}  ${it.meta}`);
    console.log(`     claim:  ${oneLine(it.claim, 150)}`);
    console.log(`     source: ${oneLine(it.text, 130)}`);
    if (v.reason) console.log(`     reason: ${oneLine(v.reason, 150)}`);
  }
}

await run("A. FALSE-NEGATIVE RECOVERY (no-span claims; expect supported for correct-but-paraphrased cites)",
  A.map((r) => ({ claim: r.claim, text: r.text, meta: `[${r.id}] tag ${r.tag}`, expect: "any" })));

await run("B. HAS-SPAN AGREEMENT (lexical span existed; expect supported)",
  B.map((r) => ({ claim: r.claim, text: r.text, meta: `[${r.id}] tag ${r.tag}`, expect: "supported" })));

await run("C. NEGATIVE CONTROLS (claim ⟂ unrelated drug's source; MUST be not_supported)",
  C.map((c) => ({ claim: c.claim, text: c.text, meta: c.note, expect: "not_supported" })));

// D. determinism — judge the first A pair twice, compare
if (A.length) {
  console.log("\n" + "=".repeat(100) + "\nD. DETERMINISM (same pair ×2 at temp 0)");
  const v1 = await judge(A[0].claim, A[0].text);
  const v2 = await judge(A[0].claim, A[0].text);
  console.log(`   run1=${v1.label}  run2=${v2.label}  ${v1.label === v2.label ? "✅ identical" : "⚠ NON-DETERMINISTIC"}`);
}
