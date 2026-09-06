import { TERMS } from "@nemesis/shared";

import { LegalPage } from "../legal-document";

// The words live in packages/shared/src/legal/terms.ts and are shared with the landing site.
export default function TermsPage() {
  return (
    <LegalPage
      doc={TERMS}
      links={[
        { href: "/legal/privacy", label: "Privacy" },
        { href: "/legal/disclaimer", label: "Disclaimer" },
      ]}
    />
  );
}
