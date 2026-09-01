/**
 * The learner's own lecture is the first rung of the figure ladder.
 *
 * 🔴 THE DEFECT, WATCHED HAPPEN 2026-09-01. Teaching the steroid scaffold, the canvas wrote *"let
 * me check whether your own lecture has a clean version of this before I draw from memory"*, then
 * drew from memory — while the deck open in the next column held the labelled template, stored and
 * described. Nothing was broken. `PROVENANCE_LADDER` had ranked `source_figure` first since it was
 * written, and `CandidateAsset` could not express one, so there was no rung to check.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { captionFor } from "./own-figures";
import { chooseAsset, moreTrustedThan, PROVENANCE_LADDER } from "./visual-provenance";

const LOOKUP = readFileSync(new URL("./figure-lookup.ts", import.meta.url), "utf8");

test("🔴🔴 the learner's own figure outranks anything retrieved, and needs no licence", () => {
  // Every licence rule in `chooseAsset` is about reusing SOMEBODY ELSE'S picture. A source figure
  // is a page out of a file this learner uploaded, in owner-scoped storage, shown back to them and
  // reachable by no other account. There is no redistribution to license — and the check sits ABOVE
  // the licence branches so a future edit to the reuse rules cannot start demanding a credit line
  // for a student's own slide.
  const own = { assetPath: "uid/figures/abc.png", provenance: "source_figure" as const };
  const licensed = {
    assetPath: "shelf/xyz.png",
    licence: { attribution: "Someone", licence: "CC BY 4.0" },
    provenance: "reference_image" as const,
  };

  const chosen = chooseAsset({ accuracyBearing: false, candidates: [licensed, own] });
  assert.ok(chosen.ok);
  assert.equal(chosen.asset.provenance, "source_figure", "a retrieved picture beat the learner's own");

  // Even where a picture is graded against, their own material is the trustworthy one.
  const graded = chooseAsset({ accuracyBearing: true, candidates: [own] });
  assert.ok(graded.ok, "the learner's own figure was refused for a graded moment");

  assert.equal(PROVENANCE_LADDER[0], "source_figure");
  assert.ok(moreTrustedThan("source_figure", "reference_image"));
});

test("🔴🔴 a subject the learner owns is never sent to the open corpus", () => {
  // Not only an ordering preference: their own lecture answers without a third-party request, so
  // the subject's wording is not handed to an image repository to satisfy a question already
  // answered. The guard reads the source because the interleave is the part that goes wrong.
  assert.match(LOOKUP, /const mine = deps\.own \?/, "the learner's own material is not consulted first");
  assert.match(LOOKUP, /const missing = subjects\.filter\(\(_subject, index\) => !mine\[index\]\)/,
    "every subject is still sent onward, including the ones already answered");
  assert.match(LOOKUP, /missing\.length > 0 \? await lookUp\(missing, deps, signal\) : \[\]/,
    "the route is called even when the learner owns every subject");
});

test("🔴 results stay addressed BY POSITION when the two sources are interleaved", () => {
  // `applyResolvedFigures` pairs results to requests by index alone. Mixing a positional list
  // (the learner's own) with a compacted one (what the route was asked for) is exactly where an
  // off-by-one puts the wrong picture under the wrong figure — silently, and plausibly.
  assert.match(LOOKUP, /const results: FigureResolution\[\] = subjects\.map\(\(subject, index\) => \{/,
    "results are no longer built per request position");
  assert.match(LOOKUP, /const routed = fetched\?\.\[next\];\n\s+next \+= 1;/,
    "the route's compacted answers are not walked with their own cursor");
});

test("🔴 the caption says WHERE it came from, never what a model thought it saw", () => {
  // The description is what a model wrote while looking at the figure; printing it as a caption
  // states a guess as fact beside the picture it was guessing at. The lecture and the page are
  // checkable, and are how a student finds the slide again.
  assert.equal(captionFor({ file_name: "Steroids.pdf", unit: 3 }), "From your Steroids.pdf, page 4");
  assert.equal(captionFor({ file_name: "Steroids.pdf", unit: null }), "From your Steroids.pdf");
});

test("🔴 a signed-out learner loses pictures, never the answer", () => {
  const source = readFileSync(new URL("./own-figures.ts", import.meta.url), "utf8");
  assert.match(source, /} catch \{\n\s+return empty;/, "a failed lookup can throw out of the answer");
  assert.match(source, /if \(error\) return null;/, "an RPC error is not turned into a missing picture");
  // The stored PATH, not a signed URL: a URL that expires in an hour becomes a broken image in a
  // canvas reopened tomorrow.
  assert.match(source, /assetPath: row\.path,/, "a signed URL is being stored into the saved answer");
});
