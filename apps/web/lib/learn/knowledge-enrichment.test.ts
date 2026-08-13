import assert from "node:assert/strict";
import { test } from "node:test";

import { identityBasis, knowledgeIdentityKey } from "./knowledge-identity";
import { hasGroundableAnchor, waysOfKnowing } from "./knowledge-provenance";
import type { KnowledgeObject } from "./knowledge-types";
import { knowledgeFromRow, knowledgePayload, mergedKnowledgePayload } from "./learner-store";
import { objectivesForKnowledge } from "./learning-objective";

// Enrichment: what happens the SECOND time Nemesis meets a fact it already holds.
//
// 🔴 THE DEFECT THIS FILE PINS WAS A SILENT SUCCESS. `saveKnowledge` upserts with
// `ignoreDuplicates`, so a claim Nemesis first knew from model knowledge and later found in the
// learner's own lecture kept `provenance: model` and no anchor FOR EVER — and the write reported
// success. Nothing failed, nothing logged, and the citation marker stayed dark on a claim that had
// a real excerpt sitting behind it.
//
// 🔴 EVERY ASSERTION BELOW READS THE ROW, NEVER THE OBJECT THAT WAS PASSED IN. A test that
// re-reads its own in-memory object goes green against a row that never changed — which is the
// precise shape of the failure being fixed, so a proof that could make it would prove nothing.
// Each case therefore goes `object → knowledgePayload → JSON (as jsonb) → merge → JSON → row`, and
// asserts on what comes back out of `knowledgeFromRow`.

const ROW_SHAPE = {
  extraction_version: null,
  relation_kind: "generic to brand",
  statement: "losartan — Cozaar",
  type: "association",
};

/** Model knowledge and nothing else: no anchor, so no citation may render. */
const MODEL_KNOWN: KnowledgeObject = {
  id: "k1",
  pair: { id: "p1", left: "losartan", right: "Cozaar" },
  relationKind: "generic to brand",
  sourceAnchors: [],
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: ["model"],
};

const LECTURE_ANCHOR = {
  headingPath: ["Angiotensin receptor blockers"],
  page: 4,
  quote: { exact: "losartan (Cozaar)", prefix: "the ARB " },
  sourceId: "lib-lecture-4",
  unitId: "b12",
};

/** The SAME claim, met again — this time in the learner's own uploaded lecture. */
const GROUNDED: KnowledgeObject = { ...MODEL_KNOWN, sourceAnchors: [LECTURE_ANCHOR] };

