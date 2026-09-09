import type { Metadata } from "next";

import { Mascot } from "@/components/home/Mascot";
import { NemesisLockup } from "@/components/NemesisMark";
import { GradientArt } from "@/components/reference/GradientArt";

import "./reference.css";

export const metadata: Metadata = {
  title: "Nemesis",
  description: "An academic OS. Bring your material, think with it, make things from it.",
};

/**
 * The landing page, built on figma.com's measured skeleton.
 *
 * Canonical source: /research/design-references/figma/DESIGN_ANALYSIS.md, plus the full teardown
 * of 2026-09-08 (section spine, type scale, control geometry, motion vocabulary, icon grid).
 *
 * Owner, 2026-09-09: "figma leads, use sana where it doesn't fight" and "use Figma as the
 * reference for the landing page ... replace the images with gradients before you actually use
 * the actual in-app because we're actually redesigning the in-app stuff".
 *
 * WHAT IS THEIRS. The skeleton, and only the skeleton: a 1360 well on 40px gutters, ten sections
 * at a uniform 80px of padding on ONE white ground, a three-column hero (headline left, art
 * centred, a 224x84 slab of a call to action right), two-tone section heads where the
 * continuation is the same size and weight at 54% ink, a 348x433 media strip on 16px gutters, a
 * 44px pull quote against an 88px stat, a 1360x136 closing band at radius 24, and a black footer
 * on 120px of padding with 12px mono column heads.
 *
 * WHAT IS OURS. Every word, the character, and the art. Figma's frames hold screenshots of their
 * product; ours hold gradient panels, because the app is mid-redesign and putting a picture of a
 * screen that is about to change in front of every visitor is worse than putting no screen there
 * at all. When the redesign lands, the gradients come out and real product art goes into the same
 * frames at the same sizes.
 *
 * 🔴 THE PREVIOUS VERSION OF THIS FILE SAID "THERE ARE NO GRADIENTS ON THIS PAGE, ON PURPOSE",
 * and that note was right about the thing it was actually defending: figma.com carries ONE
 * gradient across 8,973px, and washes behind the type are what make an AI landing page look
 * generic. That still holds. The page ground here is flat white and the type sits on nothing.
 * Gradients appear only INSIDE the frames where the reference has a photograph, which is a
 * different decision from the one that note refused.
 *
 * Lives at /preview rather than replacing `/` so it can be compared against the live page first.
 */
export default function ReferenceLanding() {
  return (
    <div className="ref-page">
      <Nav />

      {/* ── HERO. Measured 860px tall. The h1 is deliberately held to 328px so it wraps to four
             short lines: a headline that fills the viewport reads as a template, one that stacks
             reads as a poster. That single constraint does more for the fold than anything else
             on their page. */}
      <section className="ref-hero">
        <div className="ref-hero-in">
          <h1 className="ref-h1">An academic OS for whatever you are studying</h1>

          {/* Their slot holds a Vimeo loop of the product at 581x700. Ours holds gradient art
              with the character standing on it: the character is the one thing neither reference
              has, and on a page that is otherwise ink on paper it carries the brand alone.

              🔴 THE PALE VARIANT, NOT THE DEEP ONE. The character is flat black — that is the
              shipped mark, not a bug — so on the navy mesh it read as a hole punched through the
              panel. `ice` gives it a field to sit on. The deep meshes still carry the strip below,
              where nothing dark sits on top of them. */}
          <div className="ref-hero-art">
            <GradientArt variant="ice" radius={24} drift>
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Mascot size={300} />
              </div>
            </GradientArt>
          </div>

          <a className="ref-hero-cta" href="/app">
            <span className="ref-lead">Start free</span>
          </a>
        </div>
      </section>

      {/* ── Two-tone head. Measured: both halves are 30/400/-0.66; only the colour changes. */}
      <section className="ref-section">
        <div className="ref-container">
          <div className="ref-head-c">
            <h2 className="ref-lead" style={{ display: "inline" }}>
              One workspace for everything you are trying to learn.
            </h2>{" "}
            <span className="ref-lead ref-dim">
              Bring a lecture, a paper, a scan of a page. Nemesis reads it and thinks with you.
            </span>
          </div>
        </div>
      </section>

      {/* ── Feature two-up. Measured inset of 114.7px inside the well. */}
      <section className="ref-section" style={{ paddingTop: 0 }}>
        <div className="ref-container">
          <div className="ref-two-up">
            <Feature
              title="Read anything you put in front of it"
              body="Slides, PDFs, recordings, photographs of a whiteboard."
              cta="See what it reads"
            />
            <Feature
              round={false}
              title="Make the things you actually study from"
              body="Notes, cards, tests, a course map, all from your own material."
              cta="See what it makes"
            />
          </div>
        </div>
      </section>

      <section className="ref-section">
        <div className="ref-container">
          <div className="ref-head-c">
            <h2 className="ref-lead" style={{ display: "inline" }}>
              The canvas is the front door.
            </h2>{" "}
            <span className="ref-lead ref-dim">
              Ask a question and the answer lands on a board you can keep working on, next to the
              source it came from.
            </span>
          </div>
        </div>
      </section>

      {/* ── Media strip. Measured 348x433 on a 364px pitch, full bleed past the well. */}
      <section className="ref-section">
        <div className="ref-container">
          <div className="ref-head-row">
            <div className="ref-head-l">
              <h2 className="ref-lead" style={{ display: "inline" }}>
                Precise where it matters. Quiet everywhere else.
              </h2>{" "}
              <span className="ref-lead ref-dim">
                Every tool you need to take something apart and put it back together.
              </span>
            </div>
            <Link href="/principles" style={{ flex: "0 0 auto", marginTop: 10 }}>
              How it thinks
            </Link>
          </div>
        </div>
        <div className="ref-strip" style={{ marginTop: 63 }}>
          <GradientArt variant="cyan" radius={0} />
          <GradientArt variant="dusk" radius={0} />
          <GradientArt variant="azure" radius={0} />
          <GradientArt variant="cobalt" radius={0} />
        </div>
        <div className="ref-strip" style={{ marginTop: 16 }}>
          <GradientArt variant="ice" radius={0} />
          <GradientArt variant="deep" radius={0} />
          <GradientArt variant="azure" radius={0} />
          <GradientArt variant="cyan" radius={0} />
        </div>
      </section>

      {/* ── Quote and stat. Measured: 44px quote against an 88px number behind a 1px rule. */}
      <section className="ref-section">
        <div className="ref-container">
          <h2 className="ref-h2" style={{ marginBottom: 107 }}>
            Built for the work you were already doing
          </h2>
          <div className="ref-quote-row">
            <div className="ref-quote">
              <p className="ref-h2">
                “I stopped keeping a separate pile of notes. The material goes in, and the thing I
                revise from comes out of the same place I asked the question.”
              </p>
              <div className="ref-byline">
                <GradientArt variant="dusk" radius={9999} className="ref-byline-art" />
                <div>
                  <p className="ref-body">A second-year law student</p>
                  <p className="ref-body ref-dim">On the canvas, not the notes app</p>
                </div>
              </div>
            </div>
            <div className="ref-stat-col">
              <p className="ref-stat">17</p>
              <p className="ref-body ref-dim" style={{ marginTop: 27 }}>
                File formats read on the way in, from slide decks to handwriting
              </p>
              <p className="ref-meta ref-dim" style={{ marginTop: 42 }}>
                Counted in the app, September 2026.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing band. Measured 1360x136, radius 24, label at 56px. */}
      <section className="ref-section">
        <div className="ref-container">
          <h2 className="ref-h2 ref-head-c" style={{ margin: "0 auto 60px", textAlign: "center" }}>
            Put your material somewhere it can think
          </h2>
        </div>
        <a className="ref-cta-band" href="/app">
          <span style={{ fontSize: 56, fontWeight: 400, lineHeight: "56px", letterSpacing: "-1.25px" }}>
            Start free
          </span>
        </a>
      </section>

      <Foot />
    </div>
  );
}

