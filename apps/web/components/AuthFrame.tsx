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

export function AuthFrame({ eyebrow, title, description, children, footer }: AuthFrameProps) {
  return (
    <main className="nemesis-auth-shell">
      <div className="nemesis-auth-scanlines" aria-hidden="true" />
      <a className="nemesis-auth-brand" href={landingUrl} aria-label="Nemesis home">
        <Image src="/nemesis/logo-4k.png" alt="" width={36} height={36} priority />
        <span>NEMESIS</span>
      </a>

      <section className="nemesis-auth-field" aria-label="Nemesis containment status">
        <div className="nemesis-auth-object" aria-hidden="true" />
        <div className="nemesis-auth-glitch glitch-a" aria-hidden="true" />
        <div className="nemesis-auth-glitch glitch-b" aria-hidden="true" />
        <div className="nemesis-auth-field-copy">
          <p className="nemesis-auth-status"><span /> Containment layer / online</p>
          <h2>Power stays inside the perimeter.</h2>
          <p>
            Nemesis retains context, operates tools, and turns a semester into order—within
            the scope you authorize. Final control remains yours.
          </p>
        </div>
      </section>

      <section className="nemesis-auth-panel-wrap">
        <div className="nemesis-auth-panel">
          <p className="nemesis-auth-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="nemesis-auth-description">{description}</p>
          {children}
          {footer ? <div className="nemesis-auth-footer">{footer}</div> : null}
          <p className="nemesis-auth-trust">Scoped tools <span>·</span> Activity logged <span>·</span> Never submits</p>
        </div>
      </section>
    </main>
  );
}
