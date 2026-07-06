// VERIFY THE FIX (was: confirm the root cause). The red-team showed two coupled problems:
//   (1) USEFULNESS: the live model adds a trailing "." to its quote, so the verbatim-substring check
//       rejected a perfectly correct extraction → meta mode almost never pooled.
//   (2) COMPARABILITY: the gate never checked the intervention, so a too-broad PICO pooled a steroid
//       (dexamethasone) and an IL-6 inhibitor (tocilizumab) into one risk ratio.
// This script proves the fixes, deterministically (no LLM, no creds):
//   A. the live model's trailing-period quote now GROUNDS under a scoped PICO (Fix D),
//   B. under a scoped "dexamethasone" PICO the tocilizumab trial DROPS (intervention_mismatch),
//   C. a too-broad "COVID-19 drug therapy" PICO drops BOTH arms → nothing pooled (comparability closed),
//   D. two real same-drug dexamethasone trials still POOL (we did not break the happy path).

import { groundStudies } from "../../supabase/functions/ask/research/ground.ts";
import type { RawExtractedStudy } from "../../supabase/functions/ask/research/extract.ts";
import { poolRiskRatio } from "../../packages/shared/src/meta-analysis.ts";
import type { RetrievedChunk } from "../../supabase/functions/ask/citation.ts";
import type { Pico } from "../../packages/shared/src/research.ts";

const DEX_TEXT = "A total of 2104 patients were assigned to receive dexamethasone and 4321 to receive usual care. Overall, 482 patients (22.9%) in the dexamethasone group and 1110 patients (25.7%) in the usual care group died within 28 days after randomization (age-adjusted rate ratio, 0.83; 95% confidence interval [CI], 0.75 to 0.93; P<0.001).";
const TOCI_TEXT = "Overall, 621 (31%) of the 2022 patients allocated tocilizumab and 729 (35%) of the 2094 patients allocated to usual care died within 28 days (rate ratio 0.85; 95% CI 0.76-0.94; p=0.0028).";
// A second, clearly-labeled dexamethasone-vs-usual-care trial (synthetic numbers) for the pool demo.
const DEX2_TEXT = "In a second trial of dexamethasone, 60 of 600 patients on dexamethasone and 90 of 600 on usual care died within 28 days.";

const ch = (tag: string, text: string, title: string): RetrievedChunk => ({
  tag, chunk_id: `c-${tag}`, chunk_text: text, source_id: `s-${tag}`, provider: "pubmed_oa",
  title, section: "abstract", url: `https://x/${tag}`, license: null,
  published_date: "2021-01-01", retrieved_at: "2026-06-11T00:00:00Z", similarity: 0.8,
});

// The live model's version of the dexamethasone quote — an EXACT source substring PLUS a trailing "."
// that the source itself does not have (the source continues "… (age-adjusted …").
const dexBase =
  "A total of 2104 patients were assigned to receive dexamethasone and 4321 to receive usual care. Overall, 482 patients (22.9%) in the dexamethasone group and 1110 patients (25.7%) in the usual care group died within 28 days after randomization";
const dexWithPeriod: RawExtractedStudy = {
  citation_tag: "1", label: "RECOVERY dexamethasone", outcome_label: "28-day mortality",
  source_quote: dexBase + ".",
  events_treatment: 482, total_treatment: 2104, events_control: 1110, total_control: 4321,
};
const tociStudy: RawExtractedStudy = {
  citation_tag: "2", label: "RECOVERY tocilizumab", outcome_label: "28-day mortality",
  source_quote: "Overall, 621 (31%) of the 2022 patients allocated tocilizumab and 729 (35%) of the 2094 patients allocated to usual care died within 28 days",
  events_treatment: 621, total_treatment: 2022, events_control: 729, total_control: 2094,
};
const dex2Study: RawExtractedStudy = {
  citation_tag: "3", label: "Dexamethasone trial 2", outcome_label: "28-day mortality",
  source_quote: "60 of 600 patients on dexamethasone and 90 of 600 on usual care died within 28 days",
  events_treatment: 60, total_treatment: 600, events_control: 90, total_control: 600,
};

const chunks = [ch("1", DEX_TEXT, "RECOVERY dexamethasone"), ch("2", TOCI_TEXT, "RECOVERY tocilizumab"), ch("3", DEX2_TEXT, "Dexamethasone trial 2")];
const scoped: Pico = { intervention: "dexamethasone", comparator: "usual care", outcome: "28-day mortality" };
const broad: Pico = { intervention: "COVID-19 drug therapy", comparator: "usual care", outcome: "28-day mortality" };

console.log("A) Fix D — live model's trailing-period quote now GROUNDS under a scoped PICO:");
const a = groundStudies([dexWithPeriod], chunks, scoped);
console.log("   grounded:", a.studies.map((s) => `${s.events_treatment}/${s.total_treatment} vs ${s.events_control}/${s.total_control}`), "dropped:", a.dropped.map((d) => d.code));

console.log("\nB) Fix B — under a scoped 'dexamethasone' PICO, the tocilizumab trial DROPS:");
const b = groundStudies([dexWithPeriod, tociStudy], chunks, scoped);
console.log("   grounded:", b.studies.map((s) => s.label), "| dropped:", b.dropped.map((d) => `${d.label}:${d.code}`));
console.log("   pooled:", poolRiskRatio(b.studies).poolable ? "POOLED (unexpected!)" : `not poolable (k=${poolRiskRatio(b.studies).k}) — steroid + IL-6 inhibitor NOT mixed`);

console.log("\nC) Fix B — a too-broad 'COVID-19 drug therapy' PICO drops BOTH arms → nothing pooled:");
const c = groundStudies([dexWithPeriod, tociStudy], chunks, broad);
console.log("   grounded:", c.studies.length, "| dropped:", c.dropped.map((d) => `${d.label}:${d.code}`));

console.log("\nD) happy path — two real same-drug dexamethasone trials still POOL:");
const d = groundStudies([dexWithPeriod, dex2Study], chunks, scoped);
const pooled = poolRiskRatio(d.studies);
console.log("   grounded:", d.studies.map((s) => `${s.label} ${s.events_treatment}/${s.total_treatment}`));
console.log("   pooled:", pooled.poolable ? JSON.stringify({ k: pooled.k, RR: +pooled.random.estimate.toFixed(3), CI: [+pooled.random.ci_low.toFixed(3), +pooled.random.ci_high.toFixed(3)], I2: pooled.heterogeneity.i2 }) : `not poolable (k=${pooled.k})`);
