import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

// ── The sign-in: Sana's anatomy, with a rendered laptop in the panel ────────────────────────────────
//
// Owner, 2026-09-10: "look exactly like Sana ... with the moving computer", "make it live", and of
// Adobe's Student Spaces workspace, "i love this design", which is what the laptop's screen shows.
// The film is ~/Desktop/nemesis-signin (HyperFrames), rendered at 60fps and cut into an intro, a loop
// and a still. These guards hold what a screenshot of one moment cannot: the files, their weight, that
// phones never download them, and the measured boxes the page is built on.

const url = (p: string) => new URL(p, import.meta.url);
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p: string) => strip(readFileSync(url(p), "utf8"));

const css = read("../app/styles/auth.css");
const frame = read("../components/AuthFrame.tsx");
const laptop = read("../components/AuthLaptop.tsx");
const signIn = read("../app/sign-in/page.tsx");
const signUp = read("../app/sign-up/page.tsx");

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

test("🔴🔴 a phone never downloads the laptop", () => {
  // The panel is hidden below 1080px, and 4MB of video nobody can see is a real cost on a data plan.
  // The component must not render a <video> until the same query matches, and the query must be the
  // one auth.css uses to show the panel.
  assert.match(laptop, /LAPTOP_PANEL_QUERY = "\(min-width: 1080px\)"/);
  assert.match(css, /@media \(min-width: 1080px\)[\s\S]*\.is-split \.nemesis-auth-field \{ display: block; \}/);
  assert.match(laptop, /if \(!shown\) return/, "AuthLaptop renders its media before checking the panel is visible");
  assert.match(laptop, /prefers-reduced-motion: reduce/, "reduced motion no longer gets the still");
});

test("🔴 only the split pages carry the laptop; the hand-off pages stay minimal", () => {
  assert.match(frame, /minimal \? null : \(\s*<section className="nemesis-auth-field" aria-hidden="true">\s*<AuthLaptop \/>/);
});

test("🔴 the panel and the column keep Sana's measured boxes", () => {
  assert.match(css, /aspect-ratio: 706\.3 \/ 720/);
  assert.match(css, /--auth-panel-w: min\(706\.3px/);
  assert.match(css, /background: rgb\(23, 24, 26\)/);
  assert.match(css, /\.nemesis-auth-field \{[^}]*border-radius: 18px/);
  assert.match(css, /right: calc\(var\(--auth-edge, 0px\) \+ 62px\)/);
  assert.match(css, /\.nemesis-auth-card \{ max-width: 381px/);
  // the art bleeds past every edge: 731.9x751.1 at -12.8/-15.5 on 706.3x720
  assert.match(css, /\.nemesis-auth-art \{ position: absolute; left: -1\.812%; top: -2\.153%; width: 103\.63%; height: 104\.32%; \}/);
});

test("🔴 the headline is two lines of one size, the second dimmed, and both still fit", () => {
  assert.match(css, /\.nemesis-auth-card-in h1 \{[^}]*font-size: 34px;[^}]*font-weight: 500;[^}]*line-height: 47\.6px/);
  assert.match(css, /\.nemesis-auth-card-in h1 span \{ color: var\(--auth-muted\); \}/);
  // Measured in Inter at 34/500 against the 381px column: 319px and 370.4px. "Your academic workspace"
  // (396.6px) is the line that wrapped on the first pass.
  assert.ok(signIn.includes('title="Welcome to Nemesis"') && signIn.includes('subtitle="Your learning workspace"'));
  assert.ok(signUp.includes('subtitle="Your learning workspace"'));
  assert.ok(!`${signIn}${signUp}`.includes("Your academic workspace"));
});

test("no em dashes in the sign-in copy", () => {
  for (const [name, src] of [["sign-in", signIn], ["sign-up", signUp], ["AuthFrame", frame]] as const) {
    assert.ok(!src.includes("—"), `${name} carries an em dash`);
  }
});
