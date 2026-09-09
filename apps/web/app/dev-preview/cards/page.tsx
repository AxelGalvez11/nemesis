"use client";

import { useState } from "react";

import "./cards.css";

/**
 * A surface for choosing how a card looks and moves.
 *
 * Owner, 2026-09-09: "for any sort of card, any sort of design style, just put it in a way for me
 * to design" — plus "I don't see any motions here ... like how things will appear, dropdown menus"
 * and "they have this thing where they have like these bright colors, I would like that for
 * Nemesis as well."
 *
 * 🔴 EVERY COLOUR AND EVERY NUMBER ON THIS PAGE WAS MEASURED, AND EACH ONE SAYS WHERE IT CAME
 * FROM. Nothing here is a mood board. The three brights are sampled from Sana's own pixels, not
 * chosen: their whole stylesheet contains only two saturated colours (#0055ff and #ff6400, both on
 * tiny elements) and the acid lime everyone remembers is not in their CSS at all — it lives inside
 * the product photograph on their sign-in page, where it measures #CDFD01 against a #131313 ground.
 *
 * 🔴 OUR CARD IS NOT A 1:1 OF MOCHI OR REMNOTE, and was never built to be. It was measured against
 * Claude.ai's learning card in August, plus the owner's instruction to keep it "plain Anki style
 * with just an X and a check." Variant A below is that card, honestly labelled. B and C are
 * proposals built on the Mochi schema in /research/functionality/NOTES_AND_CARDS.md.
 */

type Variant = "anki" | "template" | "bright";
type Accent = "acid" | "electric" | "ember" | "ours";

const ACCENTS: Record<Accent, { label: string; hex: string; on: string; note: string }> = {
  acid: {
    label: "Acid lime",
    hex: "#CDFD01",
    on: "#131313",
    note: "Sampled from Sana's own product shot: 1,264px of it, chroma 252. Their brightest colour, and it never appears in their CSS.",
  },
  electric: {
    label: "Electric blue",
    hex: "#0055FF",
    on: "#FFFFFF",
    note: "One of only two saturated colours in Sana's entire stylesheet. Used on a 3,270px element.",
  },
  ember: {
    label: "Ember",
    hex: "#FF6400",
    on: "#FFFFFF",
    note: "The other one. Same tiny footprint. A pair, not a palette.",
  },
  ours: {
    label: "Ours",
    hex: "var(--acid)",
    on: "var(--on-acid)",
    note: "The accent already in the app, which each learner can change in settings.",
  },
};

export default function CardDesignSurface() {
  const [variant, setVariant] = useState<Variant>("anki");
  const [accent, setAccent] = useState<Accent>("acid");
  const [flipped, setFlipped] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [graded, setGraded] = useState<string | null>(null);

  const a = ACCENTS[accent];
  const styleVars = { "--pick": a.hex, "--on-pick": a.on } as React.CSSProperties;

  return (
    <main className="cd" style={styleVars}>
      <header className="cd-head">
        <h1>Cards</h1>
        <p>
          Pick a shape and a colour. Everything is measured; each swatch says where it came from.
          Click a card to turn it over.
        </p>
      </header>

      {/* ── the two choices ─────────────────────────────────────────────────────────────── */}
      <section className="cd-controls">
        <div>
          <p className="cd-label">Shape</p>
          <div className="cd-seg" role="tablist">
            {(
              [
                ["anki", "A · Plain Anki"],
                ["template", "B · Templated"],
                ["bright", "C · Bright on dark"],
              ] as [Variant, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                role="tab"
                aria-selected={variant === v}
                className={variant === v ? "is-on" : ""}
                onClick={() => {
                  setVariant(v);
                  setFlipped(false);
                  setGraded(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="cd-label">Accent</p>
          <div className="cd-swatches">
            {(Object.keys(ACCENTS) as Accent[]).map((k) => (
              <button
                key={k}
                className={`cd-swatch${accent === k ? " is-on" : ""}`}
                onClick={() => setAccent(k)}
                title={ACCENTS[k].note}
              >
                <i style={{ background: ACCENTS[k].hex }} />
                <span>{ACCENTS[k].label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="cd-prov">{a.note}</p>

      {/* ── the card ────────────────────────────────────────────────────────────────────── */}
      <section className={`cd-stage v-${variant}`}>
        <div
          className={`cd-card${flipped ? " is-flipped" : ""}`}
          onClick={() => setFlipped((f) => !f)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
        >
          <div className="cd-face cd-front">
            {variant === "template" ? <span className="cd-field">question</span> : null}
            <p className="cd-q">Why does a spacer improve delivery from a metered-dose inhaler?</p>
            {variant === "template" ? (
              <div className="cd-meta">
                <span className="cd-chip">Devices</span>
                <span className="cd-chip">Lecture 9</span>
              </div>
            ) : null}
            <span className="cd-hint">Click to turn over</span>
          </div>

          <div className="cd-face cd-back">
            {variant === "template" ? <span className="cd-field">answer</span> : null}
            <p className="cd-a">
              It slows the plume and lets the propellant evaporate, so fewer large particles hit the
              throat and more of the dose reaches the lung. It also removes the need to time the
              press with the breath.
            </p>
            {variant === "template" ? (
              <p className="cd-src">
                From your note, <b>Pulmonary drug delivery</b> · toggle 3
              </p>
            ) : null}
          </div>
        </div>

        {/* ── grading. Mochi ships THREE grades, measured in their client: review/again,
               review/forgot, review/remember. Anki ships four and most people use two. */}
        <div className={`cd-grades${flipped ? " is-shown" : ""}`}>
          {(["Again", "Forgot", "Remember"] as const).map((g) => (
            <button
              key={g}
              className={`cd-grade${graded === g ? " is-picked" : ""}`}
              onClick={() => setGraded(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </section>

      {/* ── motion, which was the other gap ─────────────────────────────────────────────── */}
      <section className="cd-motion">
        <h2>Motion</h2>
        <p className="cd-note">
          The landing page uses Figma&apos;s vocabulary: 0.18s ease-out, no springs. Study surfaces
          use Sana&apos;s: a 0.3s signature curve and a real spring that overshoots to 1.263. A card
          turning over is the one place the spring earns its keep.
        </p>

        <div className="cd-motion-row">
          <div className="cd-demo">
            <p className="cd-label">Dropdown · 0.18s ease-out, 4px rise</p>
            <div className="cd-menu-wrap">
              <button className="cd-btn" onClick={() => setMenuOpen((o) => !o)}>
                Card actions
                <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                  <path d="m19.75 8.75-7.25 7-7.25-7" stroke="currentColor" strokeWidth="1.25" />
                </svg>
              </button>
              <div className={`cd-menu${menuOpen ? " is-open" : ""}`} role="menu">
                {["Edit card", "Move to deck", "Reset schedule", "Archive"].map((i) => (
                  <button key={i} role="menuitem">
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="cd-demo">
            <p className="cd-label">Reveal · staggered 60ms, Sana&apos;s curve</p>
            <button
              className="cd-btn"
              onClick={(e) => {
                const list = e.currentTarget.nextElementSibling as HTMLElement;
                list.classList.remove("is-in");
                void list.offsetWidth; // force reflow so the animation restarts
                list.classList.add("is-in");
              }}
            >
              Play
            </button>
            <div className="cd-reveal is-in">
              {["Definition", "Mechanism", "Comparison", "Self-test"].map((r, i) => (
                <span key={r} style={{ animationDelay: `${i * 60}ms` }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
