"use client";

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
      "80 hours of lecture recording each month",
      "Web-grounded answers with real citations",
      "The highest answer quality, on every question",
    ],
    id: "pro",
    name: "Agent Pro",
    price: "$19.99",
    tagline: "For a full course load, every week.",
  },
  {
    cta: "Get Max",
    cadence: "/ month",
    // Only claims that are true of the plan TODAY. Speaker-labels-as-a-Max-feature
    // and a metered High mode are proposals, not shipped behaviour — they belong
    // here once they are built, and not one day before.
    features: [
      "Everything in Agent Pro, five times over",
      "200 hours of lecture recording each month",
      "The highest daily limits on everything",
      "First access to every new power we ship",
    ],
    id: "max",
    name: "Max",
    price: "$99",
    tagline: "For the heaviest study and research loads.",
  },
];

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
    <main className="nm-pricing">
      <style>{PRICING_CSS}</style>

      <header className="nm-nav">
        <span className="nm-wordmark">NEMESIS</span>
        <Link className="nm-nav-link" href={session?.access_token ? "/" : "/sign-in"}>
          {session?.access_token ? "Open app" : "Sign in"}
        </Link>
      </header>

      <section className="nm-hero">
        <p className="nm-eyebrow">Founding member · early access</p>
        <h1 className="nm-title">The AI that runs your semester.</h1>
        <p className="nm-sub">
          Nemesis combines live notes, study tools, research, and cited answers for any course or field in one focused
          workspace, right in your browser.
        </p>
        <p className="nm-trialline">Start free, no card required. Paid plans raise the limits — cancel anytime.</p>
      </section>

      {checkoutStatus === "success" ? (
        <p className="nm-banner nm-banner-ok">
          Payment received — you&apos;re a founding member. Your plan is live on this account: open the app and you&apos;re
          set.
        </p>
      ) : checkoutStatus === "cancelled" ? (
        <p className="nm-banner">Checkout cancelled — no charge was made.</p>
      ) : null}
      {error ? <p className="nm-banner nm-banner-err">{error}</p> : null}

      <section className="nm-tiers">
        {TIERS.map((tier) => (
          <article className={`nm-card${tier.featured ? " nm-card-featured" : ""}`} key={tier.id}>
            {tier.featured ? <span className="nm-tag">Most popular</span> : null}
            <h2 className="nm-card-name">{tier.name}</h2>
            <p className="nm-card-tagline">{tier.tagline}</p>
            <p className="nm-price">
              <strong>{tier.price}</strong>
              <span className="nm-cadence">{tier.cadence}</span>
            </p>
            <p className="nm-trialhint">Billed monthly. Cancel anytime.</p>
            <button className="nm-cta" disabled={busy === tier.id} onClick={() => onCta(tier)} type="button">
              {busy === tier.id ? "Opening checkout…" : tier.cta}
            </button>
            <ul className="nm-features">
              {tier.features.map((feature) => (
                <li key={feature}>
                  <span className="nm-check" aria-hidden>
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
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

const PRICING_CSS = `
.nm-pricing { --nm-bg:#ffffff; --nm-surface:#fafafa; --nm-line:#e4e4e8; --nm-text:#17171a; --nm-dim:#63636d; --nm-red:#d81f33; --nm-red-soft:rgba(216,31,51,0.10);
  min-height:100vh; background:var(--nm-bg); color:var(--nm-text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  padding:0 24px 72px; -webkit-font-smoothing:antialiased; }
.nm-nav { display:flex; align-items:center; justify-content:space-between; max-width:1080px; margin:0 auto; padding:22px 4px; }
.nm-wordmark { font-weight:800; letter-spacing:0.22em; font-size:15px; }
.nm-nav-link { color:var(--nm-dim); text-decoration:none; font-size:14px; font-weight:500; }
.nm-nav-link:hover { color:var(--nm-text); }
.nm-hero { max-width:720px; margin:56px auto 40px; text-align:center; }
.nm-eyebrow { color:var(--nm-red); font-size:12px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; margin:0 0 18px; }
.nm-title { font-size:clamp(30px,5vw,50px); line-height:1.05; letter-spacing:-0.03em; font-weight:800; margin:0 0 18px; text-wrap:balance; }
.nm-sub { color:var(--nm-dim); font-size:clamp(15px,2.2vw,18px); line-height:1.6; margin:0 auto; max-width:600px; }
.nm-trialline { color:var(--nm-red); font-size:13.5px; font-weight:600; margin:20px auto 0; }
.nm-banner { max-width:1080px; margin:0 auto 24px; padding:13px 16px; border-radius:12px; font-size:14px; background:var(--nm-surface); border:1px solid var(--nm-line); color:var(--nm-dim); text-align:center; }
.nm-banner-ok { border-color:rgba(28,138,66,0.35); color:#1c7a3f; background:rgba(52,199,89,0.08); }
.nm-banner-err { border-color:rgba(216,31,51,0.35); color:#b3121f; background:rgba(216,31,51,0.06); }
.nm-tiers { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; max-width:1080px; margin:0 auto; align-items:start; }
.nm-card { position:relative; background:var(--nm-bg); border:1px solid var(--nm-line); border-radius:20px; padding:26px 24px; display:flex; flex-direction:column;
  box-shadow:0 14px 34px -28px rgba(10,10,14,0.25); }
.nm-card-featured { border-color:var(--nm-red); box-shadow:0 0 0 1px var(--nm-red), 0 22px 50px -26px var(--nm-red-soft); }
.nm-tag { position:absolute; top:-11px; left:24px; background:var(--nm-red); color:#fff; font-size:11px; font-weight:700; letter-spacing:0.04em; padding:4px 11px; border-radius:999px; text-transform:uppercase; }
.nm-card-name { font-size:19px; font-weight:700; margin:0 0 4px; letter-spacing:-0.01em; }
.nm-card-tagline { color:var(--nm-dim); font-size:13.5px; line-height:1.45; margin:0 0 18px; min-height:38px; }
.nm-price { margin:0 0 18px; display:flex; align-items:baseline; gap:6px; }
.nm-price strong { font-size:36px; font-weight:800; letter-spacing:-0.03em; }
.nm-cadence { color:var(--nm-dim); font-size:14px; }
.nm-trialhint { color:var(--nm-dim); font-size:12px; margin:-8px 0 14px; }
.nm-cta { width:100%; border:none; border-radius:12px; padding:12px 16px; font-size:15px; font-weight:700; cursor:pointer; background:#f3f3f5; color:var(--nm-text); border:1px solid var(--nm-line); transition:filter 0.15s, background 0.15s; }
.nm-cta:hover:not(:disabled) { background:#ebebee; }
.nm-cta:disabled { opacity:0.6; cursor:default; }
.nm-card-featured .nm-cta { background:var(--nm-red); border-color:var(--nm-red); color:#fff; }
.nm-card-featured .nm-cta:hover:not(:disabled) { filter:brightness(1.06); }
.nm-features { list-style:none; margin:22px 0 0; padding:0; display:grid; gap:12px; }
.nm-features li { display:flex; gap:10px; font-size:14px; line-height:1.45; color:var(--nm-dim); }
.nm-check { color:var(--nm-red); font-weight:800; flex:0 0 auto; }
.nm-fineprint { max-width:680px; margin:40px auto 0; text-align:center; color:var(--nm-dim); font-size:12.5px; line-height:1.6; }
@media (max-width:820px) { .nm-tiers { grid-template-columns:1fr; max-width:440px; } .nm-card-tagline { min-height:0; } }
`;
