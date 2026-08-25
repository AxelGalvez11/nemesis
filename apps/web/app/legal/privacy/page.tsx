import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <nav className="legal-nav">
        <Link className="brand" href="/">Nemesis</Link>
        <div>
          <Link className="source-link" href="/legal/terms">Terms</Link>
          <Link className="source-link" href="/legal/disclaimer">Disclaimer</Link>
        </div>
      </nav>
      <article className="legal-content">
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="muted">Effective July 14, 2026</p>
        <section>
          <h2>What Nemesis collects</h2>
          <p>
            Nemesis collects account information, app activity, questions, generated answers,
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
          <h2>What you ask about</h2>
          <p>
            Nemesis is educational software and learners study every subject there is. Questions and
            answers may touch sensitive ground, including health, law and personal circumstances.
            Nemesis is not professional advice in any of those areas, and it is not an emergency
            service.
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
          <h2>Analytics &amp; crash reports</h2>
          <p>
            The desktop app uses PostHog to collect anonymous usage statistics and crash
            reports, so we can find bugs and see which features are actually used. This
            never includes the content of your chats, notes, files, or recordings. You can
            opt out at any time from Settings → Account &amp; usage.
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
