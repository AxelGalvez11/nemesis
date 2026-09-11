import type { Metadata } from "next";

import { PricingPlans } from "@/components/PricingPlans";
import { SnFaq, SnFoot, SnHeader } from "@/components/reference/SanaChrome";
import { Words } from "@/components/reference/motion/Motion";
import { APP_SIGN_UP } from "@/components/SiteChrome";

import "../home-sana.css";
import "./pricing.css";

export const metadata: Metadata = {
  title: "Pricing · Nemesis",
  description:
    "Start free, no card. Nemesis is $19.99 a month, or $199.99 a year. Cancel anytime.",
  robots: { index: true, follow: true },
};

/**
 * Pricing, in the homepage's system. Owner, 2026-09-11: "make the pricing page follow the new design style".
 *
 * The header, footer, type, motion and questions are the homepage's (SanaChrome, Motion, home-sana.css); the plans
 * sit in sana.ai's own pricing panel, measured the same day (pricing.css has every number). The old page wore the
 * previous site's chrome, one hop from a homepage that no longer looked like it.
 *
 * ONE PAID PRODUCT (owner, 2026-08-17), at $19.99 a month or $199.99 a year (owner, 2026-08-18). The ladder this
 * page used to sell (Free / Student $9.99 / Agent Pro $19.99, with Max $99 above) is gone. Retiring it is not
 * forgetting it: plan_entitlements still carries the old rows and planForPriceId still resolves the old Stripe
 * prices; what no longer exists is anywhere to buy one.
 *
 * 🔴 THE PRICES COME FROM lib/pricing.ts, WHICH IS TESTED AGAINST packages/shared/src/plan.ts. This is a separate
 * application with no workspace link to the shared package, so the number lives twice and the guard is what keeps
 * the two honest. pricing-page.test.ts refuses a price typed into the page.
 */

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
    <div className="sn">
      <SnHeader />
      <main>
        <section className="sn-hero">
          <p className="sn-eyebrow sn-load">Pricing</p>
          <Words as="h1" now className="sn-h1" text="One Nemesis. Free, or all of it." />
          <p className="sn-sub sn-load sn-load-1">
            The free plan is the real product, with less of the month in it. Pay monthly or yearly, and cancel anytime.
          </p>
        </section>

        <PricingPlans />

        <SnFaq items={[...BILLING_FAQ]} title="The fine print, plainly" />

        <section className="pr-close">
          <Words as="h2" className="sn-h2" text="Try it on this week's classes." />
          <div className="sn-actions">
            <a className="sn-btn sn-btn-solid nm-press" href={APP_SIGN_UP}>
              Start free
            </a>
          </div>
        </section>
      </main>
      <SnFoot />
    </div>
  );
}
