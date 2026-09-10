import { existsSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

// ── The landing page, built on figma.com's measured skeleton ──────────────────────────────────
//
// Canonical source: /research/design-references/figma/DESIGN_ANALYSIS.md and the teardown of
// 2026-09-08. Owner, 2026-09-09: "figma leads, use sana where it doesn't fight."
//
// 🔴🔴 WHAT THIS FILE DEFENDS IS THE PAGE'S RESTRAINT, WHICH IS ALSO ITS MOST FRAGILE PROPERTY.
// figma.com carries exactly ONE gradient across 8,973px and runs all ten of its sections on one
// flat white with a uniform 80px of padding. Every instinct on a marketing page pushes the other
// way: a wash behind the headline, a tinted band to "break up" the page, a heavier weight to make
// the h1 "pop". Each of those feels like an improvement in isolation and each moves the page
// toward the generic AI-SaaS look and away from the reference. That drift is what these guards
// exist to catch.
//
// 🔴 COLOUR NOW COMES FROM RENDERED IMAGES, NOT CSS. The frames first held CSS mesh gradients; the
// owner rejected five procedural attempts and approved six rendered gradient images on 2026-09-10
// (research/design-references/GRADIENT_RECIPE.md). So the page and its stylesheet carry NO CSS
// gradient at all, and every frame points at an approved file that actually exists.

const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const url = (p: string) => new URL(p, import.meta.url);
const css = stripComments(readFileSync(url("../../app/preview/reference.css"), "utf8"));
const page = stripComments(readFileSync(url("../../app/preview/page.tsx"), "utf8"));

describe("the landing page follows figma.com's measured skeleton", () => {
  it("🔴🔴 carries no CSS gradient: colour comes from the approved rendered images", () => {
    // A wash behind a headline is the clearest signature of a generated landing page, and every CSS
    // mesh tried here was rejected. Neither the markup nor the stylesheet may paint one.
    expect(page).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
    expect(css).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);

    // Every frame names an approved image, and the file is really there. A typo would render an
    // empty frame that no screenshot at a glance would catch.
    const names = [...page.matchAll(/<Art name="([a-z]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(9);
    for (const name of new Set(names)) {
      const file = url(`../../public/gradients/${name}.webp`);
      expect(existsSync(file), `missing gradient image: ${name}.webp`).toBe(true);
      // ~15KB each when approved. Something ten times that means an unoptimised export slipped in.
      expect(statSync(file).size, `${name}.webp is too heavy for a landing page`).toBeLessThan(60_000);
    }
  });

  it("🔴🔴 keeps ONE page ground: no bands, no alternating sections", () => {
    // Measured: all ten figma.com sections are rgb(255,255,255). Sana alternates white with a
    // sand band at rgb(246,245,244) — this is the first place the two references disagree, and
    // Figma leads, so a second ground here is a regression and not a refinement.
    expect(css).toMatch(/\.ref-section\s*\{[^}]*background:\s*var\(--ref-paper\)/);
    expect(css).not.toMatch(/246,\s*245,\s*244/);
    expect(css).not.toMatch(/--ref-sand|\.ref-band/);
  });

  it("🔴🔴 keeps the hero headline at weight 400 in its narrow measure", () => {
    // Measured on figma.com: 56 / 400 / line-height 56 (exactly 1.0) / -1.25px, set in a 328px
    // column so it wraps to four short lines.
    expect(css).toMatch(/\.ref-h1\s*\{[^}]*font-size:\s*56px/);
    expect(css).toMatch(/\.ref-h1\s*\{[^}]*font-weight:\s*400/);
    expect(css).toMatch(/\.ref-h1\s*\{[^}]*line-height:\s*56px/);
    expect(css).toMatch(/\.ref-h1\s*\{[^}]*letter-spacing:\s*-1\.25px/);
    expect(css).toMatch(/--ref-hero-measure:\s*328px/);

    // 🔴 450 IS THE SPECIFIC REGRESSION. The first pass assumed Inter would render thinner than
    // their proprietary figmaSans and bumped display type to 450. Measuring ink coverage on
    // identical crops disproved it — Inter 400 is 16.57% against their 16.04% — and 450 also
    // pushes the headline to five lines, which destroys the four-line stack the 328px column
    // exists to create.
    expect(css).not.toMatch(/\.ref-h1\s*\{[^}]*font-weight:\s*4[2-9]\d/);
    expect(css).not.toMatch(/\.ref-h(1|2)\s*\{[^}]*font-weight:\s*[5-9]\d\d/);
  });

  it("🔴 keeps the measured section rhythm and container", () => {
    expect(css).toMatch(/--ref-well:\s*1360px/);
    expect(css).toMatch(/--ref-gutter:\s*40px/);
    expect(css).toMatch(/--ref-section-y:\s*80px/);
    // The footer runs its own wider gutter — measured 60px, not 40.
    expect(css).toMatch(/--ref-footer-gutter:\s*60px/);
    // Measured centred heading column.
    expect(css).toMatch(/--ref-measure:\s*901\.3px/);
  });

  it("🔴 keeps the three-column hero, which is the part nobody copies", () => {
    // Measured: hero 860 tall, art 581x700 at x429.5, and the primary action as a 224x84 SLAB at
    // x1124 rather than a pill in a row under the paragraph. Collapse any one of these and the
    // fold becomes an ordinary centred hero.
    expect(css).toMatch(/\.ref-hero\s*\{[^}]*height:\s*860px/);
    expect(css).toMatch(/\.ref-hero-art\s*\{[^}]*width:\s*581px/);
    expect(css).toMatch(/\.ref-hero-art\s*\{[^}]*height:\s*700px/);
    expect(css).toMatch(/\.ref-hero-cta\s*\{[^}]*width:\s*224px/);
    expect(css).toMatch(/\.ref-hero-cta\s*\{[^}]*height:\s*84px/);
  });

  it("🔴 keeps the breakpoint OFF the reference width", () => {
    // `max-width` is inclusive, so a 1440px breakpoint fires AT the viewport being matched and
    // collapses the very layout under test. This cost a full render cycle to find once already.
    expect(css).toMatch(/max-width:\s*1439\.98px/);
    expect(css).not.toMatch(/max-width:\s*1440px/);
  });

  it("🔴 keeps Figma's motion vocabulary and adds none of Sana's", () => {
    // Measured: their whole page is 0.18s ease-out with 0.15s for fades. No springs, no reveals,
    // no stagger. Sana's spring and 2s word reveals belong to the sign-in, not here.
    expect(css).toMatch(/--ref-dur:\s*0\.18s/);
    expect(css).toMatch(/--ref-dur-fast:\s*0\.15s/);
    expect(css).toMatch(/--ref-ease:\s*ease-out/);
    expect(css).not.toMatch(/cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    expect(css).not.toMatch(/linear\(0 0%/);
    // Reduced motion is honoured.
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  it("🔴 the art frame fills its slot without outranking a stated size", () => {
    // 🔴 width/height 100% are load-bearing: a missing height once collapsed the 581x700 hero slot to
    // 361px. And they must sit in :where(), which has zero specificity, or they outrank the 48px
    // byline avatar and the 348x433 strip card — the avatar once rendered 833px wide.
    expect(css).toMatch(/:where\(\.ref-art\)\s*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/:where\(\.ref-art\)\s*\{[^}]*height:\s*100%/);
    expect(css).not.toMatch(/^\.ref-art\s*\{[^}]*width:\s*100%/m);
    expect(css).toMatch(/\.ref-art-img\s*\{[^}]*object-fit:\s*cover/);
  });

  it("🔴 the header's layout lives in CSS, so the phone breakpoint can reach it", () => {
    // 🔴 An inline `display: flex` beats any stylesheet rule regardless of specificity. The nav
    // carried one, so `@media (max-width: 720px)` could not hide it and the header ran 28px off
    // a 390px screen while every wider viewport and every other guard stayed green.
    expect(page).not.toMatch(/<nav style=/);
    expect(css).toMatch(/\.ref-nav-links\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.ref-nav-actions\s*\{[^}]*margin-left:\s*auto/);
    expect(css).toMatch(/max-width:\s*720px/);
  });

  it("🔴 the media strip keeps the measured card size and gutter", () => {
    expect(css).toMatch(/\.ref-strip\s*>\s*\*\s*\{[^}]*width:\s*348px/);
    expect(css).toMatch(/\.ref-strip\s*>\s*\*\s*\{[^}]*height:\s*433px/);
    expect(css).toMatch(/\.ref-strip\s*\{[^}]*gap:\s*16px/);
  });
});
