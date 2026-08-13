// N11: a source that states a claim must give that claim its provenance.
//
// 🔴 THE DEFECT THIS PINS WAS A SILENT NO-OP, MEASURED IN PRODUCTION ON 2026-08-13. A canvas holding
// twenty-four model-written facts was given a spreadsheet stating five of them verbatim. Everything
// beneath the boundary worked — real library row, parsed cleanly, both worksheets recovered — and
// afterwards all five payload checksums were BYTE-IDENTICAL, `updated_at` unmoved, provenance still
// `["model"]`, no `sourceAnchors` key at all. Enrichment ran and accrued nothing.
//
// 🔴 THE INVARIANT UNDER TEST IS NOT "THE PAGE CHANGED". The owner narrowed it themselves: if
// nothing pedagogically useful changed, the page may legitimately stay identical — but those claims
// must be able to ACQUIRE SOURCE PROVENANCE. So every assertion here is about what the claim
// carries, never about what got rendered.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext, resolveQuote, type SourceContext } from "@/lib/sources/source-context";

import { knowledgeIdentityKey } from "./knowledge-identity";
import { anchorForClaimInUnit, groundClaim, groundClaims } from "./knowledge-grounding";
import { hasGroundableAnchor, waysOfKnowing } from "./knowledge-provenance";
import type { KnowledgeObject } from "./knowledge-types";
import { objectivesForKnowledge } from "./learning-objective";

// ── fixtures ────────────────────────────────────────────────────────────────

function modelOf(blocks: Partial<DocBlock>[]): DocumentModel {
  return {
    blocks: blocks.map(
      (b, i) => ({ headingPath: [], id: `b${i}`, kind: "paragraph", text: "", unit: 0, ...b }) as DocBlock,
    ),
    format: "xlsx",
    title: "gearing.xlsx",
    units: [{ index: 0, kind: "page" as const }],
  };
}

function contextOf(blocks: Partial<DocBlock>[], sourceId = "lib-sheet"): SourceContext {
  return buildSourceContext({
    sourceId,
    sourceKind: "xlsx",
    structure: JSON.parse(
      JSON.stringify(structureEnvelope({ model: modelOf(blocks), text: "", title: "gearing.xlsx" })),
    ),
  });
}

/** A fact Nemesis wrote from its own knowledge when the learner typed a topic. No source behind it. */
const MODEL_ONLY: KnowledgeObject = {
  id: "k1",
  pair: { id: "p1", left: "chainring size", right: "gear ratio" },
  relationKind: "input to output",
  sourceAnchors: [],
  statement: "chainring size — gear ratio",
  type: "association",
  unanchoredProvenance: ["model"],
};

/** The learner's own spreadsheet, which states that fact in one row. */
const SPREADSHEET = contextOf([
  { id: "b0", kind: "paragraph", text: "Drivetrain reference" },
  { id: "b1", kind: "paragraph", text: "A larger chainring size raises the gear ratio for a given cog." },
]);

// ── the reproduction ────────────────────────────────────────────────────────

test("🔴 N11: a model-written claim its source actually states GAINS an anchor", () => {
  assert.equal(hasGroundableAnchor(MODEL_ONLY), false, "the fixture must start ungrounded or this proves nothing");

  const [grounded] = groundClaims([MODEL_ONLY], [SPREADSHEET]);

  assert.ok(grounded);
  assert.equal(hasGroundableAnchor(grounded), true, "the claim must now be citable");
  assert.equal(grounded.sourceAnchors?.[0]?.sourceId, "lib-sheet", "and it must point at the learner's own file");
});

test("🔴 the quote is COPIED OUT OF THE SOURCE and re-resolves against it", () => {
  // This is the anti-laundering property, and it is why the lane is model-free. A model asked "does
  // this document support this claim?" produces a citation nobody checked. Here the anchor can only
  // exist if the source's own characters contain it, so a fabricated citation is unrepresentable.
  const [grounded] = groundClaims([MODEL_ONLY], [SPREADSHEET]);
  const quote = grounded?.sourceAnchors?.[0]?.quote;
  assert.ok(quote, "an anchor with no quote could not be shown to the learner at all");

  const unitText = SPREADSHEET.units.find((unit) => unit.id === "b1")?.text ?? "";
  assert.ok(resolveQuote(unitText, quote) >= 0, "the stored quote must be findable in the source it names");
  assert.match(quote.exact, /chainring size.*gear ratio/, "and it must span the claim, not merely touch one half");
});

