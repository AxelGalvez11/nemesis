import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Terms of Use — Nemesis",
  description:
    "The terms that govern your use of Nemesis, including the academic-integrity boundary: it drafts, you submit.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalShell>
      <div className="legal-kicker">
        Legal<span className="dot"> · </span>Terms
      </div>
      <h1>Terms of Use</h1>
      <p className="legal-updated">Effective July 2026</p>

      <p className="legal-lead">
        These terms govern your use of Nemesis and this website. Using Nemesis means you
        agree to them.
      </p>

      <h2>The license</h2>
      <p>
        Nemesis is licensed to you personally, for your own studies. Don&rsquo;t resell it,
        share your account, or reverse-engineer the service.
      </p>

      <h2 id="integrity">Academic integrity</h2>
      <p>
        Nemesis produces drafts and study material. It has no ability to submit coursework,
        and it never sends anything on your behalf. What you submit — and whether it complies
        with your institution&rsquo;s policies — is your decision and your responsibility.
        Use Nemesis in the way your school permits.
      </p>

      <h2>Your accounts</h2>
      <p>
        You connect your school portals and email by signing in yourself, on your device.
        You are responsible for having the right to access the accounts you connect.
      </p>

      <h2>Subscriptions</h2>
      <p>
        Paid plans bill through our payment provider until you cancel. Cancel any time;
        access continues through the period you paid for.
      </p>

      <h2>No warranty</h2>
      <p>
        Nemesis is provided as-is. We work to keep it accurate and dependable, but we do not
        guarantee it is error-free, and you should verify anything that matters — grades,
        deadlines, and citations included.
      </p>

      <h2>Liability</h2>
      <p>
        To the maximum extent the law allows, our liability is limited to the amount you
        paid for the service in the twelve months before a claim.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change materially, we will tell you in the app before the change
        takes effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href="mailto:support@nemesis.app">support@nemesis.app</a>
      </p>
    </LegalShell>
  );
}
