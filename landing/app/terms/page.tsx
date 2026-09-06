import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/LegalDocument";
import { TERMS } from "@/lib/legal-content";

// The words come from packages/shared/src/legal/terms.ts by way of lib/legal-content.ts, which is
// generated. Do not edit the Terms here; edit the shared source and re-run the sync script.

export const metadata: Metadata = {
  title: "Terms of Use · Nemesis",
  description:
    "The terms that govern your use of Nemesis, including the academic-integrity boundary: it drafts, you submit.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return <LegalDocumentPage doc={TERMS} kicker="Terms" />;
}