// ── the invariants the accrual must not disturb ─────────────────────────────

test("🔴 grounding cannot move knowledge identity, so evidence cannot be orphaned", () => {
  // The owner's own wording: changing provenance must not change knowledge identity, learner
  // evidence history, or objective continuity. `identityBasis` cannot read an anchor, so this is a
  // construction proof — asserted anyway, because the cost of being wrong is that a learner who
  // proved they knew something is asked it again with their history attached to an abandoned object.
  const [grounded] = groundClaims([MODEL_ONLY], [SPREADSHEET]);
  assert.ok(grounded);
  assert.equal(knowledgeIdentityKey(grounded), knowledgeIdentityKey(MODEL_ONLY));

  const before = objectivesForKnowledge(MODEL_ONLY).map((o) => o.identityKey);
  const after = objectivesForKnowledge(grounded).map((o) => o.identityKey);
  assert.deepEqual(after, before, "objective continuity is what learner evidence actually hangs off");
  assert.ok(before.length > 0, "a comparison of two empty lists would pass while proving nothing");
});

test("🔴 grounding ADDS a way of knowing — it never deletes the one already there", () => {
  const [grounded] = groundClaims([MODEL_ONLY], [SPREADSHEET]);
  assert.ok(grounded);
  assert.deepEqual(grounded.unanchoredProvenance, ["model"], "Nemesis still knew this independently");
  assert.equal(waysOfKnowing(grounded).length, 2, "both ways of knowing must be readable");
});

test("the input object is never mutated", () => {
  // These objects live inside a stored territory replayed on every open. Mutating one would edit the
  // cache in place and make what the marker says depend on how many times it had been read.
  groundClaims([MODEL_ONLY], [SPREADSHEET]);
  assert.deepEqual(MODEL_ONLY.sourceAnchors, [], "the caller's object must come back as it went in");
});

test("existing anchors are kept when a second source states the same claim", () => {
  const already = { ...MODEL_ONLY, sourceAnchors: [{ sourceId: "lib-lecture", unitId: "x1" }] };
  const [grounded] = groundClaims([already], [SPREADSHEET]);
  assert.equal(grounded?.sourceAnchors?.length, 2, "two sources for one claim are two ways of knowing it");
});

// ── what must NOT be grounded ───────────────────────────────────────────────

test("🔴 a claim no source mentions stays honestly model-known", () => {
  const unrelated: KnowledgeObject = {
    ...MODEL_ONLY,
    id: "k2",
    pair: { id: "p2", left: "spoke tension", right: "wheel dish" },
  };
  const [ungrounded] = groundClaims([unrelated], [SPREADSHEET]);
  assert.equal(hasGroundableAnchor(ungrounded!), false, "silence in the source must stay silence");
  assert.deepEqual(ungrounded, unrelated, "and the claim comes back untouched, not merely unanchored");
});

test("🔴 a term inside a longer word is NOT a match — substring matching fabricates citations", () => {
  // `ACE` occurs inside `spacer`, `pH` inside `graph`, `ion` inside `station`. A plain indexOf would
  // anchor a claim about ACE inhibitors to a sentence about spacers and show it to the learner as
  // their own lecture saying so — a broken locator that passes every check.
  const claim: KnowledgeObject = {
    ...MODEL_ONLY,
    pair: { id: "p3", left: "ACE", right: "ion" },
  };
  const spacers = contextOf([{ id: "b1", kind: "paragraph", text: "Fit the spacer at the station before riding." }]);
  assert.equal(hasGroundableAnchor(groundClaim(claim, [spacers])), false);

  // Calibration: the same claim IS grounded when the terms appear as whole words, so the guard is
  // testing word boundaries rather than simply never matching anything.
  const real = contextOf([{ id: "b1", kind: "paragraph", text: "An ACE inhibitor blocks the ion channel." }]);
  assert.equal(hasGroundableAnchor(groundClaim(claim, [real])), true);
});

