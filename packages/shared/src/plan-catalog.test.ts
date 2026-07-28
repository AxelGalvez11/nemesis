// Run: deno test --no-check packages/shared/src/plan-catalog.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { catalogInversions, PLAN_CATALOG, planByCode } from "./plan-catalog.ts";

Deno.test("the printed ladder never runs backwards", () => {
  // The guard that matters. A dearer plan giving less of anything is the bug
  // that shipped once already and is invisible until a student hits the lower
  // cap they paid more for.
  assertEquals(catalogInversions(), []);
});

Deno.test("the catalog matches the entitlement numbers it claims to describe", () => {
  // Mirrors apps/web/lib/workload-cost.ts's PLANS, in student-facing units.
  // Recording is stored in MINUTES there and printed as HOURS here, which is
  // the only conversion — so this is where a minutes/hours slip gets caught.
  const expected = {
    free: { askDaily: 10, minutes: 120, price: 0, search: 60 },
    max: { askDaily: 1_250, minutes: 12_000, price: 99, search: 750 },
    plus: { askDaily: 125, minutes: 1_200, price: 9.99, search: 75 },
    pro: { askDaily: 250, minutes: 5_000, price: 19.99, search: 150 },
  } as const;

  for (const plan of PLAN_CATALOG) {
    const row = expected[plan.code];
    assertEquals(plan.priceUsd, row.price, `${plan.code} price`);
    assertEquals(plan.askDaily, row.askDaily, `${plan.code} asks/day`);
    assertEquals(plan.searchMonthly, row.search, `${plan.code} searches`);
    // Pro's 5,000 minutes is 83.3 hours and is ADVERTISED as 80 — deliberate
    // slack, per the comment on that row. So the printed figure must never
    // EXCEED what the meter allows; under is honest, over is a promise we break.
    assert(
      plan.recordingHours * 60 <= row.minutes,
      `${plan.code} advertises ${plan.recordingHours}h but the meter only allows ${row.minutes}min`,
    );
  }
});

Deno.test("only Pro and Max reach the deeper answer lane", () => {
  // nemesis-llm gates on plan === 'pro' || 'max'. Printing it on Plus would be
  // selling something the valve refuses to serve.
  assertEquals(
    PLAN_CATALOG.filter((p) => p.premiumAnswers).map((p) => p.code),
    ["pro", "max"],
  );
});

Deno.test("an unknown plan falls back to the LEAST generous card", () => {
  // A stale or garbled plan string must never light up Max.
  assertEquals(planByCode("enterprise").code, "free");
  assertEquals(planByCode(null).code, "free");
  assertEquals(planByCode(undefined).code, "free");
  assertEquals(planByCode("max").code, "max");
});
