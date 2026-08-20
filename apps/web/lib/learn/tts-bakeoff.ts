// Comparing synthesisers by listening to them (§43).
//
// 🔴 THE ONLY THING THIS FILE REFUSES TO DO IS PICK A WINNER FROM A DATASHEET. The owner's
// constraint, in their own words: *"Do not treat vendor language-count claims as quality evidence…
// there is no reason to assume the provider that wins Japanese also wins Mexican Spanish."* So
// coverage counts are recorded here as CATALOGUE, clearly separated from ratings, and
// `winnerFor()` cannot be satisfied by them — it reads human scores or it returns a refusal.
//
// 🔴 A BAKE-OFF IS A DEV SURFACE AND THIS IS ITS PURE HALF. Nothing here calls a provider or plays
// audio; it decides what to ask for, what a sample costs, and whether enough listening has happened
// to call a locale decided. The adapters live in the dev-only API route, and the reason they live
// there rather than in `lib/` is that integrating four vendors into production to test three of
// them is exactly what the owner ruled out.
//
// 🔴 AND A WINNER HERE IS STILL NOT A PRODUCTION CHANGE. `speech-route.ts`'s `MEASURED_PROVIDERS`
// is a checked-in constant, and promoting a bake-off winner into it is a commit somebody makes on
// purpose. A lab that could silently repoint production speech would be a lab that changes what
// learners hear without review.

/** Every synthesiser the bake-off can ask. Wider than production's `TtsProvider`, deliberately. */
export type BakeoffProvider = "cartesia" | "elevenlabs" | "google" | "xai";

/** The axes the owner named. Scored 1–5 by a person who listened. */
export const RATING_AXES = [
  "nativeAccent",
  "pronunciation",
  "prosody",
  "naturalness",
  "conversationalPacing",
] as const;

export type RatingAxis = (typeof RATING_AXES)[number];

export interface ProviderCatalogueEntry {
  /** Environment variable holding this provider's key. Absent key ⇒ the provider is not offered. */
  readonly keyEnv: string;
  readonly label: string;
  readonly provider: BakeoffProvider;
  /**
   * What the vendor advertises about language coverage.
   *
   * 🔴 RECORDED AND EXPLICITLY NOT EVIDENCE. It is here so the Lab can show it beside the ratings
   * and make the gap visible — "supports 75 languages" and "sounds native in es-MX" are different
   * claims, and the first is the one that arrives free with a marketing page. `null` means nobody
   * has written the figure down from the provider's own documentation, which is better than a
   * number somebody half-remembered.
   */
  readonly advertisedLocales: number | null;
  /**
   * What a million characters costs, and how much that figure can be trusted.
   *
   * 🔴 A RATE WITHOUT ITS PROVENANCE IS THE THING THIS WHOLE MODULE EXISTS TO REFUSE. §43 already
   * says a provider's language count is marketing rather than evidence; a price recalled from
   * memory is worse, because it is the number a decision actually turns on. So a rate never travels
   * alone — it carries where it came from and whether anybody checked.
   */
  readonly pricing: ProviderPricing;
}

/**
 * How a price got into this table.
 *
 * 🔴 THE THREE VALUES ARE NOT DEGREES OF THE SAME THING. `invoiced` means this is what Nemesis is
 * actually billed and can be read off a statement. `published` means somebody opened the vendor's
 * pricing page on a stated date and copied it. `recalled` means it came from an assistant's or a
 * person's memory and **has not been checked against anything** — it is a starting point for a
 * conversation, never an input to a decision. Collapsing `recalled` into `published` would be the
 * exact failure §43 names one level up.
 */
export type PricingEvidence = "invoiced" | "published" | "recalled";

export interface ProviderPricing {
  /**
   * USD per million characters, or null when nobody has written a figure down at all.
   *
   * 🔴 READ IT TOGETHER WITH `evidence` OR NOT AT ALL. A number here with `evidence: "recalled"` is
   * not a price; it is a hypothesis about a price.
   */
  readonly usdPerMillionChars: number | null;
  readonly evidence: PricingEvidence;
  /**
   * How the vendor actually sells it, because "per million characters" flatters some sellers.
   *
   * 🔴 THE COMPARISON IS NOT LIKE FOR LIKE AND SAYING SO IS THE POINT. A pay-as-you-go provider
   * bills what you use. A subscription provider sells a monthly credit allowance, so the effective
   * rate depends entirely on how much of that allowance gets used — a tier that is half empty costs
   * double its headline rate, and a per-million column silently assumes it is always full.
   */
  readonly model: "pay-as-you-go" | "subscription-credits" | "unknown";
  /** Where the figure came from, in words a person can go and re-check. */
  readonly source: string;
  /** ISO date the figure was last confirmed, or null when it never was. */
  readonly checkedOn: string | null;
  /** Anything that makes the headline rate misleading — tiers, free allowances, model variants. */
  readonly caveat?: string;
}

