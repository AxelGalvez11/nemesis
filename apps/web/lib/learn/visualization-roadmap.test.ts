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
const RESOLVER_WIRING = readFileSync(new URL("./structure-resolve.ts", import.meta.url), "utf8");
const RESOLVER_ROUTE = readFileSync(new URL("../../app/api/learn/structure/route.ts", import.meta.url), "utf8");
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
const COMPUTED_WIRING = readFileSync(new URL("./plot-compute.ts", import.meta.url), "utf8");
const ROUTE = readFileSync(new URL("../../app/api/learn/plot/route.ts", import.meta.url), "utf8");

/** The stack §41 names, by the package that would appear if one were adopted. */
//
// 🔴 `katex` IS DELIBERATELY ABSENT FROM THIS LIST, AND THE REASON IS RECORDED IN §41. It is
// already installed — it arrived with markdown maths for chat and the note editor, long before
// any of this — so listing it would make the guard permanently red and it would be deleted within
// a week. §41 states that exception in prose instead. Every OTHER renderer here is genuinely
// absent today, so each one going red means something real just changed.
//
// 🔴 `three` LEFT THIS LIST ON 2026-08-24, AND THE GUARD DID ITS JOB ON THE WAY OUT. It went red
// the moment the surface renderer's dependency landed, and §41's status line moved in the same
// commit — which is the entire mechanism. The surface guard below now holds the shipped route to
// its own rules instead.
// 🔴 "mermaid" LEFT THIS LIST ON 2026-08-30, the day it shipped by owner order as prose fences in
// chat (see §41's table row). The guard's job is unchanged for the rest: an installed renderer
// with a "planned" status line is a doc telling the next reader a lie.
const PLANNED_RENDERERS: readonly string[] = [
  "jsxgraph",
  "vega-lite",
  "vega-embed",
  "@react-three/fiber",
];

const SECTION = CONTRACT.slice(CONTRACT.indexOf("# 41."));


/**
 * The element at an index, or a failed test.
 *
 * 🔴 A FUNCTION RATHER THAN `!`, BECAUSE THE TWO FAIL DIFFERENTLY. `list[0]!` silences the compiler
 * and then throws "cannot read properties of undefined" a few lines later, naming neither the list
 * nor the index. This says which index was empty, at the moment it was empty.
 */
function at<T>(list: readonly T[], index = 0): T {
  const found = list[index];
  assert.ok(found, `nothing at index ${index}`);
  return found;
}

