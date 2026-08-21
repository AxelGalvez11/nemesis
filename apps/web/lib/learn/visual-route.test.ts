// The router decides WHICH representation, and "none" is a real answer.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE IS THE FIELD-AGNOSTIC ONE. Everything else here is ordinary
// coverage; `a law concept and a chemistry concept route identically` is the one that would catch
// the failure the owner named by name — a keyword list creeping in and "if anatomy → diagram"
// becoming the rule. Two knowledge objects with the same SHAPE and different subjects must reach
// the same decision, or this router has learned a subject.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { FigureLabel } from "./figure-labels";
import type { KnowledgeObject, KnowledgeType } from "./knowledge-types";
import type { CandidateAsset } from "./visual-provenance";
import { routeVisual } from "./visual-route";

function knowledge(type: KnowledgeType, over: Partial<KnowledgeObject> = {}): KnowledgeObject {
  return {
    id: "k1",
    statement: "A statement.",
    type,
    unanchoredProvenance: ["model"],
    ...over,
  };
}

const LABELS: readonly FigureLabel[] = [
  { text: "Alpha", x: 0.2, y: 0.3 },
  { text: "Beta", x: 0.7, y: 0.6 },
];

function withFigure(over: Partial<KnowledgeObject> = {}): KnowledgeObject {
  return knowledge("spatial", {
    figure: { assetPath: "u1/fig.png", caption: "A diagram", imageRef: "media/image1.png", labels: LABELS },
    ...over,
  });
}

/** A chain of three, which is the smallest graph worth drawing. */
function chain(labels: readonly [string, string, string]) {
  return {
    edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    kind: "relationship",
    learningGoal: "Follow the chain",
    nodes: [
      { id: "a", label: labels[0] },
      { id: "b", label: labels[1] },
      { id: "c", label: labels[2] },
    ],
  };
}

// ─────────────────────────────────────────────────────────── the source figure comes first

test("🔴 the learner's own figure is preferred over a valid model request for the same moment", () => {
  // Both routes are available and both are legitimate. The owner's ordering says the source wins:
  // it is the picture the learner will meet again in the exam, and it is evidence-backed.
  const route = routeVisual({
    knowledge: withFigure(),
    labelKey: "Alpha",
    operation: "locate",
    request: chain(["A", "B", "C"]),
  });
  assert.equal(route.decision, "render");
  assert.equal(route.representation, "source_figure");
  assert.equal(route.decision === "render" && route.representation === "source_figure" && route.hidden.text, "Alpha");
});

test("a figure whose pixels were never kept does not host an interaction", () => {
  const route = routeVisual({
    knowledge: withFigure({ figure: { imageRef: "media/image1.png", labels: LABELS } }),
    labelKey: "Alpha",
    operation: "locate",
  });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "figure-has-no-asset");
});

test("a figure naming one part is an illustration, not spatial knowledge", () => {
  const route = routeVisual({
    knowledge: withFigure({
      figure: { assetPath: "u1/f.png", imageRef: "m/i.png", labels: [{ text: "Only", x: 0.5, y: 0.5 }] },
    }),
    labelKey: "Only",
    operation: "locate",
  });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "figure-not-occludable");
});

test("🔴 a label the figure does not carry covers nothing rather than covering something else", () => {
  const route = routeVisual({ knowledge: withFigure(), labelKey: "Gamma", operation: "locate" });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "label-not-in-figure");
});

test("the caller's own normalisation decides whether a label matches", () => {
  const route = routeVisual({
    knowledge: withFigure(),
    labelKey: "alpha",
    normalizeLabel: (text) => text.toLowerCase(),
    operation: "locate",
  });
  assert.equal(route.decision, "render");
  assert.equal(route.representation, "source_figure");
});

test("a diagram is not occluded when the learner is not being asked to locate anything", () => {
  const route = routeVisual({ knowledge: withFigure(), labelKey: "Alpha", operation: "explain" });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "operation-is-not-spatial");
});

// ─────────────────────────────────────────────────────────── no visual is the common answer

test("🔴 nothing requested and no figure is prose, which is the ordinary outcome", () => {
  const route = routeVisual({ knowledge: knowledge("conceptual_system") });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "nothing-to-show");
});

test("🔴 two things in relation is a sentence, not a diagram", () => {
  const route = routeVisual({
    knowledge: knowledge("causal"),
    request: {
      edges: [{ from: "a", to: "b" }],
      kind: "relationship",
      learningGoal: "See the link",
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    },
  });
  // 🔴 THIS ASSERTION REVERSED, AND THAT IS THE CHANGE. A relationship needed three nodes, so
  // "load applied → beam deflects" — two nodes and a polarity — could never be drawn, though
  // polarity is exactly what the shape exists to show and an arrow is exactly how a person would
  // draw it. Counting nodes was never a way to tell whether a picture helps; that judgement belongs
  // to the thing that read the idea, and it is asked for in VISUAL_RULE now.
  assert.equal(route.decision, "render");
  assert.equal(route.representation, "relationship");
});

