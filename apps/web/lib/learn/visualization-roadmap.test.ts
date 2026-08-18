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
const PROVENANCE = readFileSync(new URL("./visual-provenance.ts", import.meta.url), "utf8");
const SPEECH_ROUTER = readFileSync(new URL("./speech-route.ts", import.meta.url), "utf8");
const VOICE_FUNCTION = readFileSync(
  new URL("../../../../supabase/functions/nemesis-speak/index.ts", import.meta.url),
  "utf8",
);

const SECTION_42 = CONTRACT.slice(CONTRACT.indexOf("# 42."), CONTRACT.indexOf("# 43."));
const SECTION_43 = CONTRACT.slice(CONTRACT.indexOf("# 43."));

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


// 🔴 §42 AND §43 ROT THE SAME WAY §41 DOES, AND FASTER, BECAUSE BOTH DESCRIBE RUNGS AND LANES THAT
// ARE CORRECT AND UNREACHED. A section saying "no registry exists" is true on the day it is written
// and becomes the most misleading paragraph in the document the morning after somebody builds one.
// The checks below fail when reality moves, so the status line has to move in the same change.

test("§42's status line matches whether a registry or a generation wiring exists", () => {
  assert.ok(SECTION_42.length > 0, "§42 has gone missing from the contract");
  assert.match(
    SECTION_42,
    /STATUS: RUNGS ONE AND TWO SHIPPED AND SERVING\. RUNGS THREE AND FOUR EXIST AS ROUTER RULES WITH NO REGISTRY BEHIND THEM\./,
    "§42 must say plainly which rungs are reached",
  );
  // The claim is "no caller passes assets". If one starts to, this is the line that has to move.
  for (const view of [POLICY_VIEW, readFileSync(new URL("../../components/workspace/learn/canvas-document.tsx", import.meta.url), "utf8")]) {
    assert.equal(/assets:/.test(view), false, "a caller now supplies registry assets — §42's status line is stale");
  }
  assert.equal(
    /nemesis-media/.test(ROUTER) || /nemesis-media/.test(PROVENANCE),
    false,
    "the generation rung has been wired — §42 still calls it a router rule only",
  );
});

test("🔴 §42's ladder is the array, not the paragraph", () => {
  // The whole mechanism of the section: an ordering a router calls, rather than one a reader
  // is trusted to honour. Reordering the array without reordering the section fails here.
  assert.match(PROVENANCE, /PROVENANCE_LADDER[^=]*=\s*\[\s*"source_figure",\s*"rendered",\s*"reference_image",\s*"generated_image",/);
  assert.match(SECTION_42, /reuse source figure/);
  const rungs = ["reuse source figure", "render deterministically", "retrieve licensed image", "generate an illustrative image"];
  let cursor = -1;
  for (const rung of rungs) {
    const at = SECTION_42.indexOf(rung);
    assert.ok(at > cursor, `§42's ladder no longer runs ${rungs.join(" → ")}`);
    cursor = at;
  }
});

test("🔴 §42's rule with teeth still has them", () => {
  // The exception this rule would grow is "unless we have nothing else", and it would be added by
  // somebody reasonable, in a hurry, with an empty registry.
  assert.match(SECTION_42, /a generated picture may never be the answer key/i);
  assert.match(PROVENANCE, /export function mayBearAccuracyClaim/);
  assert.match(PROVENANCE, /return provenance !== "generated_image";/);
});

test("§43's status line matches whether a language lane or a pronunciation provider exists", () => {
  assert.ok(SECTION_43.length > 0, "§43 has gone missing from the contract");
  assert.match(
    SECTION_43,
    /THE LANGUAGE LANE HAS RULES, A LOCALE CONTRACT AND NO SESSION TYPE BEHIND IT\. PRONUNCIATION ASSESSMENT DOES NOT EXIST\./,
    "§43 must say plainly what is unreached",
  );
  // Every caller passes `canvas`. The day one passes the other purpose, this line is stale.
  const voiceHook = readFileSync(
    new URL("../../components/workspace/learn/use-canvas-voice.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    /purpose: "language_learning"/.test(voiceHook),
    false,
    "a caller now enters the language lane — §43's status line is stale",
  );
});

test("🔴 §43's locale refusal is a refusal, not a fallback", () => {
  // The failure it prevents is invisible from the outside: fluent audio in the wrong variety.
  assert.match(SECTION_43, /Silence is diagnosable; the wrong accent is not\./);
  assert.match(SPEECH_ROUTER, /reason: "locale-unknown"/);
  assert.equal(
    /targetLocale.*\?\?\s*LOCALE_UNSPECIFIED/.test(SPEECH_ROUTER),
    false,
    "the target-language lane now falls back to `auto` — that is the failure §43 exists to prevent",
  );
});

test("🔴 no provider is claimed as measured while no bake-off has run", () => {
  assert.match(SPEECH_ROUTER, /MEASURED_PROVIDERS:\s*Readonly<Record<string, TtsProvider>>\s*=\s*\{\}/);
  assert.match(SECTION_43, /every locale is `unmeasured-default`/);
});

test("🔴 the function that pays still bounds what the client may ask for", () => {
  // The same argument the character cap makes: a cap that lives only in the caller is a cap
  // anybody can remove with a fetch.
  assert.match(VOICE_FUNCTION, /reason: "locale-malformed"/);
  assert.match(VOICE_FUNCTION, /Math\.min\(1\.2, Math\.max\(0\.7,/);
});
