"use client";

import { Hanken_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import {
  annualPerMonthCents,
  annualSavingPercent,
  formatUsdCents,
  NEMESIS_ANNUAL_CENTS,
  NEMESIS_MONTHLY_CENTS,
} from "@nemesis/shared";
import { useAuth } from "@/components/AuthProvider";
import { type CheckoutInterval } from "@/lib/billing-contract";
import { phCapture } from "@/lib/posthog";

/**
 * ONE PRODUCT, TWO WAYS TO PAY FOR IT.
 *
 * This page used to be a ladder — Student $9.99 and Agent Pro $19.99, with Max
 * $99 above them before it was retired — and every card carried its own feature
 * list, its own recording-hours claim and its own drift. It is now a choice
 * between free and Nemesis, and then between paying monthly or yearly.
 *
 * 🔴 THE AMOUNTS ARE RENDERED FROM packages/shared/src/plan.ts, NOT FROM STRIPE.
 * A pricing page that fetches its own prices shows nothing when the provider is
 * slow, misconfigured or not yet set up — and a blank price is worse than a
 * stale one. The Stripe Price is still verified, at CHECKOUT, where being wrong
 * would actually charge somebody: /api/stripe/checkout refuses to open a session
 * whose Price does not carry exactly the amount below.
 *
 * 🔴 NO FEATURE MATRIX, AND NO PROVIDER NAMES. The proposition is one full
 * Nemesis product. Token quotas, parser page allowances, search credits and the
 * names of the companies whose APIs sit underneath are internal cost controls;
 * putting any of them on this page turns a product into a metering dashboard.
 */

interface Interval {
  id: CheckoutInterval;
  label: string;
  /** The big number: what it works out at each month. */
  monthlyEquivalent: string;
  /** The true charge, always shown next to the big number. */
  billedAs: string;
}

const INTERVALS: readonly Interval[] = [
  {
    billedAs: "Billed monthly. Cancel anytime.",
    id: "monthly",
    label: "Monthly",
    monthlyEquivalent: formatUsdCents(NEMESIS_MONTHLY_CENTS),
  },
  {
    // 🔴 THE SECOND LINE IS NOT OPTIONAL. $16.67 is $199.99 divided by twelve and
    // rounded; nobody is ever charged it. Showing it without the real annual
    // charge beside it is the deceptive pattern the owner ruled out.
    billedAs: `${formatUsdCents(NEMESIS_ANNUAL_CENTS)} billed annually. Cancel anytime.`,
    id: "annual",
    label: `Yearly · Save ${annualSavingPercent()}%`,
    monthlyEquivalent: formatUsdCents(annualPerMonthCents()),
  },
];

/** The default, and the fallback: an unknown interval can only ever mean the
 *  cheaper commitment, never the larger charge. */
const MONTHLY = INTERVALS[0]!;


/** What Free actually is: the whole product, for less of the month. Not a worse
 *  tutor, not a smaller model, not a degraded Canvas. */
const FREE_LINES = [
  "The same teaching Canvas, and the same reasoning behind it",
  "Bring your own lectures, slides, notes and readings",
  "Ask, get taught, get tested — every day",
];

const NEMESIS_LINES = [
  "Everything in Free, with room for a full course load",
  "Talk to Nemesis out loud, and hear it answer",
  "Answers grounded in the web, with real sources",
  "Enough headroom that you stop thinking about limits",
];

// The marketing site's typeface, loaded ONLY for this route.
//
// www.enternemesis.com is set in Hanken Grotesk and the app is set in the system
// stack. That is normally invisible, but pressing "Get Nemesis" on the marketing
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

/** A stored or querystring intent, narrowed. Anything else (a stale ?plan=max
 *  link, a typo) leaves the visitor on the page to choose rather than starting
 *  a checkout for something they did not pick. */
function asInterval(value: null | string): CheckoutInterval | null {
  return value === "monthly" || value === "annual" ? value : null;
}

function PricingInner() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<CheckoutInterval>("monthly");

  const checkoutStatus = params.get("checkout");
  const intentInterval = params.get("interval");
  const selected = INTERVALS.find((candidate) => candidate.id === interval) ?? MONTHLY;

  const startCheckout = useCallback(
    async (chosen: CheckoutInterval) => {
      setError(null);

      // Not signed in yet: remember the choice and route through sign-up, returning to
      // this page so we can resume checkout the moment they are authenticated.
      if (!session?.access_token) {
        try {
          window.sessionStorage.setItem(INTENT_KEY, chosen);
        } catch {
          /* best-effort */
        }
        const next = encodeURIComponent(`/pricing?interval=${chosen}`);
        router.push(`/sign-up?next=${next}`);

        return;
      }

      setBusy(true);
      phCapture("checkout_started", { billing_interval: chosen, plan: "nemesis", source: "pricing" });
      try {
        const res = await fetch("/api/stripe/checkout", {
          body: JSON.stringify({ interval: chosen }),
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
        setBusy(false);
      }
    },
    [router, session],
  );

  // Resume checkout after the sign-up round trip: once we are signed in and a
  // choice is pending (via ?interval= or the stashed intent), open Stripe.
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
    const pending = asInterval(intentInterval) ?? asInterval(stashed);
    if (pending) {
      setInterval(pending);
      void startCheckout(pending);
    }
    // Only re-run when auth state settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  function chooseInterval(next: CheckoutInterval) {
    setInterval(next);
    phCapture("pricing_interval_selected", { billing_interval: next });
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
        <h1 className="nm-title">One Nemesis. Free, or all of it.</h1>
        <p className="nm-sub">
          The free plan is the real product, with less of the month in it. Nemesis gives you room for a full
          course load. Pay monthly or yearly, and cancel whenever you like.
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
        <article className="nm-card">
          <p className="nm-price">
            <strong>$0</strong>
          </p>
          <h2 className="nm-card-name">Free</h2>
          <p className="nm-card-tagline">Everything Nemesis does, for part of the month.</p>
          <ul className="nm-features">
            {FREE_LINES.map((line) => (
              <li key={line}>
                <svg aria-hidden height="13" viewBox="0 0 16 16" width="13">
                  <path d="M3 8.5 6.2 11.7 13 4.9" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
                {line}
              </li>
            ))}
          </ul>
          <div className="nm-cta-wrap">
            <Link className="nm-cta" href={session?.access_token ? "/" : "/sign-up"}>
              Continue free
            </Link>
            <p className="nm-trialhint">No card required.</p>
          </div>
        </article>

        <article className="nm-card nm-card-featured">
          <div className="nm-toggle" role="group" aria-label="Billing period">
            {INTERVALS.map((option) => (
              <button
                aria-pressed={option.id === interval}
                className={`nm-toggle-option${option.id === interval ? " nm-toggle-on" : ""}`}
                key={option.id}
                onClick={() => chooseInterval(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="nm-price">
            <strong>{selected.monthlyEquivalent}</strong>
            <span className="nm-cadence">/mo</span>
          </p>
          <h2 className="nm-card-name">Nemesis</h2>
          <p className="nm-card-tagline">{selected.billedAs}</p>
          <ul className="nm-features">
            {NEMESIS_LINES.map((line) => (
              <li key={line}>
                <svg aria-hidden height="13" viewBox="0 0 16 16" width="13">
                  <path d="M3 8.5 6.2 11.7 13 4.9" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
                {line}
              </li>
            ))}
          </ul>
          <div className="nm-cta-wrap">
            <button
              className="nm-cta nm-cta-primary"
              disabled={busy}
              onClick={() => void startCheckout(interval)}
              type="button"
            >
              {busy ? "Opening checkout…" : "Get Nemesis"}
            </button>
            <p className="nm-trialhint">
              {interval === "annual"
                ? `Save ${annualSavingPercent()}% against paying monthly.`
                : "Switch to yearly whenever you like."}
            </p>
          </div>
        </article>
      </section>

      <p className="nm-fineprint">
        Cancel anytime. Prices in USD. Monthly and yearly are the same Nemesis — the only difference is how often
        you pay. Nemesis reads your school accounts to help you; it never submits work or sends email on your
        behalf. Works in your browser today; an iPhone app is on the way.
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
/* Two columns: Free and Nemesis. */
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
/* The interval switch. Two words, told apart by the same inverted ground the
   popular plan's chip uses, because this page has one ink and no second hue. */
.nm-toggle { display:flex; gap:4px; padding:3px; margin:0 0 20px; border:1px solid var(--nm-line); border-radius:2px; }
.nm-toggle-option { flex:1; cursor:pointer; font-family:inherit; font-size:11.5px; font-weight:650; letter-spacing:0.06em;
  text-transform:uppercase; padding:8px 6px; border:0; border-radius:2px; background:transparent; color:var(--nm-faint); transition:color 0.15s, background 0.15s; }
.nm-toggle-option:hover { color:var(--nm-text); }
.nm-toggle-on, .nm-toggle-on:hover { background:var(--nm-text); color:var(--nm-bg); }
a.nm-cta { display:block; text-align:center; text-decoration:none; }
`;

