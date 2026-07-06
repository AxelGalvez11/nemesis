// scripts/diag/retarget-validate.ts
//
// CITATION-RETARGET VALIDATION (advisor-prescribed 2026-06-14, OFFLINE — reads the saved v34 scorecard,
// no live calls). Before building any re-pointing rule, test the PREMISE against real data: "a claim
// with no support span on its cited tag is a MIS-CITE (the fact lives in another retrieved chunk)."
// The competing explanation is PARAPHRASE — the cited source IS correct but supports by synonym
// ("death" vs "mortality", numbers written differently) and scores below the lexical bar.
//
// For every load-bearing claim (what_we_know + safety_notes) that carries a citation but NO support
// span, print: the claim, its CITED source (snippet + the best lexical score the matcher gets there),
// and the best NON-CITED chunk the candidate rule would re-point to (snippet + score + the quote it
// would attach). Then EYEBALL-CLASSIFY each:
//   - GENUINE MIS-CITE   : cited source is a DIFFERENT entity/topic; candidate names the claim's drug.
//   - PARAPHRASE-CORRECT : cited source IS the claim's drug; candidate is just lexically closer (noise).
//   - UNSUPPORTED-ANYWHERE: no chunk really supports it (boilerplate / spread).
// PASS CONDITION (advisor): the rule fixes the genuine mis-cites and leaves the paraphrase-correct ones
// untouched. If it would re-point even a couple of paraphrase-correct cites, the premise is disproven.
//
// Run: deno run --allow-read scripts/diag/retarget-validate.ts
// NOT committed (diagnostic).

import { bestSupportingSpan } from "../../supabase/functions/ask/support-span.ts";

const PATH = "/tmp/pharmaorb-scorecard-v34.json";
const REPOINT_BAR = 0.5; // candidate must clear this to be a re-point under the proposed rule

interface Pt { text: string; citation_ids?: string[]; support?: Array<{ quote?: string }> }
interface Resp {
  __error?: string;
  answer_sections?: { what_we_know?: Pt[]; safety_notes?: Pt[] };
  citations?: Array<{ chunk_tag?: string; source_type?: string; title?: string | null }>;
  source_texts?: Array<{ tag: string; text: string }>;
}

const data = JSON.parse(await Deno.readTextFile(PATH)) as { transcripts: Array<{ id: string; question: string; response: Resp }> };

const oneLine = (s: string, n = 150) => s.replace(/\s+/g, " ").trim().slice(0, n);

let totalNoSpan = 0;
let wouldRepoint = 0;
const repoints: Array<{ id: string; claim: string; citedSnips: string[]; candTag: string; candScore: number; candSnip: string; candQuote: string }> = [];

for (const t of data.transcripts) {
  const r = t.response;
  if (!r || r.__error || !r.source_texts?.length) continue;
  const byTag = new Map(r.source_texts.map((s) => [s.tag, s.text]));
  const allTags = [...byTag.keys()];
  const titleByTag = new Map((r.citations ?? []).map((c) => [c.chunk_tag ?? "", `${c.source_type ?? "?"} | ${c.title ?? ""}`]));
  const points = [...(r.answer_sections?.what_we_know ?? []), ...(r.answer_sections?.safety_notes ?? [])];

  for (const p of points) {
    const cites = p.citation_ids ?? [];
    if (cites.length === 0) continue;
    if ((p.support?.length ?? 0) > 0) continue; // only the no-span claims
    totalNoSpan++;

    const citedSnips = cites.map((tag) => {
      const txt = byTag.get(tag) ?? "(cited tag not in source_texts)";
      const sc = bestSupportingSpan(p.text, txt)?.score ?? 0;
      return `[${tag}] score=${sc.toFixed(2)} ${titleByTag.get(tag) ? `(${oneLine(titleByTag.get(tag)!, 50)})` : ""} "${oneLine(txt, 110)}"`;
    });

    // best non-cited candidate
    let cand: { tag: string; score: number; snip: string; quote: string } | null = null;
    for (const tag of allTags) {
      if (cites.includes(tag)) continue;
      const span = bestSupportingSpan(p.text, byTag.get(tag) ?? "");
      const score = span?.score ?? 0;
      if (score > (cand?.score ?? 0)) cand = { tag, score, snip: oneLine(byTag.get(tag) ?? "", 110), quote: oneLine(span?.quote ?? "", 150) };
    }

    const willRepoint = cand !== null && cand.score >= REPOINT_BAR;
    if (willRepoint) wouldRepoint++;

    console.log("\n" + "-".repeat(96));
    console.log(`[${t.id}] CLAIM: ${oneLine(p.text, 220)}`);
    for (const cs of citedSnips) console.log(`   cited  ${cs}`);
    if (cand) {
      console.log(`   →cand  [${cand.tag}] score=${cand.score.toFixed(2)} ${titleByTag.get(cand.tag) ? `(${oneLine(titleByTag.get(cand.tag)!, 50)})` : "(uncited chunk)"} "${cand.snip}"`);
      console.log(`   ${willRepoint ? "⚠ WOULD RE-POINT" : "   (below bar, no re-point)"}  ${willRepoint ? `→ quote: "${cand.quote}"` : ""}`);
      if (willRepoint) repoints.push({ id: t.id, claim: oneLine(p.text, 160), citedSnips, candTag: cand.tag, candScore: cand.score, candSnip: cand.snip, candQuote: cand.quote });
    } else {
      console.log(`   →cand  (no non-cited chunk clears even 0.34 — UNSUPPORTED ANYWHERE, fail-safe leaves as-is)`);
    }
  }
}

console.log("\n" + "=".repeat(96));
console.log(`TOTAL no-span load-bearing claims: ${totalNoSpan}`);
console.log(`Candidate rule WOULD re-point (cand ≥ ${REPOINT_BAR}): ${wouldRepoint}`);
console.log(`\nThe ${wouldRepoint} re-point candidates to eyeball-classify (mis-cite vs paraphrase-correct):`);
for (const r of repoints) {
  console.log(`\n  • [${r.id}] ${r.claim}`);
  console.log(`      cited: ${r.citedSnips.join(" || ")}`);
  console.log(`      →[${r.candTag}] (${r.candScore.toFixed(2)}): ${r.candSnip}`);
}
