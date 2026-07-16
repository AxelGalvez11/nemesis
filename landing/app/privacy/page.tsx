import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy · Nemesis",
  description:
    "What stays on your Mac, what Nemesis collects, and what we never do with your data.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalShell>
      <div className="legal-kicker">
        Legal<span className="dot"> · </span>Privacy
      </div>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Effective July 2026</p>

      <p className="legal-lead">
        Nemesis is local-first by design. This policy covers this website and the Nemesis
        product. The web research workspace includes additional disclosures inside the app.
      </p>

      <h2>What stays on your Mac</h2>
      <p>
        Your course files, notes, flashcards, calendar, and the academic record Nemesis
        builds are stored on your device. Your school and email logins are entered in
        Nemesis&rsquo;s own browser on your device; we never see or store those
        credentials.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account information: the email address you sign up with and your subscription status.</li>
        <li>Metering: counts of assistant usage, never the content, to enforce plan limits.</li>
        <li>Payments are processed by our payment provider; we do not store card numbers.</li>
      </ul>

      <h2>When content leaves your device</h2>
      <p>
        When you ask the assistant a question, that request (and the context you attach to
        it) is sent to our model provider to generate the answer, then used for nothing
        else. Nemesis does not send email, submit coursework, or upload your library.
      </p>

      <h2>What we never do</h2>
      <ul>
        <li>No selling or sharing of personal data.</li>
        <li>No advertising and no ad tracking.</li>
        <li>No training on your content.</li>
      </ul>

      <h2>This website</h2>
      <p>
        This site sets no advertising trackers. If you create an account, the email you
        provide is used to operate your account and tell you about the product you signed up
        for, and nothing else.
      </p>

      <h2>Deletion</h2>
      <p>
        Delete your account and we delete the account records we hold. Everything local is
        already yours: it lives in your files and stays there.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href="mailto:support@enternemesis.com">support@enternemesis.com</a>
      </p>
    </LegalShell>
  );
}
