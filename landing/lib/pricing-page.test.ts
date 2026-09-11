import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// ── The pricing page, in the homepage's system (owner, 2026-09-11) ──────────────────────────────────────
//
// "make the pricing page follow the new design style". The page used to wear the previous site's chrome one hop
// from a homepage that no longer looked like it. These guards hold what a screenshot cannot: that it keeps the
// homepage's chrome and light-only theme, that no price is typed into the page (the figures live in lib/pricing,
// which pricing.test.ts ties to the app's), and that its classes cannot collide with the old globals.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const page = strip(read("../app/pricing/page.tsx"));
const plans = strip(read("../components/PricingPlans.tsx"));
const css = read("../app/pricing/pricing.css");

describe("the pricing page", () => {
  it("🔴🔴 wears the homepage's chrome, type and light theme, not the old site's", () => {
    expect(page).toMatch(/import "\.\.\/home-sana\.css";/);
    expect(page).toMatch(/<SnHeader \/>/);
    expect(page).toMatch(/<SnFoot \/>/);
    expect(page).toMatch(/<div className="sn">/);
    expect(page).not.toMatch(/<SiteChrome|PageGlow|className="section/);
  });

  it("🔴🔴 never types a price: every figure comes from lib/pricing", () => {
    expect(plans).not.toMatch(/\$\d/);
    expect(plans).toMatch(/selected\.perMonth/);
    expect(plans).toMatch(/selected\.billedAs/);
  });

  it("🔴 the plan panel keeps sana.ai's measured anatomy", () => {
    expect(css).toMatch(/\.pr-panel \{[^}]*border-radius: 40px;[^}]*padding: 42px 48px;/);
    expect(css).toMatch(/\.pr-card \{[^}]*border-radius: 28px;[^}]*padding: 24px 28px;/);
    expect(css).toMatch(/\.pr-toggle \{[^}]*height: 48px;/);
    expect(css).toMatch(/\.pr-list li \{[^}]*padding: 10px 0 11px;/);
  });

  it("🔴 every class is prefixed, so nothing collides with the old site's globals", () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...bare.matchAll(/(?:^|[{}])\s*([^{}@]+?)\s*\{/g)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) {
      for (const part of selector.split(",")) expect(part.trim(), `unprefixed selector: ${part.trim()}`).toMatch(/^\.pr-/);
    }
  });

  it("no em dashes and no 'months free'", () => {
    for (const src of [page, plans]) {
      expect(src).not.toMatch(/—/);
      expect(src.toLowerCase()).not.toContain("months free");
    }
  });
});
