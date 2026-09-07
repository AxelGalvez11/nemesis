import type { ReactNode } from "react";
import { landingUrl } from "@/lib/env";
import { NemesisMark } from "./nemesis-mark";

interface AuthFrameProps {
  /** Small uppercase label above the title. Omitted on pass-through pages, where
   *  it only restates what the title already says. */
  eyebrow?: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Strip the frame back for a page nobody is meant to READ.
   *
   * /sign-in and /sign-up are destinations: a bordered card that holds a form is
   * the right weight for them. /auth/callback and /auth/desktop are corridors —
   * most students see them for about a second on the way somewhere else, and a
   * card with a logo badge, an uppercase label, a 28px headline and a status line
   * makes a doorway look like a room. Minimal drops the badge, the label and the
   * card's own borders, and quiets the type: a sentence on the page, nothing more.
   */
  minimal?: boolean;
}

/** Shared /sign-in and /sign-up shell, and the quieter `minimal` variant the
 * pass-through auth routes use. Pages own the copy and auth logic; this
 * component owns only the presentation.
 *
 * 🔴🔴 TWO COLUMNS AGAIN, FORM LEFT, AND THE OWNER REVERSED HIS OWN EARLIER CALL TO GET HERE.
 * 2026-07-28 was *"the sign in should be centered like chatgpt"*, which is why this second column
 * spent two months at `display: none`. 2026-09-06 is *"i want splitscreen so sign in is on left
 * and gradient background on right"*. The markup was deliberately kept through the centred era so
 * that coming back would be a CSS change, and very nearly was.
 *
 * 🔴 THE FORM COMES FIRST IN THE DOM NOW, not merely on screen. It used to be second, after the
 * decorative column, so a screen reader and a tab press both met the marketing copy before the
 * thing the page exists for. Reordering the columns with CSS `order` would have kept that fault
 * and hidden it better. */
export function AuthFrame({ eyebrow, title, description, children, footer, minimal = false }: AuthFrameProps) {
  return (
    <main className={minimal ? "nemesis-auth-shell" : "nemesis-auth-shell is-split"}>
      <a className="nemesis-auth-brand" href={landingUrl} aria-label="Nemesis home">
        <NemesisMark size={30} />
        <span>NEMESIS</span>
      </a>

      <section className="nemesis-auth-panel-wrap">
        <div className={minimal ? "nemesis-auth-card is-minimal" : "nemesis-auth-card"}>
          <div className={minimal ? "nemesis-auth-card-in is-minimal" : "nemesis-auth-card-in"}>
            {minimal ? null : (
              <div className="nemesis-auth-mark" aria-hidden="true">
                <NemesisMark size={22} />
              </div>
            )}
            {eyebrow ? <p className="nemesis-auth-eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
            <p className="nemesis-auth-description">{description}</p>
            {children}
            {footer ? <div className="nemesis-auth-footer">{footer}</div> : null}
          </div>
        </div>
      </section>

      {/* The gradient half. Decorative: `aria-hidden`, and its one line is said again by the page
          itself and by the landing site, so a reader who never sees it loses nothing. Hidden below
          900px, where two columns would mean a form squeezed into half a phone.

          🔴 THE COLOURS ARE THE PRODUCT'S, NOT A STOCK BLUE. The same wash the landing page and the
          launch film use — deep #062E86 through cobalt and azure into cyan and sky — so the first
          screen of the app and the page that sold it are recognisably one thing.

          🔴 ONE LINE. It was an eyebrow, a three-line headline, a sentence about notes and
          flashcards and a calendar, and a numbered 01/02/03 strip: five things on a panel nobody
          came here to read. Owner, 2026-09-06: *"the text on gradient side is doing too much, too
          wordy"*. And not "semester" — same message, *"dont mention semester, this is supposed to
          be a learning workspace"*. That is the standing field-agnostic rule wearing a different
          hat: "semester" assumes a university calendar, and Nemesis is for anyone learning
          anything, including the people who have no semester at all. */}
      {minimal ? null : (
        <section className="nemesis-auth-field" aria-hidden="true">
          <div className="nemesis-auth-field-wash" />
          <div className="nemesis-auth-field-copy">
            <h2>Your learning workspace.</h2>
          </div>
        </section>
      )}
    </main>
  );
}
