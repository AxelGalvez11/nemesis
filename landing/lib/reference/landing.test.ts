import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// ── The reference landing page ────────────────────────────────────────────────────────────────
//
// Canonical source: /research/design-references/LANDING_PATTERNS.md.
//
// 🔴🔴 THE WHOLE POINT OF THIS PAGE IS WHAT IT DOES NOT HAVE. Swept with animation forced off,
// figma.com carries exactly ONE gradient on its entire page (a conic starburst in brand blue) and
// x.ai/bot carries TWO, neither decorative: a fade-to-ground scrim and a dot lattice. Their modern
// quality comes from a rigid section rhythm on one ground, headline type at line-height 1.0 with
// negative tracking at weight 400 to 500, and shadows at 10% or less.
//
// A gradient wash added here later would feel like an improvement and would move the page AWAY from
// both references. That is exactly the kind of drift a guard exists to stop.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const css = strip(readFileSync(new URL("../../app/preview/reference.css", import.meta.url), "utf8"));
const page = strip(readFileSync(new URL("../../app/preview/page.tsx", import.meta.url), "utf8"));
const frame = strip(readFileSync(new URL("../../components/reference/ProductFrame.tsx", import.meta.url), "utf8"));

describe("the reference landing page", () => {
  it("🔴🔴 ships no decorative gradient", () => {
    expect(css).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
    expect(page).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
  });

  it("🔴 keeps the measured hero type: line-height 1, weight 500, negative tracking", () => {
    // x.ai/bot measured 60/500/lh 60/-1.2px; figma.com 56/400/lh 56/-1.25px. Neither is bold, and
    // both set the headline solid. Presence comes from size and tightness, never weight.
    expect(css).toMatch(/\.ref-h1\s*\{[^}]*line-height:\s*1;/);
    expect(css).toMatch(/\.ref-h1\s*\{[^}]*font-weight:\s*500;/);
    expect(css).toMatch(/\.ref-h1\s*\{[^}]*letter-spacing:\s*-0\.02em;/);
    // 🔴 THE NARROW MEASURE IS THE COMPOSITIONAL TRICK. Figma sets its 56px headline in a 336px
    // column so it WRAPS. A headline that fills the viewport reads as a template.
    expect(css).toMatch(/\.ref-h1\s*\{[^}]*max-width:\s*var\(--ref-hero-measure\)/);
  });

  it("🔴 keeps one ground and the section rhythm as the only separator", () => {
    // Figma: 8 sections, every one `padding: 80px 0`, every one on the same white. No bands.
    expect(css).toMatch(/--ref-section-y:\s*80px/);
    expect(css).toMatch(/\.ref-section\s*\{\s*padding-block:\s*var\(--ref-section-y\)/);
    expect(css).not.toMatch(/\.ref-section[^{]*\{[^}]*background:/);
  });

  it("🔴 keeps shadows faint and the reading measure at 672", () => {
    // Measured: 10% on x.ai's hero frame, 2.5% on its cards. Nothing heavier anywhere.
    expect(css).toMatch(/--ref-frame-shadow:[^;]*0\.10\)/);
    expect(css).toMatch(/--ref-card-shadow:[^;]*0\.025\)/);
    expect(css).not.toMatch(/0 1px 2px/);
    // 672px recurs at x.ai and Figma, and is the app's reading column too.
    expect(css).toMatch(/--ref-measure:\s*672px/);
  });

  it("🔴🔴 the product frame holds the real session, not a marketing section", () => {
    // The first build wrapped `CanvasShowcase`, which is a whole landing SECTION with its own
    // heading and padding. That nested a section inside a window: a marketing headline appeared
    // INSIDE the app screenshot and ~270px of dead space opened above and below the canvas.
    expect(frame).toMatch(/SessionCanvas/);
    expect(frame).not.toMatch(/CanvasShowcase/);
    expect(page).not.toMatch(/CanvasShowcase/);
    // 🔴 THE RATIO IS DERIVED FROM THE ARTWORK (2.29:1), NOT COPIED FROM x.ai (1.48:1). Imposing
    // their ratio on our content is what letterboxes every scene into the middle of the frame.
    expect(css).toMatch(/aspect-ratio:\s*2\.29/);
    // It pauses off screen rather than burning a rAF loop on a frame nobody is looking at.
    expect(frame).toMatch(/IntersectionObserver/);
    expect(frame).toMatch(/prefers-reduced-motion/);
  });

  it("🔴 the character scales on a phone", () => {
    // `Mascot` takes a pixel size at render, so a 300px character stayed 300px on a 390px viewport:
    // 77% of the screen width, measured. CSS owns the responsive behaviour.
    expect(css).toMatch(/@media \(max-width: 600px\)[\s\S]*?\.ref-hero-character svg\s*\{\s*width:\s*180px/);
  });
});