/**
 * The candidates worth comparing.
 *
 * 🔴 FOUR ENTRIES AND ONE INTEGRATION. Being in this table means "worth listening to", not
 * "wired up": the dev route reports a provider with no key as unavailable rather than failing, so
 * the Lab is honest about which columns are real on any given machine.
 */
export const PROVIDER_CATALOGUE: readonly ProviderCatalogueEntry[] = [
  {
    advertisedLocales: null,
    keyEnv: "XAI_API_KEY",
    label: "xAI",
    pricing: {
      checkedOn: null,
      // 🔴 THE ONLY RATE IN THIS TABLE NEMESIS CAN SETTLE FROM ITS OWN RECORDS, AND IT IS DISPUTED.
      // `nemesis-speak` bills at this rate and logs a USD figure per utterance, so a month of those
      // logs against a statement settles it — which is why the evidence is `invoiced` rather than
      // `published`. The brief that asked for this work cites $15 per million from the same vendor.
      // Both cannot be current, and the one the function bills is the one that reaches an invoice.
      caveat: "disputed: the function bills 4.20, the commissioning brief cites 15.00 — reconcile against a statement",
      evidence: "invoiced",
      model: "pay-as-you-go",
      source: "supabase/functions/nemesis-speak/index.ts USD_PER_CHAR",
      usdPerMillionChars: 4.2,
    },
    provider: "xai",
  },
  {
    advertisedLocales: null,
    keyEnv: "CARTESIA_API_KEY",
    label: "Cartesia",
    pricing: {
      caveat: "sold as monthly credits — the effective rate depends on how full the tier runs",
      checkedOn: null,
      evidence: "recalled",
      model: "subscription-credits",
      source: "not checked — no figure has been read off cartesia.ai/pricing",
      usdPerMillionChars: null,
    },
    provider: "cartesia",
  },
  {
    advertisedLocales: null,
    keyEnv: "ELEVENLABS_API_KEY",
    label: "ElevenLabs",
    pricing: {
      caveat: "sold as monthly credits across tiers — the headline rate falls steeply with volume",
      checkedOn: null,
      evidence: "recalled",
      model: "subscription-credits",
      source: "not checked — no figure has been read off elevenlabs.io/pricing",
      usdPerMillionChars: null,
    },
    provider: "elevenlabs",
  },
  {
    advertisedLocales: null,
    keyEnv: "GOOGLE_TTS_API_KEY",
    label: "Google Cloud",
    pricing: {
      // 🔴 ONE PROVIDER, SEVERAL PRICES, AND THE VOICE TIER DECIDES WHICH. Google prices its basic,
      // neural and studio voice families very differently, so a single number for "Google" is
      // meaningless without naming the voice family — and the voice family is exactly what a
      // language lesson is choosing. Whoever fills this in must fill in the tier too.
      caveat: "priced per voice family — basic, neural and studio differ by an order of magnitude",
      checkedOn: null,
      evidence: "recalled",
      model: "pay-as-you-go",
      source: "not checked — no figure has been read off cloud.google.com/text-to-speech/pricing",
      usdPerMillionChars: null,
    },
    provider: "google",
  },
];

/**
 * What one utterance costs, or null when the provider's rate is not established.
 *
 * 🔴 `recalled` RATES RETURN NULL, WHICH IS THE WHOLE REASON THE EVIDENCE FIELD EXISTS. A cost
 * estimate computed from a half-remembered price looks exactly like one computed from an invoice,
 * and the Lab would print both to the same number of decimal places.
 */
export function pricedFor(chars: number, pricing: ProviderPricing): number | null {
  if (pricing.usdPerMillionChars === null || pricing.evidence === "recalled") return null;
  return (chars * pricing.usdPerMillionChars) / 1_000_000;
}

/** One thing a person listened to. */
export interface BakeoffSample {
  readonly chars: number;
  /** Milliseconds from request to audio in hand. A product fact, measured rather than advertised. */
  readonly latencyMs: number;
  readonly locale: string;
  readonly phrase: string;
  readonly provider: BakeoffProvider;
  /** Which voice was used, when the adapter reports one. Part of the material, not a skin. */
  readonly voice?: string;
}

/** What a person scored after listening. All five axes, so a half-filled card cannot count. */
export type BakeoffRating = Readonly<Record<RatingAxis, number>>;

