import assert from "node:assert/strict";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext, type SourceContext } from "@/lib/sources/source-context";

import { extractKnowledgeObjects } from "./knowledge-extraction";
import type { KnowledgeObject } from "./knowledge-types";
import {
  OBJECTIVE_IDENTITY_VERSION,
  objectiveIdentityBasis,
  objectiveIdentityKey,
  objectivesForKnowledge,
} from "./learning-objective";

// ── the real path, twice ────────────────────────────────────────────────────
//
// 🔴 CALLING `objectiveIdentityKey` TWICE WITH THE SAME ARGUMENT PROVES NOTHING. It is the same
// shape as writing an accent test with the same literal on both sides: the assertion holds because
// the inputs are identical, not because the identity is stable. So these mint objectives the way
// production does — a stored envelope, through `buildSourceContext`, through the real extractor —
// from documents that differ in every way except the fact they teach.

function stored(model: DocumentModel) {
  return JSON.parse(JSON.stringify(structureEnvelope({ model, text: "…", title: "A document" })));
}

function sourceWith(blocks: Partial<DocBlock>[], units = 1): DocumentModel {
  return {
    blocks: blocks.map((b, i) => ({ headingPath: [], id: `b${i}`, kind: "paragraph", text: "", unit: 0, ...b }) as DocBlock),
    format: "docx",
    title: "A document",
    units: Array.from({ length: units }, (_, index) => ({ index, kind: "page" as const })),
  };
}

/** A glossary as a lecture printed it: term first, on page 1, in a document called lib-A. */
const LECTURE: SourceContext = buildSourceContext({
  sourceId: "lib-LECTURE",
  sourceKind: "docx",
  structure: stored(sourceWith([
    { id: "h1", kind: "heading", text: "Key drugs" },
    {
      headingPath: ["Key drugs"],
      id: "t1",
      kind: "table",
      table: { headerRows: 1, rows: [["Generic", "Brand"], ["losartan", "Cozaar"]] },
    },
  ])),
});

/**
 * The SAME fact as a revision sheet printed it — and deliberately different in every other way:
 * a different source id, different block ids, a later page, a different heading, and the two
 * columns THE OTHER WAY ROUND.
 */
const REVISION: SourceContext = buildSourceContext({
  sourceId: "lib-REVISION",
  sourceKind: "pdf",
  structure: stored(sourceWith([
    { id: "x0", kind: "paragraph", text: "Unrelated opening.", unit: 0 },
    { id: "x1", kind: "heading", text: "Brands to know", unit: 3 },
    {
      headingPath: ["Brands to know"],
      id: "x2",
      kind: "table",
      table: { headerRows: 1, rows: [["Brand", "Generic"], ["Cozaar", "losartan"]] },
      unit: 3,
    },
  ], 4)),
});

const objectivesFrom = (context: SourceContext) =>
  extractKnowledgeObjects(context).objects.flatMap(objectivesForKnowledge);

test("🔴 the same capability over the same knowledge, met in two documents, is ONE objective", () => {
  const fromLecture = objectivesFrom(LECTURE);
  const fromRevision = objectivesFrom(REVISION);
  assert.equal(fromLecture.length, 2, "both directions");
  assert.deepEqual(
    fromRevision.map((o) => o.identityKey).sort(),
    fromLecture.map((o) => o.identityKey).sort(),
  );
});

test("🔴 one identity key always asks the same question", () => {
  // THE TEST THAT NEARLY WASN'T. Comparing key-sets, or even direction→key maps, passes whatever
  // happens: both documents always yield one `left_to_right` and one `right_to_left`, so the keys
  // match by construction. What that cannot see is whether the two keys MEAN the same thing.
  //
  // The lecture prints Generic|Brand; the revision sheet prints Brand|Generic. Define direction
  // against the document's own order and `left_to_right` becomes "produce the brand" in one file
  // and "produce the generic" in the other — the SAME KEY for OPPOSITE capabilities. Evidence that
  // someone can go generic→brand would then be credited to brand→generic, silently, and the
  // learner would be told they know something they have never been asked.
  //
  // So the assertion has to be about what the key asks, not about the set of keys. Remove the
  // `.sort()` in objectivesForKnowledge and this goes red; comparing keys alone does not.
  const asked = (context: SourceContext) =>
    Object.fromEntries(objectivesFrom(context).map((o) => [o.identityKey, o.label]));
  assert.deepEqual(asked(REVISION), asked(LECTURE));
});

