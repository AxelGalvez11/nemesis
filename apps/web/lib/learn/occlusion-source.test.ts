// The two rules production taught this feature on the day it shipped.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isAnswerableLabel, OCCLUSION_READ_WIDTH, readableThumbnail } from "./occlusion-source";

// The real URL the reference lane returned for `subject: "nephron"`, 2026-08-25.
const REAL = "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/KidneyAndNephron-v4_Antares42.svg/1280px-KidneyAndNephron-v4_Antares42.svg.png";

test("🔴🔴🔴 a bare number is never an answer", () => {
  // 🔴 THE MEASURED FAILURE. That nephron URL came back with 18 boxes found, and their labels were
  // `1 2 3 … 12 F R S E Cortex Medulla` — a numbered-key diagram whose names live in a legend.
  // Vision read it perfectly. The question it produced was "Which part is covered? — 3 / 7 / 11".
  for (const key of ["1", "2", "12", "3.5", "(4)", " 7 ", "#3", "—"]) {
    assert.equal(isAnswerableLabel(key), false, `"${key}" was offered as an answer`);
  }
});

test("🔴 a ROMAN numeral key is a known gap, and it is left open on purpose", () => {
  // "IV" on a figure is usually a key and sometimes a real label. The rule that would catch it —
  // "made only of I V X L C D M" — also catches MIX, CIVIC, DILL and CLIMB, which are words.
  //
  // 🔴 THE CURE IS WORSE THAN THE DISEASE, so this is documented rather than fixed. The failure it
  // leaves is one odd question on a minority of figures; the failure it would cause is silently
  // deleting real labels from any diagram whose parts happen to be spelled in those letters. If
  // this ever needs solving, the honest signal is that the WHOLE label set is roman numerals, not
  // that one label is.
  assert.equal(isAnswerableLabel("IV"), true, "a roman-numeral rule appeared without this note being updated");
});

test("🔴🔴 a lone letter is a legend key, not a name", () => {
  // F, R, S and E all came off that same kidney diagram.
  for (const key of ["F", "R", "S", "E", "a", "x"]) {
    assert.equal(isAnswerableLabel(key), false, `"${key}" was offered as an answer`);
  }
});

test("🔴🔴 real names survive, in any discipline", () => {
  // Structural, never subject-matter (CLAUDE.md): this knows nothing about kidneys, circuits or
  // sonata form. It asks whether the text could be SPOKEN as the answer.
  for (const name of [
    "Cortex",
    "Medulla",
    "Bowman's capsule",
    "loop of Henle",
    "Q3",
    "T1 vertebra",
    "Bundesrat",
    "camshaft",
    "第一楽章",
  ]) {
    assert.equal(isAnswerableLabel(name), true, `"${name}" was thrown away`);
  }
});

test("🔴 an empty or blank label is refused", () => {
  for (const blank of ["", " ", "   ", "\t"]) assert.equal(isAnswerableLabel(blank), false);
});

test("🔴🔴🔴 a big picture is asked for smaller, because the big one 504s the route", () => {
  // 🔴 THE MEASURED FAILURE, the second one: `subject: "neuron"` returned **504 Gateway Timeout**.
  // A 1280px PNG regularly costs vision more than the 60s budget has left after the search and the
  // download, and the platform ends the request with an HTML error the client cannot read.
  const small = readableThumbnail(REAL);
  assert.match(small, new RegExp(`/${OCCLUSION_READ_WIDTH}px-`), "the rendering was not made smaller");
  assert.ok(!small.includes("1280px-"), "the original width survived the rewrite");
  // Same file, same host, same licence — only the rendering changed.
  assert.equal(new URL(small).hostname, "upload.wikimedia.org");
  assert.ok(small.includes("KidneyAndNephron-v4_Antares42"), "the rewrite pointed at a different file");
});

test("🔴🔴 it never asks for a LARGER rendering than the source", () => {
  // Wikimedia refuses an upscale, and a refusal here costs the whole question.
  const already = REAL.replace("1280px-", "640px-");
  assert.equal(readableThumbnail(already), already, "a 640px source was upscaled to 800px");
  assert.equal(readableThumbnail(REAL.replace("1280px-", "800px-")), REAL.replace("1280px-", "800px-"));
});

test("🔴 a URL that is not a resizable thumbnail is left exactly alone", () => {
  // Original-file URLs have no width in the path. Rewriting one would 404 the picture.
  const original = "https://upload.wikimedia.org/wikipedia/commons/d/dc/KidneyAndNephron.svg.png";
  assert.equal(readableThumbnail(original), original);
  assert.equal(readableThumbnail(""), "");
});

test("🔴🔴 the route reads and shows the SAME url, or every box is on the wrong picture", () => {
  // Masks are measured against the bytes fetched. Reading a small rendering and displaying a large
  // one would place every box correctly in a coordinate space nobody is looking at.
  const route = readFileSync(new URL("../../app/api/learn/figure-occlusion/route.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(route, /const assetPath = readableThumbnail\(chosenPath\)/, "the route stopped shrinking the picture");
  assert.match(route, /await fetch\(assetPath,/, "vision reads a different url from the one it measures");
  assert.match(route, /asset: \{\s*assetPath,/, "the learner is shown a different url from the one measured");
  // …and the allow list is checked on BOTH, so a rewrite cannot smuggle in another host.
  assert.match(route, /allowedAssetUrl\(assetPath\) \|\| !allowedAssetUrl\(chosenPath\)/, "the rewritten url is trusted unchecked");
});

test("🔴🔴 vision has a budget, so the caller gets JSON rather than a 504", () => {
  const route = readFileSync(new URL("../../app/api/learn/figure-occlusion/route.ts", import.meta.url), "utf8");
  assert.match(route, /signal: AbortSignal\.timeout\(VISION_BUDGET_MS\)/, "the vision read is unbounded again");
  // The three waits must fit inside maxDuration with room for the work that is not waiting.
  const budget = /const VISION_BUDGET_MS = (\d+)/.exec(route);
  const maxDuration = /export const maxDuration = (\d+)/.exec(route);
  assert.ok(budget && maxDuration, "the budgets are no longer readable");
  const total = Number(budget[1]) / 1000 + 8 + 10;
  assert.ok(total < Number(maxDuration[1]), `the budgets add to ${total}s of a ${maxDuration[1]}s function`);
});

console.log("occlusion-source.test.ts OK");
