/**
 * THE CANONICAL PLAN. One paid product, two ways to pay for it.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────
 *
 * Nemesis sold a ladder: Student ($9.99) and Agent Pro ($19.99), with Max ($99)
 * retired above them and `professional`/`enterprise`/`trial` rows underneath in
 * the database. Every one of those names leaked into the product — feature gates,
 * model gates, upgrade buttons, pricing copy, analytics — so "what can this user
 * do?" was answered in a dozen places by string comparison against a tier name.
 *
 * The owner's decision (2026-08-17) is that there is ONE paid product called
 * Nemesis. Free is the same product with less of it. The billing period is a
 * billing detail, not a capability.
 *
 * ── THE SEPARATION THIS FILE ENFORCES ─────────────────────────────────────────
 *
 *   billing identity        what the user pays, to whom, how often, at what price
 *   entitlement identity    what the application lets them do
 *
 * They are deliberately different types here. A subscription can be Stripe
 * monthly, Stripe annual, Apple monthly, a comped internal account or a
 * grandfathered legacy price — and every one of them resolves to exactly two
 * possible answers for the application: `free` or `nemesis`.
 *
 * 🔴 NOTHING OUTSIDE THIS FILE MAY BRANCH ON A LEGACY TIER NAME. If a caller
 * needs to know "can they do X", it asks for the entitlement. If it needs to
 * print what someone is paying for, it asks `billingLabel`. A `plan === "pro"`
 * anywhere else is the architecture this file replaces.
 */

/** What the application knows. There are two answers and there will be two. */
export type Plan = "free" | "nemesis";

/** How often they are billed. NOT a capability — see `entitlementPlan`. */
export type BillingInterval = "monthly" | "annual";

/** Who takes the money. Entitlement must never depend on this. */
export type BillingProvider = "stripe" | "apple" | "internal";

/**
 * Plan codes that exist in production data, Stripe webhooks and RevenueCat
 * payloads, and which must keep resolving to paid access.
 *
 * 🔴 THIS IS A COMPATIBILITY LIST, NOT A PRODUCT LADDER. Deleting a name here
 * does not retire a tier — it silently downgrades whoever still carries it. They
 * are listed because old records and old webhook events still say them, which is
 * a completely different thing from them being for sale.
 *
 * Verified against production on 2026-08-17: `subscriptions` held five rows —
 * four `enterprise` (the owner's own account, the enternemesis.com account and
 * two `.test` probes) and one canceled `free`. There were NO external paying
 * `plus`/`pro`/`student`/`max` subscribers to migrate. The mapping below is
 * therefore about webhook and data hygiene rather than about protecting revenue.
 */
const LEGACY_PAID_CODES: ReadonlySet<string> = new Set([
  "plus",
  "pro",
  "max",
  "student",
  "professional",
  "trial",
]);

/**
 * Comped internal accounts. They resolve to paid access like anything else, but
 * they keep their own `plan_entitlements` rows rather than Nemesis's caps.
 *
 * 🔴 NOT A CUSTOMER-FACING TIER AND NOT A SUBTIER OF NEMESIS. `enterprise` is
 * how the owner's own account, the company account and the integration probes
 * get unmetered headroom to test with. Folding it into `nemesis` would cap the
 * accounts used to exercise the product at a student's allowance, which is how
 * you find out about a limit by breaking your own testing. It is invisible in
 * pricing, checkout and upgrade copy.
 */
const INTERNAL_CODES: ReadonlySet<string> = new Set(["enterprise"]);

/**
 * The entitlement a raw stored plan code grants.
 *
 * 🔴 UNKNOWN STRINGS RESOLVE TO `free`, ALWAYS. A typo, a renamed Stripe product
 * or a corrupted write must be able to fail to grant access; it must never be
 * able to grant it.
 */
export function canonicalPlan(raw: string | null | undefined): Plan {
  const code = (raw ?? "").trim().toLowerCase();
  if (code === "nemesis") return "nemesis";
  if (LEGACY_PAID_CODES.has(code)) return "nemesis";
  if (INTERNAL_CODES.has(code)) return "nemesis";
  return "free";
}

/** True when the stored code is one of the comped internal accounts. */
export function isInternalPlan(raw: string | null | undefined): boolean {
  return INTERNAL_CODES.has((raw ?? "").trim().toLowerCase());
}

