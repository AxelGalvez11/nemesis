import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groundStudies } from "./ground.ts";
import { poolRiskRatio } from "../../../../packages/shared/src/meta-analysis.ts";
import type { RawExtractedStudy } from "./extract.ts";
import type { RetrievedChunk } from "../citation.ts";
import type { Pico } from "../../../../packages/shared/src/research.ts";

const PICO: Pico = { intervention: "drug", comparator: "placebo", outcome: "mortality" };

function chunk(tag: string, text: string | undefined, title: string | null = null): RetrievedChunk {
  return {
    tag, chunk_id: `c${tag}`, source_id: `s${tag}`, provider: "pubmed_oa", title,
    section: null, url: null, license: null, published_date: null, retrieved_at: null, similarity: 1,
    chunk_text: text,
  };
}

function raw(p: Partial<RawExtractedStudy> & Pick<RawExtractedStudy, "citation_tag" | "source_quote">): RawExtractedStudy {
  return {
    label: "", outcome_label: "mortality",
    events_treatment: 1, total_treatment: 10, events_control: 2, total_control: 10,
    ...p,
  };
}

const C1 = chunk("1", "Among patients, 23 of 150 in the drug group and 40 of 148 in the placebo group died from any cause.");
const C2 = chunk("2", "Mortality: 5 of 80 (drug) vs 12 of 90 (placebo).");

Deno.test("grounds two studies whose quotes + numbers + outcome all check out", () => {
  const r = groundStudies(
    [
      raw({ citation_tag: "1", source_quote: "23 of 150 in the drug group and 40 of 148 in the placebo group died", outcome_label: "all-cause mortality", events_treatment: 23, total_treatment: 150, events_control: 40, total_control: 148, label: "Trial A" }),
      raw({ citation_tag: "2", source_quote: "5 of 80 (drug) vs 12 of 90 (placebo)", outcome_label: "mortality", events_treatment: 5, total_treatment: 80, events_control: 12, total_control: 90 }),
    ],
    [C1, C2],
    PICO,
  );
  assertEquals(r.dropped.length, 0);
  assertEquals(r.studies.length, 2);
  assertEquals(r.outcome, "mortality");
  assertEquals(r.studies[0].label, "Trial A");
  assertEquals(r.studies[0].citation_tag, "1");
  assertEquals(r.studies[0].events_treatment, 23);
});

Deno.test("drops a study whose citation tag is not in the merged pool", () => {
  const r = groundStudies([raw({ citation_tag: "9", source_quote: "x" })], [C1], PICO);
  assertEquals(r.studies.length, 0);
  assertEquals(r.dropped[0].code, "tag_not_in_pool");
});

Deno.test("drops a study when the cited source carries no text (fail-closed)", () => {
  const r = groundStudies([raw({ citation_tag: "1", source_quote: "anything" })], [chunk("1", undefined)], PICO);
  assertEquals(r.dropped[0].code, "source_text_unavailable");
});

Deno.test("drops a study whose quote is not verbatim in the source", () => {
  const r = groundStudies([raw({ citation_tag: "1", source_quote: "31 of 150 on the drug died", events_treatment: 31, total_treatment: 150, events_control: 40, total_control: 148 })], [C1], PICO);
  assertEquals(r.dropped[0].code, "quote_not_in_source");
});

Deno.test("drops a study when a count is not literally in the quote (15 is not 150)", () => {
  const c = chunk("1", "Drug events: 150 of 300 vs 40 of 148.");
  const r = groundStudies([raw({ citation_tag: "1", source_quote: "150 of 300 vs 40 of 148", events_treatment: 15, total_treatment: 300, events_control: 40, total_control: 148 })], [c], PICO);
  assertEquals(r.dropped[0].code, "numbers_not_in_quote");
});