test("three things in relation earns the diagram", () => {
  const route = routeVisual({ knowledge: knowledge("causal"), request: chain(["A", "B", "C"]) });
  assert.equal(route.decision, "render");
  assert.equal(route.representation, "relationship");
});

test("🔴 an association may still earn a picture — the model decides, not the knowledge type", () => {
  // This used to route every association to prose on the reasoning that an arbitrary mapping has
  // no structure to show. True of a vocabulary pair; false of a molecule beside its name, a term
  // beside where it sits in a figure, a character beside the radical it is built from. The rule
  // could not tell those apart because it never saw the content — only the TYPE.
  const route = routeVisual({ knowledge: knowledge("association"), request: chain(["A", "B", "C"]) });
  assert.equal(route.decision, "render");
});

test("🔴🔴 the association rule is UNREACHABLE with today's callers, and the code says so", () => {
  // 🔴 THIS TEST EXISTS BECAUSE THE TEST ABOVE IS MISLEADING ON ITS OWN. It passes by constructing
  // an input no caller constructs: reaching that branch needs a `request` AND a `knowledge`, and
  // `canvas-policy-view` supplies only the second while `canvas-document` supplies only the first.
  // A green test next to a dead branch is precisely how "implemented, merged, deployed, dead" keeps
  // happening here, so the honesty is pinned rather than left in a commit message.
  //
  // When a caller finally supplies both, this test fails and whoever wired it removes the comment
  // in the same change. That is the whole mechanism — it polices the CLAIM, not the design.
  const router = readFileSync(new URL("./visual-route.ts", import.meta.url), "utf8");
  assert.match(router, /UNREACHABLE WITH TODAY'S CALLERS/);

  const callers = [
    readFileSync(new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../../components/workspace/learn/canvas-document.tsx", import.meta.url), "utf8"),
  ];
  for (const caller of callers) {
    const call = /routeVisual\(\{[^}]*\}\)/s.exec(caller)?.[0] ?? "";
    assert.notEqual(call, "", "a caller stopped calling routeVisual");
    const hasBoth = call.includes("knowledge:") && call.includes("request:");
    assert.equal(
      hasBoth,
      false,
      "a caller now supplies BOTH knowledge and a request — the association rule is live, so delete " +
        "the UNREACHABLE note in visual-route.ts and this test with it.",
    );
  }
});

test("🔴 a plot whose points all share one x has no range to draw along", () => {
  const route = routeVisual({
    request: {
      kind: "quantitative",
      learningGoal: "Compare",
      series: [{ label: "One", points: [{ x: 5, y: 1 }, { x: 5, y: 9 }] }],
    },
  });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "plot-has-no-range");
});

test("🔴 a flat line still renders — a constant across a range is exactly the teaching point", () => {
  // The refusal above is about DRAWABILITY, never about whether the data is interesting. Saturation
  // kinetics, a statutory cap, a rule that holds regardless of input: all flat, all worth showing.
  const route = routeVisual({
    request: {
      kind: "quantitative",
      learningGoal: "See that it stops changing",
      series: [{ label: "Rate", points: [{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }] }],
    },
  });
  assert.equal(route.decision, "render");
  assert.equal(route.representation, "quantitative");
});

// ─────────────────────────────────────────────────────────── refusals carry a name

test("🔴 a malformed request is REFUSED with a named reason, never quietly replaced", () => {
  const route = routeVisual({
    request: {
      edges: [{ from: "a", to: "ghost" }],
      kind: "relationship",
      learningGoal: "x",
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
    },
  });
  assert.equal(route.decision, "refused");
  assert.equal(route.decision === "refused" && route.reason, "dangling-edge");
  assert.match(route.decision === "refused" ? route.detail : "", /ghost/);
});

test("🔴 a LaTeX escape out of mathematics is named as unsafe, not as malformed", () => {
  for (const latex of ["\\href{https://x.test}{click}", "\\includegraphics{/etc/passwd}", "\\def\\x{\\x\\x}\\x"]) {
    const route = routeVisual({ request: { kind: "equation", latex, learningGoal: "Read it" } });
    assert.equal(route.decision, "refused", latex);
    assert.equal(route.decision === "refused" && route.reason, "unsafe-latex", latex);
  }
});

