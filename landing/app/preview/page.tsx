import type { Metadata } from "next";

import { Mascot } from "@/components/home/Mascot";
import { ProductFrame } from "@/components/reference/ProductFrame";

import "./reference.css";

export const metadata: Metadata = {
  title: "Nemesis",
  description: "An academic OS. Bring your material, think with it, make things from it.",
};

/**
 * The landing page, rebuilt to the structure measured on figma.com and x.ai/bot.
 *
 * Canonical source: /research/design-references/LANDING_PATTERNS.md.
 *
 * 🔴🔴 THERE ARE NO DECORATIVE GRADIENTS ON THIS PAGE, ON PURPOSE. Swept with animation forced off,
 * figma.com carries ONE gradient (a conic starburst in brand blue) and x.ai/bot carries TWO, both
 * functional (a fade-to-ground scrim, a dot lattice). What makes those pages read as expensive is a
 * rigid section rhythm on ONE ground, headline type at line-height 1.0 with negative tracking at
 * weight 400 to 500, and shadows at 10% or less. Colour washes would move us away from the two
 * references, not toward them.
 *
 * 🔴 THE PRODUCT FRAME HOLDS REAL COMPONENTS, NOT A SCREENSHOT. `ProductFrame` drives the actual
 * session renderer with actual session data, so the page cannot drift from the product and there is
 * no image to re-export when the app changes. Both references use captured screens; this is ours.
 *
 * Lives at /preview rather than replacing `/` so it can be compared against the live page first.
 */
export default function ReferenceLanding() {
  return (
    <div className="ref-page" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <Nav />

      {/* ── Hero. Measured anatomy from x.ai/bot: eyebrow, 20px, h1, 20px, sub, 28px, actions.
             Explicit margins rather than a flex gap, because each step is tuned separately. */}
      <section className="ref-section">
        {/* 🔴 A TWO-COLUMN HERO IS OUR ADDITION, NOT THE REFERENCES'. Both x.ai/bot and figma.com
            run a single left-aligned column with the product frame beneath. We put the character
            beside the headline because it is the one thing on this page neither reference has, and
            because it is the only coloured object in the whole design: the interface is ink on
            paper so that the mascot carries the brand alone. It is also the only interactive thing
            above the fold, and it is pokeable. */}
        <div className="ref-container ref-hero">
          <div>
            <a className="ref-eyebrow" href="/principles">
              <Dot />
              The canvas is the front door
            </a>
            <h1 className="ref-h1" style={{ marginTop: 20 }}>
              An academic OS for whatever you are studying
            </h1>
            <p className="ref-sub" style={{ marginTop: 20 }}>
              Bring a lecture, a paper, a scan of a page. Nemesis reads it, thinks with you on a
              canvas, and makes the things you need to actually learn it.
            </p>
            <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Cta href="/pricing" primary>
                Start free
              </Cta>
              <Cta href="/about">See how it works</Cta>
            </div>
          </div>
          <div className="ref-hero-character">
            <Mascot size={300} />
          </div>
        </div>

        {/* The product frame: radius 24, one shadow at 10%, contents clipped rather than faded. */}
        <div className="ref-container" style={{ marginTop: 48 }}>
          <ProductFrame />
        </div>
      </section>

      <Section
        heading="It reads what you actually have"
        body="Slides, a textbook chapter, a photographed whiteboard, a recording. Seventeen formats, and it tells you plainly what it could and could not read."
      >
        <Trio
          items={[
            { title: "Drop anything", body: "PDFs, decks, documents, images, audio. It parses the structure, not just the words." },
            { title: "Ask across all of it", body: "Every source on the canvas answers together, or tick the ones you want." },
            { title: "Keep the thread", body: "Chats live on the canvas beside the material they came from." },
          ]}
        />
      </Section>

      <Section
        heading="Then it makes the things you need"
        body="Flashcards on a real scheduler, tests that mark themselves, notes, decks, mind maps. Everything it makes opens in the panel, not scattered across the board."
      >
        <Trio
          items={[
            { title: "Cards that come back", body: "Spaced repetition underneath, so the ones you miss return sooner." },
            { title: "Tests with hints", body: "Answer in the panel. Your progress survives closing it." },
            { title: "Notes you own", body: "Written to your library, editable, yours to take away." },
          ]}
        />
      </Section>

      {/* ── The mascot. Neither reference has a character, so this composition is ours. It gets a
             section to itself because the character IS the accent: nothing else on this page is
             coloured, so it carries the whole warmth of the brand on its own. */}
      <section className="ref-section">
        <div
          className="ref-container"
          style={{ display: "flex", gap: 48, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}
        >
          <div style={{ flex: "0 0 auto" }}>
            <Mascot size={200} />
          </div>
          <div style={{ flex: "1 1 380px", minWidth: 280 }}>
            <h2 className="ref-h2">It is a study partner, not a chat box</h2>
            <p className="ref-sub" style={{ marginTop: 16 }}>
              Nemesis explains first and then holds its ground. It asks you a question before it
              builds you a course, and it will tell you when you have got something wrong.
            </p>
          </div>
        </div>
      </section>

      <section className="ref-section">
        <div className="ref-container" style={{ textAlign: "center" }}>
          <h2 className="ref-h2" style={{ marginInline: "auto" }}>
            Start with one lecture
          </h2>
          <p className="ref-sub" style={{ marginTop: 16, marginInline: "auto" }}>
            Free to try. No card.
          </p>
          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center" }}>
            <Cta href="/pricing" primary>
              Start free
            </Cta>
          </div>
        </div>
      </section>
    </div>
  );
}

function Nav() {
  return (
    <header className="ref-nav">
      <div className="ref-container" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--text)", textDecoration: "none" }}>
          Nemesis
        </a>
        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cta href="/pricing">Pricing</Cta>
          <Cta href="/app" primary>
            Open
          </Cta>
        </nav>
      </div>
    </header>
  );
}

/** 🔴 THE PRIMARY ACTION IS INK, NOT A BRAND COLOUR — the app's rule, kept here so the character
 *  stays the only coloured thing on the page. Measured on x.ai and champ: both use their darkest
 *  neutral for the main call to action. */
function Cta({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 40,
        padding: "0 18px",
        borderRadius: 9999,
        fontSize: 14,
        fontWeight: 500,
        textDecoration: "none",
        background: primary ? "var(--text)" : "transparent",
        color: primary ? "var(--bg)" : "var(--text)",
        border: primary ? "1px solid transparent" : "1px solid rgba(var(--fg), 0.10)",
      }}
    >
      {children}
    </a>
  );
}

function Section({ heading, body, children }: { heading: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="ref-section">
      <div className="ref-container">
        <h2 className="ref-h2">{heading}</h2>
        <p className="ref-sub" style={{ marginTop: 16 }}>
          {body}
        </p>
        {children ? <div style={{ marginTop: 40 }}>{children}</div> : null}
      </div>
    </section>
  );
}

function Trio({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      {items.map((item) => (
        <div className="ref-card" key={item.title} style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em" }}>{item.title}</h3>
          <p style={{ marginTop: 8, fontSize: 15, lineHeight: 1.6, color: "var(--text-2)" }}>{item.body}</p>
        </div>
      ))}
    </div>
  );
}

function Dot() {
  return <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--text)", opacity: 0.5 }} />;
}