/* ── Nav. Measured 78.39px with a hairline bottom; labels render at 16/400, not the 18/330 that
      sits on their anchor. The two pills are 46.39px at radius 8 with 12/22 padding. */
function Nav() {
  return (
    <header className="ref-nav">
      <div className="ref-nav-in">
        <a href="/" aria-label="Nemesis home" style={{ display: "flex", marginRight: 24 }}>
          <NemesisLockup size={26} />
        </a>
        <nav className="ref-nav-links">
          <a className="ref-nav-link" href="/principles">
            How it thinks
          </a>
          <a className="ref-nav-link" href="/about">
            About
          </a>
          <a className="ref-nav-link" href="/pricing">
            Pricing
          </a>
        </nav>
        <div className="ref-nav-actions">
          <a className="ref-btn" href="/app" style={{ padding: 8 }}>
            Log in
          </a>
          <a className="ref-btn ref-btn-outline" href="/about">
            Talk to us
          </a>
          <a className="ref-btn ref-btn-solid" href="/app">
            Start free
          </a>
        </div>
      </div>
    </header>
  );
}

function Feature({
  title,
  body,
  cta,
  round = true,
}: {
  title: string;
  body: string;
  cta: string;
  round?: boolean;
}) {
  return (
    <div>
      <div className="ref-feat-ico" style={round ? undefined : { borderRadius: 2 }} />
      <h3 className="ref-body" style={{ margin: "0 0 2px" }}>
        {title}
      </h3>
      <p className="ref-body ref-dim" style={{ margin: "0 0 20px" }}>
        {body}
      </p>
      <Link href="/principles">{cta}</Link>
    </div>
  );
}

/** The arrow is Figma's own geometry, read out of their DOM: a FILLED outline on a 24x24 grid
 *  with a 0.13px stroke used to thicken it, not a stroked chevron-and-line. Drawing it by eye
 *  is what made an earlier pass look subtly wrong. */
function Link({
  href,
  children,
  style,
}: {
  href: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <a className="ref-link" href={href} style={style}>
      {children}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.13"
          d="m12.57 4.205 7.477 7.75.043.045-.043.045-7.478 7.75-.046.047-.046-.045-.734-.71-.046-.044.045-.047 6.195-6.42H3.935v-1.151h14.003l-6.196-6.421-.045-.047.046-.045.734-.709.046-.045z"
        />
      </svg>
    </a>
  );
}

/* ── Footer. Measured: black, 120px padding, a 60px gutter of its own, 180px columns on a 240px
      pitch, and heads in 12px mono uppercase at +0.6px — the only positive tracking on the page. */
function Foot() {
  const cols = [
    { head: "Product", links: ["The canvas", "Reading", "Study tools", "Pricing"] },
    { head: "Learn", links: ["How it thinks", "Principles", "What it reads", "Changelog"] },
    { head: "Company", links: ["About", "Contact", "Privacy", "Terms"] },
  ];
  return (
    <footer className="ref-foot">
      <div className="ref-foot-in">
        <div className="ref-foot-brand">
          <div style={{ fontSize: 44, fontWeight: 400, lineHeight: "48.4px", letterSpacing: "-0.66px" }}>
            Nemesis
          </div>
        </div>
        <div className="ref-foot-cols">
          {cols.map((col) => (
            <div className="ref-foot-col" key={col.head}>
              <h4 className="ref-mono">{col.head}</h4>
              <ul>
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="/">{l}</a>
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
