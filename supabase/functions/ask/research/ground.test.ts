import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groundStudies } from "./ground.ts";
import type { RawExtractedStudy } from "./extract.ts";
import type { RetrievedChunk } from "../citation.ts";

const PICO = { intervention: "drug", comparator: "placebo", outcome: "mortality" };

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
  const c = chunk("1", "Events: 150 of 300 vs 40 of 148.");
  const r = groundStudies([raw({ citation_tag: "1", source_quote: "150 of 300 vs 40 of 148", events_treatment: 15, total_treatment: 300, events_control: 40, total_control: 148 })], [c], PICO);
  assertEquals(r.dropped[0].code, "numbers_not_in_quote");
});

Deno.test("drops a study with impossible counts (events exceed arm size)", () => {
  const c = chunk("1", "200 of 150 ... 40 of 148");
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
