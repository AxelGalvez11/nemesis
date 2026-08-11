import Link from "next/link";
import type { ReactNode } from "react";
import { SocialLinks } from "./SocialLinks";
import { NemesisMark } from "./NemesisMark";

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
            <NemesisMark state="static" size={21} />
            <b>nemesis</b>
          </Link>
          <Link href="/" className="legal-back">
            Back to home
          </Link>
        </div>
      </header>
      <main className="legal legal-wrap">{children}</main>
      <footer className="foot">
        <div className="wrap foot-in">
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <SocialLinks />
          <span className="spacer" />
          <span className="muted">© 2026 Nemesis</span>
        </div>
      </footer>
    </>
  );
}
