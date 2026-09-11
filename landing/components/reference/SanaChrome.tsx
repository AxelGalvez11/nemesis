"use client";

import Link from "next/link";

import { NemesisMark } from "@/components/NemesisMark";
import { useScrolled, Words } from "@/components/reference/motion/Motion";

/**
 * Header, questions and footer for the homepage. Anatomy measured on sanalabs.com; see
 * app/home-sana.css for every number.
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
        <Link className="sn-brand" href="/" aria-label="Nemesis home">
          <NemesisMark state="static" size={20} />
          <span className="sn-wordmark">Nemesis</span>
        </Link>
        <nav className="sn-nav" aria-label="Main">
          {NAV.map(([label, href]) => (
            <a key={label} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className="sn-head-right">
          <a className="sn-login" href="https://app.enternemesis.com/sign-in">
            Log in
          </a>
          <a className="sn-btn sn-btn-solid nm-press" href="https://app.enternemesis.com/sign-up">
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

// Every real link on the page. "#tools" and "#agents" are homepage sections, not separate routes
// (this site has no dedicated /canvas or /agents page); Pricing, Privacy and Terms are.
const FOOT: { head: string; links: [string, string][] }[] = [
  {
    head: "Product",
    links: [
      ["Canvas", "#together"],
      ["Flashcards", "#tools"],
      ["Slides", "#tools"],
      ["Study guides", "#tools"],
    ],
  },
  {
    head: "Agents",
    links: [
      ["Claude", "#agents"],
      ["ChatGPT", "#agents"],
      ["Cursor", "#agents"],
      ["Nemesis AI", "https://app.enternemesis.com/sign-up"],
    ],
  },
  {
    head: "Company",
    links: [
      ["Pricing", "/pricing"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
  },
];

export function SnFoot() {
  return (
    <footer className="sn-foot">
      <div className="sn-foot-in">
        <Link className="sn-brand" href="/" aria-label="Nemesis home">
          <NemesisMark state="static" size={22} />
          <span className="sn-wordmark">Nemesis</span>
        </Link>
        {FOOT.map((c) => (
          <div key={c.head}>
            <h4>{c.head}</h4>
            <ul>
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href}>{label}</a>
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
