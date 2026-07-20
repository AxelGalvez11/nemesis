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

// Nemesis tiers — a trial model, not freemium: every plan starts with a no-charge
// trial (Stripe collects the card, first charge lands after the trial). The plans map
// to Stripe prices (plan "plus" | "pro" | "max" → STRIPE_{PLUS,PRO,MAX}_PRICE_ID); the
// $ shown here must match those Stripe prices.
const TIERS: Tier[] = [
  {
    cta: "Start free trial",
    cadence: "/ month",
    features: [
      "Cited answers and research support for any field",
      "Turn your lectures into notes + exam-ready flashcards",
      "30 minutes of live transcription each month",
      "Higher daily limits for answers, notes & decks",
      "Sync your school portal + email on a schedule",
    ],
    id: "plus",
    name: "Student",
    price: "$9.99",
    tagline: "For the student who lives in it.",
  },
  {
    cta: "Start free trial",
    cadence: "/ month",
    featured: true,
    features: [
      "Everything in Student, plus the autopilot",
      "The agent runs your whole semester end-to-end",
      "Deep research reports with real citations",
      "Live copilot — 90 transcription minutes each month",
    ],
    id: "pro",
    name: "Agent Pro",
    price: "$19.99",
    tagline: "The full autopilot for your degree.",
  },
  {
    cta: "Start free trial",
    cadence: "/ month",
    features: [
      "Everything in Agent Pro, with the highest limits",
      "Live copilot — 4,000 transcription minutes each month",
      "The highest daily limits on everything",
      "First access to every new power we ship",
    ],
    id: "max",
    name: "Max",
    price: "$99",
    tagline: "Real-time AI for your heaviest study and research.",
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
        <Link className="nm-nav-link" href={session?.access_token ? "/app" : "/sign-in"}>
          {session?.access_token ? "Open app" : "Sign in"}
        </Link>
      </header>

      <section className="nm-hero">
        <p className="nm-eyebrow">Founding member · early access</p>
        <h1 className="nm-title">The AI that runs your semester.</h1>
        <p className="nm-sub">
          Nemesis combines live notes, study tools, research, and cited answers for any course or field in one focused
          workspace — on the web first, with a deeper desktop agent to follow.
        </p>
        <p className="nm-trialline">Every plan starts with a 7-day free trial. No charge until it ends — cancel anytime.</p>
      </section>

      {checkoutStatus === "success" ? (
        <p className="nm-banner nm-banner-ok">
          Payment received — you&apos;re a founding member. Check your email for how to get the Mac app, or open the app if
          you already have it and sign in with this account.
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
            <p className="nm-trialhint">7 days free, then billed monthly</p>
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
        email on your behalf. macOS only for now; an iPhone app is on the way.
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
.nm-pricing { --nm-bg:#0b0b0c; --nm-surface:#141416; --nm-line:#262629; --nm-text:#f2f2f4; --nm-dim:#a0a0a8; --nm-red:#ff2740; --nm-red-soft:rgba(255,39,64,0.12);
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
.nm-banner-ok { border-color:rgba(52,199,89,0.4); color:#7ee29a; background:rgba(52,199,89,0.08); }
.nm-banner-err { border-color:rgba(255,59,70,0.45); color:#ff8f97; background:rgba(255,59,70,0.08); }
.nm-tiers { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; max-width:1080px; margin:0 auto; align-items:start; }
.nm-card { position:relative; background:var(--nm-surface); border:1px solid var(--nm-line); border-radius:20px; padding:26px 24px; display:flex; flex-direction:column; }
.nm-card-featured { border-color:var(--nm-red); box-shadow:0 0 0 1px var(--nm-red), 0 20px 50px -24px var(--nm-red-soft); }
.nm-tag { position:absolute; top:-11px; left:24px; background:var(--nm-red); color:#fff; font-size:11px; font-weight:700; letter-spacing:0.04em; padding:4px 11px; border-radius:999px; text-transform:uppercase; }
.nm-card-name { font-size:19px; font-weight:700; margin:0 0 4px; letter-spacing:-0.01em; }
.nm-card-tagline { color:var(--nm-dim); font-size:13.5px; line-height:1.45; margin:0 0 18px; min-height:38px; }
.nm-price { margin:0 0 18px; display:flex; align-items:baseline; gap:6px; }
.nm-price strong { font-size:36px; font-weight:800; letter-spacing:-0.03em; }
.nm-cadence { color:var(--nm-dim); font-size:14px; }
.nm-trialhint { color:var(--nm-dim); font-size:12px; margin:-8px 0 14px; }
.nm-cta { width:100%; border:none; border-radius:12px; padding:12px 16px; font-size:15px; font-weight:700; cursor:pointer; background:#1f1f22; color:var(--nm-text); border:1px solid var(--nm-line); transition:filter 0.15s, background 0.15s; }
.nm-cta:hover:not(:disabled) { background:#242427; }
.nm-cta:disabled { opacity:0.6; cursor:default; }
.nm-card-featured .nm-cta { background:var(--nm-red); border-color:var(--nm-red); color:#fff; }
.nm-card-featured .nm-cta:hover:not(:disabled) { filter:brightness(1.08); }
.nm-features { list-style:none; margin:22px 0 0; padding:0; display:grid; gap:12px; }
.nm-features li { display:flex; gap:10px; font-size:14px; line-height:1.45; color:var(--nm-dim); }
.nm-check { color:var(--nm-red); font-weight:800; flex:0 0 auto; }
.nm-fineprint { max-width:680px; margin:40px auto 0; text-align:center; color:var(--nm-dim); font-size:12.5px; line-height:1.6; }
@media (max-width:820px) { .nm-tiers { grid-template-columns:1fr; max-width:440px; } .nm-card-tagline { min-height:0; } }
`;
