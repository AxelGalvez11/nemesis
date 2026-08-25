// The 3D plot has to be VISIBLE, and twice now it was not.
//
// 🔴🔴🔴 THE OWNER PHOTOGRAPHED IT, 2026-08-25: a solid white blob where a surface should be, and
// *"the plots were rendering too white i couldnt see in light mode."* He was looking at a drawing
// with no shading and no lattice in it, because every colour in the scene had collapsed to white.
//
// The cause is a chain that no type checks and no test caught, and the middle link had already been
// "fixed" once:
//
//   1. every theme token in `desktop-ui.css` is a `color-mix(in srgb, …)`
//   2. `getComputedStyle` resolves those to `color(srgb 0.96 0.96 0.97)`
//   3. `three.Color` cannot parse that form — it warns and KEEPS ITS DEFAULT, which is white
//   4. so ink, paper, valley and peak were all white, and so was the lattice drawn over them
//
// Step 3 is the trap worth remembering: three.js does not throw on a colour it cannot read. It
// falls back to white, which is invisible on a light page and a blob on a dark one.
//
// This file is source-reading rather than rendering, because the component needs WebGL and a real
// DOM. What it defends is the SHAPE of the fix, so the specific mistakes cannot come back.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const PLOT = readFileSync(new URL("./surface-plot.tsx", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("🔴🔴🔴 the colour is MEASURED from a pixel, never read back as a string", () => {
  // 🔴 THE PREVIOUS FIX WAS THE RIGHT IDEA WITH THE WRONG READ-BACK. It assigned the value to a 2D
  // context's `fillStyle` and read the string back, believing that always yields `#rrggbb`. It does
  // for `rgb(…)`. For `color(srgb …)` Chrome round-trips the modern form UNCHANGED — measured:
  // `color(srgb 0.960784 0.964706 0.972549)` in, the same string out — so three.js was handed
  // exactly the value it could not parse, and the plot stayed white.
  assert.match(PLOT, /getImageData\(0, 0, 1, 1\)/, "the colour is no longer measured from a painted pixel");
  assert.match(PLOT, /fillRect\(0, 0, 1, 1\)/, "nothing is painted, so there is no pixel to measure");
  assert.ok(
    !/return typeof probe\.fillStyle === "string"/.test(PLOT),
    "the fillStyle string read-back is back, and it cannot see color(srgb …)",
  );
});

test("🔴🔴 an unreadable colour is detected, because fillStyle fails SILENTLY", () => {
  // Assigning a value the browser cannot parse leaves the property at whatever it already held. A
  // value that "sticks" to black and to white was never applied at all, and only two sentinels can
  // tell those apart — one sentinel makes every unparseable colour look like that sentinel.
  assert.match(PLOT, /probe\.fillStyle = "#000000"/, "the black sentinel is gone");
  assert.match(PLOT, /probe\.fillStyle = "#ffffff"/, "the white sentinel is gone");
  assert.match(PLOT, /if \(probe\.fillStyle !== overBlack\) return null/, "an unparseable colour is no longer refused");
});

test("🔴🔴🔴 valleys dark and peaks light means the mix FLIPS with the page", () => {
  // 🔴 THE SECOND BUG, HIDDEN UNDER THE FIRST. Both ends of the ramp were stated as a distance from
  // paper towards ink, which reads as "darker" only when the paper is the lighter of the two. On a
  // dark page ink IS the light colour, so the same two numbers put peaks at near-black and troughs
  // at mid-grey: a surface lit from underneath. Which end takes more ink has to be decided by the
  // paper's own luminance, so the drawing is right in both themes rather than one.
  assert.match(PLOT, /0\.2126 \* paper\.r \+ 0\.7152 \* paper\.g \+ 0\.0722 \* paper\.b/, "the paper's luminance is no longer measured");
  assert.match(PLOT, /const \[lowMix, highMix\] = bright \?/, "the ramp no longer depends on which theme is showing");
});

test("🔴🔴 alpha comes from the same pixel, so a transparent ancestor is not treated as paper", () => {
  // The old test matched `rgba(…)` with a regex and called anything else opaque, so a fully
  // transparent `color(srgb 0 0 0 / 0)` counted as black paper and the whole ramp was built against
  // a ground nobody can see.
  assert.match(PLOT, /readColour\(value\)\?\.a \?\? 0\) > 0\.9/, "an unpainted ancestor can be mistaken for the page again");
});

test("🔴🔴🔴 the box is what carries depth, and it is three ruled panes not one outline", () => {
  // Owner, 2026-08-25: *"i need the classic grid depth look."* A floor rectangle and one upright
  // stick is not one: against it, how high a peak stands and how far back it sits are both
  // unanswerable, so the drawing reads flat however good the shading is. Ruled panes fix that
  // because a grid square has a KNOWN size — the far ones looking smaller IS the depth cue.
  assert.match(PLOT, /const wall = \(axis: "x" \| "z", side: -1 \| 1\)/, "the upright walls are gone");
  assert.match(PLOT, /groundGrid\.push/, "the floor is no longer ruled");
  assert.ok(!/new three\.LineLoop/.test(PLOT), "the bare floor outline is back in place of the panes");
});

test("🔴🔴🔴 the BACK walls are chosen on every frame, or a wall lands in front of the surface", () => {
  // All four are built and two are shown. Drawing all four is a cage the surface hides inside;
  // fixing two at build time puts a wall between the learner and the drawing the moment they orbit
  // past a corner. Which two is a function of where the camera is, so it is settled per render.
  assert.match(PLOT, /camera\.position\.x > 0/, "the far wall is no longer chosen from the camera");
  assert.match(PLOT, /camera\.position\.z > 0/, "the far wall is no longer chosen from the camera");
  assert.match(PLOT, /const draw = \(\) => \{\s*faceTheCamera\(\);/, "the walls are picked once at build time and never again");
  // 🔴 AND THE WALLS ARE NOT WRAPPED IN A `Group`. `add` REPARENTS: putting lines already added to
  // the scene into a group that is never itself added takes them straight back out, and every wall
  // silently disappears. This bug was written and caught inside one edit.
  assert.ok(!/new three\.Group\(\)/.test(PLOT), "the walls went into a Group again, which removes them from the scene");
});

test("🔴🔴 the camera cannot go under the floor", () => {
  // Orbiting beneath puts the ground pane between the learner and the surface, and the only way
  // back is to guess which way to drag.
  assert.match(PLOT, /maxPolarAngle = Math\.PI \/ 2 - 0\.04/, "the camera can drop below the ground pane again");
});

test("🔴 everything built is still disposed — a WebGL context is a resource the browser counts", () => {
  assert.match(PLOT, /for \(const built of panes\) built\.geometry\.dispose\(\)/, "the pane geometries leak");
  assert.match(PLOT, /ruling\.dispose\(\)/, "the ruling material leaks");
  assert.match(PLOT, /edging\.dispose\(\)/, "the edging material leaks");
  assert.match(PLOT, /renderer\.dispose\(\)/, "the renderer leaks");
});

test("🔴 there is still no animation loop", () => {
  // The Mol* discipline: the scene renders once and again on each orbit gesture, never per frame.
  assert.ok(!/requestAnimationFrame/.test(PLOT), "a per-frame loop appeared in a static drawing");
});

console.log("surface-plot.test.ts OK");