/** A jsonb column, faithfully: whatever survives a JSON round trip and nothing else. */
function asStoredRow(payload: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

/** Store an object, merge the next encounter into it, and read the ROW back as an object. */
function enrich(
  stored: KnowledgeObject,
  nextEncounter: Pick<KnowledgeObject, "sourceAnchors" | "unanchoredProvenance">,
): { row: KnowledgeObject; wrote: boolean } {
  const storedPayload = asStoredRow(knowledgePayload(stored));
  const merged = mergedKnowledgePayload(storedPayload, nextEncounter);
  return {
    row: knowledgeFromRow({ ...ROW_SHAPE, identity_key: knowledgeIdentityKey(stored), payload: asStoredRow(merged ?? storedPayload) }),
    wrote: merged !== null,
  };
}

// ── the enrichment actually reaches the row ─────────────────────────────────

test("🔴 a model-known fact that later turns up in a real source GAINS the anchor on the stored row", () => {
  const { row, wrote } = enrich(MODEL_KNOWN, GROUNDED);

  assert.equal(wrote, true, "finding a real source for a model-known claim must produce a write");
  assert.equal(row.sourceAnchors?.length, 1, "the anchor must be on the ROW, not merely in the object we passed");
  assert.deepEqual(row.sourceAnchors?.[0], LECTURE_ANCHOR, "and it must survive the payload boundary whole");
  assert.equal(
    hasGroundableAnchor(row),
    true,
    "the citation marker is allowed to render only once the row itself carries an excerpt",
  );
});

test("🔴 grounding ADDS a way of knowing — it never deletes the one already there", () => {
  const { row } = enrich(MODEL_KNOWN, GROUNDED);

  // `waysOfKnowing` is explicit that this is accumulating, never exclusive: a learner asking "how
  // do you know this?" about a claim that is both model-known and in their Lecture 4 is entitled to
  // both answers, and the tidier half alone is a false answer to a question about trust.
  assert.deepEqual(row.unanchoredProvenance, ["model"], "model knowledge stays true after a source is found");
  assert.equal(waysOfKnowing(row).length, 2, "both ways of knowing must be readable off the row");
});

// ── the invariant the whole change exists to protect ────────────────────────

test("🔴 enrichment cannot move knowledge identity, so evidence cannot be orphaned", () => {
  // A construction proof, not a sample: `identityBasis` accepts only type, statement, pair,
  // relation and relationKind. Provenance is not in its parameter type, so no provenance change can
  // reach it. Asserted anyway, because the cost of being wrong is that someone who proved they knew
  // a fact is asked it again as though for the first time, their history attached to an abandoned
  // object.
  assert.equal(identityBasis(MODEL_KNOWN), identityBasis(GROUNDED));
  assert.equal(knowledgeIdentityKey(MODEL_KNOWN), knowledgeIdentityKey(GROUNDED));

  const before = objectivesForKnowledge(MODEL_KNOWN).map((o) => o.identityKey);
  const after = objectivesForKnowledge(GROUNDED).map((o) => o.identityKey);
  assert.deepEqual(after, before, "objective continuity is what learner evidence actually hangs off");
  assert.ok(before.length > 0, "a test that compared two empty lists would pass while proving nothing");
});

// ── a merge is not a rewrite ────────────────────────────────────────────────

test("🔴 the merge keeps payload fields it knows nothing about", () => {
  // The write-only-payload defect, one layer along: rebuilding the payload from the incoming object
  // would delete everything the stored row carries that this encounter happens not to mention. Six
  // structural fields have already died in this codebase exactly that way.
  const stored = asStoredRow(knowledgePayload(MODEL_KNOWN));
  stored.somethingAFutureKnowledgeTypeStored = { depth: 3 };

  const merged = mergedKnowledgePayload(stored, GROUNDED);
  assert.ok(merged, "the anchor is new, so there is a write to inspect");
  assert.deepEqual(
    merged.somethingAFutureKnowledgeTypeStored,
    { depth: 3 },
    "an unrelated field must survive an enrichment that never heard of it",
  );
});

// ── it converges rather than accumulating ───────────────────────────────────

test("🔴 meeting the same fact from the same source again writes NOTHING", () => {
  // Not merely an optimisation. `updated_at` is the only timestamp a later audit can read, and a
  // row rewritten on every ordinary re-encounter would make routine reading look like authorship.
  const alreadyGrounded = asStoredRow(knowledgePayload(GROUNDED));
  assert.equal(mergedKnowledgePayload(alreadyGrounded, GROUNDED), null);
});

test("a second, genuinely different source is added beside the first", () => {
  const secondSource = { ...LECTURE_ANCHOR, quote: { exact: "Cozaar" }, sourceId: "lib-review-sheet", unitId: "b7" };
  const { row } = enrich(GROUNDED, { sourceAnchors: [secondSource], unanchoredProvenance: [] });

  assert.equal(row.sourceAnchors?.length, 2, "two sources for one claim are two ways of knowing it");
  assert.equal(waysOfKnowing(row).length, 3, "model knowledge plus both sources");
});

test("🔴 two anchors that differ only in a field this key does not name are NOT collapsed", () => {
  // Calibrates the subtractive anchor key. An enumerated key — sourceId, unitId, page, quote —
  // would make any field added to `CanonicalSourceAnchor` later invisible, so two anchors differing
  // only in that new field would merge and one would be silently dropped on the way to the database.
  // `headingPath` stands in for that future field here: it is real, it locates the anchor, and an
  // enumerated key is exactly the kind that forgets it.
  const elsewhereInTheSameUnit = { ...LECTURE_ANCHOR, headingPath: ["Appendix", "Brand cross-reference"] };
  const { row } = enrich(GROUNDED, { sourceAnchors: [elsewhereInTheSameUnit], unanchoredProvenance: [] });

  assert.equal(row.sourceAnchors?.length, 2, "a differing anchor must survive, whichever field differs");
});

test("an anchor built in a different field order is the same anchor", () => {
  // The other half of the key's job: JSON key order is not identity, and a merge that thought it
  // was would store the same excerpt twice every time an extractor changed.
  const reordered = {
    quote: { prefix: "the ARB ", exact: "losartan (Cozaar)" },
    unitId: "b12",
    sourceId: "lib-lecture-4",
    page: 4,
    headingPath: ["Angiotensin receptor blockers"],
  };
  assert.equal(mergedKnowledgePayload(asStoredRow(knowledgePayload(GROUNDED)), { sourceAnchors: [reordered], unanchoredProvenance: [] }), null);
});

// ── the pre-existing rows this must not disturb ─────────────────────────────

test("a row stored before provenance existed reads as anchored-only, and enriching it is still safe", () => {
  const legacyPayload = asStoredRow({ anchors: [LECTURE_ANCHOR], pair: { left: "losartan", right: "Cozaar" } });
  const merged = mergedKnowledgePayload(legacyPayload, { sourceAnchors: [LECTURE_ANCHOR], unanchoredProvenance: [] });

  assert.equal(merged, null, "nothing new was learned, so nothing is written");

  const nowAlsoModelKnown = mergedKnowledgePayload(legacyPayload, { sourceAnchors: [], unanchoredProvenance: ["model"] });
  assert.ok(nowAlsoModelKnown, "learning that Nemesis also knows it independently IS new");
  assert.deepEqual(nowAlsoModelKnown.anchors, [LECTURE_ANCHOR], "and the existing anchor is untouched");
  assert.deepEqual(nowAlsoModelKnown.unanchoredProvenance, ["model"]);
});
