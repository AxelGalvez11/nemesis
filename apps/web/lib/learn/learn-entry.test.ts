// 🔴 THE `×` IS THE ONLY WAY OUT OF A CANVAS (UX brief §38.1 + §38.2). This file is the guard.
//
// §38.1 takes the navigation rail off screen inside a canvas. §38.2 turns the back arrow into an
// `×`. Together they mean an entry path that renders no `×` is a page a learner cannot leave — and
// this repo has shipped exactly that before: `/learn` was an immersive route, suppressing the rail
// also suppressed its reopen toggle, and the Canvas offered no route to Library, Calendar or Stats
// from the front door or from any active session.
//
// The brief's condition is *"unconditionally present in every entry path"*, so this test does two
// separable things:
//
//   1. enumerate the entry paths and check each resolves to the surface we think it does;
//   2. check that surface's exit is STRUCTURAL — not a prop, not a branch, not a flag.
//
// (2) is a source-level assertion, because this package has no DOM harness. That is a real
// limitation and it is the reason the code was restructured rather than merely patched: the exit
// was hoisted above the render branch into `CanvasSurface`, so the strongest available check is
// "no branch stands between the surface and its exit" — a claim about shape, which source text can
// carry — instead of "every branch remembered to include one", which it cannot.
//
// 🔴 THE CALIBRATION THAT MATTERS: reintroduce the shipped defect by deleting `<CanvasExit …/>`
// from canvas-surface.tsx, or by wrapping it in any condition, and the third test goes red. A test
// that only asserted "the file mentions an exit somewhere" would stay green through both.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { LEARN_ENTRY_PATHS, canvasIsImmersive, learnEntryFromSearch, learnSurface } from "./learn-entry";

const componentsDir = join(import.meta.dirname, "..", "..", "components", "workspace", "learn");
const read = (file: string) => readFileSync(join(componentsDir, file), "utf8");

/** 🔴 THE CODE, NOT THE PROSE. These files carry long explanations that quote the very markup the
 *  assertions forbid — the comment recording "this branch used to return a bare `<main>`" is the
 *  reason the fix exists, and a guard that read it as the defect would be red on its own history.
 *  Deliberately crude: no string-literal awareness, which is safe here because nothing asserted
 *  below lives inside a string. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("every way a learner arrives at /learn resolves to the surface we think it does", () => {
  for (const path of LEARN_ENTRY_PATHS) {
    assert.equal(
      learnSurface(learnEntryFromSearch(path.search)),
      path.surface,
      `${path.label} — "${path.search}" resolved to the wrong surface`,
    );
  }
});

test("🔴 the front door is NOT inside a canvas, so it keeps its navigation", () => {
  // The positive case, and it is not a formality. "Hide the sidebar on /learn" applied to the
  // pathname alone would take the rail off the composer page too — which is not what §38.1 says
  // and would leave the learner's own front door with no way to reach Library or Calendar.
  assert.equal(canvasIsImmersive(learnEntryFromSearch("")), false);
  assert.equal(canvasIsImmersive(learnEntryFromSearch("?foo=bar")), false);
  // And the extension's link, which goes to /library rather than into a canvas at all.
  assert.equal(canvasIsImmersive(learnEntryFromSearch("?import=coursework")), false);
});

test("🔴 every canvas entry path renders ONE sheet — the exit it used to guarantee is the rail's now", () => {
  // 🔴🔴 THE SECOND HALF OF THIS TEST IS GONE, AND THE FIRST HALF IS WHY IT STAYS. It asserted that
  // `CanvasSurface` renders `<CanvasExit />` unconditionally, because under §38.1 the rail was off
  // and the × was the only way out of a canvas — a branch that missed it was a dead end. The owner
  // removed the × on 2026-08-31 (*"since chat is default, the '×' should be gone from the chats"*),
  // which is only safe because #995 reversed §38.1 the same day: the sidebar collapses to the rail
  // and the rail stays, so navigation is on screen at all times.
  //
  // What is still worth holding is the ONE-SHEET rule underneath it: every branch of the canvas
  // returns a `CanvasSurface`, never a bare `<main>`. That is what stopped the processing branch
  // drifting into a surface of its own, and it outlives the control it was written to protect.
  const surface = read("canvas-surface.tsx");

  // Every canvas entry goes through LearningCanvas…
  const page = readFileSync(
    join(import.meta.dirname, "..", "..", "app", "(workspace)", "learn", "page.tsx"),
    "utf8",
  );
  assert.match(page, /<LearningCanvas/, "the canvas branch of /learn must render LearningCanvas");

  // …LearningCanvas paints nothing of its own — the sheet is CanvasSurface's, in BOTH branches,
  // and the processing branch is the one that used to return a bare <main> with no exit in it.
  const canvas = codeOnly(read("learning-canvas.tsx"));
  assert.ok(
    !/<main[\s>]/.test(canvas),
    "learning-canvas.tsx must not open its own <main>: a second sheet is a branch that can miss the exit",
  );
  const returnsJsx = [...canvas.matchAll(/return \(\s*<([A-Za-z]+)/g)].map((m) => m[1]);
  assert.ok(returnsJsx.length >= 2, "expected the canvas to still have both a processing and a ready branch");
  for (const tag of returnsJsx) {
    assert.equal(tag, "CanvasSurface", `LearningCanvas returned <${tag}> directly; every branch must be a CanvasSurface`);
  }

  // …and the surface carries no exit control of its own any more.
  assert.ok(
    !/aria-label="Leave the canvas"/.test(surface),
    "the canvas grew its own exit again — leaving a chat is the rail's job since the × was removed",
  );
});

test("🔴 the canvas offers no back arrow either — the rail is the only navigation", () => {
  const surface = read("canvas-surface.tsx");
  // §38.2 said the control inside a canvas is an `×` rather than a `←`, because a back arrow reads
  // as "the previous canvas" and that is not navigation. Neither control exists now; the rule is
  // kept as the narrower one it always was — this surface does not paint its own way out.
  assert.ok(
    !/name="arrow-left"/.test(surface),
    "§38.2: a back arrow inside a canvas reads as the previous canvas, which is not navigation",
  );
  // 🔴 THE × ITSELF IS GONE TOO. The two assertions that stood here pinned its geometry — an inline
  // SVG rather than a webfont glyph that can fail to load, drawn as two crossing strokes so a
  // change of icon library could not quietly turn it back into an arrow. Both were right about a
  // control the owner removed on 2026-08-31; what survives is the rule that this surface paints no
  // exit of its own, asserted above and in `canvas-exit-reliability.test.ts`.
  assert.ok(!/M3\.5 3\.5 L12\.5 12\.5/.test(surface), "the × came back — the rail is the way out of a chat now");
});

test("leaving a canvas lands on the front door, not on the chat surface", () => {
  // 🔴 A DELIBERATE CHANGE OF DESTINATION, PINNED HERE SO IT IS REVERSIBLE IN ONE LINE. `/sessions`
  // is the chat page; canvases live at `/learn`. It no longer describes a `×` — that control and
  // its `leave` went on 2026-08-31 — but `CANVAS_EXIT_ROUTE` is still where deleting a canvas
  // sends you, and pointing that at the chat page would be the same mistake in a quieter place.
  const canvas = read("learning-canvas.tsx");
  assert.match(canvas, /const CANVAS_EXIT_ROUTE = "\/learn"/);
  assert.ok(
    !/router\.push\("\/sessions"\)/.test(canvas),
    "no canvas exit may still route to the chat surface",
  );
});
