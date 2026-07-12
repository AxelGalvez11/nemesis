import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SocialLinks } from "./SocialLinks";

/**
 * Shared chrome for the static legal pages (privacy, terms): a slim sticky header
 * that links back to the marketing page, the prose column, and a minimal footer.
 */
export function LegalShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="legal-top">
        <div className="container">
          <Link href="/" className="brand" aria-label="Nemesis home">
            <Image className="brand-logo-legal" src="/nemesis/logo.png" alt="" width={22} height={22} />
            <b>Nemesis</b>
          </Link>
          <Link href="/" className="legal-back">
            Back to home
          </Link>
        </div>
      </header>
      <main className="legal legal-wrap">{children}</main>
      <footer className="foot">
        <div className="wrap foot-in">
          <Link href="/privacy" style={{ color: "var(--iron)", fontFamily: "var(--mono)", fontSize: 12, textDecoration: "none" }}>
            Privacy
          </Link>
          <Link href="/terms" style={{ color: "var(--iron)", fontFamily: "var(--mono)", fontSize: 12, textDecoration: "none" }}>
            Terms
          </Link>
          <SocialLinks />
          <span className="spacer" />
          <span className="muted">local-first · never submits · macOS</span>
        </div>
      </footer>
    </>
  );
}
