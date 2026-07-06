// DIAGNOSTIC (not committed): apply the NEW two-phase bestSupportingSpan to the v33 transcript's
// cited-but-unsupported claims (per cited tag, exactly like supportForPoint) and PRINT THE VERBATIM
// WINDOWED QUOTE for every newly-grounded claim. The count alone is not enough to trust: a multi-
// sentence window can stitch co-occurring words across a topic shift or a NEGATION into a high-overlap
// span the source does not actually assert. For a trust product a wrong highlight is worse than none,
// so this prints claim + the exact span the UI would highlight, for manual hazard review.
//
//   deno run -A --no-check scripts/diag/window-projection.ts [/tmp/pharmaorb-scorecard-v33.json]
import { bestSupportingSpan } from "../../supabase/functions/ask/support-span.ts";

const path = Deno.args[0] ?? "/tmp/pharmaorb-scorecard-v33.json";
const r = JSON.parse(Deno.readTextFileSync(path));

let supportedBefore = 0, claimsTotal = 0, newlyGrounded = 0;
const stillNull: string[] = [];
const grounded: Array<{ id: string; q: string; tag: string; claim: string; quote: string; score: number }> = [];

for (const t of r.transcripts) {
  const resp = t.response;
  if (!resp || "__error" in resp || resp.template || resp.refused_unsupported) continue;
  const byTag = new Map<string, string>((resp.source_texts ?? []).map((s: any) => [s.tag, s.text]));
  const points = [...(resp.answer_sections?.what_we_know ?? []), ...(resp.answer_sections?.safety_notes ?? [])];
  for (const p of points) {
    claimsTotal++;
    if ((p.support?.length ?? 0) > 0) { supportedBefore++; continue; }
    if ((p.citation_ids?.length ?? 0) === 0) continue; // uncited boilerplate — not a grounding claim
    // First cited tag whose source now yields a span under the NEW two-phase matcher.
    let hit: { tag: string; quote: string; score: number } | null = null;
    for (const tag of p.citation_ids as string[]) {
      const txt = byTag.get(tag);
      if (!txt) continue;
      const span = bestSupportingSpan(p.text, txt);
      if (span) { hit = { tag, quote: span.quote, score: span.score }; break; }
    }
    if (hit) {
      newlyGrounded++;
      grounded.push({ id: t.id, q: t.question, tag: hit.tag, claim: p.text, quote: hit.quote, score: hit.score });
    } else {
      stillNull.push(`${t.id}: ${p.text.slice(0, 70)}`);
    }
  }
}

const before = supportedBefore / claimsTotal, after = (supportedBefore + newlyGrounded) / claimsTotal;
console.log(`claims ${claimsTotal} | grounding BEFORE ${(before * 100).toFixed(1)}% → AFTER window ${(after * 100).toFixed(1)}%  (+${newlyGrounded} newly grounded)\n`);

console.log(`${"=".repeat(90)}\nNEWLY-GROUNDED CLAIMS — read each: does the QUOTE actually assert the CLAIM? (negation? topic stitch?)\n${"=".repeat(90)}`);
for (const g of grounded) {
  console.log(`\n[${g.id}] (tag ${g.tag}, score ${(g.score * 100).toFixed(0)}%)  ${g.q}`);
  console.log(`  CLAIM: ${g.claim}`);
  console.log(`  QUOTE: ${g.quote}`);
}

console.log(`\n${"=".repeat(90)}\nStill unsupported after window (${stillNull.length}):`);
for (const s of stillNull) console.log(`  • ${s}`);
