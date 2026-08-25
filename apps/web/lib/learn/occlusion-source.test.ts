// The two rules production taught this feature on the day it shipped.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isAnswerableLabel, labelQuality, MIN_LABEL_SPREAD, OCCLUSION_READ_WIDTH, plainLabel, smallerThumbnail } from "./occlusion-source";

/** One box as vision reports it: text plus where it sits, in fractions of the picture. */
const at = (label: string, x: number, y: number) => ({ h: 0.03, label, w: 0.08, x, y });

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

test("🔴🔴🔴 the REAL nephron diagram is rejected, because it does not name its parts", () => {
  // 🔴 THE OWNER'S CATCH, 2026-08-25: *"make sure the images that it uses for image occlusion
  // actually have the content in it… the one for the nephron actually didn't even have proper
  // labels."* He was right and the failure was mine — I filtered the unusable labels OUT and then
  // built a question from whatever survived, instead of rejecting the PICTURE.
  //
  // These are the exact 20 labels the live route returned for `subject: "nephron"`. The diagram
  // numbers its parts 1-12 and prints the names in a key beside the figure, so the box landed on a
  // legend line and the question tested nothing about a kidney.
  // 🔴 THE LEGEND IS A BLOCK, and its geometry is what gives it away. The four "F:"/"R:"/"S:"/"E:"
  // entries are four stacked lines in one corner; the numbers are scattered over the figure.
  const nephron = [
    at("F: Filtration", 0.68, 0.42), at("R: Reabsorption", 0.68, 0.45),
    at("S: Secretion", 0.68, 0.48), at("E: Excretion", 0.68, 0.51),
    at("Cortex", 0.72, 0.53), at("Medulla", 0.72, 0.55),
    at("to Renal Vein", 0.69, 0.63), at("to Ureter", 0.63, 0.69),
    at("1", 0.35, 0.42), at("2", 0.35, 0.46), at("3", 0.35, 0.50), at("4", 0.35, 0.55),
    at("5", 0.35, 0.60), at("6", 0.48, 0.57), at("7", 0.53, 0.39), at("8", 0.51, 0.45),
    at("9", 0.51, 0.51), at("10", 0.51, 0.58), at("11", 0.57, 0.39), at("12", 0.60, 0.57),
  ];
  const quality = labelQuality(nephron);
  assert.equal(quality.named, 8, "the named count changed — re-check the rule against the real data");
  assert.equal(quality.keyed, 12);
  assert.equal(quality.usable, false, "the picture the owner rejected is accepted again");
});

test("🔴🔴🔴 a legend BLOCK is rejected on its geometry, even when every entry is a real name", () => {
  // 🔴 THIS IS THE ANSWER TO "how do we know the picture really labels its parts?" Every other rule
  // grades the TEXT vision reported, which means trusting the report. This grades WHERE that text
  // sits — which the report cannot fake without also getting the boxes wrong, and wrong boxes are
  // visible on screen immediately.
  //
  // Four stacked lines in a corner, all genuine words, all distinct, no numbers anywhere: passes
  // every other check and is still a legend, not a labelled diagram.
  const legend = [
    at("Filtration", 0.70, 0.40), at("Reabsorption", 0.70, 0.44),
    at("Secretion", 0.70, 0.48), at("Excretion", 0.70, 0.52),
  ];
  const quality = labelQuality(legend);
  assert.equal(quality.named, 4, "the words themselves are fine");
  assert.equal(quality.keyed, 0);
  assert.ok(quality.spread < MIN_LABEL_SPREAD, `a text block spread ${quality.spread.toFixed(2)}`);
  assert.equal(quality.usable, false, "a legend block is accepted as a labelled diagram");
});

test("🔴🔴 a LAYERED diagram is accepted, though all its labels sit in one column", () => {
  // 🔴 WHY THE RULE IS THE DIAGONAL AND NOT BOTH AXES. Skin layers, rock strata, the atmosphere —
  // these legitimately put every label in a single left-hand column: almost no x-spread, and a huge
  // y-spread. Requiring spread in both axes would throw away a whole shape of good figure.
  const layers = [
    at("epidermis", 0.12, 0.10), at("dermis", 0.12, 0.35),
    at("hypodermis", 0.12, 0.60), at("muscle", 0.12, 0.88),
  ];
  assert.equal(labelQuality(layers).usable, true, "a layered diagram was rejected for being tidy");
});