export interface RatedSample {
  readonly rating: BakeoffRating;
  readonly sample: BakeoffSample;
}

/** What a sample cost, or null when the provider's rate has not been established. */
export function sampleCostUsd(sample: BakeoffSample, catalogue: readonly ProviderCatalogueEntry[] = PROVIDER_CATALOGUE): number | null {
  const pricing = catalogue.find((entry) => entry.provider === sample.provider)?.pricing;
  return pricing ? pricedFor(sample.chars, pricing) : null;
}

/** The mean of the five axes for one rating. */
export function ratingMean(rating: BakeoffRating): number {
  return RATING_AXES.reduce((total, axis) => total + rating[axis], 0) / RATING_AXES.length;
}

/** A rating is only usable if every axis is a whole score in range. Half-filled cards do not count. */
export function isCompleteRating(value: unknown): value is BakeoffRating {
  if (typeof value !== "object" || value === null) return false;
  return RATING_AXES.every((axis) => {
    const score = (value as Record<string, unknown>)[axis];
    return typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 5;
  });
}

export type WinnerRefusal =
  /** Nobody has listened to anything in this locale. */
  | "nothing-rated"
  /**
   * One provider was rated, so there is no comparison.
   *
   * 🔴 THE RULE THAT MAKES THIS A BAKE-OFF RATHER THAN AN ENDORSEMENT. A single provider scoring 4
   * out of 5 says nothing about whether another would score 5, and declaring it the winner of a
   * field of one is how a default gets laundered into a measurement.
   */
  | "only-one-provider-rated"
  /** Two or more providers tied. A tie is not a winner; listen again with more phrases. */
  | "tied";

export type WinnerResult =
  | { locale: string; mean: number; ok: true; provider: BakeoffProvider; ratings: number }
  | { detail: string; ok: false; reason: WinnerRefusal };

/**
 * Who won a locale, from ratings alone.
 *
 * 🔴 IT TAKES NO CATALOGUE ARGUMENT, AND THAT IS THE POINT. Coverage counts, prices and vendor
 * claims are not in scope for this function because they are not evidence of how a voice sounds.
 * The only inputs are things a person heard.
 */
export function winnerFor(locale: string, rated: readonly RatedSample[]): WinnerResult {
  const forLocale = rated.filter((row) => row.sample.locale === locale);
  if (forLocale.length === 0) {
    return { detail: `nobody has listened to a sample in ${locale}`, ok: false, reason: "nothing-rated" };
  }

  const byProvider = new Map<BakeoffProvider, number[]>();
  for (const row of forLocale) {
    const means = byProvider.get(row.sample.provider) ?? [];
    means.push(ratingMean(row.rating));
    byProvider.set(row.sample.provider, means);
  }

  if (byProvider.size < 2) {
    const only = [...byProvider.keys()][0];
    return {
      detail: `only ${only} has been rated in ${locale} — a field of one has no winner`,
      ok: false,
      reason: "only-one-provider-rated",
    };
  }

  const scored = [...byProvider.entries()]
    .map(([provider, means]) => ({
      mean: means.reduce((total, value) => total + value, 0) / means.length,
      provider,
      ratings: means.length,
    }))
    .sort((a, b) => b.mean - a.mean);

  const [winner, runnerUp] = scored;
  // Unreachable: `byProvider.size >= 2` above guarantees two entries. Handled rather than asserted
  // with `!`, because a non-null assertion is a claim the compiler cannot check and the guard above
  // is exactly the kind of thing that gets moved.
  if (!winner) return { detail: `nobody has listened to a sample in ${locale}`, ok: false, reason: "nothing-rated" };
  if (runnerUp && winner.mean === runnerUp.mean) {
    return {
      detail: `${winner.provider} and ${runnerUp.provider} scored identically in ${locale}`,
      ok: false,
      reason: "tied",
    };
  }

  return { locale, mean: winner.mean, ok: true, provider: winner.provider, ratings: winner.ratings };
}

/**
 * The line to paste into `speech-route.ts` once a locale is decided.
 *
 * 🔴 A STRING RATHER THAN A WRITE, ON PURPOSE. The lab could edit the source file; it must not.
 * Promoting a winner changes what every learner in that locale hears, and that belongs in a diff
 * somebody reviewed rather than in a side effect of clicking a rating.
 */
export function promotionLine(result: WinnerResult): string | null {
  if (!result.ok) return null;
  return `  "${result.locale}": "${result.provider}", // measured: ${result.ratings} rating(s), mean ${result.mean.toFixed(2)}`;
}