Deno.test("drops a study with impossible counts (events exceed arm size)", () => {
  const c = chunk("1", "Drug: 200 of 150 ... 40 of 148");
  const r = groundStudies([raw({ citation_tag: "1", source_quote: "200 of 150 ... 40 of 148", events_treatment: 200, total_treatment: 150, events_control: 40, total_control: 148 })], [c], PICO);
  assertEquals(r.dropped[0].code, "invalid_counts");
});

Deno.test("drops a grounded study reporting a different outcome than the PICO", () => {
  const c = chunk("1", "Tumor response: 23 of 150 (drug) vs 40 of 148 (placebo).");
  const r = groundStudies([raw({ citation_tag: "1", source_quote: "23 of 150 (drug) vs 40 of 148 (placebo)", outcome_label: "tumor response", events_treatment: 23, total_treatment: 150, events_control: 40, total_control: 148 })], [c], PICO);
  assertEquals(r.studies.length, 0);
  assertEquals(r.dropped[0].code, "different_outcome");
});

Deno.test("drops a duplicate of an already-grounded source", () => {
  const r = groundStudies(
    [
      raw({ citation_tag: "2", source_quote: "5 of 80 (drug) vs 12 of 90 (placebo)", events_treatment: 5, total_treatment: 80, events_control: 12, total_control: 90 }),
      raw({ citation_tag: "2", source_quote: "5 of 80 (drug) vs 12 of 90 (placebo)", events_treatment: 5, total_treatment: 80, events_control: 12, total_control: 90 }),
    ],
    [C2],
    PICO,
  );
  assertEquals(r.studies.length, 1);
  assertEquals(r.dropped[0].code, "duplicate_source");
});

Deno.test("matches numbers written with thousands separators", () => {
  const c = chunk("1", "Death: 1,234 of 5,000 (drug) vs 1,300 of 5,000 (placebo).");
  const r = groundStudies([raw({ citation_tag: "1", source_quote: "1,234 of 5,000 (drug) vs 1,300 of 5,000 (placebo)", events_treatment: 1234, total_treatment: 5000, events_control: 1300, total_control: 5000 })], [c], PICO);
  assertEquals(r.dropped.length, 0);
  assertEquals(r.studies.length, 1);
});

Deno.test("derives a label from the source title when the model gave none", () => {
  const c = chunk("1", "Mortality: 5 of 80 (drug) vs 12 of 90 (placebo).", "Smith 2021 cohort");
  const r = groundStudies([raw({ citation_tag: "1", source_quote: "5 of 80 (drug) vs 12 of 90 (placebo)", events_treatment: 5, total_treatment: 80, events_control: 12, total_control: 90, label: "" })], [c], PICO);
  assertEquals(r.studies[0].label, "Smith 2021 cohort");
});

// ── Fix A: decimal anchoring — an integer count must not match a decimal figure ──────────────────
Deno.test("does not let an integer count match a decimal in the source (5 is not 5.0)", () => {
  const c = chunk("1", "Mortality was 5.0% on the drug and 8.0% on placebo; 1000 enrolled per group.");
  const r = groundStudies(
    [raw({ citation_tag: "1", source_quote: "Mortality was 5.0% on the drug and 8.0% on placebo; 1000 enrolled per group.", events_treatment: 5, total_treatment: 1000, events_control: 8, total_control: 1000 })],
    [c],
    PICO,
  );
  assertEquals(r.studies.length, 0);
  assertEquals(r.dropped[0].code, "numbers_not_in_quote");
});

// ── Fix D: tolerate a model-added trailing period the source itself does not carry ───────────────
Deno.test("grounds a quote that differs from the source only by an added trailing period", () => {
  const c = chunk("1", "In the drug group, 23 of 150 and 40 of 148 on placebo died within 28 days after randomization (age-adjusted ratio 0.83).");
  const r = groundStudies(
    [raw({ citation_tag: "1", source_quote: "In the drug group, 23 of 150 and 40 of 148 on placebo died within 28 days after randomization.", events_treatment: 23, total_treatment: 150, events_control: 40, total_control: 148 })],
    [c],
    PICO,
  );
  assertEquals(r.dropped.length, 0);
  assertEquals(r.studies.length, 1);
});

