import type { Metadata } from "next";
import { SiteChrome, APP_SIGN_UP, APP_DOWNLOAD } from "@/components/SiteChrome";
import { IconCheck, IconDownload } from "@/components/FeatureIcons";

export const metadata: Metadata = {
  title: "Pricing · Nemesis",
  description:
    "Seven days free on every plan. Student $9.99, Agent Pro $19.99, Max $49.99. Cancel anytime.",
  robots: { index: true, follow: true },
};

// Comparison rows repeat ONLY claims already made on this page's cards —
// nothing new gets promised in a table cell. "—" renders as an em dash with
// an sr-friendly label via aria-label on the cell.
const COMPARE_ROWS = [
  { label: "Notes, flashcards, and practice tests from your files", values: ["yes", "yes", "yes"] },
  { label: "Scheduled school sync", values: ["yes", "yes", "yes"] },
  { label: "Deep research with cited reports", values: ["no", "yes", "yes"] },
  { label: "Daily limits", values: ["Standard", "Higher", "Highest"] },
  { label: "First access to new features", values: ["no", "no", "yes"] },
] as const;

const BILLING_FAQ = [
  {
    q: "When am I charged?",
    a: "Day 8. A card is required to start, and nothing is charged during the 7-day trial. Cancel before day 8 and you pay nothing.",
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
    a: "Nothing. Your notes and decks are plain files on your Mac. They stay yours forever, on any plan or none.",
  },
  {
    q: "Which plan should I start with?",
    a: "Student covers a normal week of classes. If you lean on deep research or keep hitting daily limits, Agent Pro is the one most people land on.",
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
        &mdash;
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
            <h2>Seven days free. Cancel anytime.</h2>
            <p>Every plan starts with a 7-day free trial. Card required, nothing charged until day 8.</p>
          </div>
          <div className="plans">
            <div className="plan">
              <div className="plan-price">$9.99<span className="per">/mo</span></div>
              <h3>Student</h3>
              <p className="plan-desc">The essentials for one semester at a time.</p>
              <ul className="plan-features">
                <li><IconCheck size={13} />Higher limits on answers and study decks</li>
                <li><IconCheck size={13} />Notes, flashcards, and practice tests from your files</li>
                <li><IconCheck size={13} />Scheduled school sync</li>
              </ul>
              <div className="plan-cta">
                <a className="btn btn-secondary" href={APP_SIGN_UP}>Start free trial</a>
                <p className="plan-note">Free for 7 days, then $9.99/mo</p>
              </div>
            </div>
            <div className="plan plan-featured">
              <span className="plan-badge">Most popular</span>
              <div className="plan-price">$19.99<span className="per">/mo</span></div>
              <h3>Agent Pro</h3>
              <p className="plan-desc">For a full course load, every week.</p>
              <ul className="plan-features">
                <li><IconCheck size={13} />Everything in Student</li>
                <li><IconCheck size={13} />Deep research with cited reports</li>
                <li><IconCheck size={13} />Higher daily limits</li>
              </ul>
              <div className="plan-cta">
                <a className="btn btn-primary" href={APP_SIGN_UP}>Start free trial</a>
                <p className="plan-note">Free for 7 days, then $19.99/mo</p>
              </div>
            </div>
            <div className="plan">
              <div className="plan-price">$49.99<span className="per">/mo</span></div>
              <h3>Max</h3>
              <p className="plan-desc">For all-day use and the heaviest weeks.</p>
              <ul className="plan-features">
                <li><IconCheck size={13} />Highest limits across the agent</li>
                <li><IconCheck size={13} />Built for heavy, daily use</li>
                <li><IconCheck size={13} />First access to new features</li>
              </ul>
              <div className="plan-cta">
                <a className="btn btn-secondary" href={APP_SIGN_UP}>Start free trial</a>
                <p className="plan-note">Free for 7 days, then $49.99/mo</p>
              </div>
            </div>
          </div>
          <div className="pricing-fine">
            <p>Cancel anytime from your account, no phone calls. Your library is plain files on your Mac and stays yours on any plan, forever. No ads, no selling your data, no training on your content.</p>
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
            <a className="btn btn-primary" href={APP_SIGN_UP}>Start free trial</a>
            <a className="btn btn-secondary" href={APP_DOWNLOAD}>
              <IconDownload size={15} />
              Download for macOS
            </a>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
