// The deck drawn as itself: what may reach the page, and what happens when it cannot be drawn.
//
// 🔴🔴 THE OWNER OVERRULED AN ARCHITECTURE CALL HERE AND WAS RIGHT. I told him on 2026-09-04 that a
// true PowerPoint preview needed a conversion service, and he pushed back: *"there has to be a way
// to do it without any other dependency, right? Like it's just some slides. Come on."* A slide is
// shapes with coordinates and text runs, and so is SVG; converting one to the other is arithmetic
// that runs in the browser. Measured on his own 55-slide lecture: 337 ms, 399 of 407 elements.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DOMParser } from "linkedom";

// 🔴 A REAL DOM, SO THE SANITISER IS EXERCISED RATHER THAN READ. The suite is plain node:test with
// no browser; `safeSlideSvg` reads `DOMParser` at call time, so handing it one here runs the actual
// code path the browser runs. Without this the security guards below could only assert on source
// text, which is the weaker thing this repo has been caught doing before.
(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;

import { safeSlideSvg } from "@/lib/reader/pptx-render";

const RENDER = readFileSync(new URL("./pptx-render.ts", import.meta.url), "utf8");
const VIEW = readFileSync(new URL("../../components/workspace/reader/slides-document-view.tsx", import.meta.url), "utf8");

test("🔴🔴 a slide that cannot be drawn falls back to the reconstruction, never to nothing", () => {
  // The rule `mermaid-diagram.tsx` set and this follows: a drawing that cannot be made costs only
  // itself. A deck the renderer cannot open must still open, because the learner dropped it to read
  // it, and `pptx-slides.ts` can already show them its text.
  assert.match(RENDER, /: Promise<string\[\] \| null>/, "the renderer stopped being allowed to say no");
  assert.match(RENDER, /catch \{\s*return null;/, "a throw escapes the renderer and takes the deck with it");
  assert.match(VIEW, /\{drawn \? \(/, "the view no longer prefers the real slide");
  assert.match(VIEW, /\) : placed \? \(/, "the reconstruction is no longer the fallback");
});

test("🔴🔴 the disclaimer is only shown over a REBUILT slide", () => {
  // "Anything the author drew is not here" over a drawing that HAS what the author drew is worse
  // than saying nothing at all.
  assert.match(VIEW, /\{!bare && !drawn && <Disclaimer \/>\}/, "the deck explains itself away over a real slide");
});

test("🔴 the parse and the picture are independent, so a slow parse never holds back the drawing", () => {
  // Two readings of one file: `pptx-slides.ts` for what it MEANS (outline, notes, the units a
  // comment pins to, the text an answer is grounded in), this for what it LOOKS like.
  assert.match(RENDER, /renderDeckSvgs/, "the render entry point is gone");
  assert.ok(!/^import .*pptx-slides/m.test(RENDER), "the renderer now depends on the parse");
});

test("🔴 the library is loaded on first use, never in the bundle", () => {
  // 270 KB gzipped, and most sessions open no deck at all. Mermaid's treatment, for mermaid's
  // reason, and the promise is shared so ten decks initialise once.
  assert.match(RENDER, /engine \?\?= import\("pptx-glimpse"\)/, "the deck renderer is imported eagerly");
  assert.ok(!/^import .*pptx-glimpse/m.test(RENDER), "the library is a static import again");
});

// ── What may reach the page ──────────────────────────────────────────────────

test("🔴🔴 a script inside a deck never reaches the page", () => {
  const out = safeSlideSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>');
  assert.ok(out && !out.includes("script"), "a script survived the sanitiser");
  assert.ok(out.includes("rect"), "the slide's own shapes were thrown away with it");
});

test("🔴🔴 an off-site picture inside a deck never fetches", () => {
  // An `<image href="https://…">` would fetch on render, which turns opening a lecture into telling
  // someone else that you opened it. `data:` and a local `#id` are the only two allowed.
  const out = safeSlideSvg('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracker.example/x.png"/><image href="data:image/png;base64,AAAA"/></svg>');
  assert.ok(out && !out.includes("tracker.example"), "an external URL survived");
  assert.ok(out.includes("data:image/png"), "the deck's own embedded picture was dropped");
});

test("🔴 an event handler attribute is stripped", () => {
  const out = safeSlideSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" width="10" height="10"/></svg>');
  assert.ok(out && !/onload/i.test(out), "an on* handler survived");
});

test("🔴 the slide is sized by the card, not by the file", () => {
  const out = safeSlideSvg('<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="2250" viewBox="0 0 1280 720"><rect width="10" height="10"/></svg>');
  assert.ok(out?.includes('width="100%"'), "a deck can still push the column out to its own width");
  assert.ok(out?.includes('viewBox="0 0 1280 720"'), "the viewBox was lost, so the slide will not scale");
});

test("🔴 markup that is not an SVG at all is refused rather than injected", () => {
  assert.equal(safeSlideSvg("<html><body>not a slide</body></html>"), null);
  assert.equal(safeSlideSvg("total nonsense <<<"), null);
});
