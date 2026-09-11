"use client";

import { Inter } from "next/font/google";
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
import { NemesisMark } from "@/components/nemesis-mark";
import { type CheckoutInterval } from "@/lib/billing-contract";
import { landingUrl } from "@/lib/env";
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
  "The same teaching chat, and the same reasoning behind it",
  "Bring your own lectures, slides, notes and readings",
  "Ask, get taught and get tested, every day",
];

const NEMESIS_LINES = [
  "Everything in Free, with room for a full course load",
  "Talk to Nemesis out loud, and hear it answer",
  "Answers grounded in the web, with real sources",
  "Enough headroom that you stop thinking about limits",
];

// The marketing site's typeface, loaded ONLY for this route.
//
// www.enternemesis.com is set in Inter (since 2026-09-11, when the homepage moved to it) and the app is set in the
// system stack. That is normally invisible, but pressing "Get Nemesis" on the marketing site lands here in one hop,
// and a typeface change across that hop is the loudest signal that you have left one product for another.
// Self-hosted by next/font, scoped by a CSS variable on this page's own root, so no other screen pays for it.
const pricingSans = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
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
  const checkoutStatus = params.get("checkout");
  const checkoutSessionId = params.get("session_id");
  // What the success banner actually knows. "checking" until /api/stripe/checkout-status has
  // confirmed the plan is on the account; "pending" if Stripe says the session finished but the
  // mirror has not caught up; "active" once the app will enforce the paid plan.
  const [verified, setVerified] = useState<"checking" | "active" | "pending" | "failed">("checking");
  const intentInterval = params.get("interval");
  // 🔴 THE CHOICE ARRIVES IN THE URL, AND IT HAS TO SURVIVE BEING SIGNED OUT.
  // The marketing site's yearly button links here as ?interval=annual. Reading
  // that only inside the resume effect meant it applied ONLY to someone already
  // signed in: a visitor who pressed "Get Nemesis" under the yearly toggle
  // landed on a page showing $19.99 a month. Caught in the browser, not by a test.
  const [interval, setInterval] = useState<CheckoutInterval>(
    () => asInterval(params.get("interval")) ?? "monthly",
  );
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

  // 🔴 THE SUCCESS BANNER USED TO BELIEVE THE URL. Now it asks the server, which also mirrors the
  // subscription on the spot if the webhook has not landed yet. Polls a few times because the
  // mirror can lag the redirect by a second or two.
  useEffect(() => {
    if (checkoutStatus !== "success" || !session?.access_token) return;
    if (!checkoutSessionId) {
      setVerified("pending");
      return;
    }
    let alive = true;
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/stripe/checkout-status?session_id=${encodeURIComponent(checkoutSessionId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = await res.json().catch(() => ({})) as { state?: string };
        if (!alive) return;
        if (res.ok && body.state === "active") {
          setVerified("active");
          return;
        }
        if (!res.ok && res.status !== 500) {
          setVerified("failed");
          return;
        }
      } catch {
        // network blip: keep polling
      }
      if (!alive) return;
      if (attempts < 6) window.setTimeout(() => void check(), 1500);
      else setVerified("pending");
    };
    void check();
    return () => { alive = false; };
  }, [checkoutStatus, checkoutSessionId, session?.access_token]);

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

  const annual = interval === "annual";

  // The plans sit in sana.ai's own pricing panel, the same anatomy as www.enternemesis.com/pricing (owner, 2026-09-11:
  // "make the pricing page follow the new design style"). Measured on sana.ai/sign-in-to-sana#pricing at 1440x900.
  return (
    <main className={`nm-pricing ${pricingSans.variable}`}>
      <style>{PRICING_CSS}</style>

      <header className="nm-nav">
        <a aria-label="Nemesis home" className="nm-brand" href={landingUrl}>
          <NemesisMark size={14} />
          <span>Nemesis</span>
        </a>
        <Link className="nm-nav-link" href={session?.access_token ? "/" : "/sign-in"}>
          {session?.access_token ? "Open app" : "Log in"}
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
        verified === "active" ? (
          <p className="nm-banner nm-banner-ok">
            Payment received. Nemesis is live on this account. <Link className="nm-banner-link" href="/learn">Open the app.</Link>
          </p>
        ) : verified === "checking" ? (
          <p className="nm-banner">Payment received. Switching your account over…</p>
        ) : verified === "failed" ? (
          <p className="nm-banner nm-banner-err">
            We could not match that payment to this account. If you paid, email support@enternemesis.com and we will sort it out.
          </p>
        ) : (
          <p className="nm-banner">
            Payment received. Your plan is being activated and will show in the app within a few minutes. If it has not after that, email support@enternemesis.com.
          </p>
        )
      ) : checkoutStatus === "cancelled" ? (
        <p className="nm-banner">Checkout cancelled. No charge was made.</p>
      ) : null}
      {error ? <p className="nm-banner nm-banner-err">{error}</p> : null}

      <section className="nm-stage">
        <div className="nm-panel">
          <button
            aria-checked={annual}
            className="nm-toggle"
            onClick={() => chooseInterval(annual ? "monthly" : "annual")}
            role="switch"
            type="button"
          >
            <span>
              Save <strong>{annualSavingPercent()}%</strong> with yearly billing
            </span>
            <span aria-hidden="true" className="nm-switch" />
          </button>

          <div className="nm-cards">
            <article className="nm-card">
              <div className="nm-card-head">
                <h2 className="nm-card-name">Free</h2>
                <p className="nm-price">$0</p>
                <p className="nm-card-tagline">Everything Nemesis does, for part of the month. No card required.</p>
                <Link className="nm-cta nm-cta-quiet" href={session?.access_token ? "/" : "/sign-up"}>
                  Continue free
                </Link>
              </div>
              <ul className="nm-features">
                {FREE_LINES.map((line) => (
                  <li key={line}>
                    <Check />
                    {line}
                  </li>
                ))}
              </ul>
            </article>

            <article className="nm-card">
              <div className="nm-card-head">
                <h2 className="nm-card-name">Nemesis</h2>
                <p className="nm-price">
                  {selected.monthlyEquivalent}/month
                  {annual ? (
                    <s>
                      <span className="nm-sr">instead of </span>
                      {formatUsdCents(NEMESIS_MONTHLY_CENTS)}/month
                    </s>
                  ) : null}
                </p>
                <p className="nm-card-tagline">{selected.billedAs}</p>
                <button
                  className="nm-cta nm-cta-solid"
                  disabled={busy}
                  onClick={() => void startCheckout(interval)}
                  type="button"
                >
                  {busy ? "Opening checkout…" : "Get Nemesis"}
                </button>
              </div>
              <ul className="nm-features">
                {NEMESIS_LINES.map((line, index) => (
                  <li className={index === 0 ? "is-carry" : undefined} key={line}>
                    <Check />
                    {line}
                  </li>
                ))}
              </ul>
            </article>
          </div>

          <p className="nm-fineprint">
            Cancel anytime. Prices in USD. Monthly and yearly are the same Nemesis; the only difference is how often
            you pay. Nemesis reads your school accounts to help you; it never submits work or sends email on your
            behalf. Works in your browser today; an iPhone app is on the way.
          </p>
        </div>
      </section>
    </main>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      <path d="M3 8.5 6.2 11.7 13 4.9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingInner />
    </Suspense>
  );
}

