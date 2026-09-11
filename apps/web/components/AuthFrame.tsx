import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { landingUrl } from "@/lib/env";
import { AuthLaptop } from "./AuthLaptop";
import { NemesisMark } from "./nemesis-mark";

// Inter with its optical-size axis: the face of the homepage and of this page, so a visitor who clicks
// "Start free" does not watch the type change under them. Scoped to the auth shell by a variable.
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-auth", display: "swap" });

// Sana's sign-in carries its marketing site's four links in a pill at the top; ours carries our own.
const NAV: readonly (readonly [string, string])[] = [
  ["Overview", landingUrl],
  ["Pricing", `${landingUrl}/pricing`],
  ["Privacy and terms", `${landingUrl}/privacy`],
  ["FAQ", `${landingUrl}/#faq`],
];

interface AuthFrameProps {
  title: string;
  /**
   * A second headline line, the same size and weight as the title at 60% ink. Measured on sana.ai
   * ("Welcome to Sana" / "Your AI agent for work"): the hierarchy is colour, not scale.
   * 🔴 Both lines must wrap where Sana's do, or every row below moves by 47.6px. Measured in this page's Inter at 34/500:
   * "Welcome to Nemesis" 319px, "Your learning space" 296.6px; Sana's pair is 249.3px and 314.6px.
   */
  subtitle?: string;
  /** Two lines on the split pages, like Sana's lead ("Sign in or sign up for free / with your work email"). */
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Strip the frame back for a page nobody is meant to READ. /auth/callback and /auth/desktop are
   * corridors most students see for a second on the way somewhere else; a laptop panel beside a one-line
   * status would make a doorway look like a room. Minimal drops the panel and the nav and quiets the type.
   */
  minimal?: boolean;
}

/**
 * The shared frame for /sign-in, /sign-up and the /auth/* pages. Pages own the copy and the auth logic;
 * this owns the presentation, and auth.css holds every measurement.
 *
 * 🔴🔴 THE DOM IS SANA'S, ELEMENT FOR ELEMENT, because the owner asked four times for the page to match
 * sana.ai/sign-in-to-sana "one for one" and three passes that matched its boxes at one window size did
 * not. A page container holding a top bar (the mark, a pill nav) and a <main> row holding the form
 * column and then the panel. Under 821px the row becomes a column-reverse stack with the panel on top,
 * which is also Sana's.
 */
export function AuthFrame({ title, subtitle, description, children, footer, minimal = false }: AuthFrameProps) {
  return (
    <div className={`nemesis-auth-shell ${inter.variable}${minimal ? "" : " is-split"}`}>
      <div className="nemesis-auth-page">
        <header className="nemesis-auth-top">
          <a aria-label="Nemesis home" className="nemesis-auth-brand" href={landingUrl}>
            <NemesisMark size={18} />
          </a>
          {minimal ? null : (
            <nav aria-label="Nemesis" className="nemesis-auth-nav">
              <ul>
                {NAV.map(([label, href]) => (
                  <li key={label}>
                    <a href={href}>{label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </header>

        <main className="nemesis-auth-main">
          <section className="nemesis-auth-column">
            <div className={minimal ? "nemesis-auth-card-in is-minimal" : "nemesis-auth-card-in"}>
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
          </section>

          {/* The laptop. Decorative: nothing in it is needed to sign in. */}
          {minimal ? null : (
            <section aria-hidden="true" className="nemesis-auth-field">
              <AuthLaptop />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