test("🔴 an ordinary equation is not caught by the safety rule", () => {
  for (const latex of ["\\frac{a}{b} = c", "\\sigma = \\frac{F}{A}", "P(\\text{guilt}) > 0.5", "\\alpha"]) {
    const route = routeVisual({ request: { kind: "equation", latex, learningGoal: "Read it" } });
    assert.equal(route.decision, "render", latex);
    assert.equal(route.representation, "equation", latex);
  }
});

test("a kind no trusted renderer owns is refused by name", () => {
  const route = routeVisual({
    request: { code: "while(true){}", kind: "threejs", learningGoal: "Spin it" },
  });
  assert.equal(route.decision, "refused");
  assert.equal(route.decision === "refused" && route.reason, "unknown-kind");
});

test("🔴 a visual with no stated learning goal is decoration and is refused", () => {
  const route = routeVisual({ request: { kind: "equation", latex: "x^2" } });
  assert.equal(route.decision, "refused");
  assert.equal(route.decision === "refused" && route.reason, "text-out-of-bounds");
});

test("🔴 refused and prose are different outcomes, and both draw nothing", () => {
  // They look identical on screen and mean opposite things: one is "words were the right choice",
  // the other is "something upstream sent us a request we would not honour". A caller counting
  // boundary probes reads `refused`; a caller counting layout reads both.
  const refused = routeVisual({ request: { kind: "nope", learningGoal: "x" } });
  const prose = routeVisual({});
  assert.equal(refused.decision, "refused");
  assert.equal(prose.decision, "prose");
  assert.notEqual(refused.decision, prose.decision);
});

// ─────────────────────────────────────────────────────────── the callers that know less

test("🔴 a caller that holds no knowledge object still renders a valid request", () => {
  // `canvas-document.tsx` has a `CanvasBlock` and no knowledge at all. Absent knowledge must mean
  // "not known", never "the knowledge said no" — the second would silently disable the whole
  // document layer's visuals and nothing would report it.
  const route = routeVisual({ request: chain(["A", "B", "C"]) });
  assert.equal(route.decision, "render");
  assert.equal(route.representation, "relationship");
});

test("a caller that holds no knowledge object still gets the structural refusals", () => {
  const route = routeVisual({
    request: {
      edges: [{ from: "a", to: "b" }],
      kind: "relationship",
      learningGoal: "See the link",
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    },
  });
  assert.equal(route.decision, "render");
  assert.equal(route.representation, "relationship");
});

// ─────────────────────────────────────────────────────────── field-agnostic

test("🔴🔴 a law concept and a chemistry concept with the same structure route identically", () => {
  // The owner's rule: "would this work for a law student and a mechanical engineering student?"
  // These two differ in every word and in nothing structural. If the router ever learns a subject,
  // this is where it shows.
  const law = routeVisual({
    knowledge: knowledge("causal"),
    request: chain(["Breach of duty", "Foreseeable harm", "Liability in negligence"]),
  });
  const chemistry = routeVisual({
    knowledge: knowledge("causal"),
    request: chain(["Catalyst added", "Activation energy falls", "Reaction rate rises"]),
  });
  assert.deepEqual(
    { d: law.decision, r: law.decision === "render" ? law.representation : null },
    { d: chemistry.decision, r: chemistry.decision === "render" ? chemistry.representation : null },
  );
  assert.equal(law.decision, "render");
});

test("🔴🔴 the same two subjects route identically on a two-node relation", () => {
  const pair = (a: string, b: string) => routeVisual({
    knowledge: knowledge("causal"),
    request: {
      edges: [{ from: "a", to: "b" }],
      kind: "relationship",
      learningGoal: "Follow it",
      nodes: [{ id: "a", label: a }, { id: "b", label: b }],
    },
  });
  const law = pair("Offer accepted", "Contract formed");
  const engineering = pair("Load applied", "Beam deflects");
  // The owner's rule is what this test is for: same structure, same route, whatever the words are
  // about. What changed is that the shared route is now `render` rather than a refusal — the specs
  // themselves differ only in the labels, which is the subject matter and is meant to.
  assert.equal(law.decision, "render");
  assert.deepEqual(
    { d: law.decision, r: law.decision === "render" ? law.representation : null },
    { d: engineering.decision, r: engineering.decision === "render" ? engineering.representation : null },
  );
});

test("🔴 no subject-matter vocabulary has crept into the router", () => {
  // A keyword list is the specific failure mode the owner forbids, and it never arrives as a
  // declared `const SUBJECTS`. It arrives as one innocent-looking branch. This reads the file.
  const source = readFileSync(new URL("./visual-route.ts", import.meta.url), "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*") && !line.trimStart().startsWith("/*"))
    .join("\n");
  for (const word of ["anatomy", "molecule", "chemistry", "biology", "physics", "pharmac", "drug", "legal", "statute", "circuit"]) {
    assert.equal(code.toLowerCase().includes(word), false, `the router branches on the subject "${word}"`);
  }
});

