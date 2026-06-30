import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { StudyArm } from "./meta-analysis.ts";
import { runGapMetaTest } from "./gap-meta-test.ts";

// Build a usable StudyArm; tests override just the fields they care about.
function arm(over: Partial<StudyArm> & { outcome_label: string }): StudyArm {
  return {
    label: over.label ?? "Study",
    citation_tag: over.citation_tag ?? "1",
    source_quote: over.source_quote ?? "events: see source",
    outcome_label: over.outcome_label,
    events_treatment: over.events_treatment ?? 10,
    total_treatment: over.total_treatment ?? 100,
    events_control: over.events_control ?? 20,
    total_control: over.total_control ?? 100,
  };
}

Deno.test("gap meta: pools >= 2 comparable (same-outcome) studies", () => {
  const r = runGapMetaTest([
    arm({ outcome_label: "mortality", events_treatment: 10, total_treatment: 100, events_control: 20, total_control: 100 }),
    arm({ outcome_label: "mortality", events_treatment: 12, total_treatment: 110, events_control: 22, total_control: 105 }),
  ]);
  assert(r.tested, "expected a pooled result");
  assertEquals(r.outcomes.length, 1);
  const res = r.outcomes[0]!.result;
  assert(res.poolable, "the single outcome should be poolable");
  if (res.poolable) assertEquals(res.k, 2);
});

Deno.test("gap meta: NEVER pools across different outcomes", () => {
  const r = runGapMetaTest([
    arm({ outcome_label: "mortality" }),
    arm({ outcome_label: "stroke" }),
  ]);
  assert(!r.tested, "two different single-study outcomes must not pool");
  assertEquals(r.outcomes.length, 2);
  assert(r.outcomes.every((o) => !o.result.poolable));
});

Deno.test("gap meta: pools the comparable cluster, abstains on the singleton", () => {
  const r = runGapMetaTest([
    arm({ outcome_label: "mortality" }),
    arm({ outcome_label: "mortality" }),
    arm({ outcome_label: "bleeding" }),
  ]);
  assert(r.tested);
  // ordered by label for determinism: bleeding, then mortality
  assertEquals(r.outcomes.map((o) => o.outcome_label), ["bleeding", "mortality"]);
  const bleeding = r.outcomes.find((o) => o.outcome_label === "bleeding")!;
  const mortality = r.outcomes.find((o) => o.outcome_label === "mortality")!;
  assert(!bleeding.result.poolable, "1 study cannot be pooled");
  assert(mortality.result.poolable, "2 studies should pool");
});

Deno.test("gap meta: groups outcomes case- and whitespace-insensitively", () => {
  const r = runGapMetaTest([
    arm({ outcome_label: "All-cause mortality" }),
    arm({ outcome_label: "  all-cause mortality " }),
  ]);
  assertEquals(r.outcomes.length, 1);
  assert(r.outcomes[0]!.result.poolable);
});

Deno.test("gap meta: empty input abstains cleanly (no crash, honest summary)", () => {
  const r = runGapMetaTest([]);
  assertEquals(r.tested, false);
  assertEquals(r.outcomes.length, 0);
  assert(r.summary.length > 0);
});
