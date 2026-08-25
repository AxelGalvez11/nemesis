// The two rules production taught this feature on the day it shipped.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isAnswerableLabel, OCCLUSION_READ_WIDTH, smallerThumbnail } from "./occlusion-source";

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

test("🔴🔴🔴 a smaller rendering is PROPOSED, never asserted", () => {
  // 🔴🔴🔴 THE BUG THIS TEST WAS REWRITTEN FOR WAS MINE, AND IT BROKE THE FEATURE COMPLETELY.
  // Wikimedia only serves thumbnail widths it has ALREADY RENDERED, and which ones those are is
  // unpredictable per file. Measured on this exact diagram, 2026-08-25:
  //
  //     1280px → 200      960px → 200
  //      800px → 400      640px → 400      1024px → 400      1200px → 400
  //
  // The first version rewrote to a fixed 800px and RETURNED IT AS FACT. Every lookup then died at
  // `image-unreachable` in 1.4 seconds, which from the outside looked exactly like "no diagram
  // exists". So this returns a candidate to TRY, and the route must fall back.
  const small = smallerThumbnail(REAL);
  assert.ok(small, "nothing was proposed for a 1280px source");
  assert.match(small, new RegExp(`/${OCCLUSION_READ_WIDTH}px-`), "the proposal is not smaller");
  assert.equal(new URL(small).hostname, "upload.wikimedia.org", "the proposal changed host");
  assert.ok(small.includes("KidneyAndNephron-v4_Antares42"), "the proposal points at a different file");
});

test("🔴🔴 null means 'nothing worth trying', which the caller must handle", () => {
  // Not a thumbnail, or already small enough. A caller that treated null as a URL would fetch
  // "null" and refuse every picture.
  assert.equal(smallerThumbnail(REAL.replace("1280px-", "640px-")), null, "a 640px source was upscaled");
  assert.equal(smallerThumbnail(REAL.replace("1280px-", `${OCCLUSION_READ_WIDTH}px-`)), null);
  assert.equal(smallerThumbnail("https://upload.wikimedia.org/wikipedia/commons/d/dc/Kidney.svg.png"), null);
  assert.equal(smallerThumbnail(""), null);
});

test("🔴🔴🔴 the route FALLS BACK when the smaller rendering is refused", () => {
  const route = readFileSync(new URL("../../app/api/learn/figure-occlusion/route.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  // Two candidates, tried in order, and only running out of them is a refusal.
  assert.match(route, /const attempts = smaller && allowedAssetUrl\(smaller\) \? \[smaller, chosenPath\] : \[chosenPath\]/, "the fallback is gone");
  assert.match(route, /for \(const candidate of attempts\)/, "the candidates are no longer tried in turn");
  assert.match(route, /if \(!bytes\) return refuse\(admin, key, "image-unreachable"\)/, "a total failure is no longer a refusal");
  // 🔴 AND THE URL THAT ANSWERED IS THE ONE SHOWN. Masks are measured against the bytes fetched;
  // reading one rendering and displaying another places every box correctly in a coordinate space
  // nobody is looking at.
  assert.match(route, /assetPath = candidate;/, "the answering url is not the one carried forward");
  assert.match(route, /asset: \{\s*assetPath,/, "the learner is shown a different url from the one measured");
  assert.match(route, /allowedAssetUrl\(chosenPath\)/, "the original url is trusted unchecked");
});

test("🔴🔴🔴 a TRANSIENT failure is never cached, only a durable one", () => {
  // 🔴 THIS NEARLY POISONED THE PRODUCT. The bad thumbnail rewrite above wrote
  // `image-unreachable` for "nephron" into the cache; until that row was deleted by hand, no
  // learner anywhere could have been asked about a kidney for a week. A momentary failure must
  // never become a stored fact.
  const route = readFileSync(new URL("../../app/api/learn/figure-occlusion/route.ts", import.meta.url), "utf8");
  const durable = /const DURABLE_REFUSALS = new Set\(\[([^\]]*)\]\)/.exec(route);
  assert.ok(durable, "the durable/transient split is gone");
  for (const transient of ["image-unreachable", "vision-failed", "wrong-scale", "image-too-large", "image-unreadable"]) {
    assert.ok(!durable[1]!.includes(transient), `"${transient}" is cached, and it is not durable`);
  }
  for (const real of ["no-candidates", "no-labelled-parts"]) {
    assert.ok(durable[1]!.includes(real), `"${real}" is no longer cached, so it costs a full search every time`);
  }
  assert.match(route, /if \(DURABLE_REFUSALS\.has\(reason\)\) await writeCache/, "every refusal is cached again");
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
