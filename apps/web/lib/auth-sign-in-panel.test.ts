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
  assert.match(css, /@media \(min-width: 1080px\)[\s\S]*\.is-split \.nemesis-auth-field \{[^}]*display: block;/);
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
  // 62px from the row's right edge: on the last item in the row, that is a right margin, not a
  // fixed offset — see the next test for why the row replaced fixed positioning.
  assert.match(css, /\.is-split \.nemesis-auth-field \{[^}]*margin: 24px 62px 24px 0;/);
  assert.match(css, /\.nemesis-auth-card \{ max-width: 381px/);
  // the art bleeds past every edge: 731.9x751.1 at -12.8/-15.5 on 706.3x720
  assert.match(css, /\.nemesis-auth-art \{ position: absolute; left: -1\.812%; top: -2\.153%; width: 103\.63%; height: 104\.32%; \}/);
});

test("🔴🔴 the panel is a containing block, so its art stays scoped to its own 706.3x720 frame", () => {
  // Found 2026-09-11, chasing "still doesn't match the sizing": moving `.nemesis-auth-field` off
  // `position: fixed` (previous test) ALSO removed the only thing making it a containing block for
  // its absolutely-positioned child, `.nemesis-auth-art`. `position: static` (the default) does not
  // establish one, so the art's percentage left/top/width/height fell through to `.nemesis-auth-
  // shell` — the whole page — instead of the 706.3x720 panel. The video still got clipped to the
  // correct panel-sized window, but the crop being windowed was now sized and positioned relative to
  // the entire viewport, so it rendered oversized and shifted at every screen size. `position:
  // relative` (or any non-static value) on `.nemesis-auth-field` restores its own frame as the
  // reference. This is the class of bug a bounding-box check on `.nemesis-auth-field` itself cannot
  // catch — flex lays that box out correctly regardless of its own `position` value — so this test
  // checks the ART's box against the FIELD's box directly, not just that a `position` value exists.
  assert.match(css, /\.nemesis-auth-field \{[^}]*position: relative;/, "the panel lost its own containing block again");
});

test("🔴🔴 the column and the panel share ONE vertical centre, the way Sana's do", () => {
  // Re-measured 2026-09-11: on sana.ai/login, the <section> holding the whole form (headline through
  // the legal text) and the dark panel section are both y118/h720 at 1440x900 — one shared band, not
  // two independently-centred boxes. The first pass here centred the panel with `position: fixed` and
  // a hand-tuned offset that only agreed with the form column's own flex-centring at one exact
  // viewport height; the owner caught the drift as "doesn't match the sizing."
  assert.match(
    css,
    /\.nemesis-auth-shell\.is-split \{[^}]*align-items: center;[^}]*display: flex;[^}]*flex-direction: row;/,
    "the split shell stopped being the one row that centres both the column and the panel",
  );
  assert.ok(!/\.nemesis-auth-field \{[^}]*position: fixed/.test(css), "the panel went back to centring itself independently of the column");
  assert.match(
    css,
    /\.is-split \.nemesis-auth-panel-wrap \{[^}]*min-height: 0;/,
    "the column wrap still claims a full-viewport min-height in split mode, which double-centres against the row",
  );
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