test("🔴🔴 the same word reported twice is ONE part, not two", () => {
  // Vision sometimes reports a caption at two positions. Four copies of one word is not four parts,
  // and the question would offer the right answer as several of its own options.
  const doubled = [
    at("axon", 0.2, 0.2), at("axon", 0.8, 0.8),
    at("axon", 0.2, 0.8), at("axon", 0.8, 0.2),
  ];
  assert.equal(labelQuality(doubled).named, 1, "duplicate labels were counted as separate parts");
  assert.equal(labelQuality(doubled).usable, false);
});

test("🔴🔴🔴 a multi-line text block is not a label, and its picture is rejected", () => {
  // 🔴 MEASURED ON THE LIVE ROUTE, ONE FIX LATER. Once the numbered nephron diagram was correctly
  // rejected, the route moved to the next candidate — and THAT picture came back with these: the
  // solute lists printed beside each tubule segment. Vision found real text in a real place; it is
  // simply not a NAME, and "Which part is covered?" answered by a fourteen-item list is not a
  // question.
  const solutes = [
    "Glucose\nAmino acids\nProtein\nVitamins\nLactate\nUrea\nUric acid\nNa+\nK+\nCa2+\nMg2+\nCl−\nHCO3−\nH2O",
    "Na+\nCl−\nHCO3−\nH2O",
    "H+\nK+\nNH4+",
    "Urea\nUric acid\nCreatinine\nSome drugs\nH+\nNH4+",
    "H2O",
    "Na+\nK+\nCl−",
    "Urea",
    "H2O\nUrea",
  ];
  for (const blob of solutes.filter((entry) => entry.includes("\n"))) {
    assert.equal(isAnswerableLabel(blob), false, `a text block was offered: ${blob.slice(0, 20)}…`);
  }
  // The two single-line survivors ("H2O", "Urea") are fewer than four named parts, so the PICTURE
  // is rejected and the route moves on — which is the behaviour that matters.
  const spread = solutes.map((label, index) => at(label, 0.2 + index * 0.08, 0.2 + index * 0.08));
  assert.equal(labelQuality(spread).usable, false, "the solute-list picture is accepted again");
});

test("🔴 a long name survives, because real diagrams print long names", () => {
  assert.equal(isAnswerableLabel("thick ascending limb of the loop of Henle"), true);
  assert.equal(isAnswerableLabel("left ventricular outflow tract"), true);
  assert.equal(isAnswerableLabel("a".repeat(61)), false, "an unbounded string is offered as an answer");
});

test("🔴 a short SENTENCE is a known gap, and length alone cannot close it", () => {
  // 🔴 AN HONEST LIMIT, WRITTEN DOWN RATHER THAN PAPERED OVER. This is 58 characters — shorter than
  // some genuine anatomical names — so no character cap separates the two. The failure observed in
  // production was multi-LINE text blocks, which the newline rule catches completely; a caption
  // that happens to be one short line would still get through.
  //
  // If it ever bites, the honest signal is grammatical (a finite verb), not dimensional. It is NOT
  // worth a keyword list: that is subject-matter scoping, which CLAUDE.md forbids and which never
  // generalises past the discipline it was written for.
  assert.equal(isAnswerableLabel("This region reabsorbs most of the filtered sodium and water"), true);
});

test("🔴🔴 a diagram that really does name its parts is accepted", () => {
  // The nine labels the live route returned for the picture it eventually chose, spread over the
  // figure the way labels on parts actually are.
  const neuron = [
    at("dendrite", 0.15, 0.20), at("axon", 0.50, 0.45), at("myelin sheath", 0.62, 0.30),
    at("node of Ranvier", 0.70, 0.60), at("soma", 0.25, 0.55), at("axon terminal", 0.88, 0.75),
  ];
  const quality = labelQuality(neuron);
  assert.equal(quality.named, 6);
  assert.equal(quality.keyed, 0);
  assert.ok(quality.spread >= MIN_LABEL_SPREAD);
  assert.equal(quality.usable, true, "a properly labelled diagram was rejected");
});

