import Image from "next/image";
import type { ReactNode } from "react";
import { landingUrl } from "@/lib/env";

interface AuthFrameProps {
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared, deliberately minimal /sign-in and /sign-up shell. Pages own the
 * copy and auth logic; this component owns only the presentation. */
export function AuthFrame({ eyebrow, title, description, children, footer }: AuthFrameProps) {
  return (
    <main className="nemesis-auth-shell">
      <a className="nemesis-auth-brand" href={landingUrl} aria-label="Nemesis home">
        <Image src="/nemesis/logo.png" alt="" width={30} height={30} priority />
        <span>NEMESIS</span>
      </a>

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

      <section className="nemesis-auth-panel-wrap">
        <div className="nemesis-auth-card">
          <div className="nemesis-auth-card-in">
            <div className="nemesis-auth-mark" aria-hidden="true">
              <Image src="/nemesis/logo.png" alt="" width={22} height={22} priority />
            </div>
            <p className="nemesis-auth-eyebrow">{eyebrow}</p>
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
