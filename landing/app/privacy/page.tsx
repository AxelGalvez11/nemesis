import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy — PharmaOrb",
  description:
    "How PharmaOrb collects, uses, and protects your information on pharmaorb.app and the beta waitlist.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalShell>
      <div className="legal-kicker">Legal</div>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: June 18, 2026</p>

      <p className="legal-lead">
        This Privacy Policy explains how PharmaOrb (&ldquo;PharmaOrb,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and protects information when you
        visit <strong>pharmaorb.app</strong> (the &ldquo;Site&rdquo;) and join our beta waitlist.
        It covers this marketing site and waitlist only; a separate policy will govern the
        PharmaOrb product when it launches.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Email address.</strong> When you join the waitlist, we collect the email address
          you submit so we can notify you when the beta opens.
        </li>
        <li>
          <strong>Basic technical data.</strong> Like most websites, our hosting provider
          automatically logs standard request data such as IP address, browser type, and pages
          requested, for security and to keep the Site running.
        </li>
        <li>
          <strong>Local preferences.</strong> We store your light/dark theme choice in your
          browser&rsquo;s local storage. It stays on your device and is not sent to us.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> use advertising trackers or sell behavioral profiles, and we do
        not knowingly collect health information through this Site.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To notify you about the beta and important updates about your waitlist request.</li>
        <li>To operate, secure, maintain, and improve the Site.</li>
        <li>To respond to questions or requests you send us.</li>
        <li>To comply with legal obligations and enforce our terms.</li>
      </ul>
      <p>
        We do not sell or rent your personal information, and we do not use your email for unrelated
        marketing.
      </p>

      <h2>Service providers</h2>
      <p>
        We share data only with vendors that help us run the Site, under agreements that limit them
        to processing on our behalf:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — database that stores waitlist submissions.
        </li>
        <li>
          <strong>Vercel</strong> — website hosting and request logging.
        </li>
      </ul>
      <p>
        We may also disclose information if required by law or to protect the rights, safety, and
        security of PharmaOrb, our users, or the public.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep your waitlist email until the beta launches or until you ask us to remove it,
        whichever comes first. You can request deletion at any time (see &ldquo;Your choices&rdquo;).
      </p>

      <h2>Your choices and rights</h2>
      <p>
        You can unsubscribe from notifications at any time, and you may request access to,
        correction of, or deletion of your information. Depending on where you live, you may have
        additional rights under laws such as the GDPR or CCPA. To exercise any of these, email{" "}
        <a href="mailto:privacy@pharmaorb.app">privacy@pharmaorb.app</a>.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable technical and organizational measures to protect your information,
        including access controls and database row-level security. No method of transmission or
        storage is completely secure, so we cannot guarantee absolute security.
      </p>

      <h2>Children</h2>
      <p>
        The Site is not directed to children, and we do not knowingly collect personal information
        from anyone under 16. If you believe a child has provided us information, contact us and we
        will delete it.
      </p>

      <h2>International users</h2>
      <p>
        PharmaOrb is operated from the United States and your information is processed there. By
        using the Site, you understand your information may be transferred to and processed in the
        United States.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will revise the
        &ldquo;Last updated&rdquo; date above. Material changes will be reflected on this page.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about this policy or your data? Email{" "}
        <a href="mailto:privacy@pharmaorb.app">privacy@pharmaorb.app</a>.
      </p>
    </LegalShell>
  );
}
