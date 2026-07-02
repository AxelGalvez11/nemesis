import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Citation } from "./answer.ts";
import { buildEvidenceTimeline, buildStudyDesignChart } from "./evidence-charts.ts";

// Minimal Citation builder — fills the required fields, lets a test set just the metadata it cares about.
let n = 0;
function cit(over: Partial<Citation>): Citation {
  n += 1;
  return {
    chunk_tag: `c${n}`,
    source_id: `s${n}`,
    source_type: "pubmed",
    title: `Source ${n}`,
    section: null,
    url: null,
    license: null,
    published_date: null,
    retrieved_at: null,
    ...over,
  };
}

// ── study-design breakdown ──

Deno.test("study design: null when too few classified sources", () => {
  // only 2 classified (need >= 3)
  const cites = [
    cit({ publication_types: ["Meta-Analysis"] }),
    cit({ publication_types: ["Review"] }),
    cit({}), // unclassified
  ];
  assertEquals(buildStudyDesignChart(cites), null);
});

Deno.test("study design: null when only one design present", () => {
  const cites = [
    cit({ publication_types: ["Randomized Controlled Trial"] }),
    cit({ publication_types: ["Randomized Controlled Trial"] }),
    cit({ publication_types: ["Randomized Controlled Trial"] }),
  ];
  assertEquals(buildStudyDesignChart(cites), null); // counts.size < 2
});

Deno.test("study design: real distribution, sorted desc, honest coverage", () => {
  const cites = [
    cit({ publication_types: ["Randomized Controlled Trial"] }),
    cit({ publication_types: ["Randomized Controlled Trial"] }),
    cit({ publication_types: ["Meta-Analysis"] }),
    cit({ study_type: "OBSERVATIONAL" }),
    cit({}), // unclassified — excluded
    cit({ source_type: "openfda" }), // unclassified — excluded
  ];
  const m = buildStudyDesignChart(cites);
  assert(m, "expected a model");
  // 4 of 6 classified
  assertEquals(m!.coverageNote, "Based on 4 of 6 sources with a known study design");
  // bars sorted by count desc: RCT(2) first, then the ties (1) alphabetical
  assertEquals(m!.bars.map((b) => `${b.label}:${b.count}`), [
    "Randomized controlled trial:2",
    "Meta-analysis:1",
    "Observational study:1",
  ]);
  assertEquals(m!.maxCount, 2);
  // widest bar belongs to the max-count row; widths are proportional (others are half).
  assertEquals(m!.bars[0].barW, m!.bars[0].barW); // max row uses full DESIGN_BAR_MAX
  assert(m!.bars[1].barW < m!.bars[0].barW, "smaller count -> shorter bar");
  // rows step down monotonically
  assert(m!.bars[1].y > m!.bars[0].y && m!.bars[2].y > m!.bars[1].y, "rows stack downward");
});

// ── publications by year ──

Deno.test("timeline: null when fewer than 3 distinct years", () => {
  const cites = [cit({ year: "2021" }), cit({ year: "2021" }), cit({ year: "2022" })];
  assertEquals(buildEvidenceTimeline(cites), null); // only 2 distinct years
});

Deno.test("timeline: fills the year range with zero-height gap bars", () => {
  const cites = [
    cit({ year: "2019" }),
    cit({ year: "2020" }),
    cit({ year: "2020" }),
    cit({ year: "2022" }), // 2021 has no papers — must render as a zero bar
    cit({ source_type: "openfda", published_date: null }), // undated — excluded
  ];
  const m = buildEvidenceTimeline(cites);
  assert(m, "expected a model");
  assertEquals(m!.minYear, 2019);
  assertEquals(m!.maxYear, 2022);
  assertEquals(m!.bars.map((b) => `${b.year}:${b.count}`), ["2019:1", "2020:2", "2021:0", "2022:1"]);
  assertEquals(m!.maxCount, 2);
  const gap = m!.bars.find((b) => b.year === 2021)!;
  assertEquals(gap.count, 0);
  assertEquals(gap.h, 0);
  // the tallest bar (2020) reaches the plot top band; bars sit on the axis
  const tall = m!.bars.find((b) => b.year === 2020)!;
  assert(tall.h > 0 && Math.abs((tall.y + tall.h) - m!.axisY) < 1e-9, "bar sits on the axis");
});

Deno.test("timeline: year falls back to published_date when year absent", () => {
  const cites = [
    cit({ published_date: "2018-03-01" }),
    cit({ published_date: "2019-06-01" }),
    cit({ published_date: "2020-01-01" }),
  ];
  const m = buildEvidenceTimeline(cites);
  assert(m, "expected a model");
  assertEquals([m!.minYear, m!.maxYear], [2018, 2020]);
});
