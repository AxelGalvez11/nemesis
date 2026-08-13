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

test("🔴 every canvas entry path renders an exit, because nothing can branch around it", () => {
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

  // …and CanvasSurface renders the exit with no condition around it.
  assert.match(surface, /aria-label="Leave the canvas"/, "the exit must keep the label other lanes probe by");
  const call = /<CanvasExit[^>]*\/>/.exec(surface);
  assert.ok(call, "CanvasSurface must render <CanvasExit />");
  // The 200 characters before the call: no `&&`, no `?`, no `{cond`. A conditional exit is the
  // defect, whatever the condition happens to be.
  const before = surface.slice(Math.max(0, call.index - 200), call.index);
  assert.ok(!/&&\s*$/.test(before.trimEnd() + " ".repeat(0)), "the exit must not sit behind `&&`");
  assert.ok(
    !/[?&|]\s*$/.test(before.trimEnd()),
    `the exit must not sit behind a condition — found: ${JSON.stringify(before.slice(-60))}`,
  );
  // And it takes no prop that could switch it off.
  assert.ok(
    !/function CanvasExit\(\{[^}]*\b(hidden|show|visible|enabled)\b/.test(surface),
    "CanvasExit must not accept a visibility prop; a switch is a branch with a nicer name",
  );
});

test("the exit is an ×, not a ←", () => {
  const surface = read("canvas-surface.tsx");
  assert.ok(
    !/name="arrow-left"/.test(surface),
    "§38.2: the control inside a canvas is an ×; the back arrow is what it replaced",
  );
  // Two strokes crossing. Asserted on the path data rather than on a component name so that
  // swapping icon libraries cannot quietly turn it back into an arrow.
  assert.match(surface, /<svg/, "the exit draws an inline SVG, not a webfont glyph that can fail to load");
  assert.match(surface, /M3\.5 3\.5 L12\.5 12\.5 M12\.5 3\.5 L3\.5 12\.5/, "expected the × to be two crossing strokes");
});

test("leaving a canvas lands on the front door, not on the chat surface", () => {
  // 🔴 A DELIBERATE CHANGE OF DESTINATION, PINNED HERE SO IT IS REVERSIBLE IN ONE LINE. `/sessions`
  // is the chat page; canvases live at `/learn`. Tolerable while the rail was one click away from
  // every canvas — not once this control is the only way out.
  const canvas = read("learning-canvas.tsx");
  assert.match(canvas, /const CANVAS_EXIT_ROUTE = "\/learn"/);
  assert.ok(
    !/router\.push\("\/sessions"\)/.test(canvas),
    "no canvas exit may still route to the chat surface",
  );
});
