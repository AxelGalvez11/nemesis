// RED-TEAM HARNESS — full end-to-end meta-mode run against the real corpus + live sources + real LLM.
// Reads secrets from supabase/functions/.env (via `deno run --env-file=...`). No writes, no deploy:
// retrieval + live fetch + LLM are all reads. Prints the full report JSON + a human digest to stdout.
//
//   deno run --allow-all --env-file=supabase/functions/.env scripts/redteam/run-meta.ts "<question>" [mode]
//
// mode defaults to "meta". Use this SEQUENTIALLY (local has no NCBI key → parallel PubMed throttles).

import { runResearch } from "../../supabase/functions/ask/research/orchestrate.ts";
import type { ResearchReport } from "../../packages/shared/src/research.ts";

const SB_URL = "https://qyjmivntajbigjswhahb.supabase.co";

const question = Deno.args[0] ?? "Does aspirin reduce the risk of recurrent stroke compared with placebo?";
const mode = (Deno.args[1] ?? "meta") as "standard" | "structured_review" | "meta";

const apiKey = Deno.env.get("LLM_API_KEY") ?? "";
const serviceKey = Deno.env.get("SERVICE_KEY") ?? "";
if (!apiKey || !serviceKey) {
  console.error("MISSING KEYS: LLM_API_KEY / SERVICE_KEY not in env (did you pass --env-file?)");
  Deno.exit(2);
}

const steps: string[] = [];
const t0 = Date.now();
let report: ResearchReport;
try {
  report = await runResearch(question, {
    apiKey,
    sbUrl: SB_URL,
    serviceKey,
    liveOn: true,
    mode,
    onProgress: (s) => steps.push(`${s.step}: ${s.detail}${s.sources_found != null ? ` [${s.sources_found}]` : ""}`),
  });
} catch (e) {
  console.error("RUN CRASHED:", (e as Error).message, (e as Error).stack);
  Deno.exit(1);
}
const elapsedMs = Date.now() - t0;

// ---- human digest (the part a reviewer scans) ----
const m = report.meta_analysis;
const digest = {
  question,
  mode,
  elapsed_s: Math.round(elapsedMs / 100) / 10,
  template: report.template ?? null,
  evidence_grade: report.evidence_grade,
  claims_verified: report.claims_verified,
  safety_flags: report.safety_flags,
  n_citations: report.citations.length,
  providers: report.counts?.per_provider ?? {},
  total_retrieved: report.counts?.total_retrieved ?? 0,
  section_headings: report.sections.map((s) => s.heading),
  // The headline: did it pool, and if so what?
  meta: !m
    ? "NO meta_analysis object"
    : m.poolable === false
    ? { poolable: false, k: m.k, reason: m.reason }
    : {
      poolable: true,
      k: m.k,
      random_RR: m.random.estimate,
      random_CI: [m.random.ci_low, m.random.ci_high],
      fixed_RR: m.fixed.estimate,
      I2: m.heterogeneity.i2,
      studies: m.studies.map((st) => ({
        tag: st.citation_tag,
        outcome: st.outcome_label,
        rr: st.effect,
        quote: st.source_quote.slice(0, 160),
      })),
    },
  // The pooled-analysis prose actually shown to the user.
  pooled_section: report.sections.filter((s) => s.heading === "Pooled analysis").flatMap((s) => s.points.map((p) => p.text)),
};

console.log("===DIGEST===");
console.log(JSON.stringify(digest, null, 2));
console.log("===STEPS===");
console.log(steps.join("\n"));
console.log("===FULL_REPORT===");
console.log(JSON.stringify(report, null, 2));