test("🔴🔴 names must OUTNUMBER keys, not merely exist", () => {
  // A mostly-numbered diagram that happens to print two words is still a numbered diagram.
  const mixed = [
    at("Cortex", 0.1, 0.1), at("Medulla", 0.9, 0.9), at("aorta", 0.1, 0.9), at("vein", 0.9, 0.1),
    at("1", 0.3, 0.3), at("2", 0.4, 0.4), at("3", 0.5, 0.5), at("4", 0.6, 0.6), at("5", 0.7, 0.7),
  ];
  assert.equal(labelQuality(mixed).usable, false);
  // …and four named parts is the floor, because two produces one two-option question repeated.
  assert.equal(
    labelQuality([at("anode", 0.1, 0.1), at("cathode", 0.9, 0.9)]).usable,
    false,
    "a two-label picture was chosen over a better one",
  );
  assert.equal(
    labelQuality([at("anode", 0.1, 0.1), at("cathode", 0.9, 0.9), at("anode wire", 0.1, 0.9), at("electrolyte", 0.9, 0.1)]).usable,
    true,
  );
});

test("🔴🔴 a legend key comes off the front of an answer", () => {
  // "F: Filtration" is not how anybody says the answer, and the letter is a CUE — a learner can
  // read "F" off the diagram and match the option without knowing what filtration is.
  assert.equal(plainLabel("F: Filtration"), "Filtration");
  assert.equal(plainLabel("1. Dendrite"), "Dendrite");
  assert.equal(plainLabel("b) axon"), "axon");
  assert.equal(plainLabel("A - soma"), "soma");
  // 🔴 AND A REAL NAME IS NOT MANGLED. The key must be short AND followed by a separator AND a
  // space, so ordinary names with punctuation in them survive intact.
  assert.equal(plainLabel("Bowman's capsule"), "Bowman's capsule");
  assert.equal(plainLabel("loop of Henle"), "loop of Henle");
  assert.equal(plainLabel("T-cell receptor"), "T-cell receptor");
  assert.equal(plainLabel("pH: measured at the surface"), "pH: measured at the surface");
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
  // Two renderings of the chosen picture, tried in order, and only running out is a failure.
  assert.match(route, /const renderings = smaller && allowedAssetUrl\(smaller\) \? \[smaller, chosenPath\] : \[chosenPath\]/, "the fallback is gone");
  assert.match(route, /for \(const rendering of renderings\)/, "the renderings are no longer tried in turn");
  assert.match(route, /if \(!bytes\) \{\s*lastRefusal = "image-unreachable";/, "an unreachable picture no longer moves to the next candidate");
  // 🔴 AND THE URL THAT ANSWERED IS THE ONE SHOWN. Masks are measured against the bytes fetched;
  // reading one rendering and displaying another places every box correctly in a coordinate space
  // nobody is looking at.
  assert.match(route, /assetPath = rendering;/, "the answering url is not the one carried forward");
  assert.match(route, /asset: \{\s*assetPath,/, "the learner is shown a different url from the one measured");
  assert.match(route, /allowedAssetUrl\(chosenPath\)/, "the original url is trusted unchecked");
});

test("🔴🔴🔴 an unsuitable picture is REJECTED and the next one is read", () => {
  // 🔴 THE OWNER'S POINT. Reading one picture and building a question from whatever survived
  // filtering is what produced the nephron legend question. The top hit for a subject is often a
  // numbered-key diagram and the good one is second or third, so the route must keep looking.
  const route = readFileSync(new URL("../../app/api/learn/figure-occlusion/route.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(route, /for \(const candidate of found\)/, "only one picture is considered again");
  // 🔴 THE WHOLE BOXES, NOT JUST THEIR TEXT. `labelQuality` grades WHERE the labels sit as well as
  // what they say, and that geometry check is the only one that looks at the picture rather than
  // trusting vision's report of it.
  assert.match(route, /const quality = labelQuality\(boxes\)/, "the picture is no longer graded");
  assert.match(route, /if \(!quality\.usable\) \{\s*lastRefusal = "unlabelled-picture";\s*continue;/, "an unlabelled picture is accepted again");
  // 🔴 BOUNDED IN BOTH MONEY AND TIME. Each attempt is a vision read, and three at their
  // individual ceilings would outlast the function.
  assert.match(route, /tried >= MAX_PICTURES \|\| Date\.now\(\) - startedAt > KEEP_TRYING_UNTIL_MS/, "the search is unbounded");
  const budget = Number(/const VISION_BUDGET_MS = (\d+)/.exec(route)?.[1]);
  const keepTrying = Number(/const KEEP_TRYING_UNTIL_MS = (\d+)/.exec(route)?.[1]);
  const maxDuration = Number(/export const maxDuration = (\d+)/.exec(route)?.[1]);
  assert.ok((keepTrying + budget) / 1000 < maxDuration, "the last attempt can start too late to finish");
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
