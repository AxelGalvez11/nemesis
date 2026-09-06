import { DISCLAIMER_SECTION_IDS, TERMS } from "@nemesis/shared";

import { POINT_OF_USE_DISCLAIMER } from "@/lib/legal";

import { LegalPage } from "../legal-document";

// 🔴 THIS PAGE WAS TITLED "MEDICAL DISCLAIMER" AND WAS ENTIRELY ABOUT MEDICATION, SUPPLEMENTS AND
// PEPTIDES. Owner, 2026-08-25: *"remove medical disclaimer claims, this is a general research tool
// not a medical tool."* It was generalised rather than deleted: a study tool that answers any
// question WILL be asked medical, legal, financial and safety ones, and "this is not professional
// advice" is not a claim to be a medical product.
//
// Since 2026-09-05 the disclaimer is not a separate text. It is the three sections of the Terms
// that say what Nemesis is and is not, rendered here under the point-of-use line so that the
// footer link, the Terms and the line near answers can never disagree with each other.
const sections = DISCLAIMER_SECTION_IDS.map((id) => {
  const section = TERMS.sections.find((s) => s.id === id);
  if (!section) throw new Error(`Terms section "${id}" is missing`);
  return section;
});

export default function DisclaimerPage() {
  return (
    <LegalPage
      eyebrow="Safety"
      doc={{ ...TERMS, title: "Disclaimer" }}
      lead={POINT_OF_USE_DISCLAIMER}
      sections={sections}
      links={[
        { href: "/legal/privacy", label: "Privacy" },
        { href: "/legal/terms", label: "Terms" },
      ]}
    />
  );
}
