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

const CHEM = readFileSync(new URL("./chem-notation.ts", import.meta.url), "utf8");
const RESOLVER = readFileSync(new URL("./chem-resolver.ts", import.meta.url), "utf8");
const REGISTRY = readFileSync(new URL("./reference-registry.ts", import.meta.url), "utf8");
const PRONUNCIATION = readFileSync(new URL("./pronunciation-evidence.ts", import.meta.url), "utf8");
const BAKEOFF = readFileSync(new URL("./tts-bakeoff.ts", import.meta.url), "utf8");

const SUBJECTS = readFileSync(new URL("./subject-visuals.ts", import.meta.url), "utf8");
const VERIFICATION = readFileSync(new URL("./visual-verification.ts", import.meta.url), "utf8");
const SUBJECT_RENDERER = readFileSync(
  new URL("../../components/workspace/learn/subject-visual.tsx", import.meta.url),
  "utf8",
);

const SECTION_42 = CONTRACT.slice(CONTRACT.indexOf("# 42."), CONTRACT.indexOf("# 43."));
const SECTION_43 = CONTRACT.slice(CONTRACT.indexOf("# 43."), CONTRACT.indexOf("# 44."));
const SECTION_44 = CONTRACT.slice(CONTRACT.indexOf("# 44."), CONTRACT.indexOf("# 45."));
const SECTION_45 = CONTRACT.slice(CONTRACT.indexOf("# 45."));
const EXPRESSION = readFileSync(new URL("./expression.ts", import.meta.url), "utf8");
const STATISTICS = readFileSync(new URL("./statistics.ts", import.meta.url), "utf8");
const COMPUTED = readFileSync(new URL("./computed-series.ts", import.meta.url), "utf8");

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
    /STATUS: RUNGS ONE AND TWO SHIPPED AND SERVING, NOW INCLUDING CHEMICAL STRUCTURES\. RUNG THREE HAS A LIVE RESOLVER AND AN EMPTY CURATED REGISTRY\. RUNG FOUR EXISTS AS A ROUTER RULE WITH NOTHING WIRED TO IT\./,
    "§42 must say plainly which rungs are reached",
  );
  // 🔴 THE EMPTY REGISTRY IS THE CLAIM MOST LIKELY TO GO STALE, because seeding it is the obvious
  // next task and the person doing it will not be reading this section.
  assert.match(
    REGISTRY,
    /REFERENCE_REGISTRY: readonly CuratedEntry\[\] = \[\]/,
    "the curated registry has rows — §42 still calls it empty",
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
    /PRONUNCIATION ASSESSMENT SHIPPED IN §47 AND NO LESSON CALLS IT YET\./,
    "§43 must say plainly what is and is not reached",
  );
  // 🔴 THE SCHEMA FILE STAYS PURE AND CLIENT-SAFE, WHICH IS WHY IT NEVER GREW THE PROVIDER. §47 put
  // the assessor in `lib/speech`, which is server-only; this file is the vocabulary every surface
  // reads. A URL appearing here means the boundary collapsed into the type it was protecting.
  assert.equal(
    /https?:\/\//.test(PRONUNCIATION),
    false,
    "pronunciation-evidence.ts now calls something — it is the schema, not the provider",
  );
  assert.match(
    readFileSync(new URL("../speech/pronunciation.ts", import.meta.url), "utf8"),
    /reason: "no-provider"/,
    "the named gap disappeared — a deployment with no key must still say so",
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


// 🔴 §42'S CHEMISTRY CLAIMS AND §43'S BENCH CLAIMS ARE TIED THE SAME WAY. Both describe things that
// are built, which is exactly the kind of paragraph this file's header says outlives the moment it
// was true.

test("🔴 §42's chemistry lane is the equation lane, and the spec carries notation rather than geometry", () => {
  assert.match(SECTION_42, /CHEMICAL STRUCTURES ARE THE EQUATION LANE WITH A DIFFERENT NOTATION/);
  assert.ok(VISUAL_CONTRACT.includes('kind: "structure"'), "the structure kind has gone from the spec");
  // 🔴 THE NOTATION IS A NAMED TYPE, NOT A LITERAL, SINCE REACTIONS LANDED. Asserting the literal
  // would fail the moment a second notation is owned — which is a capability being ADDED, exactly
  // the change this guard must not punish. What matters is that the field carries a notation name
  // and that `chem-notation.ts` decides which names exist.
  assert.match(VISUAL_CONTRACT, /notation: ChemNotation/);
  assert.match(CHEM, /export type ChemNotation = "reaction-smiles" \| "smiles"/);
  // The rule with teeth for this lane: no renderer configuration, no path data, no SVG. Checked
  // against the interface body only, so prose elsewhere in the file cannot satisfy or trip it.
  const body = VISUAL_CONTRACT.slice(
    VISUAL_CONTRACT.indexOf("export interface StructureVisual"),
    VISUAL_CONTRACT.indexOf("export type CanvasVisualRequest"),
  );
  for (const term of ["svg", "path", "coordinates", "geometry"]) {
    assert.equal(
      new RegExp(`\\b${term}\\??:`, "i").test(body),
      false,
      `StructureVisual carries a ${term} field — the model is supplying drawing instructions again`,
    );
  }
});

test("🔴 the unclosed-ring refusal survives, because the parser accepts what it catches", () => {
  assert.match(SECTION_42, /renders WRONG is worse than one that refuses/);
  assert.match(CHEM, /structure-unclosed-ring/);
});

test("🔴 the resolver still prefers the isomeric form", () => {
  // Dropping stereochemistry makes a chirality question unanswerable, and nothing downstream could
  // tell that it had happened.
  assert.match(SECTION_42, /prefers the \*\*isomeric\*\* SMILES/);
  assert.match(RESOLVER, /SMILES_FIELDS = \["IsomericSMILES"/);
});

test("🔴 pathways reused the relationship renderer, and the extension stayed general", () => {
  assert.match(SECTION_42, /PATHWAYS REUSED THE RELATIONSHIP RENDERER/);
  assert.match(VISUAL_CONTRACT, /EdgePolarity = "increases" \| "decreases" \| "plain"/);
  // The line that must not be crossed: a domain vocabulary in the spec.
  for (const verb of ["phosphorylates", "transcribes", "binds", "catalyses"]) {
    assert.equal(VISUAL_CONTRACT.includes(`"${verb}"`), false, `${verb} is in the spec — this is a pathway engine now`);
  }
});

test("🔴 the bench cannot name a winner from a field of one", () => {
  assert.match(SECTION_43, /One rated provider is never a winner/);
  assert.match(BAKEOFF, /only-one-provider-rated/);
  assert.match(BAKEOFF, /"tied"/);
});

test("🔴 no price stands without its provenance, and the disputed one still says so", () => {
  assert.match(SECTION_43, /THE COST COLUMN/);
  // Every rate carries where it came from. A bare number in this table is the failure.
  const sources = [...BAKEOFF.matchAll(/source: "([^"]*)"/g)].map((match) => match[1]);
  const rates = [...BAKEOFF.matchAll(/usdPerMillionChars: ([^,\n}]+)/g)].map((match) => match[1].trim().replace(/;$/, ""));
  assert.ok(sources.length >= 4, "provider pricing has lost its source field");
  assert.ok(rates.length > 0, "the provider catalogue has lost its cost column");
  // A recalled figure may never become a cost — that rule lives in pricedFor.
  assert.match(BAKEOFF, /if \(pricing\.usdPerMillionChars === null \|\| pricing\.evidence === "recalled"\) return null;/);
  assert.match(BAKEOFF, /disputed: the function bills 4\.20/);
});


// 🔴 §44 MAKES FOUR CLAIMS THAT ROT, AND EVERY ONE OF THEM IS ABOUT SOMETHING BEING CHECKED. A
// section that says "the arithmetic is verified" is worthless the day a verification is quietly
// skipped, and the person skipping it will be doing so to make a test pass.

test("§44's status line matches whether a lesson emits these or anything executes", () => {
  assert.ok(SECTION_44.length > 0, "§44 has gone missing from the contract");
  assert.match(
    SECTION_44,
    /STATUS: ALL FIVE REPRESENTATIONS SHIPPED AND ROUTED, WITH EVERY NUMERIC CLAIM VERIFIED\. NO CANVAS LESSON EMITS ONE YET\. NOTHING EXECUTES CODE\./,
    "§44 must say plainly what is unreached",
  );
  // The moment a teaching prompt asks for one of these, the status line is stale.
  const prompts = readFileSync(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
  for (const kind of ['"table"', '"timeline"', '"construction"', '"vectors"']) {
    assert.equal(prompts.includes(kind), false, `canvas-prompts now asks for ${kind} — §44's status line is stale`);
  }
});

test("🔴 five representations, and not one of them is named after a subject", () => {
  const ROUTER_TEXT = readFileSync(new URL("./visual-route.ts", import.meta.url), "utf8");
  for (const shape of ['"table"', '"timeline"', '"construction"', '"vectors"', '"code"']) {
    assert.ok(ROUTER_TEXT.includes(shape), `the router lost the ${shape} representation`);
  }
  // The line that must never be crossed. §41's rule, checked on the new vocabulary.
  for (const subject of ["accounting", "physics", "finance", "history", "geometry", "statistics"]) {
    assert.equal(
      new RegExp(`representation[^\\n]*"${subject}"|\\| "${subject}"`).test(ROUTER_TEXT),
      false,
      `"${subject}" has become a representation — the router has learned a subject`,
    );
  }
});

test("🔴 every numeric claim is still recomputed rather than trusted", () => {
  assert.match(SECTION_44, /an unverified computed answer may not be an answer key/i);
  // Each of the four checks §44 tabulates, called from the validator rather than merely existing.
  for (const call of ["verifyTotal(", "verifyBalance(", "verifyAngle(", "verifyEquilibrium("]) {
    assert.ok(SUBJECTS.includes(call), `${call} is no longer called — a claim is being trusted again`);
  }
  // The refusal exists and is produced from a verification result rather than hand-written, so a
  // check cannot be dropped while the reason survives as a decoration.
  assert.match(SUBJECTS, /refuse\("failed-verification"/);
  assert.match(SUBJECTS, /function fromVerification/);
});

test("🔴 a mismatch still refuses rather than silently correcting", () => {
  assert.match(SECTION_44, /A MISMATCH REFUSES; IT NEVER SILENTLY CORRECTS/);
  // The shape of the fix somebody would reach for: replacing the stated value with the computed one.
  assert.equal(
    /stated\s*=\s*sum|value:\s*sum\b/.test(SUBJECTS),
    false,
    "a stated total is being overwritten with the computed one — that hides the model producing it",
  );
});

test("🔴 money and geometry still do not share a tolerance", () => {
  assert.match(SECTION_44, /different tolerances/);
  assert.match(VERIFICATION, /export function moneyAgrees/);
  assert.match(VERIFICATION, /Math\.abs\(a - b\) < 0\.005/);
});

test("🔴 the code trace cannot claim to have been executed", () => {
  assert.match(SECTION_44, /stamped by the validator, never accepted from the request/);
  // The stamp is written by the validator, not read from the request.
  assert.match(SUBJECTS, /traceOrigin: "narrated" as const/);
  assert.equal(
    /traceOrigin:\s*(value|item)\.traceOrigin/.test(SUBJECTS),
    false,
    "traceOrigin is being read from the request — a model can now claim its narration was an execution",
  );
  // And the learner-facing label survives.
  assert.match(SUBJECT_RENDERER, /not produced by running the code/);
});

test("🔴 nothing executes code", () => {
  assert.match(SECTION_44, /Nothing in this repository executes learner or model code/);
  for (const danger of ["eval(", "new Function(", "child_process", "vm.runIn"]) {
    assert.equal(SUBJECTS.includes(danger), false, `${danger} has appeared in the subject lane`);
    assert.equal(SUBJECT_RENDERER.includes(danger), false, `${danger} has appeared in the subject renderer`);
  }
});


// 🔴 §45 IS THE SECTION MOST DANGEROUS TO GET WRONG, because it is the one place a model's output is
// EXECUTED. Every check below guards something that would look like a harmless simplification.

test("§45's status line matches whether a lesson emits one and where the parser runs", () => {
  assert.ok(SECTION_45.length > 0, "§45 has gone missing from the contract");
  assert.match(
    SECTION_45,
    /STATUS: EXPRESSIONS, DISTRIBUTIONS AND SEEDED SIMULATION SHIPPED AND TESTED\. NO LESSON EMITS ONE YET\. NOTHING MODEL-WRITTEN REACHES THE DOM\./,
  );
  // The expression layer must not reach the browser: no client component may import it.
  const clientFiles = ["subject-visual.tsx", "semantic-visual.tsx", "chemical-structure.tsx", "canvas-document.tsx"];
  for (const file of clientFiles) {
    const source = readFileSync(new URL(`../../components/workspace/learn/${file}`, import.meta.url), "utf8");
    for (const heavy of ["expression", "computed-series", "mathjs", "simple-statistics"]) {
      assert.equal(
        source.includes(`/${heavy}"`) || source.includes(`"${heavy}"`),
        false,
        `${file} imports ${heavy} — the maths layer has reached the learner's bundle`,
      );
    }
  }
});

test("🔴 the line §45 draws is still drawn: computation yes, rendering no", () => {
  assert.match(SECTION_45, /Model-written computation is safe\. Model-written rendering is not\./);
  // §41's rule is the other half and must not have been softened to make room.
  assert.match(
    SECTION,
    /must not generate arbitrary Three\.js, D3 or React visualization code/,
    "§41's constraint was softened when §45 landed",
  );
});

test("🔴 the AST allow list is still the defence, not the scope", () => {
  // The probe that proved it: config({}) runs under a constrained scope and is stopped by the walk.
  assert.match(SECTION_45, /`config\(\{\}\)` RUNS/);
  assert.match(EXPRESSION, /ALLOWED_NODES/);
  assert.match(EXPRESSION, /tree\.traverse\(/);
  for (const dangerous of ["FunctionAssignmentNode", "AccessorNode", "IndexNode", "ObjectNode", "ArrayNode", "AssignmentNode", "BlockNode"]) {
    assert.equal(
      new RegExp(`ALLOWED_NODES[^\\]]*"${dangerous}"`, "s").test(EXPRESSION),
      false,
      `${dangerous} has been added to the allow list — that is a program, not an expression`,
    );
  }
});

test("🔴 no escape hatch has been added to the function list", () => {
  for (const name of ["import", "createUnit", "config", "eval", "parse", "compile"]) {
    assert.equal(
      new RegExp(`^\\s+${name}:`, "m").test(EXPRESSION),
      false,
      `${name} has been added to the callable functions`,
    );
  }
});

test("🔴 simulation is still seeded, and Math.random is still absent", () => {
  assert.match(SECTION_45, /A SIMULATION THAT CHANGES EACH TIME IS NOT A TEACHING OBJECT/);
  assert.equal(
    /Math\.random\(\)/.test(STATISTICS),
    false,
    "Math.random has appeared in the statistics lane — simulations are no longer reproducible",
  );
  // The seed is a required positional argument, not an option with a default.
  assert.match(STATISTICS, /export function sample\(spec: DistributionSpec, count: number, seed: number\)/);
});

test("🔴 a pole still splits the curve", () => {
  assert.match(SECTION_45, /A pole is not a hole/i);
  assert.match(COMPUTED, /crossesPole/);
});

test("🔴 the algebra check still says it is sampled rather than proved", () => {
  assert.match(SECTION_45, /SAMPLED, NOT PROVED/);
  assert.match(VERIFICATION, /SAMPLED, NOT PROVED/);
  assert.match(VERIFICATION, /reason: "not-equivalent"|fail\(\s*"not-equivalent"/s);
});

test("🔴 §46 — the renderers place what they are handed and compute nothing", () => {
  // 🔴 THE DEFECT THIS GUARDS AGAINST IS NOT A WRONG NUMBER, IT IS A NUMBER IN THE WRONG FILE. Three
  // layout defects shipped because position was computed inside React components, where the only way
  // to ask "do these two labels overlap?" is to render a browser and look. Move that arithmetic back
  // into a component and the assertions in `visual-layout.test.ts` stop covering what ships.
  assert.match(VISUAL_RENDERER, /layoutFlow/, "the relationship renderer stopped using the layout module");
  assert.match(SUBJECT_RENDERER, /layoutTimeline/, "the timeline renderer stopped using the layout module");
  assert.match(SUBJECT_RENDERER, /layoutConstruction/, "the construction renderer stopped using the layout module");
  assert.match(CONTRACT, /# 46\. .*WHERE THINGS GO IS ARITHMETIC/);
});

test("🔴 §46 — nothing in the layout module measures text", () => {
  // A layout that asks the browser how wide a string is gives one answer on the server and another
  // in the page, and the picture moves after the learner has already looked at it.
  const layout = readFileSync(new URL("./visual-layout.ts", import.meta.url), "utf8");
  for (const forbidden of ["getComputedTextLength", "getBBox", "measureText", "document.", "window."]) {
    assert.ok(!layout.includes(forbidden), `visual-layout.ts reaches for ${forbidden}`);
  }
});

test("🔴 §47 — the speech registry only names providers Nemesis can actually call", () => {
  // 🔴 THE FAILURE THIS GUARDS AGAINST HAS HAPPENED IN THIS REPO ONCE. §41 described eleven
  // knowledge kinds while the code had one lane, and the gap read as description rather than intent.
  // A provider union is the same trap: a vendor name with no integration behind it reads as a working
  // multi-provider router to the next person who opens the file.
  const speechRoute = readFileSync(new URL("./speech-route.ts", import.meta.url), "utf8");
  const capabilities = readFileSync(new URL("../speech/capabilities.ts", import.meta.url), "utf8");
  const union = speechRoute.match(/export type TtsProvider =([^;]+);/)?.[1] ?? "";
  const named = [...union.matchAll(/"([a-z]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(named, ["azure", "xai"], "a synthesiser was named that nothing calls");
  for (const provider of named) {
    assert.match(capabilities, new RegExp(`provider: "${provider}"`), `${provider} routes but has no capability row`);
  }
  assert.match(CONTRACT, /# 47\. .*AZURE EARNS TWO CAPABILITIES/);
});

test("🔴 §47 — the Azure key has exactly one reader, and it is not a client module", () => {
  // The full scan lives in lib/speech/secrets.test.ts. This is the contract-facing half: the status
  // line above claims the key is server-side, and a claim in a document is worth what enforces it.
  const config = readFileSync(new URL("../speech/azure/config.ts", import.meta.url), "utf8");
  assert.match(config, /typeof window !== "undefined"/, "the server-only guard was removed");
  assert.ok(!config.includes("use client"));
  assert.match(CONTRACT, /THE KEY IS READ IN ONE FILE, AND A TEST ENFORCES IT/);
});
