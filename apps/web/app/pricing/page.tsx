"use client";

import { Hanken_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { phCapture } from "@/lib/posthog";

type PaidPlan = "plus" | "pro" | "max";

interface Tier {
  id: PaidPlan;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

// Nemesis tiers — freemium: the free plan works every day with no card, and these
// paid plans raise the limits. The plans map to Stripe prices (plan "plus" | "pro" |
// "max" → STRIPE_{PLUS,PRO,MAX}_PRICE_ID); the $ shown here must match those prices.
//
// RECORDING HOURS MUST MATCH plan_entitlements.transcription_seconds_month_limit
// (2026-07-28: plus 72,000s, pro 300,000s, max 720,000s). These had drifted badly —
// the page offered Plus 30 minutes against a real allowance of 20 HOURS, and Max
// 4,000 minutes against 200 hours — which undersells the plans by more than 3x and
// is the kind of error nothing fails on. Recheck both together.
//
// The old copy also said "live copilot". There is no live lane any more: a recording
// is transcribed and written up once, after it stops.
//
// EVERY LINE HERE MUST NAME SOMETHING A STUDENT CAN REACH. Deep research, watches,
// missions, evidence briefs and saved reports are PharmaOrb leftovers: their
// entitlement rows still exist, but there is no route, no nav entry and no chat tool
// for any of them, and BrowseTopics / WatchButton / ResearchReportView are rendered
// by nothing. Do not put them back on this page.
const TIERS: Tier[] = [
  {
    cta: "Get Student",
    cadence: "/ month",
    features: [
      "Cited answers and research support for any field",
      "Turn your lectures into notes + exam-ready flashcards",
      "20 hours of lecture recording each month",
      "A calendar built from your syllabus",
      "Higher daily limits for answers, notes & decks",
    ],
    id: "plus",
    name: "Student",
    price: "$9.99",
    tagline: "For the student who lives in it.",
  },
  {
    cta: "Get Agent Pro",
    cadence: "/ month",
    featured: true,
    features: [
      "Everything in Student, with room for a full course load",
      "70 hours of lecture recording each month",
      "Web-grounded answers with real citations",
      "The highest answer quality, on every question",
    ],
    id: "pro",
    name: "Agent Pro",
    price: "$19.99",
    tagline: "For a full course load, every week.",
  },
];

// MAX WAS REMOVED 2026-07-31. The owner set a $20/mo ceiling after looking at the
// nearest competitor, whose most expensive plan is $19 a month — against that, a $99
// row reads as a different category of product rather than as a generous option.
//
// Only the CARD is gone. `plan_entitlements.max`, the Stripe price and the checkout
// route's "max" branch are all untouched, so an existing subscriber keeps their
// entitlements and an old ?plan=max link still resolves. Nothing migrated because
// Max had no subscribers. Retiring the Stripe product is a live billing change and
// is the owner's call, not a side effect of a pricing-page edit.

// The marketing site's typeface, loaded ONLY for this route.
//
// www.enternemesis.com is set in Hanken Grotesk and the app is set in the system
// stack. That is normally invisible, but pressing "Get Student" on the marketing
// site lands here in one hop, and a typeface change across that hop is the single
// loudest signal that you have left one product for another. Self-hosted by
// next/font, scoped by a CSS variable on this page's own root, so no other screen
// in the app pays for it and nothing else changes.
const pricingSans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-pricing-sans",
  display: "swap",
});

const INTENT_KEY = "nemesis.checkout.intent";

