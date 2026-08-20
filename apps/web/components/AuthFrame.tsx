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
 * component owns only the presentation. */
export function AuthFrame({ eyebrow, title, description, children, footer, minimal = false }: AuthFrameProps) {
  return (
    <main className="nemesis-auth-shell">
      <a className="nemesis-auth-brand" href={landingUrl} aria-label="Nemesis home">
        <NemesisMark size={30} />
        <span>NEMESIS</span>
      </a>

      {/* The marketing column. `display: none` in auth.css since the owner asked
          for a centred, ChatGPT-style sign-in, and kept in the markup so the
          two-column layout is one CSS change away — see the comment on
          .nemesis-auth-field. Skipped entirely on the minimal pages: if that
          layout ever comes back, a corridor page must not come back with it. */}
      {minimal ? null : (
        <section className="nemesis-auth-field" aria-hidden="true">
          <div className="nemesis-auth-field-copy">
            <p className="nemesis-auth-status">Your AI study agent</p>
            <h2>Your whole semester, in one quiet place.</h2>
            <p>
              Notes, flashcards, practice tests, and a calendar that keeps deadlines
              honest. It gets sharper the longer you use it.
            </p>
            <div className="nemesis-auth-capabilities">
              <span><b>01</b> Capture</span>
              <span><b>02</b> Connect</span>
              <span><b>03</b> Recall</span>
            </div>
          </div>
        </section>
      )}

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
    </main>
  );
}
