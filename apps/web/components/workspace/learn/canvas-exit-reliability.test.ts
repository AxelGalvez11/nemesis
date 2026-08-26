// "investigate exiting out of the canvas because it sometimes won't let me and make sure it has a
// smooth animation" (owner, 2026-08-26). Two separable claims, guarded here together because they
// were investigated together and both trace back to this one complaint.
//
// 🔴🔴 THE RELIABILITY HALF WAS NEVER canvas-surface.tsx. Every render branch this component
// reaches carries a working `×` — re-verified on screen against the loading branch, a busy /
// turnInFlight surface, the Sources panel open, a docked and a full-screen reader, the legacy
// `orient` shape, and a mobile viewport. The actual defect was one layer OUT: `apps/web/app` had
// no `error.tsx` anywhere, so a render exception thrown by anything inside the 2000+ line
// `learning-canvas.tsx` — over real, sometimes-irregular session data — fell all the way through
// to Next's bare handling: no `×`, no rail, nothing. Confirmed by throwing deliberately with no
// boundary present, both on the dev-preview harness and on the real `/learn` route, before this
// file existed to catch it.
//
// 🔴 SOURCE ASSERTIONS, AND THE LIMIT IS STATED RATHER THAN HIDDEN, exactly as
// `handoff-and-mascot.test.ts` states it beside this file. These catch a fix being reverted or
// weakened; they cannot catch the departure looking wrong. The animation was ALSO measured in
// real headless Chrome (`chromium.launch({ channel: "chrome" })` — the in-app Browser pane keeps
// its tab `document.hidden` and never fires an animation frame, so it cannot prove motion): on a
// real press, `<main>`'s computed opacity went 1 → 0.975 → 0.805 → 0.0004 and its scale went
// 1 → 0.9996 → 0.9971 → 0.985006 over the ~200ms before the route changed to `/learn` — reaching
// almost exactly the authored end state (`scale(0.985)`, `opacity: 0`). Under
// `prefers-reduced-motion: reduce` the same probe never left opacity 1 / transform none before
// navigating. A forced second press mid-departure landed on `/learn` at 137ms rather than waiting
// out the first press's own 200ms, proving the second press skips the remainder instead of
// queuing behind it. A green suite here is not a claim that the departure reads well — it is a
// claim that these numbers and this shape survive the next edit.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/** 🔴 THE CODE, NOT THE PROSE — same helper, same reason, as canvas-shell.test.ts's own
 *  `codeOnly`. Every file here explains a negative in comments before enforcing it (that is the
 *  house style), so a negative assertion run over the raw text fails on the file's own
 *  explanation of the rule it is following. Deliberately crude: no string-literal awareness, safe
 *  here because nothing asserted below lives inside a string. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SURFACE = read("./canvas-surface.tsx");
const CSS = read("../../../app/globals.css");
// 🔴 NOT UNDER THIS test SCRIPT'S GLOB (`components/workspace/*/*.test.ts` never reaches
// `app/`), which is exactly why the assertions on it live here instead of beside it — a test
// that cannot run is not a guard. See package.json's `test` script.
const ERROR_BOUNDARY = read("../../../app/(workspace)/learn/error.tsx");

