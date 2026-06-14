import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeExtracted } from "./extract.ts";

Deno.test("normalizeExtracted shapes a valid study and coerces stringy counts", () => {
  const out = normalizeExtracted([
    {
      citation_tag: "[3]",
      label: "  TRIAL-A ",
      source_quote: "  23 of 150 vs 40 of 148 had the event ",
      outcome_label: " mortality ",
      events_treatment: "23",
      total_treatment: 150,
      events_control: "40",
      total_control: 148,
    },
  ]);
  assertEquals(out, [{
    citation_tag: "3",
    label: "TRIAL-A",
    source_quote: "23 of 150 vs 40 of 148 had the event",
    outcome_label: "mortality",
    events_treatment: 23,
    total_treatment: 150,
    events_control: 40,
    total_control: 148,
  }]);
});

Deno.test("normalizeExtracted drops studies missing the quote or outcome", () => {
  assertEquals(
    normalizeExtracted([
      { citation_tag: "1", source_quote: "", outcome_label: "x", events_treatment: 1, total_treatment: 2, events_control: 1, total_control: 2 },
      { citation_tag: "1", source_quote: "q", outcome_label: "  ", events_treatment: 1, total_treatment: 2, events_control: 1, total_control: 2 },
    ]),
    [],
  );
});

Deno.test("normalizeExtracted drops studies with non-integer / negative / NaN counts", () => {
  const bad = (counts: Record<string, unknown>) => ({ citation_tag: "1", source_quote: "q", outcome_label: "o", ...counts });
  assertEquals(
    normalizeExtracted([
      bad({ events_treatment: 1.5, total_treatment: 2, events_control: 1, total_control: 2 }),
      bad({ events_treatment: -1, total_treatment: 2, events_control: 1, total_control: 2 }),
      bad({ events_treatment: "x", total_treatment: 2, events_control: 1, total_control: 2 }),
      bad({ events_treatment: 1, total_treatment: 0, events_control: 1, total_control: 2 }),
    ]),
    [],
  );
});

Deno.test("normalizeExtracted tolerates non-array / non-object input", () => {
  assertEquals(normalizeExtracted(null), []);
  assertEquals(normalizeExtracted([null, 5, "x"]), []);
});

Deno.test("normalizeExtracted defaults a missing label to empty string", () => {
  const out = normalizeExtracted([
    { citation_tag: "2", source_quote: "q", outcome_label: "o", events_treatment: 1, total_treatment: 10, events_control: 2, total_control: 10 },
  ]);
  assertEquals(out[0].label, "");
});