test("🔴 two terms far apart in one block do NOT count as the source stating the claim", () => {
  // Co-occurrence anywhere in a document is nearly meaningless: a lecture naming fifty terms would
  // "support" every pairing of them. The span cap is the precision of the whole lane.
  const far = contextOf([
    {
      id: "b1",
      kind: "paragraph",
      text: `chainring size is discussed first. ${"Filler about brake pads and cable routing. ".repeat(6)}gear ratio appears much later.`,
    },
  ]);
  assert.equal(hasGroundableAnchor(groundClaim(MODEL_ONLY, [far])), false);
});

test("a knowledge type this method cannot locate is refused rather than guessed", () => {
  // A claim whose halves cannot be named cannot be found in a document this way, and guessing would
  // put a citation on a claim the source may never have made.
  const shapeless: KnowledgeObject = {
    id: "k9",
    sourceAnchors: [],
    statement: "Gear ratios matter.",
    type: "conceptual_system",
    unanchoredProvenance: ["model"],
  };
  assert.equal(hasGroundableAnchor(groundClaim(shapeless, [SPREADSHEET])), false);
});

test("no sources means no work and no change", () => {
  assert.deepEqual(groundClaims([MODEL_ONLY], []), [MODEL_ONLY]);
});

test("a heading is not a citable claim", () => {
  // Headings are excluded from readable units by the same rule the excerpt builder follows: a
  // heading names what follows, and anchoring to one would cite a label rather than a statement.
  const headingOnly = contextOf([
    { id: "b1", kind: "heading", text: "chainring size and gear ratio" },
  ]);
  const unit = headingOnly.units.find((u) => u.type === "heading");
  assert.ok(unit, "the fixture must actually produce a heading unit or this proves nothing");
  assert.ok(anchorForClaimInUnit(MODEL_ONLY, unit) !== null, "the text IS there — the exclusion is structural");
  assert.equal(hasGroundableAnchor(groundClaim(MODEL_ONLY, [headingOnly])), false);
});

// ── the lane is actually wired ──────────────────────────────────────────────

test("🔴 THE GROUNDED CLAIMS ARE WHAT GETS STORED — a data-flow assertion, not an ordering one", () => {
  // 🔴 THIS SHAPE IS DELIBERATE AND IT IS THE PREDECESSOR'S OWN LESSON. A guard asserting that
  // `groundClaims` merely APPEARS in this file, or appears BEFORE `storeTerritory`, stays green
  // against code that computes the grounded claims and stores the ungrounded ones — which is
  // exactly the shipped defect, and exactly the calibration failure that let `RUNTIME-001` be
  // reintroduced inside the test written to prevent it. If a test can be satisfied by code that
  // computes a value and never uses it, it is not testing that the value is used.
  const source = readFileSync(join(import.meta.dirname, "canvas-knowledge.ts"), "utf8");
  assert.match(
    source,
    /storeTerritory\(\s*userId,\s*groundClaims\(\s*stored\.objects,\s*contexts\s*\)\s*\)/,
    "the carried territory must be stored THROUGH groundClaims, or provenance never accrues",
  );
});

test("🔴 grounding runs only on sources the lane could actually READ", () => {
  // A source that failed to load must be absent from the contexts, never present and empty:
  // "we could not read this" and "this says nothing" are opposite facts, and the second one would
  // silently mean a claim is not in a document nobody managed to open.
  const source = readFileSync(join(import.meta.dirname, "canvas-knowledge.ts"), "utf8");
  const loop = source.slice(source.indexOf("for (const canonical of loaded)"), source.indexOf("const ownership ="));
  const failure = loop.indexOf("if (!canonical.ok)");
  const push = loop.indexOf("contexts.push(");
  assert.ok(failure >= 0 && push >= 0, "both the failure branch and the collection must exist");
  assert.ok(failure < push, "an unreadable source must be skipped before its context is collected");
  assert.match(loop.slice(failure, push), /continue;/, "and skipped by continuing, not by falling through");
});
