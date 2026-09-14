"use client";

import { NemesisMark } from "@/components/NemesisMark";
import { useScrolled, Words } from "@/components/reference/motion/Motion";

/**
 * Header, questions and footer for the Sana-structured variations (/preview/v/together and on).
 * Anatomy measured on sanalabs.com; see app/preview/v/sana.css for every number.
 */

const NAV: [string, string][] = [
  ["Product", "#together"],
  ["Agents", "#agents"],
  ["Decks", "#decks"],
  ["Pricing", "/pricing"],
];

export function SnHeader() {
  const scrolled = useScrolled();
  return (
    <header className="nm-header sn-head" data-scrolled={scrolled ? "true" : undefined}>
      <div className="sn-head-in">
        <a className="sn-brand" href="/preview/v" aria-label="Nemesis home">
          <NemesisMark state="static" size={20} />
          <span className="sn-wordmark">Nemesis</span>
        </a>
        <nav className="sn-nav" aria-label="Main">
          {NAV.map(([label, href]) => (
            <a key={label} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className="sn-head-right">
          <a className="sn-login" href="/app">
            Log in
          </a>
          <a className="sn-btn sn-btn-solid nm-press" href="/app">
            Start free
          </a>
        </div>
      </div>
    </header>
  );
}

export function SnFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="sn-faq" id="faq">
      <Words as="h2" className="sn-faq-title" text="Questions" />
      <div className="sn-faq-list">
        {items.map((it) => (
          <details key={it.q}>
            <summary>
              {it.q}
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="sn-faq-a">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

const FOOT = [
  { head: "Product", links: ["Canvas", "Flashcards", "Slides", "Study guides"] },
  { head: "Agents", links: ["Claude", "ChatGPT", "Cursor", "Nemesis AI"] },
  { head: "Company", links: ["Pricing", "Privacy", "Terms"] },
];

export function SnFoot() {
  return (
    <footer className="sn-foot">
      <div className="sn-foot-in">
        <a className="sn-brand" href="/preview/v" aria-label="Nemesis home">
          <NemesisMark state="static" size={22} />
          <span className="sn-wordmark">Nemesis</span>
        </a>
        {FOOT.map((c) => (
          <div key={c.head}>
            <h4>{c.head}</h4>
            <ul>
              {c.links.map((l) => (
                <li key={l}>
                  <a href="#">{l}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="sn-foot-base">Nemesis. For anyone learning anything.</p>
    </footer>
  );
}