// ─────────────────────────────────────────────────────────── the boundary itself

test("🔴 the router never executes model output and never hands it to a renderer as code", () => {
  const source = readFileSync(new URL("./visual-route.ts", import.meta.url), "utf8");
  for (const forbidden of ["eval(", "new Function", "dangerouslySetInnerHTML", "import(", "require("]) {
    assert.equal(source.includes(forbidden), false, `the router reaches for ${forbidden}`);
  }
  // Every rendered spec came through the validator. A route that constructed one itself would be a
  // path around the only place bounds are enforced.
  assert.match(source, /validateCanvasVisual/);
});

// ─────────────────────────────────────────────── §42's lower rungs — retrieved, then generated

const LICENSED: CandidateAsset = {
  assetPath: "registry/ref-1.png",
  licence: { attribution: "J. Author, 2019", licence: "CC-BY-4.0", source: "An open repository" },
  provenance: "reference_image",
};

const GENERATED: CandidateAsset = { assetPath: "registry/gen-1.png", provenance: "generated_image" };

test("🔴 omitting assets leaves the router behaving exactly as it did before §42", () => {
  // The whole reason the new rungs are safe to add now: every caller in production omits `assets`,
  // and with it omitted nothing about the old decisions moves.
  const route = routeVisual({});
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "nothing-to-show");
});

test("a licensed picture answers a moment nothing higher on the ladder could", () => {
  const route = routeVisual({ assets: [LICENSED] });
  assert.equal(route.decision, "render");
  assert.equal(route.decision === "render" && route.representation, "reference_image");
});

test("🔴 a valid request outranks a licensed image, because a render is trustworthy on arithmetic", () => {
  // The rung order that is easiest to get backwards: a photograph looks more "real" than an SVG,
  // and is trusted on somebody else's authority rather than on the encoding that produced it.
  const route = routeVisual({ assets: [LICENSED], request: chain(["A", "B", "C"]) });
  assert.equal(route.decision, "render");
  assert.equal(route.decision === "render" && route.representation, "relationship");
});

test("🔴 the learner's own figure outranks both", () => {
  const route = routeVisual({
    assets: [LICENSED],
    knowledge: withFigure(),
    labelKey: "Alpha",
    operation: "locate",
  });
  assert.equal(route.decision, "render");
  assert.equal(route.decision === "render" && route.representation, "source_figure");
});

test("🔴 a generated picture is unreachable when the learner is being graded against it", () => {
  // `locate` covers a part and asks what it was. An invented picture would be the answer key.
  const route = routeVisual({ assets: [GENERATED], operation: "locate" });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "no-trusted-asset");
  assert.equal(route.decision === "prose" && route.assetRefusal, "generated-cannot-bear-accuracy");
});

test("the same generated picture is allowed beside teaching, where nothing is graded on it", () => {
  const route = routeVisual({ assets: [GENERATED], operation: "explain" });
  assert.equal(route.decision, "render");
  assert.equal(route.decision === "render" && route.representation, "generated_image");
});

test("🔴 a source figure whose pixels were never kept drops to the next rung rather than stopping", () => {
  // "Parsed before assets existed" means the source's picture is UNAVAILABLE, which is the exact
  // condition the lower rungs exist for.
  const noPixels = withFigure({
    figure: { caption: "A diagram", imageRef: "media/image1.png", labels: LABELS },
  });
  const route = routeVisual({
    assets: [LICENSED],
    knowledge: noPixels,
    labelKey: "Alpha",
    operation: "locate",
  });
  assert.equal(route.decision, "render");
  assert.equal(route.decision === "render" && route.representation, "reference_image");
});

test("🔴 a considered 'a picture would not help' is never reopened by the registry", () => {
  // The router already decided a diagram loses to a sentence here. Reaching for a stock image
  // afterwards would turn that into "no, so let us find one anyway".
  const route = routeVisual({
    assets: [LICENSED],
    request: { ...chain(["A", "B", "C"]), edges: [{ from: "a", to: "b" }], nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
  });
  assert.equal(route.decision, "render");
  assert.equal(route.representation, "relationship");
});

test("🔴 a figure that exists but is not being located against does not fall through to an image", () => {
  const route = routeVisual({ assets: [LICENSED], knowledge: withFigure(), operation: "explain" });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "operation-is-not-spatial");
});

test("an unlicensed picture is refused with the reason that names the bookkeeping failure", () => {
  const route = routeVisual({ assets: [{ ...LICENSED, licence: undefined }] });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.assetRefusal, "licence-missing");
});
