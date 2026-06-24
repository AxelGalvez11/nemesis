import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/Sections";

/**
 * Shared chrome for the static legal pages (privacy, terms): a slim sticky header
 * that links back to the marketing page, the prose column, and the shared footer.
 */
export function LegalShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="legal-top">
        <div className="container">
          <Link href="/" className="nav-brand" style={{ fontSize: "18px" }}>
            Pharma<span>Orb</span>
          </Link>
          <Link href="/" className="legal-back">
            ← Back to home
          </Link>
        </div>
      </header>
      <main className="legal legal-wrap">{children}</main>
      <SiteFooter />
    </>
  );
}
