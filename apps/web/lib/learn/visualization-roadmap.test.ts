// §41 distinguishes the first trusted routes from the advanced routes that remain planned.
//
// 🔴 THE FAILURE THIS EXISTS TO PREVENT HAS ALREADY HAPPENED ONCE IN THIS REPO. The contract
// described eleven knowledge kinds while the code had a single lane, and the gap was read as a
// description of built behaviour rather than of intent — nobody was lying, the document simply
// outlived the moment it was true. A roadmap section is the most likely thing in any spec to rot,
// because the day it stops being accurate is the day someone is busy shipping the thing that
// made it inaccurate.
//
// So the status line is tied to reality: the moment any renderer in the planned stack is actually
// installed, this test fails and whoever installed it has to move the status line in the same
// change. That is the whole mechanism. It does not police the design — it polices the claim.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const CONTRACT = readFileSync(
  new URL("../../../../docs/canvas-product-contract.md", import.meta.url),
  "utf8",
);
const WEB_PACKAGE = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
const VISUAL_CONTRACT = readFileSync(new URL("./canvas-visual.ts", import.meta.url), "utf8");
const VISUAL_RENDERER = readFileSync(
  new URL("../../components/workspace/learn/semantic-visual.tsx", import.meta.url),
  "utf8",
);
const ROUTER = readFileSync(new URL("./visual-route.ts", import.meta.url), "utf8");
const POLICY_VIEW = readFileSync(
  new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url),
  "utf8",
);

/** The stack §41 names, by the package that would appear if one were adopted. */
//
// 🔴 `katex` IS DELIBERATELY ABSENT FROM THIS LIST, AND THE REASON IS RECORDED IN §41. It is
// already installed — it arrived with markdown maths for chat and the note editor, long before
// any of this — so listing it would make the guard permanently red and it would be deleted within
// a week. §41 states that exception in prose instead. Every OTHER renderer here is genuinely
// absent today, so each one going red means something real just changed.
const PLANNED_RENDERERS: readonly string[] = [
  "jsxgraph",
  "mermaid",
  "vega-lite",
  "vega-embed",
  "@react-three/fiber",
  "three",
];

const SECTION = CONTRACT.slice(CONTRACT.indexOf("# 41."));

test("§41 distinguishes shipped trusted routes from advanced routes", () => {
  assert.ok(SECTION.length > 0, "§41 has gone missing from the contract");
  // 🔴 THE CLAIM IS ABOUT THE ROUTER, NOT ABOUT EVERY RENDERER. KaTeX is already installed, so a
  // flat "NOT BUILT" would be false — and a status line that is visibly false is worse than none,
  // because it teaches the next reader to discount the whole section.
  assert.match(
    SECTION,
    /STATUS: FIRST TRUSTED ROUTES SHIPPED[^\n]*ADVANCED ROUTES REMAIN PLANNED/,
    "§41 must say plainly what is shipped and what remains planned",
  );
  for (const kind of ["equation", "relationship", "quantitative"]) {
    assert.ok(VISUAL_CONTRACT.includes(`kind: "${kind}"`), `${kind} is documented as shipped but absent from the contract`);
  }
  assert.match(VISUAL_RENDERER, /katex\.renderToString/);
  assert.match(VISUAL_RENDERER, /<svg/);
});

test("🔴 no advanced renderer is installed while §41 still calls those routes planned", () => {
  const declared = JSON.parse(WEB_PACKAGE) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const installed = new Set([
    ...Object.keys(declared.dependencies ?? {}),
    ...Object.keys(declared.devDependencies ?? {}),
  ]);

  const found = PLANNED_RENDERERS.filter((pkg) => installed.has(pkg));
  assert.deepEqual(
    found,
    [],
    `${found.join(", ")} is installed, so an advanced route may no longer be merely planned. ` +
      "Move §41's status line in the same change that adds the renderer.",
  );
});

test("🔴 the ordering that keeps this below the core survives", () => {
  // The owner's priority list is the part of §41 most likely to be quietly dropped, because it is
  // the part that says "not yet" to the most enjoyable engineering in the document.
  assert.match(SECTION, /Excellent adaptive learning \/ session algorithm/);
  assert.match(SECTION, /Selective 3D and advanced simulations/);
  const core = SECTION.indexOf("Excellent adaptive learning");
  const threeD = SECTION.indexOf("Selective 3D and advanced simulations");
  assert.ok(core < threeD, "the priority list has been reordered — 3D must remain last");
});

// 🔴 THE STATUS LINE AND THE PACKAGE LIST WERE THE ONLY THINGS TIED TO REALITY, AND §41 MAKES TWO
// MORE CLAIMS THAT ROT THE SAME WAY. The section now says the router EXISTS and that it ABSORBED
// the source-figure path. Both were future tense until this change, and a paragraph describing
// built behaviour is exactly the kind this file's own header says "outlived the moment it was
// true". So both claims fail here if the code stops backing them.
test("🔴 §41's claim that the router exists is tied to the router existing", () => {
  assert.match(SECTION, /The router exists/, "§41 no longer claims a router — has it been removed?");
  assert.match(SECTION, /routeVisual\(\)/);
  assert.match(ROUTER, /export function routeVisual/);
  // The three decisions §41 names. A router that can only say yes is not a router.
  for (const decision of ['decision: "render"', 'decision: "prose"', 'decision: "refused"']) {
    assert.ok(ROUTER.includes(decision), `the router no longer returns ${decision}`);
  }
});

test("🔴 §41's claim that the source-figure path was absorbed is tied to the component asking", () => {
  assert.match(SECTION, /THE ROUTER HAS SUBSUMED IT/);
  assert.ok(ROUTER.includes('"source_figure"'), "the router lost the source-figure representation");
  // The whole point of the absorption: the component asks rather than deciding. If these four
  // conditions reappear in the view, the second visual system has grown back.
  assert.match(POLICY_VIEW, /routeVisual\(/, "canvas-policy-view no longer asks the router");
  for (const rule of ["isOccludable", "figure.labels.find"]) {
    assert.equal(POLICY_VIEW.includes(rule), false, `the occlusion rule "${rule}" has moved back into the view`);
  }
});

test("🔴 the constrained-interface rule is still stated", () => {
  // Everything else in §41 is a preference. This is the rule with teeth: generated visualization
  // code is unreviewable, unbounded in cost, and fails in front of the learner.
  assert.match(
    SECTION,
    /must not generate arbitrary Three\.js, D3 or React visualization code/,
    "§41's load-bearing constraint has been softened or removed",
  );
  assert.match(SECTION, /visualize\(\{/, "the semantic interface sketch is gone");
});
