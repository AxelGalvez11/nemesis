import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── The app's pricing page, in the marketing site's pricing design (owner, 2026-09-11) ────────────────────
//
// "make the pricing page follow the new design style". "Get Nemesis" on www.enternemesis.com/pricing lands here in
// one hop, so this page and that one share sana.ai's pricing panel, the site's typeface and its wording rules.

const source = readFileSync(new URL("../app/pricing/page.tsx", import.meta.url), "utf8");
const css = source.slice(source.indexOf("const PRICING_CSS = `") + "const PRICING_CSS = `".length, source.lastIndexOf("`;"));
const jsx = source.slice(0, source.indexOf("const PRICING_CSS = `")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

test("🔴🔴 the page wears the marketing site's face and pricing panel", () => {
  assert.match(source, /const pricingSans = Inter\(\{[\s\S]*?axes: \["opsz"\]/, "the site is set in Inter; a different face across the hop reads as another product");
  assert.ok(!/Hanken_Grotesk/.test(source));
  assert.match(css, /\.nm-panel \{[^}]*padding:42px 48px; border-radius:40px;/);
  assert.match(css, /\.nm-card \{[^}]*padding:24px 28px; border-radius:28px;/);
  assert.match(css, /\.nm-toggle \{[^}]*height:48px;/);
});

test("🔴🔴 the yearly figure never appears without the real charge", () => {
  // $16.67 is $199.99 over twelve months and nobody is charged it.
  assert.match(jsx, /\{selected\.monthlyEquivalent\}\/month/);
  assert.match(jsx, /<p className="nm-card-tagline">\{selected\.billedAs\}<\/p>/);
});

test("🔴 the stylesheet holds no backtick, and the copy no em dash", () => {
  // The CSS lives in a template literal: one backtick inside it ends the string and the build breaks.
  assert.ok(!css.includes("`"));
  assert.ok(!jsx.includes("—"), "an em dash is on the page");
});
