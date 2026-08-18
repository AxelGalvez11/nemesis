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
   * USD per million characters, from the provider's own pricing page.
   *
   * 🔴 `null` MEANS UNVERIFIED, AND THE LAB PRINTS IT AS UNKNOWN RATHER THAN ESTIMATING. A cost
   * column filled with plausible numbers is how a bake-off ends up recommending the cheapest
   * provider that nobody priced.
   *
   * 🔴 THE ONE FIGURE THIS REPO HOLDS IS ALREADY DISPUTED, WHICH IS WHY THE FIELD IS NULLABLE
   * RATHER THAN OPTIONAL. `supabase/functions/nemesis-speak/index.ts` bills xAI TTS at $4.20 per
   * million characters, citing x.ai's own announcement; the brief that asked for this work cites
   * $15 per million from the same vendor's docs. Both cannot be current. Until somebody reads the
   * live pricing page, neither belongs in this table — and the cost the FUNCTION bills is the one
   * that reaches an invoice, so that is the number to reconcile against.
   */
  readonly usdPerMillionChars: number | null;
}

/**
 * The candidates worth comparing.
 *
 * 🔴 FOUR ENTRIES AND ONE INTEGRATION. Being in this table means "worth listening to", not
 * "wired up": the dev route reports a provider with no key as unavailable rather than failing, so
 * the Lab is honest about which columns are real on any given machine.
 */
export const PROVIDER_CATALOGUE: readonly ProviderCatalogueEntry[] = [
  { advertisedLocales: null, keyEnv: "XAI_API_KEY", label: "xAI", provider: "xai", usdPerMillionChars: null },
  { advertisedLocales: null, keyEnv: "CARTESIA_API_KEY", label: "Cartesia", provider: "cartesia", usdPerMillionChars: null },
  { advertisedLocales: null, keyEnv: "ELEVENLABS_API_KEY", label: "ElevenLabs", provider: "elevenlabs", usdPerMillionChars: null },
  { advertisedLocales: null, keyEnv: "GOOGLE_TTS_API_KEY", label: "Google Cloud", provider: "google", usdPerMillionChars: null },
];

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

/** What a sample cost, or null when the provider's rate has not been verified. */
export function sampleCostUsd(sample: BakeoffSample, catalogue: readonly ProviderCatalogueEntry[] = PROVIDER_CATALOGUE): number | null {
  const rate = catalogue.find((entry) => entry.provider === sample.provider)?.usdPerMillionChars;
  if (rate === null || rate === undefined) return null;
  return (sample.chars * rate) / 1_000_000;
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

  if (scored.length > 1 && scored[0].mean === scored[1].mean) {
    return {
      detail: `${scored[0].provider} and ${scored[1].provider} scored identically in ${locale}`,
      ok: false,
      reason: "tied",
    };
  }

  return { locale, mean: scored[0].mean, ok: true, provider: scored[0].provider, ratings: scored[0].ratings };
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
