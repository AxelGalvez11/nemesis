import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="legal-page">
      <nav className="legal-nav">
        <Link className="brand" href="/app">Pharma<span>Orb</span></Link>
        <div>
          <Link className="source-link" href="/legal/privacy">Privacy</Link>
          <Link className="source-link" href="/legal/disclaimer">Disclaimer</Link>
        </div>
      </nav>
      <article className="legal-content">
        <p className="eyebrow">Legal</p>
        <h1>Terms of Use</h1>
        <p className="muted">Effective June 6, 2026</p>
        <section>
          <h2>Beta access</h2>
          <p>
            PharmaOrb is a public web beta. Features, pricing, limits, and availability may change
            as the product matures.
          </p>
        </section>
        <section>
          <h2>Educational use only</h2>
          <p>
            PharmaOrb provides cited biomedical research information. It is not a clinician,
            pharmacist, medical device, diagnostic tool, or substitute for professional care.
          </p>
        </section>
        <section>
          <h2>User responsibility</h2>
          <p>
            Do not use PharmaOrb for emergencies. Do not start, stop, or change medication,
            supplement, peptide, or treatment decisions based only on PharmaOrb output.
          </p>
        </section>
        <section>
          <h2>Subscriptions and billing</h2>
          <p>
            Paid Plus access is processed through Stripe. Subscription status is mirrored into
            PharmaOrb to enforce app entitlements and usage limits.
          </p>
        </section>
        <section>
          <h2>Acceptable use</h2>
          <p>
            Do not abuse free limits, bypass entitlements, attack the service, scrape protected
            endpoints, or use PharmaOrb to generate harmful instructions.
          </p>
        </section>
      </article>
    </main>
  );
}
