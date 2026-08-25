import type { Metadata } from "next";
import { SiteChrome, APP_SIGN_UP } from "@/components/SiteChrome";
import { PageGlow } from "@/components/PageGlow";
import { PricingPlans } from "@/components/PricingPlans";

export const metadata: Metadata = {
  title: "Pricing · Nemesis",
  description:
    "Start free, no card. Nemesis is $19.99 a month, or $199.99 a year. Cancel anytime.",
  robots: { index: true, follow: true },
};

// ONE PAID PRODUCT (owner, 2026-08-17), at $19.99 a month or $199.99 a year
// (owner, 2026-08-18). The ladder this page used to sell — Free / Student $9.99 /
// Agent Pro $19.99, with Max $99 retired above them — is gone, along with its
// comparison table.
//
// Retiring the ladder is NOT forgetting it: plan_entitlements still carries the
// old rows, planForPriceId still resolves the old Stripe prices, and a stale
// ?plan=max link lands on the app's pricing page to choose. What no longer
// exists is anywhere to buy one. Archiving the old Stripe prices is a live
// billing change and remains the owner's call.
//
// 🔴 THE PRICES HERE COME FROM lib/pricing.ts, WHICH IS TESTED AGAINST
// packages/shared/src/plan.ts. This is a separate application with no workspace
// link to the shared package, so the number lives twice and the guard is what
// keeps the two honest.

const BILLING_FAQ = [
  {
    q: "When am I charged?",
    a: "Only when you upgrade. The free plan doesn't ask for a card. Nemesis bills from the day you subscribe, monthly or yearly depending on what you picked.",
  },
  {
    q: "What is the difference between monthly and yearly?",
    a: "The price, and nothing else. It is the same Nemesis either way, with the same limits. Yearly works out about 17% cheaper.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, from your account page. No phone calls, no retention chat.",
  },
  {
    q: "Can I switch between monthly and yearly later?",
    a: "Yes, from your account whenever you like.",
  },
  {
    q: "What happens to my library if I cancel?",
    a: "Nothing. Your library stays in your account and keeps working on the free plan. It stays yours forever.",
  },
  {
    q: "Which should I start with?",
    a: "Start free. It is the real product, not a demo. Upgrade when the month runs out before your semester does.",
  },
] as const;

export default function PricingPage() {
  return (
    <SiteChrome>
      <section className="section pricing-hero" id="plans">
        <PageGlow />
        <div className="wrap">
          <div className="section-head pricing-head" data-reveal="up">
            <p className="eyebrow">Pricing</p>
            <h2>One Nemesis. Free, or all of it.</h2>
            <p>The free plan is the real product, with less of the month in it. Pay monthly or yearly, and cancel anytime.</p>
          </div>
          <PricingPlans />
          <div className="pricing-fine">
            <p>Monthly and yearly are the same Nemesis. The only difference is how often you pay. Cancel anytime from your account, no phone calls. Your library stays yours on any plan, forever. No ads, no selling your data, no training on your content.</p>
          </div>
        </div>
      </section>

      <section className="section alt" id="billing">
        <div className="wrap">
          <div className="section-head pricing-head" data-reveal="up">
            <p className="eyebrow">Billing</p>
            <h2>The fine print, plainly.</h2>
          </div>
          <div className="faq" data-reveal="soft">
            {BILLING_FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="closer" id="get">
        <div className="wrap">
          <h2>Try it on this week&rsquo;s classes.</h2>
          <div className="closer-cta">
            <a className="btn btn-primary" href={APP_SIGN_UP}>Get started free</a>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
