export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
// The local no-env experience remains useful for design work. A production build must never grant
// a fake preview session when credentials are missing; it fails closed through the real auth path.
export const isPreviewMode = process.env.NODE_ENV !== "production" && !hasSupabaseConfig;

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
  : "https://app.enternemesis.com";

export const appUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ?? defaultAppUrl;
export const landingUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_LANDING_URL) ?? "https://www.enternemesis.com";

// Engine data-visuals (study-design mix + publications-by-year on a research report) — DEFAULT OFF.
// Computed from real citation metadata; shown only when the data warrants. Off ⇒ reports render as today.
export const engineVisualsEnabled = process.env.NEXT_PUBLIC_ENGINE_VISUALS === "true";

// NEXT_PUBLIC_SIMPLE_MODES is retired (2026-07-06): the simplified dial is now the ONLY dial —
// Auto (default) + Thorough, hardcoded in the ask page ("Fast" removed as a label; its engine
// register survives as Auto's quick depth). The env var no longer has any effect.

// Deliverables-on-command — DEFAULT OFF. When "true", a typed message like "make me slides on X" /
// "write a document about Y" / "make a poster on Z" is detected (see lib/deliverable-intent.ts) and
// auto-routes to the deep-research report pipeline with the matching export armed, instead of the
// user having to open the "+" menu and click a Skill first. Off ⇒ submit() behaves exactly as today
// (byte-identical) — the SKILLS menu entries remain the only way to arm a deliverable export.
export const deliverablesOnCommandEnabled = process.env.NEXT_PUBLIC_DELIVERABLES_ON_COMMAND === "true";

// Streamed answers (SSE): the thinking trail rides real pipeline milestones and the lead
// paragraph types itself in as the model writes it. Requires the ask fn deployed with
// ASK_STREAMING=on — an eager client against an off server degrades cleanly to normal JSON.
export const streamingEnabled = process.env.NEXT_PUBLIC_STREAMING === "true";

// Bot-protection CAPTCHA (Cloudflare Turnstile + Supabase native enforcement) — DEFAULT OFF.
// When NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, the sign-in/sign-up forms render a Turnstile widget
// and pass its token to Supabase auth (options.captchaToken). Off (no key) ⇒ no widget, no token,
// auth behaves exactly as today. SAFE ACTIVATION ORDER: (1) set this site key in Vercel + redeploy
// so tokens start flowing while Supabase still ignores them; (2) THEN enable CAPTCHA enforcement in
// the Supabase dashboard (Auth → Attack Protection → Turnstile + secret key). Never enable server
// enforcement first, or every sign-in/up breaks until the client deploys.
export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const captchaEnabled = turnstileSiteKey.length > 0;

// Social sign-in (Supabase OAuth) — DEFAULT OFF. Buttons render only for providers listed in
// NEXT_PUBLIC_AUTH_PROVIDERS (comma-separated, e.g. "google,apple"), so the UI can never offer a
// provider before it is configured in Supabase (Auth -> Providers). Unset => email/password only.
export type OAuthProviderId = "google" | "apple";
const rawAuthProviders = process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "";
export const enabledOAuthProviders: OAuthProviderId[] = rawAuthProviders
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter((value): value is OAuthProviderId => value === "google" || value === "apple");

// PostHog product analytics. Public phc_ project key (write-only ingestion) + host — safe in the
// browser bundle. Reads happen elsewhere with a personal API key.
export const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
export const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
export const stripePlusPriceId = process.env.STRIPE_PLUS_PRICE_ID ?? "";
export const stripeProPriceId = process.env.STRIPE_PRO_PRICE_ID ?? "";
// Optional top tier: leave unset to sell Plus + Pro only. When set, Max joins the
// catalog, the billing cards, and checkout accepts plan === "max".
export const stripeMaxPriceId = process.env.STRIPE_MAX_PRICE_ID ?? "";
export const stripeAllowLive = process.env.STRIPE_ALLOW_LIVE === "true";
export const stripeAllowTestBilling = process.env.STRIPE_ALLOW_TEST_BILLING === "true";

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
