// The ladder, and the two rules that make it more than a preference.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a generated picture may never be the answer key`. Everything
// else here is ordinary coverage of a small pure module. That one is the rule that stops the
// cheapest rung quietly becoming the default one, and it is the rule someone in a hurry would
// soften first — "unless we have nothing else" is exactly the shape the exception would take.

import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseAsset,
  creditLineFor,
  ILLUSTRATIVE_NOTICE,
  mayBearAccuracyClaim,
  moreTrustedThan,
  mustLabelAsIllustrative,
  PROVENANCE_LADDER,
  REUSABLE_LICENCES,
  trustRank,
  type CandidateAsset,
} from "./visual-provenance";

function licensed(over: Partial<CandidateAsset> = {}): CandidateAsset {
  return {
    assetPath: "registry/ref-1.png",
    licence: { attribution: "J. Author, 2019", licence: "CC-BY-4.0", source: "An open repository" },
    provenance: "reference_image",
    ...over,
  };
}

function generated(over: Partial<CandidateAsset> = {}): CandidateAsset {
  return { assetPath: "registry/gen-1.png", provenance: "generated_image", ...over };
}

// ─────────────────────────────────────────────────────────────────────── the ordering itself

test("the ladder runs from the learner's own material down to invention", () => {
  assert.deepEqual(PROVENANCE_LADDER, ["source_figure", "rendered", "reference_image", "generated_image"]);
});

test("🔴 a deterministic render outranks even a licensed image", () => {
  // The non-obvious rung. A render is the canonical encoding drawn; a retrieved picture is
  // trustworthy on somebody else's authority. Reordering these two is the change this catches.
  assert.equal(moreTrustedThan("rendered", "reference_image"), true);
  assert.equal(moreTrustedThan("source_figure", "rendered"), true);
  assert.equal(moreTrustedThan("reference_image", "generated_image"), true);
  assert.equal(moreTrustedThan("generated_image", "source_figure"), false);
});

test("trustRank is the ladder index, so lower is more trusted", () => {
  assert.equal(trustRank("source_figure"), 0);
  assert.equal(trustRank("generated_image"), PROVENANCE_LADDER.length - 1);
});

// ─────────────────────────────────────────────────────────── the rule with teeth

test("🔴 a generated picture may never be the answer key", () => {
  assert.equal(mayBearAccuracyClaim("generated_image"), false);
  for (const trusted of ["source_figure", "rendered", "reference_image"] as const) {
    assert.equal(mayBearAccuracyClaim(trusted), true);
  }

  const choice = chooseAsset({ accuracyBearing: true, candidates: [generated()] });
  assert.equal(choice.ok, false);
  assert.equal(choice.ok === false && choice.reason, "generated-cannot-bear-accuracy");
});

test("🔴 the same generated picture is fine when nothing is graded against it", () => {
  // The rule is about GRADING, not about generation being forbidden. An illustration beside an
  // explanation asks the learner nothing, so nothing can be scored wrong on invented detail.
  const choice = chooseAsset({ accuracyBearing: false, candidates: [generated()] });
  assert.equal(choice.ok, true);
  assert.equal(choice.ok && choice.asset.provenance, "generated_image");
});

test("a generated picture must be labelled as an illustration", () => {
  assert.equal(mustLabelAsIllustrative("generated_image"), true);
  assert.equal(mustLabelAsIllustrative("reference_image"), false);
  assert.equal(creditLineFor(generated()), ILLUSTRATIVE_NOTICE);
});

// ─────────────────────────────────────────────────────────── licences are per file

test("🔴 a repository name is not a licence", () => {
  // The owner's own warning about the broadest reservoir: media there is meant to be reusable, but
  // the licence rides on each file. A registry row naming only the source has recorded nothing.
  const choice = chooseAsset({
    accuracyBearing: false,
    candidates: [licensed({ licence: undefined })],
  });
  assert.equal(choice.ok, false);
  assert.equal(choice.ok === false && choice.reason, "licence-missing");
});

test("an unrecognised licence is refused rather than assumed", () => {
  const choice = chooseAsset({
    accuracyBearing: false,
    candidates: [licensed({ licence: { licence: "All rights reserved", source: "Somewhere" } })],
  });
  assert.equal(choice.ok, false);
  assert.equal(choice.ok === false && choice.reason, "licence-not-reusable");
});

test("a BY licence with no credit line kept is refused, so the credit always exists to show", () => {
  const choice = chooseAsset({
    accuracyBearing: false,
    candidates: [licensed({ licence: { licence: "CC-BY-4.0", source: "An open repository" } })],
  });
  assert.equal(choice.ok, false);
  assert.equal(choice.ok === false && choice.reason, "attribution-missing");
});

test("a public-domain asset needs no credit line and is still shown with its source", () => {
  const asset = licensed({ licence: { licence: "public-domain", source: "A government archive" } });
  const choice = chooseAsset({ accuracyBearing: true, candidates: [asset] });
  assert.equal(choice.ok, true);
  assert.equal(creditLineFor(asset), "A government archive · public-domain");
});

test("every reusable licence is actually accepted, so the list is not decorative", () => {
  for (const licence of REUSABLE_LICENCES) {
    const asset = licensed({ licence: { attribution: "Someone", licence, source: "A repository" } });
    const choice = chooseAsset({ accuracyBearing: false, candidates: [asset] });
    assert.equal(choice.ok, true, `${licence} was rejected`);
  }
});

// ─────────────────────────────────────────────────────────── choosing between candidates

test("🔴 the best candidate wins regardless of the order the registry listed them", () => {
  const choice = chooseAsset({
    accuracyBearing: true,
    candidates: [generated(), licensed()],
  });
  assert.equal(choice.ok, true);
  assert.equal(choice.ok && choice.asset.provenance, "reference_image");
});

test("🔴 the refusal reported names what cost us the BEST candidate, not the first listed", () => {
  // A generated image listed first and an unlicensed reference image behind it. Reporting
  // "generated" would point at the wrong problem — the registry's real hole is the missing licence.
  const choice = chooseAsset({
    accuracyBearing: true,
    candidates: [generated(), licensed({ licence: undefined })],
  });
  assert.equal(choice.ok, false);
  assert.equal(choice.ok === false && choice.reason, "licence-missing");
});

test("a candidate with no stored pixels is skipped, and the next one still gets its turn", () => {
  const choice = chooseAsset({
    accuracyBearing: false,
    candidates: [licensed({ assetPath: "  " }), generated()],
  });
  assert.equal(choice.ok, true);
  assert.equal(choice.ok && choice.asset.provenance, "generated_image");
});

test("an empty registry refuses by name rather than returning nothing", () => {
  const choice = chooseAsset({ accuracyBearing: false, candidates: [] });
  assert.equal(choice.ok, false);
  assert.equal(choice.ok === false && choice.reason, "no-candidates");
});

// ─────────────────────────────────────────────────────────── field-agnostic

test("🔴 two assets differing only in subject are treated identically", () => {
  // The owner's standing rule. Nothing in this module may read what a picture is OF.
  const anatomy = licensed({ assetPath: "registry/renal.png", caption: "A renal corpuscle" });
  const contract = licensed({ assetPath: "registry/offer.png", caption: "Offer and acceptance" });
  const a = chooseAsset({ accuracyBearing: true, candidates: [anatomy] });
  const b = chooseAsset({ accuracyBearing: true, candidates: [contract] });
  assert.equal(a.ok, b.ok);
  assert.equal(a.ok && b.ok && a.asset.provenance, b.ok && b.asset.provenance);
});
