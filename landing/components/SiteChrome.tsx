"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode } from "react";
import { SocialLinks } from "@/components/SocialLinks";

export const APP_SIGN_UP = "https://app.enternemesis.com/sign-up";
export const APP_SIGN_IN = "https://app.enternemesis.com/sign-in";

// The cursor-following card glow lived here until 2026-07-28: a rAF-throttled
// pointermove listener wrote the cursor position into two CSS variables that fed a
// red radial gradient under every card. It went with the accent — "focus not noise"
// (owner) rules out an effect whose entire purpose is to draw the eye to wherever
// the eye already is. Removing it also takes a global pointermove listener off
// every marketing page.

/** Shared marketing chrome: sticky nav on top, footer below, page content between. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="nav">
        <div className="wrap nav-in">
          <Link className="brand" href="/" aria-label="Nemesis home">
            <Image src="/nemesis/logo.png" alt="" width={26} height={26} />
            <b>Nemesis</b>
          </Link>
          <span className="spacer" />
          <Link className="ghost" href="/pricing">Pricing</Link>
          <Link className="ghost" href="/about">About</Link>
          <a className="ghost" href={APP_SIGN_IN}>Sign in</a>
          <a className="btn btn-primary" href={APP_SIGN_UP}>Sign up</a>
        </div>
      </nav>

      {children}

      {/* Column footer (2026-07-16): brand block + two link columns, base row
          with copyright and social glyphs. Reads more established than the old
          single row without getting louder — same type scale, same colors. */}
      <footer className="foot">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <Link className="brand" href="/" aria-label="Nemesis home">
                <Image className="brand-logo-footer" src="/nemesis/logo.png" alt="" width={20} height={20} />
                <b style={{ fontSize: "11px" }}>Nemesis</b>
              </Link>
              <p className="foot-tag">A study agent that gets better the more you use it.</p>
            </div>
            <nav className="foot-col" aria-label="Product">
              <span className="foot-k">Product</span>
              <Link href="/pricing">Pricing</Link>
              <a href={APP_SIGN_UP}>Get started free</a>
              <a href={APP_SIGN_IN}>Sign in</a>
            </nav>
            <nav className="foot-col" aria-label="Company">
              <span className="foot-k">Company</span>
              <Link href="/about">About</Link>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </nav>
          </div>
          <div className="foot-base">
            <span className="muted">© 2026 Nemesis</span>
            <span className="spacer" />
            <SocialLinks />
          </div>
        </div>
      </footer>
    </>
  );
}
