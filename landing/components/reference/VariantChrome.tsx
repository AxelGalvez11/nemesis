import { NemesisMark } from "@/components/NemesisMark";

/**
 * Shared chrome for the landing page variations (/preview/v/*).
 *
 * THE NAME IS SET IN THE SYSTEM TYPE. The shipped lockup uses Hanken Grotesk at 15px with 5.1px of
 * letter spacing; the owner asked for the logo and name to follow the design system, so here it is
 * Inter 20/500 at -0.3px, the system's UI weight and its tracking rule (zero at 12px, negative
 * above). Alternatives are on /preview/brand; the owner picks one there.
 *
 * Agent names are plain text, never logos, by the owner's choice on 2026-09-10.
 */

export function VxNav() {
  return (
    <header className="ref-nav">
      <div className="ref-nav-in">
        <a href="/preview/v" className="vx-brand" aria-label="Nemesis home">
          <NemesisMark state="static" size={22} />
          <span className="vx-wordmark">Nemesis</span>
        </a>
        <nav className="ref-nav-links">
          <a className="ref-nav-link" href="#tools">Product</a>
          <a className="ref-nav-link" href="#agents">Agents</a>
          <a className="ref-nav-link" href="/pricing">Pricing</a>
        </nav>
        <div className="ref-nav-actions">
          <a className="ref-btn" href="/app" style={{ padding: 8 }}>
            Log in
          </a>
          <a className="ref-btn ref-btn-solid" href="/app">
            Start free
          </a>
        </div>
      </div>
    </header>
  );
}

/** Figma's two-tone head: the first sentence in ink, the rest at 54%, same size and weight. */
export function TwoTone({ lead, rest, align = "center" }: { lead: string; rest: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "ref-head-c" : "vx-head-l"}>
      <h2 className="ref-lead" style={{ display: "inline" }}>
        {lead}
      </h2>{" "}
      <span className="ref-lead ref-dim">{rest}</span>
    </div>
  );
}

export function WorksWith() {
  return (
    <div className="vx-works" id="agents">
      <p className="ref-mono vx-works-label">Works with</p>
      <div className="vx-works-row">
        {["Claude", "ChatGPT", "Cursor", "Nemesis AI"].map((n) => (
          <span key={n} className="vx-works-name">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="vx-stat">
      <p className="ref-stat">{value}</p>
      <p className="ref-body ref-dim">{label}</p>
    </div>
  );
}

/** Figma's closing band: 1360x136 at radius 24. */
export function CtaBand({ heading }: { heading: string }) {
  return (
    <section className="ref-section">
      <div className="ref-container">
        <h2 className="ref-h2 ref-head-c" style={{ margin: "0 auto 60px", textAlign: "center" }}>
          {heading}
        </h2>
      </div>
      <a className="ref-cta-band" href="/app">
        <span className="vx-cta-label">Start free</span>
      </a>
    </section>
  );
}

export function VxFoot() {
  const cols = [
    { head: "Product", links: ["Canvas", "Flashcards", "Slides", "Study guides"] },
    { head: "Agents", links: ["Claude", "ChatGPT", "Cursor", "Nemesis AI"] },
    { head: "Company", links: ["About", "Pricing", "Privacy", "Terms"] },
  ];
  return (
    <footer className="ref-foot">
      <div className="ref-foot-in">
        <div className="ref-foot-brand">
          <span className="vx-brand vx-brand-foot">
            <NemesisMark state="static" size={30} />
            <span className="vx-wordmark vx-wordmark-lg">Nemesis</span>
          </span>
        </div>
        <div className="ref-foot-cols">
          {cols.map((c) => (
            <div className="ref-foot-col" key={c.head}>
              <h4 className="ref-mono">{c.head}</h4>
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
      </div>
    </footer>
  );
}
