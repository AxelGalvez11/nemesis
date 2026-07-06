// DIAGNOSTIC (not committed): adjudicate each "cited but unsupported" benchmark claim against the
// EXACT per-tag source text the engine returned (AskResponse.source_texts, via include_source_text) —
// NOT re-retrieval (lossy; an earlier form of this script gave FALSE "drift" verdicts that way). For
// every unsupported cited claim it answers the 3-way question the per-tag/context split turns on:
//   PER-TAG  : does the CITED chunk contain a supporting sentence?  (the benchmark's own grounding check)
//   CONTEXT  : is the fact anywhere in the full retrieved set?
//   ⇒ FAITHFUL·multi-sentence  — cited chunk HAS the words, just spread across >1 sentence (window grounds)
//   ⇒ MIS-CITED-TAG            — fact is in the retrieved SET but not the CITED chunk (e.g. EVOKE Plus)
//   ⇒ DRIFT/PARAMETRIC         — fact is NOT in the retrieved set at all (e.g. the lisinopril 1.4%)
//
// Run AFTER a benchmark run with include_source_text:
//   deno run -A --no-check scripts/diag/grounding-verify.ts [/tmp/pharmaorb-scorecard-v33.json]

// tokenizer COPIED VERBATIM from support-span.ts so present/absent uses the real matcher's rules.
const STOP = new Set([
  "the","a","an","of","in","on","and","or","to","for","with","was","were","is","are","be","been","by",
  "that","this","as","at","from","than","vs","versus","its","their","our","we","it","these","those","but",
  "not","no","may","can","could","also","into","over","under","between","per","both","had","has","have",
  "who","which","when","while","during","after","before","more","most","such","they","them","there","compared",
]);
const contentTokens = (s: string): string[] =>
  (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 2 && !STOP.has(t));
function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}
const MIN_SCORE = 0.34; // matcher's per-sentence bar — NEVER lower it to ground more (would hide drift)

function bestSingle(claim: string, src: string): number {
  const ct = new Set(contentTokens(claim));
  if (ct.size === 0) return 0;
  let best = 0;
  for (const sen of sentences(src)) {
    const st = new Set(contentTokens(sen));
    let m = 0; for (const t of ct) if (st.has(t)) m++;
    best = Math.max(best, m / ct.size);
  }
  return best;
}
function bestWindow(claim: string, src: string, maxSent: number): number {
  const ct = new Set(contentTokens(claim));
  if (ct.size === 0) return 0;
  const sens = sentences(src);
  let best = 0;
  for (let i = 0; i < sens.length; i++) {
    for (let n = 1; n <= maxSent && i + n <= sens.length; n++) {
      const wt = new Set(contentTokens(sens.slice(i, i + n).join(" ")));
      let m = 0; for (const t of ct) if (wt.has(t)) m++;
      best = Math.max(best, m / ct.size);
    }
  }
  return best;
}
function coverage(claim: string, texts: string[]): { frac: number; absent: string[]; total: number } {
  const ct = [...new Set(contentTokens(claim))];
  const all = new Set<string>();
  for (const tx of texts) for (const t of contentTokens(tx)) all.add(t);
  const absent = ct.filter((t) => !all.has(t));
  return { frac: ct.length ? (ct.length - absent.length) / ct.length : 0, absent, total: ct.length };
}

const path = Deno.args[0] ?? "/tmp/pharmaorb-scorecard-v33.json";
const r = JSON.parse(Deno.readTextFileSync(path));

const tally: Record<string, number> = {};
let withFlag = 0, noFlag = 0;
for (const t of r.transcripts) {
  const resp = t.response;
  if (!resp || "__error" in resp || resp.template || resp.refused_unsupported) continue;
  const st: Array<{ tag: string; text: string }> = resp.source_texts ?? [];
  if (st.length === 0) { noFlag++; continue; }
  withFlag++;
  const byTag = new Map(st.map((s) => [s.tag, s.text]));
  const allTexts = st.map((s) => s.text);
  const points = [...(resp.answer_sections?.what_we_know ?? []), ...(resp.answer_sections?.safety_notes ?? [])];
  const misses = points.filter((p: any) => (p.support?.length ?? 0) === 0 && (p.citation_ids?.length ?? 0) > 0);
  if (misses.length === 0) continue;
  console.log(`\n${"=".repeat(80)}\n[${t.id}] ${t.question}`);
  for (const p of misses) {
    const citedTexts = (p.citation_ids as string[]).map((tag) => byTag.get(tag)).filter((x): x is string => !!x);
    const perTagSingle = Math.max(0, ...citedTexts.map((tx) => bestSingle(p.text, tx)));
    const perTagWindow = Math.max(0, ...citedTexts.map((tx) => bestWindow(p.text, tx, 3)));
    const perTagCov = coverage(p.text, citedTexts);
    const ctxCov = coverage(p.text, allTexts);
    let verdict: string;
    if (perTagSingle >= MIN_SCORE) verdict = "⁇ SHOULD-HAVE-GROUNDED (matcher bug — investigate)";
    else if (perTagCov.frac >= 0.7) verdict = perTagWindow >= MIN_SCORE ? "FAITHFUL · cited-chunk window grounds" : "FAITHFUL · cited-chunk has the words, spread >3 sent";
    else if (ctxCov.frac >= 0.7) verdict = "MIS-CITED-TAG · fact in the set, not the CITED chunk";
    else verdict = "DRIFT/PARAMETRIC · fact NOT in the retrieved set";
    tally[verdict.split(" ")[0]] = (tally[verdict.split(" ")[0]] ?? 0) + 1;
    console.log(`\n  • [cites ${(p.citation_ids as string[]).join(",")}, ${p.text.length}c] ${p.text.slice(0, 150)}${p.text.length > 150 ? "…" : ""}`);
    console.log(`    per-tag: single ${(perTagSingle * 100).toFixed(0)}%  window<=3 ${(perTagWindow * 100).toFixed(0)}%  cov ${(perTagCov.frac * 100).toFixed(0)}%   context-cov ${(ctxCov.frac * 100).toFixed(0)}%   ⇒ ${verdict}`);
    if (verdict.startsWith("DRIFT") || verdict.startsWith("MIS")) console.log(`    absent-from-cited: [${perTagCov.absent.slice(0, 14).join(", ")}]`);
  }
}
console.log(`\n${"=".repeat(80)}\nSUMMARY  (answers with source_texts: ${withFlag}, without: ${noFlag})`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${v.toString().padStart(3)}  ${k}`);