test("nothing about the document reaches the objective key", () => {
  const key = objectivesFrom(LECTURE)[0]!.identityKey;
  for (const leak of ["lib-LECTURE", "lib-REVISION", "t1", "x2", "Key drugs", "Brands to know"]) {
    assert.equal(key.includes(leak), false, `the key leaked "${leak}"`);
  }
});

// ── non-convergence: what must stay apart ───────────────────────────────────

test("🔴 the two directions are two objectives", () => {
  // Producing the brand from the generic is genuinely not the same skill as the reverse. One key
  // for both would credit a learner with a direction they were never asked.
  const [a, b] = objectivesFrom(LECTURE);
  assert.notEqual(a!.identityKey, b!.identityKey);
  assert.notEqual(a!.parameters.inputRole, b!.parameters.inputRole);
  assert.equal(a!.parameters.inputRole, b!.parameters.outputRole);
});

test("🔴 recall, discriminate and explain over one fact are three objectives", () => {
  const knowledge = objectivesFrom(LECTURE)[0]!.knowledgeIdentityKey;
  const parameters = { direction: "left_to_right" as const };
  const keys = (["recall", "discriminate", "explain"] as const).map((capability) =>
    objectiveIdentityKey({ capability, knowledgeIdentityKey: knowledge, parameters }));
  assert.equal(new Set(keys).size, 3);
});

test("two different facts never share an objective", () => {
  const other = buildSourceContext({
    sourceId: "lib-OTHER",
    sourceKind: "docx",
    structure: stored(sourceWith([{
      id: "t1", kind: "table",
      table: { headerRows: 1, rows: [["Generic", "Brand"], ["valsartan", "Diovan"]] },
    }])),
  });
  const mine = new Set(objectivesFrom(LECTURE).map((o) => o.identityKey));
  assert.equal(objectivesFrom(other).some((o) => mine.has(o.identityKey)), false);
});

// ── wording is presentation, never identity ─────────────────────────────────

test("🔴 the human label does not participate in identity", () => {
  // "Recall the brand for losartan" / "What is losartan sold as?" / "Give the brand name of
  // losartan" are one capability worded three ways. Rewording a prompt must not orphan evidence.
  const objective = objectivesFrom(LECTURE)[0]!;
  const reworded = { ...objective, label: "What is losartan sold as?" };
  assert.equal(
    objectiveIdentityKey({
      capability: reworded.capability,
      knowledgeIdentityKey: reworded.knowledgeIdentityKey,
      parameters: reworded.parameters,
    }),
    objective.identityKey,
  );
});

test("the basis is inspectable, so a disagreement can be read rather than guessed", () => {
  assert.equal(
    objectiveIdentityBasis({
      capability: "recall",
      knowledgeIdentityKey: "association:v2:abc",
      parameters: { inputRole: "generic", outputRole: "brand" },
    }),
    "objective|association:v2:abc|recall|in=generic,out=brand|dir=-",
  );
  // The headerless fallback occupies a visibly different shape, so the two can never be confused
  // by anything reading a stored basis.
  assert.equal(
    objectiveIdentityBasis({
      capability: "recall",
      knowledgeIdentityKey: "association:v2:abc",
      parameters: { direction: "left_to_right" },
    }),
    "objective|association:v2:abc|recall|in=-,out=-|dir=left_to_right",
  );
});

test("a parameterless objective is distinct from a directional one", () => {
  const knowledge = "association:v2:abc";
  assert.notEqual(
    objectiveIdentityKey({ capability: "explain", knowledgeIdentityKey: knowledge, parameters: {} }),
    objectiveIdentityKey({ capability: "explain", knowledgeIdentityKey: knowledge, parameters: { direction: "left_to_right" } }),
  );
});

// ── identity describes the capability, not the typesetting ──────────────────

test("🔴 the objective says what the learner must PRODUCE, in the source's own words", () => {
  // The rule this pins: identity describes the capability, never a column position. Both documents
  // must yield `given the generic, produce the brand` and its reverse — not `given the left one`.
  const roles = (context: SourceContext) =>
    objectivesFrom(context)
      .map((o) => `${o.parameters.inputRole}->${o.parameters.outputRole}`)
      .sort();
  assert.deepEqual(roles(LECTURE), ["brand->generic", "generic->brand"]);
  // 🔴 THE REVISION SHEET PRINTS ITS COLUMNS THE OTHER WAY ROUND and must still agree. Keyed on
  // position, `left_to_right` would mean "produce the brand" in one file and "produce the generic"
  // in the other — one key, two opposite capabilities.
  assert.deepEqual(roles(REVISION), roles(LECTURE));
});

