// scripts/diag/multidrug-asym-probe.ts
//
// WS-F LIVE DIAGNOSIS, PART 2 — the ASYMMETRIC case (advisor-prompted 2026-06-14, read-only).
// Part 1 (multidrug-probe.ts) showed single-pass retrieval already balances BOTH drugs on COMPARISON
// questions where both drugs are common — but that's the case the combined query is structurally best
// at (a comparison paper names both drugs, so it matches both terms and ranks high). The steelman for
// per-drug fan-out is the case it was NOT tested on: a brand-new NICHE drug vs a decades-old common
// standard-of-care, SAME indication, NO head-to-head trial — where the common drug's vast literature
// could crowd the niche drug out of the top-12.
//
// THE DECISIVE TEST: for each pair, run the COMBINED query AND a SOLO query for the niche drug.
//   - niche coverage SOLO  = the ceiling (is the niche drug even retrievable at all?)
//   - niche coverage COMBINED = what survives when the common drug competes for the top-12
//   solo >> combined  → CROWD-OUT → fan-out (a per-drug sub-query) WOULD recover the niche literature.
//   solo ≈ combined (both low)   → CORPUS/BREADTH gap (WS-A/B), NOT a fan-out problem.
//   solo ≈ combined (both high)  → no problem; fan-out adds nothing.
//
// Run:
//   export SB_URL=https://qyjmivntajbigjswhahb.supabase.co
//   set -a; . supabase/functions/.env; set +a
//   deno run --allow-net --allow-env --allow-read scripts/diag/multidrug-asym-probe.ts
//
// NOT committed (diagnostic).

import { grantEnterprise, mintUser, readEnv, teardownUser } from "../../eval/lib/corpus.ts";

const PACE_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Drug { generic: string; names: string[] }
const drug = (generic: string, ...brands: string[]): Drug => ({ generic, names: [generic, ...brands].map((s) => s.toLowerCase()) });

// niche = brand-new / thin literature; common = decades-old, ubiquitous; same indication; no head-to-head.
interface AsymPair { indication: string; niche: Drug; common: Drug }
const PAIRS: AsymPair[] = [
  { indication: "Alzheimer's disease", niche: drug("lecanemab", "leqembi"), common: drug("donepezil", "aricept") },
  { indication: "hypertrophic cardiomyopathy", niche: drug("mavacamten", "camzyos"), common: drug("metoprolol", "lopressor", "toprol") },
];

interface SourceText { tag: string; text: string }
interface AskResponse {
  intent: string; template?: string; refused_unsupported?: boolean; safety_flags?: string[];
  plain_english_summary?: string;
  answer_sections?: { what_we_know?: Array<{ text: string }>; safety_notes?: Array<{ text: string }> };
  citations?: Array<{ chunk_tag?: string }>;
  source_texts?: SourceText[];
}

function mentions(text: string, d: Drug): boolean {
  const t = text.toLowerCase();
  return d.names.some((n) => {
    const i = t.indexOf(n);
    if (i < 0) return false;
    const before = i === 0 ? " " : t[i - 1];
    const after = i + n.length >= t.length ? " " : t[i + n.length];
    return !/[a-z]/.test(before) && !/[a-z]/.test(after);
  });
}

async function ask(env: ReturnType<typeof readEnv>, jwt: string, question: string): Promise<AskResponse | { __error: string }> {
  const res = await fetch(`${env.SB_URL}/functions/v1/ask`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question, use_health_context: false, include_source_text: true }),
  });
  if (!res.ok) return { __error: `${res.status} ${(await res.text()).slice(0, 200)}` };
  return await res.json();
}

// count sources (in the reranked retrieved set) mentioning the niche drug / the common drug
function coverage(r: AskResponse, niche: Drug, common: Drug) {
  const sts = r.source_texts ?? [];
  let n = 0, c = 0, both = 0;
  for (const st of sts) {
    const hn = mentions(st.text, niche), hc = mentions(st.text, common);
    if (hn) n++;
    if (hc) c++;
    if (hn && hc) both++;
  }
  return { total: sts.length, niche: n, common: c, both };
}

const env = readEnv();
const user = await mintUser(env);
const out: unknown[] = [];

try {
  await grantEnterprise(env, user.userId);

  for (const p of PAIRS) {
    const combinedQ = `${p.niche.generic} versus ${p.common.generic} for ${p.indication} — which is more effective?`;
    const soloQ = `What does the evidence show about ${p.niche.generic} for ${p.indication}?`;

    await sleep(PACE_MS);
    const rc = await ask(env, user.jwt, combinedQ);
    await sleep(PACE_MS);
    const rs = await ask(env, user.jwt, soloQ);

    console.log("\n" + "=".repeat(100));
    console.log(`PAIR: ${p.niche.generic} (niche) vs ${p.common.generic} (common) — ${p.indication}`);

    if ("__error" in rc) { console.log(`  COMBINED ERROR: ${rc.__error}`); }
    if ("__error" in rs) { console.log(`  SOLO     ERROR: ${rs.__error}`); }
    if ("__error" in rc || "__error" in rs) { out.push({ pair: p.niche.generic, error: true }); continue; }

    const cov = coverage(rc, p.niche, p.common);
    const sov = coverage(rs, p.niche, p.common);
    const proseC = [rc.plain_english_summary ?? "", ...(rc.answer_sections?.what_we_know ?? []).map((x) => x.text)].join(" ");
    const niche_in_combined_prose = mentions(proseC, p.niche);

    console.log(`  COMBINED  q="${combinedQ}"`);
    console.log(`     intent=${rc.intent} template=${rc.template ?? "-"} refused=${rc.refused_unsupported ?? false}`);
    console.log(`     retrieved=${cov.total}  niche(${p.niche.generic})=${cov.niche}  common(${p.common.generic})=${cov.common}  both=${cov.both}`);
    console.log(`     niche drug appears in answer prose: ${niche_in_combined_prose}`);
    console.log(`  SOLO      q="${soloQ}"`);
    console.log(`     intent=${rs.intent} template=${rs.template ?? "-"} refused=${rs.refused_unsupported ?? false}`);
    console.log(`     retrieved=${sov.total}  niche(${p.niche.generic})=${sov.niche}  (this is the CEILING — what's available for the niche drug)`);

    const verdict = sov.niche === 0
      ? "CORPUS GAP — niche drug barely retrievable even SOLO → breadth (WS-A/B), not fan-out"
      : cov.niche >= Math.min(sov.niche, 3)
      ? "NO CROWD-OUT — combined query keeps the niche drug's coverage → fan-out adds little"
      : "CROWD-OUT — solo finds the niche drug but combined drops it → fan-out WOULD help";
    console.log(`  ⇒ ${verdict}  (niche solo=${sov.niche} vs combined=${cov.niche})`);

    out.push({
      pair: `${p.niche.generic} vs ${p.common.generic}`, indication: p.indication,
      combined: cov, solo_niche_ceiling: sov.niche, niche_in_combined_prose, verdict,
    });
  }

  console.log("\n" + "=".repeat(100));
  console.log("JSON SUMMARY:");
  console.log(JSON.stringify(out, null, 2));
} finally {
  await teardownUser(env, user.userId);
}
