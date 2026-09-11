import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

// ── The sign-in: sana.ai/sign-in-to-sana, one for one ──────────────────────────────────────────────────
//
// Owner, 2026-09-10: "look exactly like Sana ... with the moving computer". 2026-09-11, the fourth report on
// the same page: "the spacing doesn't match like the Sana sign in one for one". The first three passes
// matched Sana's boxes at 1440x900 and drifted at every other window size, and kept five rows Sana's first
// screen does not have. These guards hold the RULES read off Sana's stylesheet, the rows of the first
// screen, and the laptop's weight.

const url = (p: string) => new URL(p, import.meta.url);
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p: string) => strip(readFileSync(url(p), "utf8"));

const css = read("../app/styles/auth.css");
const frame = read("../components/AuthFrame.tsx");
const laptop = read("../components/AuthLaptop.tsx");
const oauth = read("../components/OAuthButtons.tsx");
const signIn = read("../app/sign-in/page.tsx");
const signUp = read("../app/sign-up/page.tsx");

/** The body of the FIRST rule written exactly as `selector {`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `auth.css has no rule for ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

test("🔴🔴 the laptop's three files exist and are light enough for a sign-in page", () => {
  const caps: [string, number][] = [
    ["laptop-intro.mp4", 1_200_000],
    ["laptop-loop.mp4", 4_000_000],
    ["laptop.webp", 250_000],
  ];
  for (const [name, cap] of caps) {
    const file = url(`../public/sign-in/${name}`);
    assert.ok(existsSync(file), `public/sign-in/${name} is missing`);
    const size = statSync(file).size;
    assert.ok(size < cap, `public/sign-in/${name} is ${size} bytes, over ${cap}: re-encode it`);
    assert.ok(laptop.includes(`/sign-in/${name}`), `AuthLaptop no longer plays ${name}`);
  }
});

test("🔴🔴 a phone never downloads the film", () => {
  // Under 821px the panel is a square above the form, as on Sana's page. It shows the resting frame there;
  // 3.5MB of video is not a cost to put on a data plan.
  assert.match(laptop, /LAPTOP_PANEL_QUERY = "\(min-width: 821px\)"/);
  assert.match(css, /@media \(min-width: 821px\) \{\s*\.nemesis-auth-main \{ flex-direction: row;/);
  const phoneBranch = laptop.indexOf("if (!shown || calm) {");
  assert.ok(phoneBranch >= 0, "AuthLaptop no longer checks the query before choosing media");
  assert.ok(laptop.indexOf("return (", phoneBranch) < laptop.indexOf("<video"), "a <video> renders before the query is checked");
  assert.match(laptop, /prefers-reduced-motion: reduce/, "reduced motion no longer gets the still");
});

test("🔴🔴 the page is built on Sana's container rules, not on boxes measured at one size", () => {
  assert.match(rule(".nemesis-auth-page"), /gap: 18px;[\s\S]*padding: 14px 20px 20px;/);
  assert.match(css, /@media \(min-width: 451px\) \{\s*\.nemesis-auth-page \{ gap: 28px; padding: 22px 32px 32px; \}/);
  assert.match(
    css,
    /@media \(min-width: 1400px\) and \(min-height: 850px\) \{\s*\.is-split \.nemesis-auth-page \{ gap: 52px; margin-left: 8\.33333%; padding: 22px 62px 62px; \}/,
  );
  assert.match(css, /\.nemesis-auth-main \{ flex-direction: row; gap: 9\.09091%; justify-content: normal; \}/);
  assert.match(rule(".nemesis-auth-column"), /flex-basis: 31\.8182%/);
  assert.match(rule(".nemesis-auth-column"), /padding-bottom: 32px/);
  assert.match(css, /\.nemesis-auth-field \{ aspect-ratio: auto; flex-basis: 59\.0909%; max-height: none; \}/);
  assert.match(rule(".nemesis-auth-field"), /border-radius: 18px/);
  assert.match(rule(".nemesis-auth-nav"), /margin: 0 auto/);
  assert.match(css, /\.is-split \.nemesis-auth-nav \{ left: calc\(-8\.33333% \+ 34px\); \}/);
  for (const label of ["Overview", "Pricing", "Privacy and terms", "FAQ"]) {
    assert.ok(frame.includes(`["${label}"`), `the nav lost ${label}`);
  }
});

test("🔴🔴 the first screen has Sana's rows and no others", () => {
  // Sana: headline, lead, provider slot, "or", one field, one button, legal. A password field, a second
  // stacked provider button, a forgot-password line or a sign-up line under the form each add a row the
  // reference does not have.
  for (const [name, src] of [["sign-in", signIn], ["sign-up", signUp]] as const) {
    const open = src.indexOf('step === "email" ? (');
    assert.ok(open >= 0, `${name} lost its email-first step`);
    const first = src.slice(open, src.indexOf(") : (", open));
    assert.ok(!first.includes('type="password"'), `${name}'s first screen shows a password field`);
    assert.equal((first.match(/<input /g) ?? []).length, 1, `${name}'s first screen has more than one field`);
  }
  assert.match(rule(".nemesis-auth-oauth"), /margin-top: 32px/);
  assert.match(rule(".nemesis-auth-oauth-btn"), /height: 40px/);
  assert.ok(!oauth.includes("nemesis-auth-oauth-note"), "the terms line moved back inside the provider row");
  assert.match(rule(".nemesis-auth-legal"), /margin: 22px auto 0;[\s\S]*min-height: 78px/);
  assert.match(rule(".nemesis-auth-description"), /color: var\(--auth-muted\)/, "the lead is 60% ink on Sana's page");
});

test("🔴 the captcha floats, so it can never open a gap in the form", () => {
  // Measured on production 2026-09-11: 88px between "Forgot your password?" and the button, the Turnstile
  // box drawn inside the form.
  assert.match(rule(".nemesis-auth-captcha"), /position: absolute/);
  assert.match(rule(".nemesis-auth-form"), /position: relative/);
  // When it does show, it must not print through the legal line (production, the same day): the widget marks itself
  // interactive only while Cloudflare needs a click, and only then does the legal line step aside.
  const widget = read("../components/TurnstileWidget.tsx");
  assert.match(widget, /"before-interactive-callback": \(\) => containerRef\.current\?\.setAttribute\("data-interactive", "true"\)/);
  assert.match(widget, /"after-interactive-callback": \(\) => containerRef\.current\?\.removeAttribute\("data-interactive"\)/);
  assert.match(css, /\.nemesis-auth-card-in:has\(\.nemesis-auth-captcha\[data-interactive="true"\]\) \.nemesis-auth-legal \{ visibility: hidden; \}/);
});

test("🔴 only the split pages carry the nav and the panel, and the panel keeps its own frame", () => {
  assert.match(frame, /minimal \? null : \(\s*<nav/);
  assert.match(frame, /minimal \? null : \(\s*<section aria-hidden="true" className="nemesis-auth-field">\s*<AuthLaptop \/>/);
  // #1192: without a position of its own the art's percentages resolve against the whole page.
  assert.match(rule(".nemesis-auth-field"), /position: relative/);
});

test("🔴 the headline is two lines of one size, the second dimmed, and both still fit", () => {
  assert.match(rule(".nemesis-auth-card-in h1"), /font-size: 34px;[\s\S]*font-weight: 500;[\s\S]*line-height: 47\.6px/);
  assert.match(css, /\.nemesis-auth-card-in h1 span \{ color: var\(--auth-muted\); \}/);
  // Measured in this page's Inter at 34/500: "Welcome to Nemesis" 319px, "Your learning space" 296.6px. Sana's
  // pair wraps to three lines only under a 314.6px column; "Your learning workspace" (370.4px) wrapped under 371px
  // and moved every row 23.8px down at 1200 wide and on phones, and "Your academic workspace" (396.6px) was worse.
  assert.ok(signIn.includes('title="Welcome to Nemesis"') && signIn.includes('subtitle="Your learning space"'));
  assert.ok(signUp.includes('subtitle="Your learning space"'));
  assert.ok(!/Your (academic|learning) workspace/.test(`${signIn}${signUp}`));
  assert.ok(!/@media \(max-width: 480px\) \{\s*\.nemesis-auth-card-in h1/.test(css), "Sana keeps its 34px headline on phones");
});

test("no em dashes in the sign-in copy", () => {
  for (const [name, src] of [["sign-in", signIn], ["sign-up", signUp], ["AuthFrame", frame], ["OAuthButtons", oauth]] as const) {
    assert.ok(!src.includes("—"), `${name} carries an em dash`);
  }
});
