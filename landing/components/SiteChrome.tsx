"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { SocialLinks } from "@/components/SocialLinks";

export const APP_SIGN_UP = "https://app.enternemesis.com/sign-up";
export const APP_SIGN_IN = "https://app.enternemesis.com/sign-in";
export const APP_DOWNLOAD = "https://app.enternemesis.com/api/download/mac";

/**
 * Cursor-following card glow (adapted from 21st.dev "Spotlight Card" by easemize).
 * One rAF-throttled pointermove listener writes the viewport cursor position into
 * two CSS variables on <html>; the cards' ::after overlays use a fixed-attachment
 * radial gradient, so every card lights up under the real cursor with no per-card
 * math. Desktop-only via the (hover:hover) media block in globals.css. Lives in
 * the shared chrome so every marketing page gets it.
 */
function useCursorGlow() {
  useEffect(() => {
    let frame = 0;
    let x = -999;
    let y = -999;

    const apply = () => {
      frame = 0;
      document.documentElement.style.setProperty("--cx", x.toFixed(1));
      document.documentElement.style.setProperty("--cy", y.toFixed(1));
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}

/** Shared marketing chrome: sticky nav on top, footer below, page content between. */
export function SiteChrome({ children }: { children: ReactNode }) {
  useCursorGlow();

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

      <footer className="foot">
        <div className="wrap foot-in">
          <Link className="brand" href="/" aria-label="Nemesis home">
            <Image className="brand-logo-footer" src="/nemesis/logo.png" alt="" width={20} height={20} />
            <b style={{ fontSize: "11px" }}>Nemesis</b>
          </Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/about">About</Link>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <SocialLinks />
          <span className="spacer" />
          <span className="muted">© 2026 Nemesis</span>
        </div>
      </footer>
    </>
  );
}
