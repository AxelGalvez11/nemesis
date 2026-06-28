import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type MetricInput, PILLARS, scoreHealth, tierFor } from "./health-score.ts";

Deno.test("tier bands map percentiles to wellness tiers", () => {
  assertEquals(tierFor(95), "elite");
  assertEquals(tierFor(80), "optimized");
  assertEquals(tierFor(65), "strong");
  assertEquals(tierFor(45), "solid");
  assertEquals(tierFor(20), "building");
});

Deno.test("a pillar score is the weighted average of its present metrics", () => {
  const inputs: MetricInput[] = [
    { key: "apob", percentile: 90 },
    { key: "hscrp", percentile: 80 },
    { key: "resting_hr", percentile: 60 },
  ];
  const result = scoreHealth(inputs);
  const cardio = result.pillars.find((p) => p.pillar === "cardiovascular");
  assertEquals(cardio?.percentile, 79);
  assertEquals(cardio?.tier, "optimized");
  assertEquals(cardio?.contributing.length, 3);
});

Deno.test("a pillar with no entered metrics is locked", () => {
  const result = scoreHealth([{ key: "vo2max", percentile: 70 }]);
  const aging = result.pillars.find((p) => p.pillar === "pace_of_aging");
  assertEquals(aging?.percentile, null);
  assertEquals(aging?.tier, null);
  const strength = result.pillars.find((p) => p.pillar === "strength");
  assertEquals(strength?.percentile, null);
});

Deno.test("composite averages only the scored pillars", () => {
  const result = scoreHealth([
    { key: "vo2max", percentile: 80 },
    { key: "hba1c", percentile: 80 },
  ]);
  const metabolic = result.pillars.find((p) => p.pillar === "metabolic");
  assertEquals(metabolic?.percentile, 80);
  assertEquals(result.composite, 80);
  assertEquals(result.tier, "optimized");
});

Deno.test("adding a second pillar refines the composite as an average", () => {
  const result = scoreHealth([
    { key: "vo2max", percentile: 80 },
    { key: "hba1c", percentile: 80 },
    { key: "hrv", percentile: 90 },
    { key: "sleep_efficiency", percentile: 90 },
  ]);
  assertEquals(result.composite, 85);
});

Deno.test("empty input yields a null composite", () => {
  const result = scoreHealth([]);
  assertEquals(result.composite, null);
  assertEquals(result.tier, null);
  assertEquals(result.pillars.length, PILLARS.length);
  assert(result.pillars.every((p) => p.percentile === null));
});
