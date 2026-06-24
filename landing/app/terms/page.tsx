import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service — PharmaOrb",
  description:
    "The terms that govern your use of pharmaorb.app, including the medical-information disclaimer.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalShell>
      <div className="legal-kicker">Legal</div>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated: June 18, 2026</p>

      <p className="legal-lead">
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of{" "}
        <strong>pharmaorb.app</strong> and the PharmaOrb beta waitlist (together, the
        &ldquo;Service&rdquo;), operated by PharmaOrb (&ldquo;PharmaOrb,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By using the Service, you agree to these Terms. If
        you do not agree, please do not use the Service.
      </p>

      <h2>What PharmaOrb is</h2>
      <p>
        PharmaOrb provides plain-English, educational information about medications and supplements,
        drawn from public sources including FDA labels, PubMed, and ClinicalTrials.gov. It is an
        information and research tool intended to help you understand published evidence.
      </p>

      <h2 id="disclaimer">Not medical advice</h2>
      <div className="legal-callout">
        <p>
          <strong>
            PharmaOrb is for educational and informational purposes only and is not a substitute for
            professional medical advice, diagnosis, or treatment.
          </strong>
        </p>
        <p>
          Nothing on the Service creates a doctor&ndash;patient relationship. Always seek the advice
          of a qualified healthcare professional with any questions about a medical condition or
          medication. Never disregard or delay seeking professional advice because of something you
          read on the Service. <strong>If you think you may have a medical emergency, call your
          doctor or emergency services immediately.</strong>
        </p>
        <p>
          PharmaOrb does not diagnose, treat, cure, or prescribe, and does not recommend or endorse
          any specific medication, supplement, test, or procedure.
        </p>
      </div>

      <h2>Accuracy and sources</h2>
      <p>
        Information is compiled from third-party public sources and may be incomplete, outdated, or
        contain errors. We do not independently verify every source and make no warranty as to the
        accuracy, completeness, or timeliness of any information. Always confirm critical details
        against the original source and your healthcare provider.
      </p>

      <h2>Beta and pre-release status</h2>
      <p>
        The Service is currently a marketing site and waitlist for a product in development.
        Features, availability, and timing may change, be delayed, or be discontinued at any time
        without notice, and we do not guarantee that the beta will become available to you.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose or in violation of these Terms.</li>
        <li>
          Scrape, harvest, or bulk-download content, or attempt to reverse engineer, disrupt, or
          gain unauthorized access to the Service.
        </li>
        <li>Submit false information or someone else&rsquo;s personal data without permission.</li>
        <li>Interfere with the security or proper functioning of the Service.</li>
      </ul>

      <h2>Intellectual property</h2>
      <p>
        The Service, including its design, text, and the PharmaOrb name and logo, is owned by
        PharmaOrb and protected by applicable laws. Underlying data from FDA, PubMed,
        ClinicalTrials.gov, and other sources remains the property of those respective sources. You
        may not copy or reuse our materials except as permitted by these Terms or applicable law.
      </p>

      <h2>Third-party links</h2>
      <p>
        The Service may link to third-party websites and sources. We are not responsible for the
        content, accuracy, or practices of those sites, and links do not imply endorsement.
      </p>

      <h2>Disclaimer of warranties</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
        warranties of any kind, whether express or implied, including warranties of merchantability,
        fitness for a particular purpose, and non-infringement. We do not warrant that the Service
        will be uninterrupted, error-free, or secure.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, PharmaOrb and its operators will not be liable for
        any indirect, incidental, special, consequential, or punitive damages, or for any loss
        arising from your use of, or reliance on, the Service. Because the Service is offered free
        during this phase, our total liability for any claim is limited to the amount you paid us,
        if any.
      </p>

      <h2>Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless PharmaOrb from any claims, losses, or expenses
        arising out of your misuse of the Service or violation of these Terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of the United States and the state in which PharmaOrb
        operates, without regard to conflict-of-law principles. Any disputes will be resolved in the
        courts located there.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. When we do, we will revise the &ldquo;Last
        updated&rdquo; date above. Your continued use of the Service after changes take effect means
        you accept the revised Terms.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a href="mailto:legal@pharmaorb.app">legal@pharmaorb.app</a>.
      </p>
    </LegalShell>
  );
}