// ── Fix B: the cited source must actually study the PICO intervention ────────────────────────────
Deno.test("drops a study whose source never names the PICO intervention", () => {
  const p: Pico = { intervention: "tocilizumab", comparator: "placebo or standard care", outcome: "mortality" };
  const c = chunk("1", "In the dexamethasone group 23 of 150 and 40 of 148 on usual care died.");
  const r = groundStudies(
    [raw({ citation_tag: "1", source_quote: "23 of 150 and 40 of 148 on usual care died", events_treatment: 23, total_treatment: 150, events_control: 40, total_control: 148 })],
    [c],
    p,
  );
  assertEquals(r.studies.length, 0);
  assertEquals(r.dropped[0].code, "intervention_mismatch");
});

// ── Fix B (the comparability break): a broad intervention named in no source pools nothing ───────
Deno.test("a broad PICO intervention absent from the sources drops every arm (closes the dex+toci break)", () => {
  const p: Pico = { intervention: "COVID-19 drug therapy", comparator: "usual care", outcome: "28-day mortality" };
  const dex = chunk("1", "482 of 2104 on dexamethasone and 1110 of 4321 on usual care died within 28 days.", "RECOVERY dexamethasone");
  const toci = chunk("2", "621 of 2022 on tocilizumab and 729 of 2094 on usual care died within 28 days.", "RECOVERY tocilizumab");
  const r = groundStudies(
    [
      raw({ citation_tag: "1", source_quote: "482 of 2104 on dexamethasone and 1110 of 4321 on usual care died within 28 days", outcome_label: "28-day mortality", events_treatment: 482, total_treatment: 2104, events_control: 1110, total_control: 4321 }),
      raw({ citation_tag: "2", source_quote: "621 of 2022 on tocilizumab and 729 of 2094 on usual care died within 28 days", outcome_label: "28-day mortality", events_treatment: 621, total_treatment: 2022, events_control: 729, total_control: 2094 }),
    ],
    [dex, toci],
    p,
  );
  assertEquals(r.studies.length, 0);
  assert(r.dropped.length === 2 && r.dropped.every((d) => d.code === "intervention_mismatch"));
});

// ── Fix B: comparator soft — a generic comparator need not appear verbatim ───────────────────────
Deno.test("does not require a generic (placebo / usual-care) comparator to appear verbatim", () => {
  const p: Pico = { intervention: "dexamethasone", comparator: "placebo or standard care", outcome: "mortality" };
  const c = chunk("1", "In the dexamethasone group 23 of 150 and 40 of 148 on usual care died.");
  const r = groundStudies(
    [raw({ citation_tag: "1", source_quote: "23 of 150 and 40 of 148 on usual care died", events_treatment: 23, total_treatment: 150, events_control: 40, total_control: 148 })],
    [c],
    p,
  );
  assertEquals(r.dropped.length, 0);
  assertEquals(r.studies.length, 1);
});

// ── Fix B: comparator strict — a NAMED active comparator absent from the source drops ────────────
Deno.test("drops a study when a named active comparator is absent from the source", () => {
  const p: Pico = { intervention: "apixaban", comparator: "warfarin", outcome: "stroke" };
  const c = chunk("1", "Apixaban: 23 of 150 had a stroke vs 40 of 148 on placebo.");
  const r = groundStudies(
    [raw({ citation_tag: "1", source_quote: "23 of 150 had a stroke vs 40 of 148 on placebo", outcome_label: "stroke", events_treatment: 23, total_treatment: 150, events_control: 40, total_control: 148 })],
    [c],
    p,
  );
  assertEquals(r.studies.length, 0);
  assertEquals(r.dropped[0].code, "comparator_mismatch");
});

