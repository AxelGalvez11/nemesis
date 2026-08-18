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
 *
 * Owner decision 2026-08-18: $19.99 a month, $199.99 a year. Consumer .99
 * pricing, and the annual keeps Nemesis under $200.
 *
 * 🔴 $19.99 IS ALSO WHAT AGENT PRO USED TO COST. Validating a Stripe Price by
 * amount alone would therefore accept a stale STRIPE_PRO_PRICE_ID as if it were
 * the new monthly Nemesis price. The checkout and catalog paths validate the
 * Price ID they were configured with AND the amount; see
 * `stripePriceMatchesInterval` in apps/web/lib/billing-contract.ts.
 */
export const NEMESIS_MONTHLY_CENTS = 1_999;
export const NEMESIS_ANNUAL_CENTS = 19_999;

export function priceCents(interval: BillingInterval): number {
  return interval === "annual" ? NEMESIS_ANNUAL_CENTS : NEMESIS_MONTHLY_CENTS;
}

/**
 * What the annual plan works out at per month, for display.
 *
 * 19999 / 12 = 1666.58, so this ROUNDS — $16.67 a month is not a number anyone
 * is ever charged, and twelve of them do not add back to $199.99. That is
 * exactly why the UI is required to print "$199.99 billed annually" next to it;
 * showing "$16.67/month" alone is the deceptive pattern the owner ruled out.
 */
export function annualPerMonthCents(): number {
  return Math.round(NEMESIS_ANNUAL_CENTS / 12);
}

/**
 * The saving against paying monthly for a year, as a whole percent.
 *
 * 🔴 ARITHMETIC, NOT A MARKETING CONSTANT. $19.99 x 12 = $239.88 against
 * $199.99 is $39.89, or 16.63% — which rounds to the 17% the UI says. If either
 * price changes, this number changes with it and the copy cannot go stale.
 *
 * The customer-facing line is "Save 17%", never "2 months free": $199.99 is
 * 10.005 months at the monthly rate, so "2 months free" would be a claim the
 * arithmetic does not support.
 */
export function annualSavingPercent(): number {
  const atMonthly = NEMESIS_MONTHLY_CENTS * 12;
  return Math.round(((atMonthly - NEMESIS_ANNUAL_CENTS) / atMonthly) * 100);
}

/** Cents to the string the customer reads. `1999` -> `"$19.99"`. */
export function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Conversational voice ─────────────────────────────────────────────────────

/**
 * 🔴 THIS IS NOT LECTURE TRANSCRIPTION, AND THE DISTINCTION IS THE WHOLE POINT.
 *
 * Nemesis used to sell recorded-lecture hours: an hour of audio in, a transcript
 * and study material out, priced in the tens of hours. That product is retired
 * (owner, 2026-08-18) and the new Nemesis plan deliberately does NOT inherit its
 * allowance.
 *
 * What xAI is used for now is CONVERSATION, and only that:
 *
 *     learner speaks -> xAI STT -> DeepSeek -> xAI TTS -> Nemesis speaks back
 *
 * Both halves of that round trip are metered into ONE counter, in seconds of
 * talking, because a learner experiences it as one thing — time spent talking to
 * Nemesis — not as two provider invoices. Speech in is billed by audio duration;
 * speech out is billed by character and converted to seconds at
 * `VOICE_SPEECH_CHARS_PER_SECOND` so both land in the same unit.
 *
 * 🔴 THE OLD KEY IS NOT REUSED. `transcription_seconds_month_limit` and
 * `live_audio_seconds_month_limit` still exist and still mean what they meant —
 * batch lecture transcription and the AssemblyAI streaming copilot. Overloading
 * either one to mean conversational voice would silently change the meaning of a
 * limit that live code still reserves against.
 */
export const VOICE_ENTITLEMENT_KEY = "voice_seconds_month_limit";
export const VOICE_COUNTER_KEY = "voice_seconds_month";

/**
 * Paid Nemesis: five hours of conversation a month.
 *
 * An internal launch allowance, chosen to be generous against how voice mode
 * actually gets used (short exchanges inside a Canvas, not hour-long calls) while
 * bounding the one lane that bills per second. At the surveyed rates a
 * subscriber who exhausts it costs about eighty cents. It is a ROW, not code —
 * raising it later is an UPDATE, not a billing change.
 */
export const NEMESIS_VOICE_SECONDS_MONTH = 18_000;

/**
 * Free: fifteen minutes.
 *
 * Enough to hear Nemesis speak, ask it something out loud and get an answer back
 * — the feature demonstrates itself — and small enough that a free account that
 * uses every second of it costs about four cents a month. Fifteen minutes is
 * also what free already gets on the streaming audio lane, so it is the smallest
 * allowance the existing architecture already expresses.
 */
export const FREE_VOICE_SECONDS_MONTH = 900;

/** Speaking rate used to convert synthesised characters into metered seconds.
 *  ~850 characters a minute, the same figure apps/web/lib/workload-cost.ts uses
 *  to turn transcript characters back into audio minutes. */
export const VOICE_SPEECH_CHARS_PER_SECOND = 850 / 60;

/** Metered seconds for a piece of synthesised speech. Always at least 1: a call
 *  that reached the provider was paid for, and must not meter as free. */
export function voiceSecondsForCharacters(characters: number): number {
  if (!Number.isFinite(characters) || characters <= 0) return 0;
  return Math.max(1, Math.ceil(characters / VOICE_SPEECH_CHARS_PER_SECOND));
}

/** The conversational voice allowance for a plan, in seconds per calendar month. */
export function voiceSecondsForPlan(plan: Plan): number {
  return plan === "nemesis" ? NEMESIS_VOICE_SECONDS_MONTH : FREE_VOICE_SECONDS_MONTH;
}