/** True when the stored code is a retired name kept only for compatibility. */
export function isLegacyPlanCode(raw: string | null | undefined): boolean {
  return LEGACY_PAID_CODES.has((raw ?? "").trim().toLowerCase());
}

export function isPaid(plan: Plan): boolean {
  return plan === "nemesis";
}

/**
 * Which `plan_entitlements` row set to read for a stored code.
 *
 * Everything a customer can buy reads `nemesis`. Internal comps keep their own
 * row set. This is the ONLY place the two diverge, and it is why the rest of the
 * application can treat the world as free-or-Nemesis.
 */
export function entitlementPlanCode(raw: string | null | undefined): string {
  const code = (raw ?? "").trim().toLowerCase();
  if (INTERNAL_CODES.has(code)) return code;
  return canonicalPlan(code) === "nemesis" ? "nemesis" : "free";
}

/**
 * Which of two stores wins when a user holds both.
 *
 * 🔴 THE LADDER IS GONE, SO THIS IS NO LONGER A RANK COMPARISON. It used to sort
 * free < plus < pro < max and take the highest, which mattered when the stores
 * could disagree about *how much* product someone had bought. With one paid
 * product the question collapses to "does either store say they are paid", and a
 * lapse on one side hands over to the other without a downgrade race.
 */
export function effectivePlan(
  stripePlan: string | null | undefined,
  applePlan: string | null | undefined,
): Plan {
  return canonicalPlan(stripePlan) === "nemesis" || canonicalPlan(applePlan) === "nemesis"
    ? "nemesis"
    : "free";
}

/**
 * The stored code to persist as the effective plan, preserving an internal comp.
 *
 * Without this, writing back `effectivePlan()` would flatten `enterprise` to
 * `nemesis` on the next webhook and quietly cap the owner's own account.
 */
export function effectivePlanCode(
  stripePlan: string | null | undefined,
  applePlan: string | null | undefined,
): string {
  if (isInternalPlan(stripePlan)) return (stripePlan ?? "").toLowerCase();
  if (isInternalPlan(applePlan)) return (applePlan ?? "").toLowerCase();
  return effectivePlan(stripePlan, applePlan);
}

/** What the customer is shown. Never a legacy tier name. */
export function planLabel(raw: string | null | undefined): string {
  return canonicalPlan(raw) === "nemesis" ? "Nemesis" : "Free";
}

/** "Monthly" / "Annual", for the account screen. */
export function intervalLabel(interval: BillingInterval | null | undefined): string {
  return interval === "annual" ? "Annual" : "Monthly";
}

/** Stripe's `recurring.interval` to ours. Anything else is not a Nemesis price. */
export function intervalFromStripe(raw: string | null | undefined): BillingInterval | null {
  if (raw === "month") return "monthly";
  if (raw === "year") return "annual";
  return null;
}

// ── Price ────────────────────────────────────────────────────────────────────

/**
 * 🔴 THE ONLY PLACE PRICES ARE WRITTEN. Stripe Price IDs live in environment
 * config, never in the codebase — but the AMOUNTS are asserted here so a
 * misconfigured environment variable pointing at the wrong Price fails closed
 * instead of quietly charging the wrong number.
 */
export const NEMESIS_MONTHLY_CENTS = 1_900;
export const NEMESIS_ANNUAL_CENTS = 9_600;

export function priceCents(interval: BillingInterval): number {
  return interval === "annual" ? NEMESIS_ANNUAL_CENTS : NEMESIS_MONTHLY_CENTS;
}

/**
 * What the annual plan works out at per month, for display.
 *
 * 9600 / 12 = exactly 800, so this is $8 with no rounding sleight of hand. The
 * moment the annual price stops dividing evenly this returns a rounded number
 * and the UI must keep printing the real annual charge beside it — which it does,
 * because showing "$8/month" without "$96 billed annually" is the deceptive
 * pattern the owner explicitly ruled out.
 */
export function annualPerMonthCents(): number {
  return Math.round(NEMESIS_ANNUAL_CENTS / 12);
}

/** What twelve months at the monthly rate would cost, for the saving line. */
export function annualSavingPercent(): number {
  const atMonthly = NEMESIS_MONTHLY_CENTS * 12;
  return Math.round(((atMonthly - NEMESIS_ANNUAL_CENTS) / atMonthly) * 100);
}
