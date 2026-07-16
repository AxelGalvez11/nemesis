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

/**
 * Auth shell shared by /sign-in and /sign-up: an atmospheric black ground with a
 * single glass card. The card's traveling border beams + glow treatment are adapted
 * from 21st.dev "Sign In Card" (jatin-yadav05), rebuilt as pure CSS in auth.css
 * (no framer-motion dependency) and re-tuned from its purple palette to the
 * Nemesis crimson. Pages own the copy + form logic; this owns only the chrome.
 */
export function AuthFrame({ eyebrow, title, description, children, footer }: AuthFrameProps) {
  return (
    <main className="nemesis-auth-shell">
      <div className="nemesis-auth-atmo" aria-hidden="true" />
      <div className="nemesis-auth-noise" aria-hidden="true" />
      <a className="nemesis-auth-brand" href={landingUrl} aria-label="Nemesis home">
        <Image src="/nemesis/logo-white.png" alt="" width={30} height={30} priority />
        <span>NEMESIS</span>
      </a>

      <section className="nemesis-auth-panel-wrap">
        <div className="nemesis-auth-card">
          <div className="nemesis-auth-beams" aria-hidden="true">
            <i className="beam beam-top" />
            <i className="beam beam-right" />
            <i className="beam beam-bottom" />
            <i className="beam beam-left" />
          </div>
          <div className="nemesis-auth-card-in">
            <div className="nemesis-auth-mark" aria-hidden="true">
              <Image src="/nemesis/logo-white.png" alt="" width={22} height={22} priority />
            </div>
            <p className="nemesis-auth-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="nemesis-auth-description">{description}</p>
            {children}
            {footer ? <div className="nemesis-auth-footer">{footer}</div> : null}
            <p className="nemesis-auth-trust">
              Activity logged <span>·</span> Never submits for you
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
