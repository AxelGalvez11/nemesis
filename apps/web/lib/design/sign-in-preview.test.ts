import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── The sign-in preview, built on sana.ai/login's measured anatomy ────────────────────────────
//
// Canonical source: the teardown of 2026-09-08 (/research/design-references/sana/).
// Owner, 2026-09-09: "figma leads, use sana where it doesn't fight" and "for the sign in, make
// sure it looks like the sana sign in because that one had a nice, cool animation."
//
// 🔴🔴 THE VERTICAL RHYTHM IS THE THING THAT BREAKS SILENTLY. Every gap below the headline is
// measured from a two-line, 95.2px h1. Lengthen either line past the 381px column and it wraps to
// three, every row below shifts down by exactly 47.6px, and the page still looks fine in a
// screenshot while matching nothing. That happened on the first pass with "Your academic
// workspace" (396.6px in a 381px column) and it is the reason this file exists.

const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const css = strip(readFileSync(new URL("../../app/dev-preview/sign-in/sana-signin.css", import.meta.url), "utf8"));
const page = strip(readFileSync(new URL("../../app/dev-preview/sign-in/page.tsx", import.meta.url), "utf8"));

test("🔴🔴 the headline copy still fits the 381px column on two lines", () => {
  // Measured in the real h1, in Inter Variable at 34/500, against the 381px column:
  //   "Welcome to Nemesis"       319.0px   fits
  //   "Your learning workspace"  370.4px   fits, 10.6px of headroom
  //   "Your academic workspace"  396.6px   WRAPS — the first draft, and the bug
  // A canvas measureText in a blank document reports these ~11% narrow because it does not use
  // the page's Inter Variable optical-size cut. Measure inside the element or not at all.
  assert.ok(page.includes("Welcome to Nemesis"), "the first headline line changed: re-measure it in the page");
  assert.ok(
    page.includes("Your learning workspace"),
    "the second headline line changed: re-measure it in the page before trusting the rhythm below",
  );
  // The specific string that broke it, so the exact regression cannot come back unnoticed.
  assert.ok(!page.includes("Your academic workspace"), "'Your academic workspace' is 396.6px and wraps the h1 to three lines");
});

test("🔴🔴 the measured vertical rhythm is intact, gap by gap", () => {
  // h1 ends 315.8 → 24 → lead → 30 → SSO → 10 → "or" → 12 → field → 8 → submit → 22 → legal.
  // Irregular on purpose: the gaps tighten as you approach the action.
  assert.match(css, /\.sig-form\s*\{[^}]*top:\s*220\.6px/, "the form column moved off its measured origin");
  assert.match(css, /\.sig-lead\s*\{[^}]*margin:\s*24px 0 0/, "the 24px gap under the headline changed");
  assert.match(css, /\.sig-sso\s*\{[^}]*margin-top:\s*30px/, "the 30px gap above the SSO button changed");
  assert.match(css, /\.sig-or\s*\{[^}]*margin-top:\s*10px/, "the 10px gap above 'or' changed");
  assert.match(css, /\.sig-field\s*\{[^}]*margin-top:\s*12px/, "the 12px gap above the field changed");
  assert.match(css, /\.sig-submit\s*\{[^}]*margin-top:\s*8px/, "the 8px gap above the submit changed");
  assert.match(css, /\.sig-legal\s*\{[^}]*margin:\s*22px 0 0/, "the 22px gap above the legal block changed");
});

