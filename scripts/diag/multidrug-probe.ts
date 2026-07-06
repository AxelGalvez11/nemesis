// scripts/diag/multidrug-probe.ts
//
// WS-F LIVE DIAGNOSIS (owner-approved 2026-06-14, read-only). Question under test: does the live
// engine's SINGLE-PASS retrieval under-cover the second/non-dominant drug in a two-drug comparison
// question? If yes, a bounded per-drug multi-query fan-out (decomposeQueries) would add coverage the
// one combined query misses. If retrieval already balances both drugs, WS-F's multi-query is low value.
//
// Method: for each two-drug question, POST /ask with include_source_text=true, then for EVERY source
// in the reranked retrieved set (source_texts = the full candidate set, cited + uncited) scan the text
// for each drug's names (generic + common brands). Tally per-drug coverage across (a) the full retrieved
// set and (b) the cited subset. A skew (most sources about drug A, few/none about drug B, few mentioning
// BOTH) is the signal the fan-out targets. Chosen pairs are all drugs that are individually well-covered,
// so a skew is a retrieval-SHAPE problem, not a corpus gap.
//
// Run:
//   export SB_URL=https://qyjmivntajbigjswhahb.supabase.co
//   set -a; . supabase/functions/.env; set +a
//   deno run --allow-net --allow-env --allow-read scripts/diag/multidrug-probe.ts
//
// NOT committed (diagnostic, like the other scripts/diag/ tools).

import { grantEnterprise, mintUser, readEnv, teardownUser } from "../../eval/lib/corpus.ts";

const PACE_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Drug { generic: string; names: string[] } // names = all synonyms (generic + brands), lowercased
interface Probe { question: string; a: Drug; b: Drug }

const drug = (generic: string, ...brands: string[]): Drug => ({
  generic,
  names: [generic, ...brands].map((s) => s.toLowerCase()),
});

// Pairs where BOTH drugs are individually well-represented (so a skew = retrieval shape, not a gap).
const PROBES: Probe[] = [
  {
    question: "Is lisinopril or losartan more effective for treating high blood pressure?",
    a: drug("lisinopril", "prinivil", "zestril"),
    b: drug("losartan", "cozaar"),
  },
  {
    question: "How does empagliflozin compare to dapagliflozin for heart failure?",
    a: drug("empagliflozin", "jardiance"),
    b: drug("dapagliflozin", "farxiga", "forxiga"),
  },
  {
    question: "Semaglutide versus tirzepatide for weight loss — which is more effective?",
    a: drug("semaglutide", "ozempic", "wegovy", "rybelsus"),
    b: drug("tirzepatide", "mounjaro", "zepbound"),
  },
];

interface Citation { source_id: string; source_type: string; title?: string; url?: string | null; chunk_tag?: string }
interface SourceText { tag: string; text: string }
interface AskResponse {
  intent: string;
  plain_english_summary?: string;
  template?: string;
  refused_unsupported?: boolean;
  safety_flags?: string[];
  answer_sections?: {
    what_we_know?: Array<{ text: string; citation_ids?: string[] }>;
    safety_notes?: Array<{ text: string; citation_ids?: string[] }>;
  };
  citations?: Citation[];
  source_texts?: SourceText[];
}

/** True if any of the drug's names appears in text (case-insensitive, word-ish boundary on the token). */
function mentions(text: string, d: Drug): boolean {
  const t = text.toLowerCase();
  return d.names.some((n) => {
    const i = t.indexOf(n);
    if (i < 0) return false;
    // crude boundary: char before/after isn't a letter (avoids substrings inside a longer word)
    const before = i === 0 ? " " : t[i - 1];
    const after = i + n.length >= t.length ? " " : t[i + n.length];
    return !/[a-z]/.test(before) && !/[a-z]/.test(after);
  });
}

type Bucket = "a" | "b" | "both" | "neither";
function bucket(text: string, p: Probe): Bucket {
  const ha = mentions(text, p.a), hb = mentions(text, p.b);
  return ha && hb ? "both" : ha ? "a" : hb ? "b" : "neither";
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

const env = readEnv();
const user = await mintUser(env);
const out: unknown[] = [];

try {
  await grantEnterprise(env, user.userId);

  for (const p of PROBES) {
    await sleep(PACE_MS);
    const r = await ask(env, user.jwt, p.question);
    console.log("\n" + "=".repeat(100));
    console.log(`Q: ${p.question}`);
    console.log(`   A=${p.a.generic}  B=${p.b.generic}`);
    if ("__error" in r) { console.log(`   ERROR: ${r.__error}`); out.push({ q: p.question, error: r.__error }); continue; }

    const sts = r.source_texts ?? [];
    const cites = r.citations ?? [];
    const citedTags = new Set(cites.map((c) => c.chunk_tag).filter(Boolean) as string[]);

    // (a) full reranked retrieved set coverage
    const retro: Record<Bucket, number> = { a: 0, b: 0, both: 0, neither: 0 };
    const perSource: Array<{ tag: string; cited: boolean; bucket: Bucket; type: string; snip: string }> = [];
    for (const st of sts) {
      const bk = bucket(st.text, p);
      retro[bk]++;
      const cite = cites.find((c) => c.chunk_tag === st.tag);
      perSource.push({
        tag: st.tag,
        cited: citedTags.has(st.tag),
        bucket: bk,
        type: cite?.source_type ?? "(uncited)",
        snip: (cite?.title ?? st.text.replace(/\s+/g, " ").trim()).slice(0, 64),
      });
    }
    // (b) cited subset coverage
    const cited: Record<Bucket, number> = { a: 0, b: 0, both: 0, neither: 0 };
    for (const st of sts) if (citedTags.has(st.tag)) cited[bucket(st.text, p)]++;

    // (c) did the answer prose actually address both drugs?
    const prose = [
      r.plain_english_summary ?? "",
      ...(r.answer_sections?.what_we_know ?? []).map((x) => x.text),
      ...(r.answer_sections?.safety_notes ?? []).map((x) => x.text),
    ].join(" ");
    const proseA = mentions(prose, p.a), proseB = mentions(prose, p.b);

    console.log(`   intent=${r.intent}  template=${r.template ?? "-"}  refused=${r.refused_unsupported ?? false}  flags=[${(r.safety_flags ?? []).join(",")}]`);
    console.log(`   RETRIEVED set (${sts.length} sources): A-only=${retro.a}  B-only=${retro.b}  BOTH=${retro.both}  neither=${retro.neither}`);
    console.log(`   CITED   subset (${citedTags.size} sources): A-only=${cited.a}  B-only=${cited.b}  BOTH=${cited.both}  neither=${cited.neither}`);
    console.log(`   ANSWER prose mentions: A=${proseA}  B=${proseB}  ${proseA && proseB ? "(covered both)" : "(SKEW — one drug)"}`);
    console.log(`   per-source:`);
    for (const s of perSource) {
      console.log(`     [${s.tag}] ${s.cited ? "CITED " : "      "} ${s.bucket.toUpperCase().padEnd(7)} ${s.type.padEnd(14)} ${s.snip}`);
    }

    out.push({
      question: p.question, a: p.a.generic, b: p.b.generic, intent: r.intent, template: r.template ?? null,
      retrieved_total: sts.length, retrieved: retro, cited_total: citedTags.size, cited,
      prose_covers_both: proseA && proseB,
    });
  }

  console.log("\n" + "=".repeat(100));
  console.log("JSON SUMMARY:");
  console.log(JSON.stringify(out, null, 2));
} finally {
  await teardownUser(env, user.userId);
}