/* sana.ai's pricing panel, on the marketing site's system (owner 2026-09-11: "make the pricing page follow the new
   design style"). Measured on sana.ai/sign-in-to-sana#pricing at 1440x900: a white panel at radius 40 with a 1px
   edge and two soft shadows, padding 42/48, rows 24px apart; a 48px switch pill at 5% ink; cards at radius 28 on
   5% ink, padding 24/28; name 16/500, price 24/500 with the old price struck at 60%, a 14px line at 60% ink, a
   44px pill; rows 10/11 with 5% ink rules, a 16px check 12px before 14px text. The same numbers as
   landing/app/pricing/pricing.css, so the one hop between the two pages does not change the page.

   INK CHANNELS, not colours. --nm-fg is an "R,G,B" triple, so every grey below is an alpha of one ink and dark mode
   is a short swap with nothing else to keep in step.

   NO BACKTICKS ANYWHERE IN THIS BLOCK, comments included: it lives inside a template literal, so one backtick ends
   the string and the file stops parsing. TypeScript will not catch it; only the real build will. */
const PRICING_CSS = `
.nm-pricing { --nm-bg:#ffffff; --nm-panel:#ffffff; --nm-edge:rgb(239,239,239); --nm-fg:10,18,23;
  --nm-text:rgb(var(--nm-fg)); --nm-dim:rgba(var(--nm-fg),0.6); --nm-faint:rgba(var(--nm-fg),0.4);
  --nm-soft:rgba(var(--nm-fg),0.05); --nm-rule:rgba(var(--nm-fg),0.05);
  min-height:100vh; background:var(--nm-bg); color:var(--nm-text); padding:0 24px 96px;
  font-family:var(--font-pricing-sans, -apple-system),BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased; }
[data-theme="dark"] .nm-pricing { --nm-bg:#0d0f10; --nm-panel:#16181a; --nm-edge:rgba(243,245,246,0.08); --nm-fg:243,245,246;
  --nm-soft:rgba(243,245,246,0.06); --nm-rule:rgba(243,245,246,0.08); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .nm-pricing { --nm-bg:#0d0f10; --nm-panel:#16181a;
  --nm-edge:rgba(243,245,246,0.08); --nm-fg:243,245,246; --nm-soft:rgba(243,245,246,0.06); --nm-rule:rgba(243,245,246,0.08); } }
.nm-pricing h1, .nm-pricing h2, .nm-pricing p, .nm-pricing ul { margin:0; }
.nm-nav { display:flex; align-items:center; justify-content:space-between; max-width:1432px; height:52px; margin:0 auto; }
.nm-brand { display:inline-flex; align-items:center; gap:8px; color:var(--nm-text); text-decoration:none;
  font-size:18px; font-weight:500; line-height:22px; letter-spacing:-0.3px; }
.nm-brand svg { display:block; }
.nm-nav-link { color:var(--nm-text); text-decoration:none; font-size:14px; line-height:19.6px; padding:8px 12px;
  border-radius:6px; transition:background-color 0.2s ease-out; }
.nm-nav-link:hover { background:var(--nm-soft); }
.nm-hero { max-width:900px; margin:0 auto; padding-top:76px; text-align:center; }
.nm-eyebrow { margin-bottom:14px; font-size:13px; font-weight:500; line-height:18px; }
.nm-title { font-size:66.87px; font-weight:400; line-height:63.53px; letter-spacing:-0.67px; text-wrap:balance; }
.nm-sub { max-width:540px; margin:22px auto 0; font-size:15px; line-height:21px; color:var(--nm-dim); }
.nm-banner { max-width:640px; margin:28px auto 0; padding:12px 16px; border-radius:14px; font-size:14px; line-height:20px;
  text-align:center; background:var(--nm-soft); color:var(--nm-text); }
.nm-banner-ok { background:rgba(46,125,87,0.1); color:#2e7d57; }
.nm-banner-err { background:rgba(192,57,43,0.09); color:#c4574b; }
.nm-banner-link { color:inherit; text-decoration:underline; text-underline-offset:2px; }
.nm-stage { max-width:888px; margin:56px auto 0; }
.nm-panel { display:flex; flex-direction:column; gap:24px; padding:42px 48px; border-radius:40px; background:var(--nm-panel);
  border:1px solid var(--nm-edge); box-shadow:0 0 4px rgba(0,0,0,0.04),0 12px 32px rgba(0,0,0,0.08); }
.nm-toggle { align-self:center; display:flex; align-items:center; gap:9px; height:48px; padding:10px 24px; border:0;
  border-radius:100px; background:var(--nm-soft); color:var(--nm-text); font:inherit; font-size:14px; line-height:19.6px; cursor:pointer; }
.nm-toggle strong { font-weight:500; }
.nm-switch { position:relative; flex:none; width:26px; height:16px; border-radius:16px; background:rgba(var(--nm-fg),0.18);
  transition:background-color 0.2s cubic-bezier(0.4,0,0.2,1); }
.nm-switch::after { content:""; position:absolute; top:2px; left:2px; width:12px; height:12px; border-radius:50%; background:#fff;
  box-shadow:0 1px 2px rgba(0,0,0,0.2); transition:transform 0.2s cubic-bezier(0.4,0,0.2,1); }
.nm-toggle[aria-checked="true"] .nm-switch { background:rgb(52,199,89); }
.nm-toggle[aria-checked="true"] .nm-switch::after { transform:translateX(10px); }
.nm-cards { display:grid; gap:24px; grid-template-columns:repeat(2,minmax(0,1fr)); }
.nm-card { display:flex; flex-direction:column; padding:24px 28px; border-radius:28px; background:var(--nm-soft); text-align:left; }
.nm-card-head { display:flex; flex-direction:column; margin-bottom:16px; }
.nm-card-name { font-size:16px; font-weight:500; line-height:22.4px; }
.nm-price { margin-top:12px; font-size:24px; font-weight:500; line-height:33.6px; }
.nm-price s { margin-left:8px; opacity:0.6; }
.nm-card-tagline { font-size:14px; line-height:19.6px; color:var(--nm-dim); }
.nm-cta { display:flex; align-items:center; justify-content:center; height:44px; margin-top:24px; padding:12px 24px; border:0;
  border-radius:9999px; font:inherit; font-size:14px; font-weight:500; line-height:20px; text-decoration:none; cursor:pointer;
  transition:opacity 0.2s cubic-bezier(0.4,0,0.2,1); }
.nm-cta-solid { background:var(--nm-text); color:var(--nm-bg); }
.nm-cta-quiet { background:var(--nm-panel); color:var(--nm-text); box-shadow:inset 0 0 0 1px rgba(var(--nm-fg),0.1); }
.nm-cta:hover:not(:disabled) { opacity:0.88; }
.nm-cta:disabled { cursor:progress; opacity:0.5; }
.nm-toggle:focus-visible, .nm-cta:focus-visible, .nm-nav-link:focus-visible, .nm-brand:focus-visible { outline:2px solid rgba(var(--nm-fg),0.4); outline-offset:3px; }
.nm-features { list-style:none; padding:0; margin-bottom:48px; }
.nm-features li { display:flex; gap:12px; padding:10px 0 11px; border-top:1px solid var(--nm-rule); font-size:14px; line-height:19.6px; }
.nm-features li:first-child { border-top:0; }
.nm-features li.is-carry { color:rgba(var(--nm-fg),0.5); }
.nm-features svg { flex:none; margin-top:2px; }
.nm-fineprint { max-width:640px; margin:0 auto; text-align:center; font-size:14px; line-height:19.6px; color:var(--nm-faint); }
.nm-sr { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
@media (max-width: 820px) {
  .nm-panel { padding:20px 14px; border-radius:28px; }
  .nm-cards { grid-template-columns:minmax(0,1fr); gap:12px; }
  .nm-card { padding:20px; border-radius:22px; }
}
@media (max-width: 720px) {
  .nm-pricing { padding:0 12px 72px; }
  .nm-hero { padding-top:44px; }
  .nm-title { font-size:38px; line-height:38px; letter-spacing:-0.4px; }
}
@media (prefers-reduced-motion: reduce) {
  .nm-switch, .nm-switch::after, .nm-cta, .nm-nav-link { transition:none; }
}
`;
