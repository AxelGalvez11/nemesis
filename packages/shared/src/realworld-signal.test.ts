import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PatientReport, ReportedOutcome } from "./realworld-signal.ts";
import { buildRealWorldSignal, REAL_WORLD_SIGNAL_TIER } from "./realworld-signal.ts";

function rep(over: Partial<PatientReport> & { reported_intervention: string; reported_outcome: ReportedOutcome }): PatientReport {
  return {
    condition: over.condition ?? "insomnia",
    reported_intervention: over.reported_intervention,
    reported_outcome: over.reported_outcome,
    source_type: over.source_type ?? "forum",
    source_url: over.source_url ?? "https://example.com/post",
    verbatim_quote: over.verbatim_quote ?? "it helped me",
    reported_date: over.reported_date ?? null,
  };
}

Deno.test("real-world signal: tallies an intervention with >= 3 reports and surfaces it", () => {
  const s = buildRealWorldSignal("insomnia", [
    rep({ reported_intervention: "magnesium", reported_outcome: "helped" }),
    rep({ reported_intervention: "magnesium", reported_outcome: "helped" }),
    rep({ reported_intervention: "magnesium", reported_outcome: "no_effect" }),
  ]);
  assert(s.shown);
  assertEquals(s.interventions.length, 1);
  const m = s.interventions[0]!;
  assertEquals(m.intervention, "magnesium");
  assertEquals(m.tried, 3);
  assertEquals(m.helped, 2);
  assertEquals(m.no_effect, 1);
  assertEquals(m.provenance.length, 3);
});

Deno.test("real-world signal: abstains on interventions below the floor", () => {
  const s = buildRealWorldSignal("insomnia", [
    rep({ reported_intervention: "melatonin", reported_outcome: "helped" }),
    rep({ reported_intervention: "melatonin", reported_outcome: "worse" }),
  ]);
  assertEquals(s.shown, false);
  assertEquals(s.interventions.length, 0);
  assertEquals(s.total_reports, 2);
  assert(s.note.length > 0);
});

Deno.test("real-world signal: orders interventions by report count, desc", () => {
  const reports: PatientReport[] = [];
  for (let i = 0; i < 4; i++) reports.push(rep({ reported_intervention: "magnesium", reported_outcome: "helped" }));
  for (let i = 0; i < 3; i++) reports.push(rep({ reported_intervention: "valerian", reported_outcome: "mixed" }));
  const s = buildRealWorldSignal("insomnia", reports);
  assertEquals(s.interventions.map((i) => i.intervention), ["magnesium", "valerian"]);
});

Deno.test("real-world signal: groups case- and whitespace-insensitively", () => {
  const s = buildRealWorldSignal("insomnia", [
    rep({ reported_intervention: "Magnesium", reported_outcome: "helped" }),
    rep({ reported_intervention: " magnesium ", reported_outcome: "helped" }),
    rep({ reported_intervention: "MAGNESIUM", reported_outcome: "worse" }),
  ]);
  assertEquals(s.interventions.length, 1);
  assertEquals(s.interventions[0]!.tried, 3);
  assertEquals(s.interventions[0]!.worse, 1);
});

Deno.test("real-world signal: empty input abstains cleanly", () => {
  const s = buildRealWorldSignal("insomnia", []);
  assertEquals(s.shown, false);
  assertEquals(s.total_reports, 0);
  assertEquals(s.tier, REAL_WORLD_SIGNAL_TIER);
});

Deno.test("real-world signal (THE WALL): the anecdotal tier never carries an effect estimate", () => {
  const s = buildRealWorldSignal("insomnia", [
    rep({ reported_intervention: "magnesium", reported_outcome: "helped" }),
    rep({ reported_intervention: "magnesium", reported_outcome: "helped" }),
    rep({ reported_intervention: "magnesium", reported_outcome: "helped" }),
  ]);
  assertEquals(s.tier, REAL_WORLD_SIGNAL_TIER); // the lowest tier, by construction
  const banned = ["effect", "estimate", "pooled", "ci_low", "ci_high", "p_value", "odds", "risk_ratio", "random", "fixed"];
  const keys = [...Object.keys(s), ...s.interventions.flatMap((i) => Object.keys(i))];
  assert(keys.every((k) => !banned.includes(k)), `must carry no effect-estimate field; saw: ${keys.join(",")}`);
});