function PricingInner() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkoutStatus = params.get("checkout");
  const intentPlan = params.get("plan");

  const startCheckout = useCallback(
    async (plan: PaidPlan) => {
      setError(null);

      // Not signed in yet: remember the plan and route through sign-up, returning to
      // this page so we can resume checkout the moment they're authenticated.
      if (!session?.access_token) {
        try {
          window.sessionStorage.setItem(INTENT_KEY, plan);
        } catch {
          /* best-effort */
        }
        const next = encodeURIComponent(`/pricing?plan=${plan}`);
        router.push(`/sign-up?next=${next}`);

        return;
      }

      setBusy(plan);
      phCapture("checkout_started", { plan, source: "pricing" });
      try {
        const res = await fetch("/api/stripe/checkout", {
          body: JSON.stringify({ plan }),
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          method: "POST",
        });
        const body = await res.json();
        if (!res.ok || !body.url) {
          throw new Error(body.message || body.error || "Checkout is not available right now.");
        }
        try {
          window.sessionStorage.removeItem(INTENT_KEY);
        } catch {
          /* best-effort */
        }
        window.location.href = body.url as string;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout failed.");
        setBusy(null);
      }
    },
    [router, session],
  );

  // Resume checkout after the sign-up round trip: once we're signed in and a plan is
  // pending (via ?plan= or the stashed intent), kick off Stripe automatically.
  useEffect(() => {
    if (!session?.access_token || checkoutStatus) {
      return;
    }
    const stashed = (() => {
      try {
        return window.sessionStorage.getItem(INTENT_KEY);
      } catch {
        return null;
      }
    })();
    const asPlan = (value: null | string): PaidPlan | null =>
      value === "plus" || value === "pro" || value === "max" ? value : null;
    const plan = asPlan(intentPlan) ?? asPlan(stashed);
    if (plan) {
      void startCheckout(plan);
    }
    // Only re-run when auth state settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  function onCta(tier: Tier) {
    void startCheckout(tier.id);
  }

  return (
    <main className={`nm-pricing ${pricingSans.variable}`}>
      <style>{PRICING_CSS}</style>

      <header className="nm-nav">
        <span className="nm-wordmark">NEMESIS</span>
        <Link className="nm-nav-link" href={session?.access_token ? "/" : "/sign-in"}>
          {session?.access_token ? "Open app" : "Sign in"}
        </Link>
      </header>

      <section className="nm-hero">
        <p className="nm-eyebrow">Pricing</p>
        <h1 className="nm-title">Upgrade when you need more.</h1>
        <p className="nm-sub">
          The free plan keeps working every day, no card required. Paid plans raise the limits, and you can cancel
          anytime.
        </p>
      </section>

      {checkoutStatus === "success" ? (
        <p className="nm-banner nm-banner-ok">
          Payment received. Your plan is live on this account — open the app and you&apos;re set.
        </p>
      ) : checkoutStatus === "cancelled" ? (
        <p className="nm-banner">Checkout cancelled — no charge was made.</p>
      ) : null}
      {error ? <p className="nm-banner nm-banner-err">{error}</p> : null}

      <section className="nm-tiers">
        {TIERS.map((tier) => (
          <article className={`nm-card${tier.featured ? " nm-card-featured" : ""}`} key={tier.id}>
            {tier.featured ? <span className="nm-tag">Most popular</span> : null}
            {/* Price first, then the name — the marketing page's order. Someone who
                arrived by pressing "Get Student" is here to check a number. */}
            <p className="nm-price">
              <strong>{tier.price}</strong>
              <span className="nm-cadence">/mo</span>
            </p>
            <h2 className="nm-card-name">{tier.name}</h2>
            <p className="nm-card-tagline">{tier.tagline}</p>
            <ul className="nm-features">
              {tier.features.map((feature) => (
                <li key={feature}>
                  <svg aria-hidden height="13" viewBox="0 0 16 16" width="13">
                    <path d="M3 8.5 6.2 11.7 13 4.9" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <div className="nm-cta-wrap">
              <button
                className={`nm-cta${tier.featured ? " nm-cta-primary" : ""}`}
                disabled={busy === tier.id}
                onClick={() => onCta(tier)}
                type="button"
              >
                {busy === tier.id ? "Opening checkout…" : tier.cta}
              </button>
              <p className="nm-trialhint">Billed monthly. Cancel anytime.</p>
            </div>
          </article>
        ))}
      </section>

      <p className="nm-fineprint">
        Cancel anytime. Prices in USD. Nemesis reads your school accounts to help you — it never submits work or sends
        email on your behalf. Works in your browser today; an iPhone app is on the way.
      </p>
    </main>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingInner />
    </Suspense>
  );
}

/* The marketing site's two-tone system, ported (owner 2026-08-01: "still has red and
   is not the same as the website style"). Someone gets here by pressing a button on
   www.enternemesis.com, so the two pages are one hop apart and used to look like two
   different companies: this one had its own crimson, rounded cards and drop shadows.

   INK CHANNELS, not colours. --nm-fg is an "R,G,B" triple, so every grey below is an
   alpha of the same ink and dark mode is a two-variable swap with nothing else to
   keep in step. The old sheet hardcoded a white background, which meant this page
   was a flashbang for anyone using the app in dark mode.

   Emphasis is WEIGHT, never hue: the popular plan gets a heavier border and an
   inverted chip, because a page with two inks has no third one to signal with.

   NO BACKTICKS ANYWHERE IN THIS BLOCK, comments included: it all lives inside a
   template literal, so one backtick ends the string and the file stops parsing.
   TypeScript will not catch it; only the real build will. That has happened here. */
const PRICING_CSS = `
.nm-pricing { --nm-bg:#ffffff; --nm-fg:0,0,0;
  --nm-text:rgb(var(--nm-fg)); --nm-dim:rgba(var(--nm-fg),0.66); --nm-faint:rgba(var(--nm-fg),0.45);
  --nm-line:rgba(var(--nm-fg),0.12); --nm-line-2:rgba(var(--nm-fg),0.26); --nm-wash:rgba(var(--nm-fg),0.03);
  min-height:100vh; background:var(--nm-bg); color:var(--nm-text);
  font-family:var(--font-pricing-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  padding:0 24px 72px; -webkit-font-smoothing:antialiased; }
[data-theme="dark"] .nm-pricing { --nm-bg:#0b0b0c; --nm-fg:255,255,255; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .nm-pricing { --nm-bg:#0b0b0c; --nm-fg:255,255,255; } }
.nm-nav { display:flex; align-items:center; justify-content:space-between; max-width:1080px; margin:0 auto; padding:22px 4px; }
.nm-wordmark { font-weight:700; letter-spacing:0.22em; font-size:15px; }
.nm-nav-link { color:var(--nm-dim); text-decoration:none; font-size:14px; font-weight:500; }
.nm-nav-link:hover { color:var(--nm-text); }
.nm-hero { max-width:560px; margin:72px auto 48px; text-align:center; }
.nm-eyebrow { color:var(--nm-faint); font-size:12px; font-weight:650; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 14px; }
.nm-title { font-size:clamp(30px,5vw,50px); line-height:1.06; letter-spacing:-0.03em; font-weight:600; margin:0 0 16px; text-wrap:balance; }
.nm-sub { color:var(--nm-dim); font-size:17px; line-height:1.6; margin:0 auto; max-width:520px; }
/* Three states, told apart by WEIGHT, because there is no green or red here to
   tell them apart with. Cancelled is the quiet default. A completed payment is
   the loudest thing this page ever says, so it gets the inverted ground the
   popular plan's chip uses. A failure keeps the page ground but takes the full
   ink and a heavier rule, so it reads as a problem without shouting.
   These were two identical rules after the colour was removed, which is dead CSS
   pretending to signal something. */
.nm-banner { max-width:760px; margin:0 auto 24px; padding:13px 16px; border-radius:2px; font-size:14px; background:var(--nm-wash); border:1px solid var(--nm-line); color:var(--nm-dim); text-align:center; }
.nm-banner-ok { background:var(--nm-text); border-color:var(--nm-text); color:var(--nm-bg); font-weight:600; }
.nm-banner-err { border-color:var(--nm-line-2); border-width:2px; padding:12px 15px; color:var(--nm-text); font-weight:600; }
/* Two columns since Max was removed. A three-column grid holding two cards leaves
   a dead third column and shoves both cards off-centre, which reads as a plan that
   failed to load rather than as a two-plan ladder. */
.nm-tiers { display:grid; grid-template-columns:repeat(2,1fr); gap:18px; max-width:760px; margin:0 auto; align-items:stretch; }
.nm-card { position:relative; background:transparent; border:1px solid var(--nm-line); border-radius:2px; padding:32px 28px; display:flex; flex-direction:column; }
.nm-card-featured { border-color:var(--nm-line-2); border-width:2px; padding:31px 27px; }
.nm-tag { position:absolute; top:-12px; left:28px; background:var(--nm-text); color:var(--nm-bg); font-size:10.5px; font-weight:700; letter-spacing:0.12em; padding:4px 10px; border-radius:2px; text-transform:uppercase; }
.nm-price { margin:0; display:flex; align-items:baseline; gap:2px; font-size:38px; font-weight:750; letter-spacing:-0.02em; }
.nm-price strong { font-weight:750; }
.nm-cadence { color:var(--nm-faint); font-size:14px; font-weight:500; letter-spacing:0; }
.nm-card-name { font-size:19px; font-weight:600; margin:12px 0 6px; letter-spacing:-0.01em; }
.nm-card-tagline { color:var(--nm-faint); font-size:13.5px; line-height:1.5; margin:0 0 14px; }
.nm-features { list-style:none; margin:4px 0 0; padding:0; display:flex; flex-direction:column; gap:10px; }
.nm-features li { display:flex; align-items:flex-start; gap:9px; font-size:14.5px; line-height:1.4; color:var(--nm-dim); }
.nm-features svg { flex-shrink:0; margin-top:3px; color:var(--nm-text); }
.nm-cta-wrap { margin-top:auto; padding-top:24px; }
.nm-cta { width:100%; cursor:pointer; font-family:inherit; font-size:12.5px; font-weight:650; letter-spacing:0.1em; text-transform:uppercase;
  padding:12px 22px; border-radius:2px; background:transparent; color:var(--nm-text); border:1px solid var(--nm-line-2); transition:border-color 0.15s, opacity 0.15s; }
.nm-cta:hover:not(:disabled) { border-color:var(--nm-text); }
.nm-cta-primary { background:var(--nm-text); color:var(--nm-bg); border-color:var(--nm-text); }
.nm-cta-primary:hover:not(:disabled) { opacity:0.82; }
.nm-cta:disabled { opacity:0.5; cursor:default; }
.nm-trialhint { color:var(--nm-faint); font-size:12px; letter-spacing:0.02em; margin:10px 0 0; text-align:center; }
.nm-fineprint { max-width:640px; margin:36px auto 0; text-align:center; color:var(--nm-faint); font-size:13.5px; line-height:1.7; }
@media (max-width:820px) { .nm-tiers { grid-template-columns:1fr; max-width:440px; } }
`;
