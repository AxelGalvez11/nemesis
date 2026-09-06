import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocument";
import { PRIVACY } from "@/lib/legal-content";

// The words come from packages/shared/src/legal/privacy.ts by way of lib/legal-content.ts, which
// is generated. Do not edit the policy here; edit the shared source and re-run the sync script.
// The list of companies that receive user data is packages/shared/src/legal/subprocessors.ts.

export const metadata: Metadata = {
  title: "Privacy Policy · Nemesis",
  description:
    "Where your work is stored, what Nemesis collects, who else sees it, and what we never do with your data.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return <LegalDocumentPage doc={PRIVACY} kicker="Privacy" />;
}
