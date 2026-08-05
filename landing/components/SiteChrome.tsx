"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { SocialLinks } from "@/components/SocialLinks";
import { ScrollReveal } from "@/components/ScrollReveal";
import { captureCtaClick } from "@/lib/posthog";

export const APP_SIGN_UP = "https://app.enternemesis.com/sign-up";
export const APP_SIGN_IN = "https://app.enternemesis.com/sign-in";

/** Paid plan ids, as the app and Stripe know them. "plus" is sold as "Student".
 *
 *  "max" came off this site on 2026-07-31 when the owner set a $20/mo ceiling, and
 *  was RETIRED outright on 2026-08-05 ("agent pro is the ceiling"). It is gone from
 *  the type rather than merely unused on the page, so a future plan card cannot
 *  reintroduce a $99 tier just by typing a string. As of the retirement the app no
 *  longer sells it either: a stale `?plan=max` link now resolves to Student rather
 *  than to a $99 checkout. */
export type PaidPlan = "plus" | "pro";

/**
 * Where a "Get <plan>" button on this site must point.
 *
 * NOT /sign-up. Every plan button used to go to the bare sign-up page, which threw the
 * choice away: someone picked Agent Pro, made an account, and landed in the app on the
 * free tier having never been asked to pay. The app's own /pricing already handles the
 * whole flow — it stashes the plan, sends a signed-out visitor to
 * /sign-up?next=/pricing?plan=X, and resumes Stripe checkout the moment they are
 * authenticated. Linking here hands the funnel to that code instead of dropping it.
 */
export function planCheckoutUrl(plan: PaidPlan): string {
  return `https://app.enternemesis.com/pricing?plan=${plan}`;
}

// The cursor-following card glow lived here until 2026-07-28: a rAF-throttled
// pointermove listener wrote the cursor position into two CSS variables that fed a
// red radial gradient under every card. It went with the accent, "focus not noise"
// (owner) rules out an effect whose entire purpose is to draw the eye to wherever
// the eye already is. Removing it also takes a global pointermove listener off
// every marketing page.

/** Shared marketing chrome: sticky nav on top, footer below, page content between. */
export function SiteChrome({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Escape closes it, and a widened window closes it too: the menu is hidden by a
  // media query at that width, so leaving `open` true would strand the state and
  // reopen the panel if the window narrowed again.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const mq = window.matchMedia("(min-width: 721px)");
    const onWide = () => { if (mq.matches) setOpen(false); };
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <>
      {/* One observer for every page's [data-reveal] elements. */}
      <ScrollReveal />
      <nav className="nav">
        <div className="wrap nav-in">
          <Link className="brand" href="/" aria-label="Nemesis home" onClick={close}>
            <Image src="/nemesis/logo.png" alt="" width={26} height={26} />
            <b>Nemesis</b>
          </Link>
          <span className="spacer" />

          {/* Wide screens: the links sit in the bar. */}
          <div className="nav-links">
            <Link className="ghost" href="/pricing">Pricing</Link>
            <Link className="ghost" href="/about">About</Link>
            <a className="ghost" href={APP_SIGN_IN}>Sign in</a>
            <a
              className="btn btn-primary"
              href={APP_SIGN_UP}
              onClick={() => captureCtaClick("nav", "Sign up")}
            >
              Sign up
            </a>
          </div>

          {/* Narrow screens: one button. Four items plus a brand do not fit a
              375px bar without shrinking the tap targets below usable size. */}
          <button
            type="button"
            className="nav-burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className={open ? "burger-glyph is-open" : "burger-glyph"} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>

        {/* Rendered always so screen readers and the aria-controls target are
            stable; visibility is the `is-open` class, not a mount. */}
        <div id="nav-menu" className={open ? "nav-menu is-open" : "nav-menu"} hidden={!open}>
          <div className="wrap nav-menu-in">
            <Link href="/pricing" onClick={close}>Pricing</Link>
            <Link href="/about" onClick={close}>About</Link>
            <a href={APP_SIGN_IN} onClick={close}>Sign in</a>
            <a
              className="btn btn-primary"
              href={APP_SIGN_UP}
              onClick={() => {
                captureCtaClick("nav", "Sign up");
                close();
              }}
            >
              Sign up
            </a>
          </div>
        </div>
      </nav>

      {children}

      {/* Column footer (2026-07-16): brand block + two link columns, base row
          with copyright and social glyphs. Reads more established than the old
          single row without getting louder, same type scale, same colors. */}
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
              <a href={APP_SIGN_UP} onClick={() => captureCtaClick("footer", "Get started free")}>
                Get started free
              </a>
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
