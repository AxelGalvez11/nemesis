import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <nav className="legal-nav">
        <Link className="brand" href="/app">Pharma<span>Orb</span></Link>
        <div>
          <Link className="source-link" href="/legal/terms">Terms</Link>
          <Link className="source-link" href="/legal/disclaimer">Disclaimer</Link>
        </div>
      </nav>
      <article className="legal-content">
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="muted">Effective June 6, 2026</p>
        <section>
          <h2>What PharmaOrb collects</h2>
          <p>
            PharmaOrb collects account information, app activity, questions, generated answers,
            monitoring watches, billing status, and technical logs needed to operate the beta.
          </p>
        </section>
        <section>
          <h2>How data is used</h2>
          <p>
            We use data to authenticate accounts, provide cited evidence answers, enforce usage
            limits, operate monitoring, improve reliability, investigate abuse, and support billing.
          </p>
        </section>
        <section>
          <h2>Health-related content</h2>
          <p>
            PharmaOrb is educational software. Questions and answers may involve health topics, but
            PharmaOrb does not provide diagnosis, treatment, prescriptions, or emergency support.
          </p>
        </section>
        <section>
          <h2>Service providers</h2>
          <p>
            The beta uses Supabase for backend/auth, Vercel for hosting, Stripe for billing, and
            model/provider services for source-grounded answer generation.
          </p>
        </section>
        <section>
          <h2>Your controls</h2>
          <p>
            Signed-in users can export account data and request account deletion from Profile.
            Deletion removes the auth account and user-owned rows where the backend schema allows it.
          </p>
        </section>
      </article>
    </main>
  );
}
