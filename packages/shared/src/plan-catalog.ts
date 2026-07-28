// The four plans, as a STUDENT sees them. One table, imported by both apps.
//
// Why this exists: the phone's Subscription screen showed only Free and "Pro"
// with adjectives ("Higher daily usage limits"), so Plus and Max were invisible
// and no number on the page was checkable. Marketing copy that drifts from the
// meters a student is actually held to is worse than no copy.
//
// WHERE THE NUMBERS COME FROM. `apps/web/lib/workload-cost.ts`'s PLANS is the
// cost model, read back out of `plan_entitlements` after the 2026-07-28 ladder
// reshape. These are the SAME numbers, converted to the units a person reads
// (minutes -> hours) and nothing else. `plan-catalog.test.ts` asserts the
// conversion and the ordering, so a re-price that lands in one place and not
// the other fails a test instead of quietly overpromising to a paying student.
//
// NOT here on purpose: token ceilings. A student cannot count tokens, and a
// number nobody can verify is decoration.

/** The rungs we actually SELL.
 *
 *  Deliberately NOT `PlanCode` from entitlements.ts, and not a reuse of it
 *  either. That union is wider — it still carries "student", "professional" and
 *  "enterprise" from earlier pricing — and those are codes an old account row
 *  may still hold but which no longer have a card to show. Naming this one
 *  differently keeps `export *` from re-exporting two `PlanCode`s, which is a
 *  build error in every consumer of the shared package.
 *
 *  A legacy code is not an error at runtime: planByCode() takes any string and
 *  falls back to Free, which is the correct card for a plan we no longer sell. */
export type CatalogPlanCode = "free" | "plus" | "pro" | "max";

export interface CatalogPlan {
  code: CatalogPlanCode;
  /** What a student sees on the card. */
  name: string;
  /** USD per month. 0 is Free — rendered as "Free", never "$0". */
  priceUsd: number;
  /** Questions per day (ask_daily_limit). */
  askDaily: number;
  /** Recorded-lecture hours per month. The owner set 20/80/200 directly on
   *  2026-07-28; Free's 2 hours comes from the same table. */
  recordingHours: number;
  /** Web searches per month (nemesis_search_monthly_units). */
  searchMonthly: number;
  /** Whether the deeper answer lane is reachable. nemesis-llm gates this on
   *  plan === 'pro' || plan === 'max', so Plus deliberately does NOT get it. */
  premiumAnswers: boolean;
}

/** Cheapest first. The screen renders in this order. */
export const PLAN_CATALOG: readonly CatalogPlan[] = [
  {
    askDaily: 10,
    code: "free",
    name: "Free",
    premiumAnswers: false,
    priceUsd: 0,
    recordingHours: 2,
    searchMonthly: 60,
  },
  {
    askDaily: 125,
    code: "plus",
    name: "Plus",
    premiumAnswers: false,
    priceUsd: 9.99,
    recordingHours: 20,
    searchMonthly: 75,
  },
  {
    askDaily: 250,
    code: "pro",
    name: "Pro",
    premiumAnswers: true,
    priceUsd: 19.99,
    recordingHours: 80,
    searchMonthly: 150,
  },
  {
    askDaily: 1_250,
    code: "max",
    name: "Max",
    premiumAnswers: true,
    priceUsd: 99,
    recordingHours: 200,
    searchMonthly: 750,
  },
];

/** One plan by code, or Free for anything unrecognised — an unknown plan string
 *  from the server must show the LEAST generous card, never the most. */
export function planByCode(code: string | null | undefined): CatalogPlan {
  return PLAN_CATALOG.find((plan) => plan.code === code) ?? PLAN_CATALOG[0];
}

/**
 * Every place a dearer plan gives LESS than a cheaper one.
 *
 * The ladder has run backwards before (2026-07-28: Pro's recording allowance
 * was below Plus's), and the failure mode is a student paying more for less and
 * finding out mid-term. `planCapInversions()` in the web cost model guards the
 * entitlement rows; this guards the numbers we PRINT, which is a different file
 * and can drift on its own. Empty means the ladder is monotonic.
 */
export function catalogInversions(): string[] {
  const problems: string[] = [];
  const metered = [
    { get: (p: CatalogPlan) => p.askDaily, key: "askDaily" },
    { get: (p: CatalogPlan) => p.recordingHours, key: "recordingHours" },
    { get: (p: CatalogPlan) => p.searchMonthly, key: "searchMonthly" },
  ];
  for (let i = 1; i < PLAN_CATALOG.length; i++) {
    const cheaper = PLAN_CATALOG[i - 1];
    const dearer = PLAN_CATALOG[i];
    if (dearer.priceUsd <= cheaper.priceUsd) {
      problems.push(`${dearer.code} costs ${dearer.priceUsd}, not more than ${cheaper.code}'s ${cheaper.priceUsd}`);
    }
    for (const meter of metered) {
      if (meter.get(dearer) < meter.get(cheaper)) {
        problems.push(`${dearer.code} gets less ${meter.key} than ${cheaper.code}`);
      }
    }
  }
  return problems;
}
