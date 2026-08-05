import type { Metadata } from "next";
import { SiteChrome, APP_SIGN_UP } from "@/components/SiteChrome";
import { PlanCta } from "@/components/PlanCta";
import { IconCheck } from "@/components/FeatureIcons";

export const metadata: Metadata = {
  title: "Pricing · Nemesis",
  description:
    "Start free, no card. Student $9.99 a month, Agent Pro $19.99 a month. Cancel anytime.",
  robots: { index: true, follow: true },
};

// THE CEILING IS $19.99 (owner, 2026-07-31), and as of 2026-08-05 Agent Pro is
// the whole ceiling: Max was RETIRED, not merely hidden. The $99 row came off
// this page first because the nearest competitor's most expensive plan is $19 a
// month, and against that it read as a different category of product rather than
// as a generous option. Nothing migrated — Max had no subscribers.
//
// After the retirement no surface sells it and an old /pricing?plan=max link
// lands on the app's pricing page to choose rather than starting a $99 checkout.
// plan_entitlements.max still RESOLVES so a pre-retirement subscription would
// keep its entitlements; archiving the Stripe price is a live billing change and
// needs the owner's go-ahead.
//
// Free takes the third card. It was always the recommended starting point in the
// copy and had no card of its own to click.
//
// The three recording figures here are checked against the real caps by
// apps/web/lib/workload-cost.test.ts — this file is on its list.

// Comparison rows repeat ONLY claims already made on this page's cards:
// nothing new gets promised in a table cell. A "no" renders as a middot with
// an sr-friendly label via aria-label on the cell.
const COMPARE_ROWS = [
  { label: "Notes, flashcards, and practice tests from your files", values: ["yes", "yes", "yes"] },
  { label: "Lecture recording each month", values: ["30 minutes", "30 hours", "70 hours"] },
  { label: "Calendar built from your syllabus", values: ["yes", "yes", "yes"] },
  { label: "Web-grounded answers with real citations", values: ["no", "no", "yes"] },
  { label: "Daily limits", values: ["Starter", "Standard", "Higher"] },
  { label: "Phone app included", values: ["yes", "yes", "yes"] },
] as const;

const BILLING_FAQ = [
  {
    q: "When am I charged?",
    a: "Only when you upgrade. The free plan doesn't ask for a card. Paid plans bill monthly from the day you subscribe.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, from your account page. No phone calls, no retention chat.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Upgrade or downgrade from your account whenever you like.",
  },
  {
    q: "What happens to my library if I cancel?",
    a: "Nothing. Your library stays in your account and keeps working on the free plan. It stays yours forever.",
  },
  {
    q: "Which plan should I start with?",
    a: "Start free. If you lean on deep research or keep hitting daily limits, Agent Pro is the one most people land on.",
  },
] as const;

function CompareCell({ value }: { value: string }) {
  if (value === "yes") {
    return (
      <td className="compare-yes" aria-label="Included">
        <IconCheck size={13} />
      </td>
    );
  }
  if (value === "no") {
    return (
      <td className="compare-no" aria-label="Not included">
        &middot;
      </td>
    );
  }
  return <td>{value}</td>;
}

export default function PricingPage() {
  return (
    <SiteChrome>
      <section className="section pricing-hero" id="plans">
        <div className="wrap">
          <div className="section-head pricing-head" data-reveal="up">
            <p className="eyebrow">Pricing</p>
            <h2>Start free. Upgrade when you need more.</h2>
            <p>Use Nemesis free every day, no card required. Paid plans raise the limits, and you can cancel anytime.</p>
          </div>
          <div className="plans">
            <div className="plan" data-reveal="up">
              <div className="plan-price">$0<span className="per">/mo</span></div>
              <h3>Free</h3>
              <p className="plan-desc">Enough to run a class through it and see.</p>
              <ul className="plan-features">
                <li><IconCheck size={13} />Notes, flashcards, and practice tests from your files</li>
                <li><IconCheck size={13} />30 minutes of lecture recording a month</li>
                <li><IconCheck size={13} />A calendar built from your syllabus</li>
                <li><IconCheck size={13} />The phone app, included</li>
              </ul>
              <div className="plan-cta">
                <a className="btn btn-secondary" href={APP_SIGN_UP}>Get started free</a>
                <p className="plan-note">No card required</p>
              </div>
            </div>
            <div className="plan" data-reveal="up">
              <div className="plan-price">$9.99<span className="per">/mo</span></div>
              <h3>Student</h3>
              <p className="plan-desc">The essentials for one semester at a time.</p>
              <ul className="plan-features">
                <li><IconCheck size={13} />Higher limits on answers and study decks</li>
                <li><IconCheck size={13} />Notes, flashcards, and practice tests from your files</li>
                <li><IconCheck size={13} />30 hours of lecture recording a month</li>
                <li><IconCheck size={13} />A calendar built from your syllabus</li>
              </ul>
              <div className="plan-cta">
                <PlanCta plan="plus" label="Get Student" />
                <p className="plan-note">Billed monthly, cancel anytime</p>
              </div>
            </div>
            <div className="plan plan-featured" data-reveal="up">
              <span className="plan-badge">Most popular</span>
              <div className="plan-price">$19.99<span className="per">/mo</span></div>
              <h3>Agent Pro</h3>
              <p className="plan-desc">For a full course load, every week.</p>
              {/* Recording hours mirror plan_entitlements.transcription_seconds_month_limit
                  and the app's own pricing page. Two repos, one number.

                  "Deep research with cited reports" was removed 2026-07-28: it is a
                  PharmaOrb feature with no route, no nav entry and no chat tool in
                  Nemesis. Every line here must name something a student can reach. */}
              <ul className="plan-features">
                <li><IconCheck size={13} />Everything in Student</li>
                <li><IconCheck size={13} />70 hours of lecture recording a month</li>
                <li><IconCheck size={13} />Web-grounded answers with real citations</li>
                <li><IconCheck size={13} />Higher daily limits</li>
              </ul>
              <div className="plan-cta">
                <PlanCta plan="pro" label="Get Agent Pro" variant="primary" />
                <p className="plan-note">Billed monthly, cancel anytime</p>
              </div>
            </div>
          </div>
          <div className="pricing-fine">
            <p>Cancel anytime from your account, no phone calls. Your library stays yours on any plan, forever. No ads, no selling your data, no training on your content.</p>
          </div>
        </div>
      </section>

      <section className="section" id="compare">
        <div className="wrap">
          <div className="section-head pricing-head" data-reveal="up">
            <p className="eyebrow">Compare</p>
            <h2>Same agent, different limits.</h2>
          </div>
          <div className="compare-scroll" data-reveal="soft">
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Feature</span></th>
                  <th scope="col">Free</th>
                  <th scope="col">Student</th>
                  <th scope="col" className="compare-featured">Agent Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map(({ label, values }) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {values.map((value, i) => (
                      <CompareCell key={i} value={value} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