test("🔴🔴 the canvas route has an error boundary, and it is a client component", () => {
  // Next silently refuses to use error.tsx as a boundary without this — the whole file becomes
  // dead weight that LOOKS like a fix and catches nothing.
  assert.match(ERROR_BOUNDARY, /^"use client";/, "error.tsx lost its client directive");
  assert.match(ERROR_BOUNDARY, /export default function \w+\(/, "error.tsx no longer exports a default component");
  // The two arguments Next's own contract hands this file — without both, Next refuses the file
  // as an error boundary at all.
  assert.match(ERROR_BOUNDARY, /error:\s*Error/);
  assert.match(ERROR_BOUNDARY, /reset:\s*\(\)\s*=>\s*void/);
});

test("🔴🔴 the boundary's own way out is a real navigation, not a call into whatever just crashed", () => {
  // Whatever threw may be crashed application state, not just an ugly screen — canvas-quiet.tsx's
  // own retry note gives the identical reasoning for a full document load over a client one. An
  // <a href> cannot fail to navigate the way a click handler reading broken state could.
  assert.match(ERROR_BOUNDARY, /<a\b[^>]*href="\/learn"/, "the escape hatch is no longer a plain anchor to /learn");
  assert.equal(
    /router\.push/.test(codeOnly(ERROR_BOUNDARY)),
    false,
    "the boundary is routing through the client router again",
  );
  // `reset` — Next's own retry — stays offered too: some of what lands here is a transient race,
  // not a durably bad state, and the learner should not have to leave a canvas over one bad frame.
  assert.match(ERROR_BOUNDARY, /onClick=\{reset\}/, "the boundary dropped its own retry");
});

test("🔴 the dev-preview harness gets the identical boundary, not a second one that can drift", () => {
  // dev-preview/learn is the one place this class of bug is reproducible without a signed-in
  // session (see the file header's real-Chrome numbers, captured through it) — see the note at
  // the top of app/dev-preview/learn/page.tsx. A second hand-written fallback here would be a
  // second thing to keep honest with the first.
  const preview = read("../../../app/dev-preview/learn/error.tsx");
  assert.match(preview, /^"use client";/);
  assert.match(preview, /export \{ default \} from "\.\.\/\.\.\/\(workspace\)\/learn\/error";/);
});

test("🔴🔴 the × starts a departure rather than navigating on the spot", () => {
  assert.match(
    SURFACE,
    /<CanvasExit onExit=\{beginExit\} \/>/,
    "the × is calling onExit directly again — the departure animation has nothing to trigger it",
  );
  assert.equal(
    /<CanvasExit onExit=\{onExit\} \/>/.test(SURFACE),
    false,
    "the × went back to the raw prop, skipping beginExit entirely",
  );
});

test("🔴 the departure is capped, never a reason the press feels slower", () => {
  // Owner: "never make the exit SLOWER TO RESPOND ... must still feel instant to the press ...
  // cap it tight (about 200ms)". This is a ceiling on THIS surface's own animation, not the
  // arrival's 320ms `DOCK_MS` — that trip has a measured destination to aim at; see
  // `.canvas-exit-out`'s own comment in globals.css for why this one does not try to replicate it.
  assert.match(SURFACE, /const EXIT_MS = 200;/, "the exit's own timing budget moved or was removed");
});

test("🔴🔴 reduced motion skips the departure, and a second press skips the wait", () => {
  assert.match(
    SURFACE,
    /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/,
    "beginExit stopped checking the same preference canvas-home.tsx's own arrival honours",
  );
  // Both guards live on one branch: an in-flight departure OR reduced motion skip straight to
  // `onExit()` rather than animating. Losing either half re-opens a way to strand the learner —
  // reduced motion behind a 200ms wait it asked not to have, or a second press stacking a second
  // timer behind the first instead of overriding it.
  assert.match(SURFACE, /if \(leaving \|\| still\) \{/, "the second-press / reduced-motion short-circuit is gone");
  assert.match(SURFACE, /window\.clearTimeout\(exitTimer\.current\)/, "the pending departure timer is no longer cancelled");
});

test("🔴 the pending navigation cannot fire twice, or after the surface holding it is gone", () => {
  assert.match(
    SURFACE,
    /exitTimer\.current = window\.setTimeout\(onExit, EXIT_MS\)/,
    "the departure stopped delaying onExit — the animation would be racing a navigation already under way",
  );
  // Cleared on unmount: a route change from anywhere else (the browser's own Back) must not leave
  // a stale timer calling `router.push` a second time on a surface that is already gone.
  assert.match(SURFACE, /useEffect\(\(\) => \(\) => \{\s*if \(exitTimer\.current !== null\) window\.clearTimeout\(exitTimer\.current\);/);
});

test("🔴🔴 the departure is the arrival's own curve, not a new effect invented to match the brief", () => {
  // Owner: "the exit should read as the reverse of the arrival." canvas-home.tsx flies the
  // composer and the character in on cubic-bezier(0.22, 0.61, 0.36, 1); this is that same curve,
  // time-reversed (each control point becomes `1 -` itself and the pair swaps order) rather than
  // a hand-picked replacement.
  assert.match(
    CSS,
    /@keyframes canvas-exit-out \{\s*from \{ opacity: 1; transform: scale\(1\); \}\s*to \{ opacity: 0; transform: scale\(0\.985\); \}\s*\}/,
    "the exit's keyframes changed shape",
  );
  assert.match(
    CSS,
    /\.canvas-exit-out \{ animation: canvas-exit-out 200ms cubic-bezier\(0\.64, 0, 0\.78, 0\.39\) forwards; \}/,
    "the exit's duration or curve no longer matches canvas-surface.tsx's own EXIT_MS and reasoning",
  );
});

test("🔴 reduced motion reaches the exit's own animation too", () => {
  // `forwards` holds the faded-out end state, so `animation: none` — the wrong fix, made once
  // already on `.canvas-preview-out` in this exact block — would leave the canvas sitting at full
  // opacity while `beginExit`'s timer still fires the navigation underneath it. The correct form
  // is `animation-duration: 1ms`, which still reaches the "to" keyframe.
  const block = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce) {\n  .canvas-swap,"));
  assert.match(block, /\.canvas-exit-out \{ animation-duration: 1ms; \}/, "the exit animation is missing from the reduced-motion block");
});