// ── Fix C: an event count that grossly disagrees with the percentage printed beside it drops ─────
Deno.test("drops a study whose event count disagrees with the percentage stated next to it", () => {
  const p: Pico = { intervention: "dexamethasone", comparator: "usual care", outcome: "mortality" };
  // Source: 482/2104 = 22.9%, 1110/4321 = 25.7%. This study swaps the totals (role confusion):
  // it claims 482 events out of 4321 (= 11.2%), contradicting the "(22.9%)" printed beside 482.
  const c = chunk("1", "Among those given dexamethasone, 2104 and 4321 were assigned; 482 patients (22.9%) and 1110 patients (25.7%) died.");
  const r = groundStudies(
    [raw({ citation_tag: "1", source_quote: "2104 and 4321 were assigned; 482 patients (22.9%) and 1110 patients (25.7%) died", events_treatment: 482, total_treatment: 4321, events_control: 1110, total_control: 2104 })],
    [c],
    p,
  );
  assertEquals(r.studies.length, 0);
  assertEquals(r.dropped[0].code, "percentage_mismatch");
});

// ── Positive path: two same-drug trials with clean 2×2s ground AND pool (proves we still pool) ───
Deno.test("grounds and pools two same-drug trials whose counts match their stated percentages", () => {
  const p: Pico = { intervention: "dexamethasone", comparator: "usual care", outcome: "mortality" };
  const t1 = chunk("1", "A total of 2104 received dexamethasone and 4321 usual care; 482 patients (22.9%) and 1110 patients (25.7%) died.", "Trial 1 (dexamethasone)");
  const t2 = chunk("2", "Of 500 on dexamethasone and 500 on usual care, 50 patients (10.0%) and 80 patients (16.0%) died.", "Trial 2 (dexamethasone)");
  const r = groundStudies(
    [
      raw({ citation_tag: "1", source_quote: "2104 received dexamethasone and 4321 usual care; 482 patients (22.9%) and 1110 patients (25.7%) died", events_treatment: 482, total_treatment: 2104, events_control: 1110, total_control: 4321 }),
      raw({ citation_tag: "2", source_quote: "Of 500 on dexamethasone and 500 on usual care, 50 patients (10.0%) and 80 patients (16.0%) died", events_treatment: 50, total_treatment: 500, events_control: 80, total_control: 500 }),
    ],
    [t1, t2],
    p,
  );
  assertEquals(r.dropped.length, 0);
  assertEquals(r.studies.length, 2);
  const pooled = poolRiskRatio(r.studies);
  assert(pooled.poolable, "two clean same-drug 2x2s must pool");
  assertEquals(pooled.poolable ? pooled.k : 0, 2);
});

// ── Fix A (middle-dot): Lancet/BMJ write decimals with "·" (U+00B7); 5 must not match "5·0" ─────
Deno.test("does not let an integer count match a middle-dot decimal (5 is not 5·0)", () => {
  const c = chunk("1", "Mortality was 5·0% on the drug and 8·0% on placebo; 1000 enrolled per group.");
  const r = groundStudies(
    [raw({ citation_tag: "1", source_quote: "Mortality was 5·0% on the drug and 8·0% on placebo; 1000 enrolled per group.", events_treatment: 5, total_treatment: 1000, events_control: 8, total_control: 1000 })],
    [c],
    PICO,
  );
  assertEquals(r.studies.length, 0);
  assertEquals(r.dropped[0].code, "numbers_not_in_quote");
});

// ── Fix C (CI guard): a "95% CI" confidence LEVEL beside a count must not be read as that count's rate ─
Deno.test("does not mistake a '95% CI' confidence level for an event rate", () => {
  const c = chunk("1", "In the drug group, 482 patients (95% CI 0.75 to 0.93) of 2104 and 1110 of 4321 on placebo died.");
  const r = groundStudies(
    [raw({ citation_tag: "1", source_quote: "482 patients (95% CI 0.75 to 0.93) of 2104 and 1110 of 4321 on placebo died", events_treatment: 482, total_treatment: 2104, events_control: 1110, total_control: 4321 })],
    [c],
    PICO,
  );
  assertEquals(r.dropped.length, 0);
  assertEquals(r.studies.length, 1);
});