test("§41 distinguishes shipped trusted routes from advanced routes", () => {
  assert.ok(SECTION.length > 0, "§41 has gone missing from the contract");
  // 🔴 THE CLAIM IS ABOUT THE ROUTER, NOT ABOUT EVERY RENDERER. KaTeX is already installed, so a
  // flat "NOT BUILT" would be false — and a status line that is visibly false is worse than none,
  // because it teaches the next reader to discount the whole section.
  assert.match(
    SECTION,
    /STATUS: FIRST TRUSTED ROUTES SHIPPED[^\n]*SELECTIVE-3D[^\n]*ADVANCED ROUTES REMAIN PLANNED/,
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

test("§42's status line matches what the registry, the figure lane and the generation wiring are", () => {
  assert.ok(SECTION_42.length > 0, "§42 has gone missing from the contract");
  assert.match(
    SECTION_42,
    // 🔴 THE STATUS LINE MOVED ON 2026-08-21 AND AGAIN ON 2026-08-23, AND THE GUARD MOVED WITH IT
    // BOTH TIMES. That is the entire mechanism this file exists for: the day the registry was
    // seeded and the figure lane was wired, this regex went red until the section told the truth.
    // The rung that is still unreached is named in the same breath, which is the property this
    // test protects.
    /STATUS: RUNGS ONE, TWO AND THREE SHIPPED AND SERVING\..*RUNG FOUR EXISTS AS A ROUTER RULE WITH NOTHING WIRED TO IT\./,
    "§42 must say plainly which rungs are reached",
  );
  // 🔴 THE SEEDED REGISTRY IS NOW THE CLAIM, and it is tied from both sides: rows must exist, and
  // `reference-registry.test.ts` re-verifies every row's licence, credit and host on every run.
  assert.equal(
    /REFERENCE_REGISTRY: readonly CuratedEntry\[\] = \[\]/.test(REGISTRY),
    false,
    "the curated registry is empty again — §42 now claims it is seeded",
  );
  assert.match(REGISTRY, /assetPath: "https:\/\/upload\.wikimedia\.org\//, "the registry's rows have lost their assets");
  // 🔴 THE CALLER-SUPPLIED ASSET LANE REMAINS UNWIRED, AND SAYING SO PRECISELY IS THE POINT. Rung
  // three serves through the REQUEST path (`figure-resolve.ts` → the reference-image route → a
  // stored, licence-gated asset on the spec). Neither view fetches candidates itself and passes
  // `assets:` to the router — the day one starts to, this is the line that has to move.
  for (const view of [POLICY_VIEW, readFileSync(new URL("../../components/workspace/learn/canvas-document.tsx", import.meta.url), "utf8")]) {
    assert.equal(/assets:/.test(view), false, "a caller now supplies registry assets — §42's account of the wiring is stale");
  }
  assert.equal(
    /nemesis-media/.test(ROUTER) || /nemesis-media/.test(PROVENANCE),
    false,
    "the generation rung has been wired — §42 still calls it a router rule only",
  );
});

// 🔴 THE 2026-08-23 CLAIMS ARE TIED TO REALITY THE SAME WAY EVERY EARLIER ONE WAS. Each assertion
// below names one thing §42 now says is true of the product; if the code stops backing it, the
// section has to move in the same change.
test("🔴 §42's figure lane is reachable from a lesson, and the strip protects the asset field", () => {
  assert.match(SECTION_42, /RUNG THREE WENT LIVE ON 2026-08-23/i);
  // The vocabulary offers it, the seam resolves it, the route exists, the renderer credits it.
  const prompts = readFileSync(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
  assert.ok(prompts.includes('"kind":"figure"'), "the prompt no longer offers the figure request");
  const seam = readFileSync(new URL("./answer-prepare.ts", import.meta.url), "utf8");
  assert.match(seam, /resolveFigures/, "the answer seam no longer runs the figure pass");
  const resolve = readFileSync(new URL("./figure-resolve.ts", import.meta.url), "utf8");
  assert.match(resolve, /asset: _claimed/, "the model-asset strip has left the figure pass");
  const route = readFileSync(new URL("../../app/api/learn/reference-image/route.ts", import.meta.url), "utf8");
  assert.match(route, /chooseAsset/, "the reference route no longer runs the licence gate");
  const renderer = readFileSync(new URL("../../components/workspace/learn/reference-figure.tsx", import.meta.url), "utf8");
  assert.match(renderer, /creditLineFor/, "the figure renderer no longer draws the credit line");
});

test("🔴 §42's macromolecule claims are tied to the viewer, the resolver and the vocabulary", () => {
  assert.match(SECTION_42, /Macromolecules are \*\*built\*\*/);
  const declared = JSON.parse(WEB_PACKAGE) as { dependencies?: Record<string, string> };
  assert.ok((declared.dependencies ?? {}).molstar, "molstar is gone from dependencies — §42 still claims a viewer");
  const prompts = readFileSync(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
  assert.ok(prompts.includes('"kind":"macromolecule"'), "the prompt no longer offers the macromolecule request");
  const seam = readFileSync(new URL("./answer-prepare.ts", import.meta.url), "utf8");
  assert.match(seam, /resolveMacromolecules/, "the answer seam no longer runs the macromolecule pass");
  const resolver = readFileSync(new URL("./macromolecule-resolver.ts", import.meta.url), "utf8");
  assert.match(resolver, /search\.rcsb\.org/, "the accession resolver no longer asks RCSB");
  // A name resolves; a bare model-written accession dies. The two lines that make both true.
  const resolve = readFileSync(new URL("./macromolecule-resolve.ts", import.meta.url), "utf8");
  assert.match(resolve, /accession: _claimed/, "the model-accession strip has left the macromolecule pass");
  const viewer = readFileSync(
    new URL("../../components/workspace/learn/macromolecule-viewer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(viewer, /import\("molstar\/lib\/mol-plugin\/context"\)/, "the viewer no longer lazy-loads its engine");
});

test("🔴 §42's anatomy claims are tied to the harvest, the registry door and the viewer", () => {
  assert.match(SECTION_42, /The anatomy atlas shipped 2026-08-24/);
  const prompts = readFileSync(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
  assert.ok(prompts.includes('"kind":"anatomy"'), "the prompt no longer offers the anatomy request");
  const seam = readFileSync(new URL("./answer-prepare.ts", import.meta.url), "utf8");
  assert.match(seam, /resolveAnatomy/, "the answer seam no longer runs the anatomy pass");
  // 🔴 THE LICENCE ACT: the harvest strips every texture before anything reaches the repo,
  // because the source's textures are NC and NC is refused across this codebase by design.
  const harvest = readFileSync(new URL("../../scripts/anatomy-harvest.mts", import.meta.url), "utf8");
  assert.match(harvest, /texture\.dispose\(\)/, "the harvest no longer strips the NC textures");
  assert.match(harvest, /CC-BY-SA-4\.0/, "the harvest no longer records the mesh licence");
  // The registry is the only door: the validator holds the asset to a same-origin /anatomy/ path.
  assert.match(VISUAL_CONTRACT, /\/anatomy\\\/\[a-z0-9-\]\+\\\.glb/, "the same-origin asset rule has left the validator");
  // The viewer keeps the Mol* discipline: its own chunk, the decoder from our own dependency.
  const viewer = readFileSync(new URL("../../components/workspace/learn/anatomy-viewer.tsx", import.meta.url), "utf8");
  assert.match(viewer, /setDecoderPath\("\/draco\/"\)/, "the viewer no longer decodes from our own /draco/ copy");
  const scripts = JSON.parse(WEB_PACKAGE) as { scripts?: Record<string, string> };
  assert.match(scripts.scripts?.prebuild ?? "", /copy-draco-decoder/, "the decoder copy has left prebuild");
});

test("🔴 every atlas the harvest names can be credited, on its OWN licence", () => {
  // 🔴🔴 THE HARVEST AND THE CREDIT MODULE ARE TWO HAND-KEPT COPIES OF ONE TABLE, and they are
  // apart on purpose: the registry may not reach the learner's bundle (see the next test), so the
  // viewer's credit line lives in its own tiny module. That split is what makes drift possible —
  // a region harvested under a source id the viewer has never heard of renders with somebody
  // else's attribution under it, which for a share-alike mesh is the precise failure the licence
  // exists to prevent. The third source made this real: HRA is CC BY 4.0 where the first two are
  // CC BY-SA 4.0, so the TERMS travel per region now, not only the name.
  const harvest = readFileSync(new URL("../../scripts/anatomy-harvest.mts", import.meta.url), "utf8");
  const licence = readFileSync(new URL("./anatomy-licence.ts", import.meta.url), "utf8");
  const ids = (source: string): string[] =>
    [...source.matchAll(/^ {2}"([a-z0-9-]+)": \{$/gm)].map((match) => match[1] ?? "").sort();
  assert.deepEqual(
    ids(harvest),
    ids(licence),
    "the harvest and the credit module disagree about which atlases exist",
  );
  assert.ok(ids(licence).includes("hra"), "the female atlas has left the credit module");
  assert.match(licence, /CC-BY-4\.0/, "the third atlas's own licence is no longer recorded");
  // §42 has to say where the female organs come from, because "the model is male" was true here
  // for three days and is the kind of claim that outlives its moment.
  assert.match(SECTION_42, /Human Reference Atlas/);
});

test("🔴 the atlas REGISTRY never reaches the learner's bundle — §45's rule, applied to data", () => {
  // 🔴🔴 THE REGISTRY IS 3,700-ODD STRUCTURE NAMES AND GROWS WITH EVERY REGION HARVESTED. It was
  // imported straight into the resolve pass on the day the lane shipped, and `prepareAnswer` runs
  // in the BROWSER (`canvas-chat.ts` calls it) — so a learner reading a history lesson downloaded
  // the name of every bone, muscle, nerve and vessel to discover their answer named none of them.
  // The fix was the shape every heavy lane already uses: a route owns the data, the browser posts
  // a name. This guard is what stops the shortcut being taken again.
  assert.match(SECTION_42, /server-side only/i);
  const clientReachable = [
    "lib/learn/anatomy-resolve.ts",
    "lib/learn/anatomy-lookup.ts",
    "lib/learn/answer-prepare.ts",
    "lib/learn/canvas-visual.ts",
    "components/workspace/learn/anatomy-viewer.tsx",
    "components/workspace/learn/semantic-visual.tsx",
    "components/workspace/learn/canvas-document.tsx",
  ];
  for (const file of clientReachable) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    for (const heavy of ["anatomy-atlas", "anatomy-match"]) {
      assert.equal(
        source.includes(`"./${heavy}"`) || source.includes(`/learn/${heavy}"`),
        false,
        `${file} imports ${heavy} — the atlas registry has reached the learner's bundle`,
      );
    }
  }
  // ...and the route that legitimately holds it still does.
  const route = readFileSync(new URL("../../app/api/learn/anatomy/route.ts", import.meta.url), "utf8");
  assert.match(route, /anatomy-match/, "the anatomy route no longer owns the matcher");
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
  // 🔴 THE STATUS LINE AND THE CODE MUST AGREE, AND THIS IS ASSERTED FROM THE OTHER SIDE NOW. It
  // used to read "every caller passes `canvas`; the day one passes the other purpose, this line is
  // stale" — and that day came: a reply can mark a sentence with `[say: locale | text]` and
  // `speakExample` enters the language lane with its locale. The prediction was right, so the
  // assertion flips rather than relaxes: a caller must exist, and §43 must say so.
  const voiceHook = readFileSync(
    new URL("../../components/workspace/learn/use-canvas-voice.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    voiceHook,
    /purpose: "language_learning"/,
    "nothing enters the language lane any more — §43's status line is stale in the other direction",
  );
  assert.match(SECTION_43, /THE LANGUAGE LANE IS NOW REACHED FROM A CONVERSATION/);
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
  const rates = [...BAKEOFF.matchAll(/usdPerMillionChars: ([^,\n}]+)/g)].map((match) => (match[1] ?? "").trim().replace(/;$/, ""));
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
    /STATUS: ALL EIGHT REPRESENTATIONS SHIPPED, ROUTED AND OFFERED TO THE TEACHING PROMPT, WITH EVERY NUMERIC CLAIM VERIFIED\. NOTHING EXECUTES CODE\./,
    "§44 must say plainly what is reached",
  );
  // 🔴 THE CLAIM FLIPPED ON 2026-08-19 AND THIS GUARD IS WHY IT COULD NOT BE FORGOTTEN. It asserted
  // for months that no prompt asked for these; the day the vocabulary was extended it went red, and
  // moving the status line was part of the same commit. That is the entire mechanism.
  const prompts = readFileSync(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
  for (const kind of ['"table"', '"timeline"', '"construction"', '"vectors"', '"code"', '"score"', '"circuit"', '"surface"']) {
    assert.ok(prompts.includes(kind), `canvas-prompts stopped offering ${kind} — §44's status line is stale`);
  }
  // Nothing runs the code, and the label saying so is still on screen.
  assert.equal(prompts.includes("traceOrigin"), false, "the prompt now sets traceOrigin — that stamp is the validator's");
});

test("🔴 the vocabulary offered to the model and the vocabulary the validator accepts are the same set", () => {
  // 🔴 THE DRIFT THIS PREVENTS IS SILENT IN BOTH DIRECTIONS. A shape the validator accepts but the
  // prompt never mentions is a renderer nobody can reach — which is exactly the state chemistry,
  // tables, timelines, constructions, vectors and code traces sat in for months, built and invisible.
  // A shape the prompt offers but the validator rejects is worse: the model produces it, every
  // instance is refused, and the lesson silently loses its visual with no sign that anything is wrong.
  const prompts = readFileSync(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
  const rule = prompts.slice(prompts.indexOf("const VISUAL_RULE ="), prompts.indexOf("const BLOCK_SHAPE"));
  const offered = new Set([...rule.matchAll(/"kind":"([a-z_]+)"/g)].map((match) => match[1]));
  // Both declaration sites: the union lives in `canvas-visual.ts`, the five §44 shapes in
  // `subject-visuals.ts`. Reading one would let the other drift, which is the whole failure mode.
  const subjectShapes = readFileSync(new URL("./subject-visuals.ts", import.meta.url), "utf8");
  const accepted = new Set(
    [...`${VISUAL_CONTRACT}\n${subjectShapes}`.matchAll(/kind: "([a-z_]+)";/g)].map((match) => match[1]),
  );
  // The router's asset lanes are representations rather than request shapes — a model never asks for
  // a source figure, it asks for a concept and the router finds one.
  accepted.delete("source_figure");
  assert.deepEqual([...offered].sort(), [...accepted].sort());
});

test("🔴 eight representations, and not one of them is named after a subject", () => {
  const ROUTER_TEXT = readFileSync(new URL("./visual-route.ts", import.meta.url), "utf8");
  // 🔴 `"circuit"` IS A SHAPE NAME THE CONTRACT CHOSE, exactly as `"macromolecule"` is in §42 — a
  // series/parallel network diagram, drawn from structure. The guard in `visual-route.test.ts`
  // still refuses every OTHER appearance of the word in router code.
  for (const shape of ['"table"', '"timeline"', '"construction"', '"vectors"', '"code"', '"score"', '"circuit"', '"surface"']) {
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
  // Each of the five checks §44 tabulates, called from the validator rather than merely existing.
  for (const call of ["verifyTotal(", "verifyBalance(", "verifyAngle(", "verifyEquilibrium(", "verifyEquivalentResistance("]) {
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
  // 🔴 THE STATUS LINE MOVED ON 2026-08-21 AND THE GUARD MOVED WITH IT. It used to say "NO LESSON
  // EMITS ONE YET", which was true for two days and was the whole defect: a computation layer that
  // was built, hardened, tested, merged — and unreachable. Now expressions and distributions are
  // wired through `plot-compute.ts` and a lesson or a reply can produce one.
  assert.match(
    SECTION_45,
    /STATUS: EXPRESSIONS AND DISTRIBUTIONS ARE REACHABLE FROM A LESSON AND A REPLY\. SEEDED SIMULATION IS NOT\. NOTHING MODEL-WRITTEN REACHES THE DOM\./,
  );
  // 🔴 AND THE HALF THAT IS STILL UNREACHED IS NAMED, rather than quietly counted as coverage —
  // the same honesty §42 keeps about its own lower rungs. A histogram wants bars and the plot
  // renderer draws polylines, so simulation is a renderer question, not a wiring one.
  assert.match(SECTION_45, /Simulation is still unreached/);
  // 🔴 THE WIRING ITSELF IS PINNED. A route is what keeps mathjs off the learner's bundle, and
  // deleting it in favour of a direct import is exactly the "harmless simplification" the header
  // of this block warns about.
  assert.match(COMPUTED_WIRING, /PLOT_ROUTE = "\/api\/learn\/plot"/);
  assert.match(ROUTE, /import \{ curve, distributionCurve/);
  // The expression layer must not reach the browser: no client component may import it.
  const clientFiles = [
    "subject-visual.tsx",
    "semantic-visual.tsx",
    "chemical-structure.tsx",
    "canvas-document.tsx",
    // 🔴 THE TWO 2026-08-24 RENDERERS SIT CLOSEST TO THE TEMPTATION: a surface is MADE of computed
    // numbers, and evaluating "just this one formula" client-side is the exact simplification §45
    // forbids. Named here the day they were born.
    "surface-plot.tsx",
    "music-score.tsx",
  ];
  // 🔴 AND THE WIRING MODULE IS ITSELF ON A CLIENT PATH — `canvas-chat.ts` imports it — so it is
  // held to the same rule as the components. It may name the ROUTE; it may not name the maths.
  for (const heavy of ["computed-series", "mathjs", "simple-statistics", "./expression"]) {
    assert.equal(
      COMPUTED_WIRING.includes(`"${heavy}"`),
      false,
      `plot-compute.ts imports ${heavy} — the maths layer has reached the learner's bundle`,
    );
  }
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

test("🔴 §47 — the provider the router chose is the provider that is actually called", () => {
  // 🔴 THIS IS THE DEFECT THE GUARD EXISTS FOR, AND IT SHIPPED. `routeSpeech` has returned a
  // `provider` since §43 and grew a second value in §47 — and `use-canvas-speech` posted every
  // utterance to `nemesis-speak` regardless. Every router test passed, the contract described two
  // synthesisers, and one of them could never speak a word.
  //
  // A decision that is computed, logged, tested and then discarded at the call site is worse than no
  // decision, because everything upstream of the call site looks correct.
  const speechHook = readFileSync(
    new URL("../../components/workspace/learn/use-canvas-speech.ts", import.meta.url),
    "utf8",
  );
  const voiceHook = readFileSync(
    new URL("../../components/workspace/learn/use-canvas-voice.ts", import.meta.url),
    "utf8",
  );
  assert.match(speechHook, /provider\?:\s*"xai"\s*\|\s*"azure"/, "the speech hook cannot be told which provider to use");
  assert.match(speechHook, /\/api\/speech\/tts/, "the speech hook has no way to reach Azure");
  assert.match(speechHook, /nemesis-speak/, "the speech hook lost the xAI lane");
  assert.match(voiceHook, /provider: route\.provider/, "the router's provider is decided and then dropped");
});

test("🔴 §47 — hearing a phrase again is not gated on voice mode", () => {
  // 🔴 THE TWO PREFERENCES ARE DIFFERENT AND CONFLATING THEM WOULD HIDE THE FEATURE. Voice mode
  // means "do not narrate my questions". It does not mean "never let me hear how this word sounds" —
  // and a foreign phrase is not a second channel for text, it IS the material. Someone with voice
  // mode off must still be able to press play on `ありがとう`.
  const control = readFileSync(new URL("../../components/workspace/learn/hear-again.tsx", import.meta.url), "utf8");
  const voiceHook = readFileSync(new URL("../../components/workspace/learn/use-canvas-voice.ts", import.meta.url), "utf8");
  assert.equal(/voiceMode|VoiceMode|mode === "on"/.test(control), false, "the replay control reads voice mode");
  // 🔴 Wrapped since the cross-lane arbiter (2026-08-23): a replay press first silences the
  // answer's player, then delegates to the speech lane, which still owns the fresh-key rule. The
  // wrapper carries no voice-mode gate, which is what this test protects.
  assert.match(voiceHook, /replay: \(text, voice\) => \{\n\s*player\.stop\(\);\n\s*return speech\.replay\(text, voice\);/, "the canvas cannot offer a replay at all");
  // It names Azure because the variety is the whole point of this lane.
  assert.match(control, /provider: "azure"/);
  assert.match(control, /TARGET_LANGUAGE_SPEED/, "a drilled phrase is slowed, which teaches a rhythm the language lacks");
});

test("🔴 §47 — the replayable phrase is looked up, never guessed from the characters", () => {
  // Script detection would be wrong on exactly the pair most learners study: Spanish and English
  // share an alphabet. The locale was recorded when the pair was read.
  const router = readFileSync(new URL("./speech-route.ts", import.meta.url), "utf8");
  const replay = router.slice(router.indexOf("export function replayableLocale"));
  for (const guess of ["charCodeAt", "\\\\p{Script", "normalize(", "/[^\\\\x00-\\\\x7F]/"]) {
    assert.equal(replay.includes(guess), false, `replayableLocale is inferring a language from the text (${guess})`);
  }
  assert.match(replay, /pair\.leftLocale/);
  assert.match(replay, /pair\.rightLocale/);
});

// 🔴🔴 §42's RESOLVER SPENT THREE DAYS BUILT AND UNREACHABLE, which is the failure this whole file
// exists to make loud. A guard on the RULE is not enough when the rule has no caller: `chem-resolver`
// was correct, tested, and asked for nothing by any teaching path, so §42 described a ladder the
// product never climbed. These check the wiring, not the chemistry.
test("🔴 §42's resolver is reachable from a lesson and a reply, not only from the Lab", () => {
  assert.match(SECTION_42, /A LESSON OR A REPLY RESOLVES A NAMED COMPOUND RATHER THAN RECALLING IT/);
  assert.match(RESOLVER_ROUTE, /import \{ resolveStructure \}/, "the route stopped asking the resolver");
  // PubChem is reached from the server. A page must not query a third party on a learner's behalf:
  // that would hand out their IP and a referrer carrying a canvas URL.
  assert.match(RESOLVER_ROUTE, /export const runtime = "nodejs"/);
  // The pure layer must not IMPORT the resolver: it says what to look up, the route does the looking.
  assert.equal(
    /^import\b.*chem-resolver/m.test(RESOLVER_WIRING),
    false,
    "the pure layer reached for the resolver directly — PubChem is now in the learner's bundle",
  );
  assert.equal(RESOLVER_WIRING.includes("import"), false, "the pure layer grew a dependency");
});

// 🔴 THE PROVENANCE STAMP IS WRITTEN, NEVER READ — the same rule §44 keeps for `traceOrigin`, and
// for the same reason. A model that could set `resolvedFrom` beside a remembered SMILES would make
// its own memory indistinguishable from a database lookup, which is worse than no provenance at all.
test("🔴 a model cannot claim a resolver's provenance", () => {
  assert.match(SECTION_42, /stamped by the resolver and stripped from anything a model sent/);
  assert.match(RESOLVER_WIRING, /resolvedFrom: \{ id: result\.structure\.id/);
  assert.equal(
    /resolvedFrom:\s*(value|item|rest)\.resolvedFrom/.test(RESOLVER_WIRING),
    false,
    "the stamp is being copied from the request — a model can now launder recall into provenance",
  );
});

// 🔴 AND THE WILDCARD CHANNEL SURVIVES THE ADDITION. `*O` is every alcohol; no database holds it,
// so routing generic notation through a resolver would silently undo the fix that made functional
// groups drawable at all.
test("🔴 model-written notation still draws, because a generic group has no name", () => {
  assert.match(SECTION_42, /A generic group has no name and must not be resolved/);
  assert.match(RESOLVER_WIRING, /Notation the model wrote directly\. It keeps working/);
});
