// Leaving a canvas, and the one way it could fail without saying so.
//
// Owner, 2026-08-30: *"exiting a canvas cause the screen to go blank, it should take to landing
// page."*
//
// 🔴 IT DOES NOT REPRODUCE ON DEMAND, AND THAT IS WHAT THESE ASSERTIONS ARE ABOUT. Every exit was
// driven on production in the owner's own signed-in browser — the `×` from four saved canvases,
// from one opened by typing, and from one left 300ms after opening; the browser's own Back and
// Forward; the rail's New canvas and Library — and all of them landed on the front door. So what
// is pinned here is not a fixed bug but the two properties whose ABSENCE is what makes this
// failure silent when it does happen: the canvas fades itself out before it navigates, and until
// now nothing checked that the navigation arrived.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CANVAS = readFileSync("components/workspace/learn/learning-canvas.tsx", "utf8");
const SURFACE = readFileSync("components/workspace/learn/canvas-surface.tsx", "utf8");
const LAYOUT = readFileSync("app/(workspace)/layout.tsx", "utf8");
const WAITING = readFileSync("components/workspace/shell/workspace-waiting.tsx", "utf8");

test("🔴🔴 a soft exit that never lands is followed by a real page load", () => {
  // The push runs on the client router and its chunks. When a deployment lands under an open tab —
  // this app ships several times a day — a soft navigation can resolve to nothing, and the canvas
  // has already faded itself to `opacity: 0` by then. What is left is a blank page with no exit.
  assert.match(CANVAS, /router\.push\(CANVAS_EXIT_ROUTE\)/, "the exit no longer tries the soft navigation first");
  assert.match(
    CANVAS,
    /strandedTimer\.current = window\.setTimeout\(\s*\(\) => \{\s*window\.location\.assign\(CANVAS_EXIT_ROUTE\);\s*\},\s*STRANDED_MS,?\s*\);/,
    "the exit has no hard-navigation deadline behind it",
  );
  // 🔴 A FULL DOCUMENT LOAD, NOT ANOTHER `router.push`. Retrying the thing that just failed with
  // the thing that just failed is not a fallback. Same reasoning as `learn/error.tsx`'s plain <a>.
  assert.match(CANVAS, /window\.location\.assign\(CANVAS_EXIT_ROUTE\)/, "the fallback stopped being a full document load");
});

test("🔴 the deadline is cancelled by a working exit, and cannot fire twice", () => {
  // A cleared timer on unmount is what makes this invisible in the normal case: the canvas going
  // away IS the push having worked. Without it every exit would reload the page two seconds later.
  assert.match(
    CANVAS,
    /useEffect\(\(\) => \(\) => \{\s*if \(strandedTimer\.current !== null\) window\.clearTimeout\(strandedTimer\.current\);\s*\}, \[\]\);/,
    "the stranded deadline is no longer cancelled when the canvas unmounts",
  );
  assert.match(CANVAS, /if \(strandedTimer\.current !== null\) window\.clearTimeout\(strandedTimer\.current\);\s*strandedTimer\.current = window\.setTimeout/,
    "a second press queues a second reload instead of replacing the first");
});

test("🔴 it waits longer than a working exit takes, by a real margin", () => {
  const ms = Number(/const STRANDED_MS = ([\d_]+);/.exec(CANVAS)?.[1]?.replace(/_/g, ""));
  assert.ok(Number.isFinite(ms), "the stranded deadline is no longer readable");
  // 🔴 THE DEPARTURE ANIMATION USED TO BE PART OF THIS BUDGET AND NO LONGER EXISTS. `EXIT_MS` was
  // the 200ms the × spent playing `.canvas-exit-out` before `onExit` was called, so the deadline
  // had to clear it or it would fire before the push happened. The × went on 2026-08-31 and the
  // navigation is immediate now, which makes the margin larger rather than smaller — so the floor
  // is asserted directly instead of against a constant that is gone.
  assert.ok(ms >= 1_000, `${ms}ms is too short to tell a wedged router from a slow one`);
  // And not so long that anyone concludes the product is broken while waiting for it.
  assert.ok(ms <= 4_000, `${ms}ms is long enough for a learner to give up first`);
});

test("🔴🔴 the workspace's waiting screen is the product's, and it admits when it is stuck", () => {
  // What this replaces was the ACCOUNT PORTAL's screen borrowed by the product: a full-viewport
  // #080809 ground with LOADING at 11px, which is also the prerendered HTML of `/learn` and so the
  // first paint of every full page load. Nothing cleared it but `getSession()` settling, and that
  // call has no timeout — a request that hangs left a black screen with nothing to press.
  // 🔴 THE USE, NOT THE WORD. The gate's own note names the class it replaced and says why — a
  // test that banned the string outright would be asking the file to forget its history, which is
  // the rule `gaze.test.ts`'s facing guard already follows. Unrendered is unseen.
  assert.ok(!/className="nemesis-account-loading"/.test(LAYOUT), "the workspace is rendering the account portal's black screen again");
  // 🔴 REPOINTED 2026-09-03, NOT WEAKENED. This asserted the literal `if (loading || !session)
  // return <WorkspaceWaiting />;`, which is the exact line that had to go: a session that blinks
  // during a token refresh is not a sign-out, and unmounting the whole workspace for one destroyed
  // a turn the owner was in the middle of (see lib/workspace-gate.ts). The invariant this test was
  // written to protect is that the workspace has ITS OWN waiting screen rather than the account
  // portal's black one — not which condition reaches it — so it now names the screen and the states
  // that render it, and `workspace-session-survives-a-blip.test.ts` owns the condition.
  assert.match(LAYOUT, /return <WorkspaceWaiting \/>;/, "the gate no longer renders the waiting screen");
  assert.match(LAYOUT, /gate === "waiting" \|\| gate === "sign-in"/, "the waiting screen stopped being tied to the states that have no workspace");
  assert.match(WAITING, /bg-\(--ui-bg-editor\)/, "the waiting screen stopped using the product's own ground");
  // 🔴 SILENT FIRST. Measured on production, the workspace is past this gate 285ms after the
  // document loads, so a message with no delay would flash on every single load.
  const patient = Number(/const PATIENT_MS = ([\d_]+);/.exec(WAITING)?.[1]?.replace(/_/g, ""));
  assert.ok(patient >= 3_000, `${patient}ms means the message flashes on ordinary loads`);
  assert.ok(patient <= 10_000, `${patient}ms is longer than anyone stares at a blank page`);
  assert.match(WAITING, /\{stuck \? \(/, "the waiting screen shows its message before it is stuck");
  // 🔴 BOTH WAYS OUT ARE PLAIN LINKS. A control that runs application code is not a recovery path
  // when the application is what is wedged — `learn/error.tsx` and `canvas-quiet.tsx` both say so.
  assert.match(WAITING, /<a\s+[^>]*href="\/learn"/s, "Reload stopped being a real link");
  assert.match(WAITING, /<a\s+[^>]*href="\/sign-in"/s, "Sign in again stopped being a real link");
  // 🔴 THE CALL, NOT THE WORD — same rule as the class name above. The file's own note explains
  // why it is not `router.push`, so banning the phrase would ban the explanation with it.
  assert.ok(!/onClick=|useRouter\(/.test(WAITING), "the way out now depends on the client router working");
});
