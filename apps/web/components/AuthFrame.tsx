import type { ReactNode } from "react";
import { landingUrl } from "@/lib/env";
import { AuthLaptop } from "./AuthLaptop";
import { NemesisMark } from "./nemesis-mark";

interface AuthFrameProps {
  /** Small uppercase label above the title. Hidden by auth.css; kept so pages need not change shape. */
  eyebrow?: string;
  title: string;
  /**
   * A second headline line, the same size and weight as the title at 60% ink. Measured on
   * sana.ai/login ("Welcome to Sana" / "Your AI agent for work"): the hierarchy is colour, not scale.
   * 🔴 Both lines must fit the 381px column at 34/500, or the whole form drops by a line.
   */
  subtitle?: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Strip the frame back for a page nobody is meant to READ.
   *
   * /sign-in and /sign-up are destinations. /auth/callback and /auth/desktop are corridors: most
   * students see them for about a second on the way somewhere else, and a laptop panel beside a
   * one-line status message would make a doorway look like a room. Minimal drops the panel, the
   * badge and the label, and quiets the type.
   */
  minimal?: boolean;
}

/** Shared /sign-in and /sign-up shell, and the quieter `minimal` variant the pass-through auth routes
 * use. Pages own the copy and auth logic; this component owns only the presentation.
 *
 * 🔴🔴 SANA'S SIGN-IN, AND THE PANEL IS A LAPTOP NOW. Owner, 2026-09-09: "for the sign in, make sure
 * it looks like the sana sign in because that one had a nice, cool animation"; 2026-09-10: "look
 * exactly like Sana ... with the moving computer", then "make it live". This replaces the gradient
 * half of 2026-09-06 ("splitscreen so sign in is on left and gradient background on right"): the
 * split stays, the form stays first in the DOM, and the right side is Sana's dark panel holding a
 * rendered MacBook (AuthLaptop). Measurements live in auth.css. */
export function AuthFrame({ eyebrow, title, subtitle, description, children, footer, minimal = false }: AuthFrameProps) {
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
            <h1>
              {title}
              {subtitle ? (
                <>
                  <br />
                  <span>{subtitle}</span>
                </>
              ) : null}
            </h1>
            <p className="nemesis-auth-description">{description}</p>
            {children}
            {footer ? <div className="nemesis-auth-footer">{footer}</div> : null}
          </div>
        </div>
      </section>

      {/* The laptop. Decorative: `aria-hidden`, nothing in it is needed to sign in. Hidden below
          1080px by auth.css, and AuthLaptop fetches nothing there. */}
      {minimal ? null : (
        <section className="nemesis-auth-field" aria-hidden="true">
          <AuthLaptop />
        </section>
      )}
    </main>
  );
}