test("🔴 the same role pair from either document is the same objective", () => {
  const byRole = (context: SourceContext) =>
    Object.fromEntries(objectivesFrom(context).map((o) => [`${o.parameters.inputRole}->${o.parameters.outputRole}`, o.identityKey]));
  const lecture = byRole(LECTURE);
  const revision = byRole(REVISION);
  assert.deepEqual(revision, lecture);
  // And the value each role carries agrees too, which is what makes the merge honest rather than
  // a coincidence of two hashes landing on the same string.
  const cueOf = (context: SourceContext, pair: string) =>
    objectivesFrom(context).find((o) => `${o.parameters.inputRole}->${o.parameters.outputRole}` === pair)!.label;
  assert.equal(cueOf(REVISION, "generic->brand"), cueOf(LECTURE, "generic->brand"));
  assert.match(cueOf(LECTURE, "generic->brand"), /Given losartan, produce Cozaar/i);
});

test("a headerless pair falls back to position, and never collides with a role-bearing one", () => {
  // 🔴 THE FALLBACK IS THE WEAKER FORM AND MUST STAY VISIBLY SO. It exists because a headerless
  // glossary still teaches something; refusing to make any objective for it would be worse. Its
  // knowledge key already carries `unstated`, so it lives in a separate identity space.
  const headerless = buildSourceContext({
    sourceId: "lib-NOHEAD",
    sourceKind: "pdf",
    structure: stored(sourceWith([{
      id: "t1", kind: "table", table: { headerRows: 0, rows: [["losartan", "Cozaar"]] },
    }])),
  });
  const fallback = objectivesFrom(headerless);
  assert.equal(fallback.length, 2);
  assert.equal(fallback.every((o) => o.parameters.inputRole === undefined), true, "no roles were invented");
  assert.equal(fallback.every((o) => o.parameters.direction !== undefined), true);
  const roleBearing = new Set(objectivesFrom(LECTURE).map((o) => o.identityKey));
  assert.equal(fallback.some((o) => roleBearing.has(o.identityKey)), false);
});

// ── the version travels inside the key ──────────────────────────────────────

test("🔴 an objective key says which rules made it", () => {
  // Learner evidence is stored against this string. Without the version, changing how the key is
  // computed orphans every row silently — old and new keys are both just strings.
  const key = objectivesFrom(LECTURE)[0]!.identityKey;
  assert.equal(key.split(":")[1], `v${OBJECTIVE_IDENTITY_VERSION}`);
  assert.match(key, /^recall:v\d+:[0-9a-f]{16}$/);
});

test("a knowledge key computed under other rules yields a different objective", () => {
  const parameters = { direction: "left_to_right" as const };
  assert.notEqual(
    objectiveIdentityKey({ capability: "recall", knowledgeIdentityKey: "association:v1:abc", parameters }),
    objectiveIdentityKey({ capability: "recall", knowledgeIdentityKey: "association:v2:abc", parameters }),
  );
});

// ── the stated limit, so it is not discovered as a bug ──────────────────────

test("🔴 a headerless glossary does NOT converge with a headed one — a recorded limit", () => {
  // The relation kind comes from the grid's own column names, and a grid that stated none records
  // `unstated`, which is deliberately not a wildcard: matching it against a stated relationship
  // would be a guess about what those columns meant, and a false merge credits a learner with
  // knowledge they were never asked for. The cost lands HERE — the two produce different objective
  // identities, so evidence from one does not reach the other. That is a missed merge, which is
  // recoverable; it is recorded rather than fixed by loosening the key.
  const headerless = buildSourceContext({
    sourceId: "lib-NOHEAD",
    sourceKind: "pdf",
    structure: stored(sourceWith([{
      id: "t1", kind: "table", table: { headerRows: 0, rows: [["losartan", "Cozaar"]] },
    }])),
  });
  const mine = new Set(objectivesFrom(LECTURE).map((o) => o.identityKey));
  assert.equal(objectivesFrom(headerless).some((o) => mine.has(o.identityKey)), false);
});

test("only recall is minted, because only recall has a task behind it", () => {
  // An objective nothing can ask reports "no evidence" for ever and drags the learner's picture
  // down for a capability they were never given a chance to show.
  assert.deepEqual([...new Set(objectivesFrom(LECTURE).map((o) => o.capability))], ["recall"]);
});

test("a non-association yields no objectives rather than a guessed one", () => {
  const causal: KnowledgeObject = { id: "k1", statement: "Resistance up, current down.", type: "causal" };
  assert.deepEqual(objectivesForKnowledge(causal), []);
});
