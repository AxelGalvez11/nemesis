/**
 * The arc cannot lie, and it cannot go backwards.
 *
 * 🔴 THE TIMER GUARD AT THE FOOT IS THE ONE THAT MATTERS. Everything else here checks arithmetic;
 * that one checks that nobody has quietly reintroduced the thing this design exists to avoid.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ARC_CIRCUMFERENCE, READ_STOPS, advance, dashOffsetFor, progressFor, type ReadPhase } from "./read-progress";

const PHASES: ReadPhase[] = ["queued", "authorised", "uploaded", "read"];

test("the stops run forward and end at a full circle", () => {
  const stops = PHASES.map(progressFor);
  for (let i = 1; i < stops.length; i += 1) {
    assert.ok(stops[i]! > stops[i - 1]!, `${PHASES[i]} does not come after ${PHASES[i - 1]}`);
  }
  assert.equal(stops[0], 0);
  assert.equal(stops.at(-1), 1);
});

test("🔴 authorising barely moves the arc, because it takes no time", () => {
  // An even split would put the arc a third of the way round for a step measured in milliseconds.
  assert.ok(READ_STOPS.authorised <= 0.15, "authorising claims too much of the circle");
  assert.ok(READ_STOPS.uploaded >= 0.5, "the upload is most of the wait and should be most of the arc");
});

test("🔴 the arc never travels backwards, whatever order the steps arrive in", () => {
  // The inline lane skips `uploaded` entirely; a retry can re-report `authorised` late.
  let shown = 0;
  for (const phase of ["authorised", "read", "authorised", "queued", "uploaded"] as ReadPhase[]) {
    const next = advance(shown, phase);
    assert.ok(next >= shown, `${phase} rewound the arc from ${shown} to ${next}`);
    shown = next;
  }
  assert.equal(shown, 1);
});

test("the inline lane, which never uploads, still reaches a full circle", () => {
  let shown = 0;
  for (const phase of ["authorised", "read"] as ReadPhase[]) shown = advance(shown, phase);
  assert.equal(shown, 1);
});

test("the dash offset draws an empty circle at zero and a full one at one", () => {
  assert.equal(dashOffsetFor(0), ARC_CIRCUMFERENCE);
  assert.equal(dashOffsetFor(1), 0);
  assert.ok(Math.abs(dashOffsetFor(0.5) - ARC_CIRCUMFERENCE / 2) < 1e-9);
});

test("a progress outside the circle is clamped rather than drawn", () => {
  assert.equal(dashOffsetFor(-3), ARC_CIRCUMFERENCE);
  assert.equal(dashOffsetFor(9), 0);
});

test("the arc's circle is the 34px slot the document glyph used to sit in", () => {
  // r=15 on a 34 box leaves 1px clear of the 2px stroke at every edge — the geometry the shipped
  // ring already used, so swapping one for the other cannot move the card's layout by a pixel.
  assert.ok(Math.abs(ARC_CIRCUMFERENCE - 94.2477) < 0.001);
});

test("🔴🔴 NOTHING IN THE PROGRESS MODEL READS A CLOCK", () => {
  // The failure this whole file exists to prevent: an arc driven by elapsed time creeps to 90% and
  // waits there, which is the invented progress bar #1027 refused, wearing a different shape.
  const source = readFileSync(new URL("./read-progress.ts", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
    .join("\n");
  for (const banned of ["Date.now", "setTimeout", "setInterval", "performance.now", "requestAnimationFrame", "elapsed"]) {
    assert.ok(!source.includes(banned), `${banned} appeared in the progress model — the arc is on a timer again`);
  }
});

console.log("read-progress.test.ts OK");
