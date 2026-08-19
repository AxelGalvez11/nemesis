"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { SocialLinks } from "@/components/SocialLinks";
import { ScrollReveal } from "@/components/ScrollReveal";
import { NemesisMark } from "@/components/NemesisMark";
import { captureCtaClick } from "@/lib/posthog";

export const APP_SIGN_UP = "https://app.enternemesis.com/sign-up";
export const APP_SIGN_IN = "https://app.enternemesis.com/sign-in";

/** How often you pay for Nemesis. There is ONE paid product, so this is not a
 *  plan id — the old `PaidPlan = "plus" | "pro"` union was, and every surface
 *  that read it had to know which tier it was selling. */
export type BillingInterval = "monthly" | "annual";

/**
 * Where a "Get Nemesis" button on this site must point.
 *
 * NOT /sign-up. Every plan button used to go to the bare sign-up page, which threw the
 * choice away: someone picked a plan, made an account, and landed in the app on the
 * free tier having never been asked to pay. The app's own /pricing already handles the
 * whole flow — it stashes the choice, sends a signed-out visitor to
 * /sign-up?next=/pricing?interval=X, and resumes Stripe checkout the moment they are
 * authenticated.
 */
export function planCheckoutUrl(interval: BillingInterval): string {
  return `https://app.enternemesis.com/pricing?interval=${interval}`;
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
    // Must stay one pixel above the nav's collapse breakpoint in globals.css.
    const mq = window.matchMedia("(min-width: 901px)");
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
          {/* The mark is drawn, not an image file. The old logo.png was a dark glyph
              that vanished on the black page, so the CSS inverted it with a filter —
              a trick that works only while the mark has no material of its own. */}
          <Link className="brand" href="/" aria-label="Nemesis home" onClick={close}>
            <NemesisMark state="static" size={24} />
            <b>nemesis</b>
          </Link>
          <span className="spacer" />

          {/* Wide screens: the links sit in the bar. Philosophy, then commerce.
              "How it works" used to lead this list, pointing at the Canvas
              section. It came out when that section started playing by itself:
              a link whose job is to send you to a demonstration is redundant
              once the demonstration runs on its own a screen further down. */}
          <div className="nav-links">
            {/* The tenets moved off the homepage to /principles when it was cut to
                four sections. Kept in the nav under the same label because that is
                what the page is still about. */}
            <Link className="ghost" href="/principles">Principles</Link>
            <Link className="ghost" href="/pricing">Pricing</Link>
            <a className="ghost" href={APP_SIGN_IN}>Sign in</a>
            <a
              className="btn btn-primary"
              href={APP_SIGN_UP}
              onClick={() => captureCtaClick("nav", "Start learning")}
            >
              Start learning
            </a>
          </div>

          {/* Narrow screens: one button. Five items plus a brand do not fit a
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
            <Link href="/principles" onClick={close}>Principles</Link>
            <Link href="/pricing" onClick={close}>Pricing</Link>
            <Link href="/about" onClick={close}>About</Link>
            <a href={APP_SIGN_IN} onClick={close}>Sign in</a>
            <a
              className="btn btn-primary"
              href={APP_SIGN_UP}
              onClick={() => {
                captureCtaClick("nav", "Start learning");
                close();
              }}
            >
              Start learning
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
              <Link className="brand brand-foot" href="/" aria-label="Nemesis home">
                <NemesisMark state="static" size={19} />
                <b>nemesis</b>
              </Link>
              <p className="foot-tag">learn. diagnose. iterate.</p>
            </div>
            <nav className="foot-col" aria-label="Product">
              <span className="foot-k">Product</span>
              <Link href="/principles">Principles</Link>
              <Link href="/pricing">Pricing</Link>
              <a href={APP_SIGN_UP} onClick={() => captureCtaClick("footer", "Start learning")}>
                Start learning
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
