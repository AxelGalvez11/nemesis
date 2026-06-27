export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isPreviewMode = !supabaseUrl || !supabaseAnonKey;

export function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

const defaultAppUrl = process.env.NODE_ENV === "development"
  ? "http://localhost:3000"
  : "https://app.pharmaorb.app";

export const appUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ?? defaultAppUrl;
export const landingUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_LANDING_URL) ?? "https://pharmaorb.app";

// PostHog product analytics. Public phc_ project key (write-only ingestion) + host — safe in the
// browser bundle. Reads happen elsewhere with a personal API key.
export const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
export const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
export const stripePlusPriceId = process.env.STRIPE_PLUS_PRICE_ID ?? "";
export const stripeProPriceId = process.env.STRIPE_PRO_PRICE_ID ?? "";
export const stripeAllowLive = process.env.STRIPE_ALLOW_LIVE === "true";

export function requirePublicEnv(): void {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  }
}

export function requireServerEnv(): void {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error("Supabase server env is required");
  }
}