test("🔴 the column and the panel keep their measured boxes", () => {
  assert.match(css, /--sig-col:\s*381px/, "the form column is no longer 381px");
  assert.match(css, /--sig-col-x:\s*182px/, "the form column moved horizontally");
  // Measured: 706.3x720 at x671.7,y118, radius 18, on its own near-black.
  assert.match(css, /\.sig-panel\s*\{[^}]*width:\s*706\.3px/);
  assert.match(css, /\.sig-panel\s*\{[^}]*height:\s*720px/);
  assert.match(css, /\.sig-panel\s*\{[^}]*border-radius:\s*18px/);
  assert.match(css, /--sig-panel:\s*rgb\(23,\s*24,\s*26\)/);

  // 🔴 THE ART IS BIGGER THAN THE FRAME AND OFFSET NEGATIVELY, ON PURPOSE. Measured 731.9x751.1
  // at -12.8/-15.5 so it bleeds past every edge and the panel crops it. Art sized to fit reads as
  // a framed screenshot; art that runs off the edges reads as a window onto something bigger.
  assert.match(css, /\.sig-panel-art\s*\{[^}]*left:\s*-12\.8px/, "the art stopped bleeding past the left edge");
  assert.match(css, /\.sig-panel-art\s*\{[^}]*top:\s*-15\.5px/, "the art stopped bleeding past the top edge");
  assert.match(css, /\.sig-panel-art\s*\{[^}]*width:\s*731\.9px/);
  assert.match(css, /\.sig-panel-art\s*\{[^}]*height:\s*751\.1px/);
});

test("🔴🔴 Sana's motion is here, and it is the only place it is allowed", () => {
  // Measured on sanalabs.com: one easing used 31 times, plus a real spring baked into a linear()
  // curve with 19 stops that overshoots to 1.263 before settling. This is the animation the owner
  // chose the page for. The landing page must NOT have it — figma.com has no spring anywhere —
  // and landing.test.ts asserts its absence there.
  assert.match(css, /--sig-ease:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/, "Sana's signature easing is gone");
  assert.match(css, /--sig-spring:\s*linear\(0 0%/, "the spring curve is gone");
  assert.match(css, /1\.263/, "the spring stopped overshooting, which is its whole character");
  assert.match(css, /--sig-dur:\s*0\.3s/, "the measured 0.3s duration changed");
  // The staggered arrival, which is our read of their wordFadeIn.
  assert.match(css, /@keyframes sig-rise/, "the arrival animation is gone");
  assert.match(css, /prefers-reduced-motion/, "reduced motion is not honoured");
});

test("🔴 hierarchy is colour, not scale: both headline lines are the same size and weight", () => {
  // Measured: 34/500 on both lines, the second dimmed to 60%. Sana and Figma disagree about
  // almost everything else and agree about this, which is why it survives into our system.
  assert.match(css, /\.sig h1\s*\{[^}]*font-size:\s*34px/);
  assert.match(css, /\.sig h1\s*\{[^}]*font-weight:\s*500/);
  assert.match(css, /\.sig h1\s*\{[^}]*line-height:\s*47\.6px/);
  assert.match(css, /\.sig h1 span\s*\{\s*color:\s*var\(--sig-ink-60\)/, "the second line stopped being the dimmed variant");
  // No second, smaller size sneaking in for the subtitle.
  assert.ok(!/\.sig h1 span\s*\{[^}]*font-size/.test(css), "the second headline line was given its own size");
});

test("🔴 neutrals are alpha over one ink, as all three references build them", () => {
  for (const step of ["--sig-ink-60", "--sig-ink-40", "--sig-ink-25", "--sig-ink-08", "--sig-ink-04"]) {
    assert.ok(css.includes(step), `the ink ramp lost ${step}`);
  }
  // A hex grey palette creeping back in is the regression this catches.
  assert.ok(!/#(?:[89ab]{2}|[cd]{2})[0-9a-f]{4}\b/i.test(css.replace(/--sig-paper[^;]*;/g, "")), "a flat grey hex appeared");
});

test("🔴 the preview stays a preview: it does not authenticate anything", () => {
  // 🔴 /sign-in is a live page people sign in through. This route exists so the SHAPE can be
  // judged first. If it ever gains real auth it stops being a preview and has to move.
  for (const forbidden of ["supabase", "signInWith", "AuthProvider", "useAuth"]) {
    assert.ok(!page.includes(forbidden), `the preview started doing real auth (${forbidden}): it must stay presentational`);
  }
});
