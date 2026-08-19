/**
 * What Nemesis costs, on the marketing site.
 *
 * 🔴 A MIRROR OF packages/shared/src/plan.ts, AND IT IS TESTED AS ONE. The
 * landing site is a separate Next application with its own dependency list and
 * no workspace link to @nemesis/shared, so these four numbers exist twice. That
 * is exactly how a pricing page ends up advertising a price the checkout does
 * not charge — so `pricing.test.ts` reads the shared module's source and fails
 * if either copy moves without the other.
 *
 * There is one paid product. The interval is how often you pay for it, never
 * what you get.
 */

export const NEMESIS_MONTHLY_CENTS = 1_999;
export const NEMESIS_ANNUAL_CENTS = 19_999;

export type BillingInterval = "monthly" | "annual";

export function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** $199.99 / 12, rounded. Never a charged amount — always printed next to the
 *  real annual figure, which is why `billedAs` below is not optional. */
export function annualPerMonthCents(): number {
  return Math.round(NEMESIS_ANNUAL_CENTS / 12);
}

/** 16.63%, shown as 17%. Arithmetic, so the copy cannot go stale. */
export function annualSavingPercent(): number {
  const atMonthly = NEMESIS_MONTHLY_CENTS * 12;
  return Math.round(((atMonthly - NEMESIS_ANNUAL_CENTS) / atMonthly) * 100);
}

export interface IntervalCopy {
  id: BillingInterval;
  label: string;
  /** The big number on the card. */
  perMonth: string;
  /** The true charge. Shown with the big number, always. */
  billedAs: string;
}

export const INTERVALS: readonly IntervalCopy[] = [
  {
    billedAs: "Billed monthly, cancel anytime",
    id: "monthly",
    label: "Monthly",
    perMonth: formatUsdCents(NEMESIS_MONTHLY_CENTS),
  },
  {
    billedAs: `${formatUsdCents(NEMESIS_ANNUAL_CENTS)} billed annually, cancel anytime`,
    id: "annual",
    // 🔴 "Save 17%", NEVER "2 months free". $199.99 buys 10.005 months at the
    // monthly rate, so the second claim is one the arithmetic does not support.
    label: `Yearly · Save ${annualSavingPercent()}%`,
    perMonth: formatUsdCents(annualPerMonthCents()),
  },
];
