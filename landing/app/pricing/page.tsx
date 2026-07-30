import type { Metadata } from "next";
import { SiteChrome, APP_SIGN_UP } from "@/components/SiteChrome";
import { IconCheck } from "@/components/FeatureIcons";

export const metadata: Metadata = {
  title: "Pricing · Nemesis",
  description:
    "Start free. Student $9.99, Agent Pro $19.99, Max $99. Cancel anytime.",
  robots: { index: true, follow: true },
};

// Comparison rows repeat ONLY claims already made on this page's cards:
// nothing new gets promised in a table cell. A "no" renders as a middot with
// an sr-friendly label via aria-label on the cell.
const COMPARE_ROWS = [
  { label: "Notes, flashcards, and practice tests from your files", values: ["yes", "yes", "yes"] },
  { label: "Lecture recording each month", values: ["20 hours", "70 hours", "200 hours"] },
  { label: "Calendar built from your syllabus", values: ["yes", "yes", "yes"] },
  { label: "Web-grounded answers with real citations", values: ["no", "yes", "yes"] },
  { label: "Daily limits", values: ["Standard", "Higher", "Highest"] },
  { label: "First access to new features", values: ["no", "no", "yes"] },
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
          <div className="section-head pricing-head">
            <p className="eyebrow">Pricing</p>
            <h2>Start free. Upgrade when you need more.</h2>
            <p>Use Nemesis free every day, no card required. Paid plans raise the limits, and you can cancel anytime.</p>
          </div>
          <div className="plans">
            <div className="plan">
              <div className="plan-price">$9.99<span className="per">/mo</span></div>
              <h3>Student</h3>
              <p className="plan-desc">The essentials for one semester at a time.</p>
              <ul className="plan-features">
                <li><IconCheck size={13} />Higher limits on answers and study decks</li>
                <li><IconCheck size={13} />Notes, flashcards, and practice tests from your files</li>
                <li><IconCheck size={13} />20 hours of lecture recording a month</li>
                <li><IconCheck size={13} />A calendar built from your syllabus</li>
              </ul>
              <div className="plan-cta">
                <a className="btn btn-secondary" href={APP_SIGN_UP}>Get Student</a>
                <p className="plan-note">Billed monthly, cancel anytime</p>
              </div>
            </div>
            <div className="plan plan-featured">
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
                <a className="btn btn-primary" href={APP_SIGN_UP}>Get Agent Pro</a>
                <p className="plan-note">Billed monthly, cancel anytime</p>
              </div>
            </div>
            <div className="plan">
              <div className="plan-price">$99<span className="per">/mo</span></div>
              <h3>Max</h3>
              <p className="plan-desc">For the heaviest study and research weeks.</p>
              <ul className="plan-features">
                <li><IconCheck size={13} />Everything in Agent Pro, five times over</li>
                <li><IconCheck size={13} />200 hours of lecture recording a month</li>
                <li><IconCheck size={13} />First access to new features</li>
              </ul>
              <div className="plan-cta">
                <a className="btn btn-secondary" href={APP_SIGN_UP}>Get Max</a>
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
          <div className="section-head pricing-head">
            <p className="eyebrow">Compare</p>
            <h2>Same agent, different limits.</h2>
          </div>
          <div className="compare-scroll">
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Feature</span></th>
                  <th scope="col">Student</th>
                  <th scope="col" className="compare-featured">Agent Pro</th>
                  <th scope="col">Max</th>
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
          <div className="section-head pricing-head">
            <p className="eyebrow">Billing</p>
            <h2>The fine print, plainly.</h2>
          </div>
          <div className="faq">
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
