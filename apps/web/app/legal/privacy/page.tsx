import { PRIVACY } from "@nemesis/shared";

import { LegalPage } from "../legal-document";

// The words live in packages/shared/src/legal/privacy.ts and are shared with the landing site.
// The Service providers section is built from packages/shared/src/legal/subprocessors.ts.
export default function PrivacyPage() {
  return (
    <LegalPage
      doc={PRIVACY}
      links={[
        { href: "/legal/terms", label: "Terms" },
        { href: "/legal/disclaimer", label: "Disclaimer" },
      ]}
    />
  );
}
