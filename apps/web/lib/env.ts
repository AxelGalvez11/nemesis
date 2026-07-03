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

// Engine data-visuals (study-design mix + publications-by-year on a research report) — DEFAULT OFF.
// Computed from real citation metadata; shown only when the data warrants. Off ⇒ reports render as today.
export const engineVisualsEnabled = process.env.NEXT_PUBLIC_ENGINE_VISUALS === "true";

// Simplified composer dial — DEFAULT OFF. When "true": Fast/Thorough collapse into one "Auto" mode
// (auto-picks depth), and Meta-analysis drops off the dial (folded into Deep research). Off ⇒ today's
// 6-mode dial, byte-identical. The Auto routing reuses the existing fast/thorough engine paths.
export const simplifiedModesEnabled = process.env.NEXT_PUBLIC_SIMPLE_MODES === "true";

// Bot-protection CAPTCHA (Cloudflare Turnstile + Supabase native enforcement) — DEFAULT OFF.
// When NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, the sign-in/sign-up forms render a Turnstile widget
// and pass its token to Supabase auth (options.captchaToken). Off (no key) ⇒ no widget, no token,
// auth behaves exactly as today. SAFE ACTIVATION ORDER: (1) set this site key in Vercel + redeploy
// so tokens start flowing while Supabase still ignores them; (2) THEN enable CAPTCHA enforcement in
// the Supabase dashboard (Auth → Attack Protection → Turnstile + secret key). Never enable server
// enforcement first, or every sign-in/up breaks until the client deploys.
export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const captchaEnabled = turnstileSiteKey.length > 0;

// Per-paper journal-quality tier badge + per-paper supporting-quote expander (WS-1 slice B) —
// DEFAULT OFF. When "true": EvidencePanel renders a Q1-Q4 tier pill (from enrich-source's
// journal_tier) and a read-only "supporting quote" expander per source card. Off ⇒ EvidencePanel
// renders exactly as today. Server-side counterpart is WS1_PER_PAPER ("on") in enrich-source; this
// is the separate client-side gate for the new render (note: "true" here, "on" server-side).
export const ws1PerPaperEnabled = process.env.NEXT_PUBLIC_WS1_PER_PAPER === "true";

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
