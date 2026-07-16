import type { Metadata } from "next";
import { SiteChrome, APP_SIGN_UP, APP_DOWNLOAD } from "@/components/SiteChrome";
import { IconCheck, IconDownload } from "@/components/FeatureIcons";

export const metadata: Metadata = {
  title: "Pricing · Nemesis",
  description:
    "Seven days free on every plan. Student $9.99, Agent Pro $19.99, Max $49.99. Cancel anytime.",
  robots: { index: true, follow: true },
};

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
              </div>
            </div>
          </div>
          <div className="pricing-fine">
            <p>Cancel anytime from your account, no phone calls. Your library is plain files on your Mac and stays yours on any plan, forever. No ads, no selling your data, no training on your content.</p>
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
