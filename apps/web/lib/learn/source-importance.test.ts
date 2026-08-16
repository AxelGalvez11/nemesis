// What the SOURCE foregrounds, and — far more often — that we could not say.
//
// 🔴 THE ASSERTIONS THAT MATTER MOST HERE ARE THE ABSENCES. Every test below that checks a refusal
// is checking that a limit of ours stays legible as a limit of ours. A knowledge object marked less
// prominent because its cue was a bare number would be taught less, and the learner would be the one
// who looked weak on it. That is the worst failure available in this direction: invisible, and it
// blames the wrong party.
//
// 🔴 AND THE ROUND TRIP GOES THROUGH JSON, LIKE `list-marker-boundary.test.ts` ONE LANE OVER. Six
// structural fields have died at this codebase's boundaries. A test holding the in-memory object
// would pass while the stored shape dropped the field.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocument, readDocumentModel } from "@nemesis/shared";

import { sourceContextFromModel, type SourceContext } from "@/lib/sources/source-context";

import { extractKnowledgeObjects } from "./knowledge-extraction";
import type { KnowledgeObject } from "./knowledge-types";
import { importanceIndex, sourceImportance } from "./source-importance";

/**
 * A lecture that foregrounds one term and mentions another once.
 *
 * Field-agnostic on purpose: this is a materials-engineering deck, and every rule under test reads it
 * exactly as it reads a pharmacology one. If any assertion below needed to know what a fatigue limit
 * is, the rule producing it would be the wrong rule.
 */
function fatigueLecture() {
  return buildDocument({
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Fatigue limit", unit: 0 },
      {
        headingPath: ["Fatigue limit"],
        kind: "paragraph",
        text: "The fatigue limit is the stress below which a specimen survives indefinitely.",
        unit: 0,
      },
      {
        headingPath: ["Fatigue limit"],
        kind: "paragraph",
        text: "Surface finish shifts the fatigue limit more than any other single factor.",
        unit: 0,
      },
      { headingPath: [], kind: "heading", level: 1, text: "Test conditions", unit: 1 },
      // Mentioned once in prose and never headlined — one observation, deliberately.
      { headingPath: ["Test conditions"], kind: "paragraph", text: "Specimen count was held constant across runs.", unit: 1 },
      {
        headingPath: ["Test conditions"],
        kind: "table",
        table: { headerRows: 1, rows: [["Property", "Value"], ["Fatigue limit", "210 MPa"], ["Specimen count", "12"]] },
        text: "| Property | Value |\n| Fatigue limit | 210 MPa |\n| Specimen count | 12 |",
        unit: 1,
      },
    ],
    format: "pdf",
    title: "Fatigue",
    units: [{ index: 0, kind: "page" }, { index: 1, kind: "page" }],
  });
}

/** model → JSON → readDocumentModel → the context an extractor is actually handed. */
function acrossTheBoundary(model: ReturnType<typeof buildDocument>): SourceContext {
  const stored = JSON.parse(JSON.stringify(model));
  const read = readDocumentModel(stored);
  assert.ok(read, "the stored model should read back");
  return sourceContextFromModel({ model: read, sourceId: "s1", sourceKind: "pdf" });
}

function objectFor(objects: readonly KnowledgeObject[], cue: string): KnowledgeObject {
  const found = objects.find((object) => object.pair?.left === cue || object.statement.startsWith(cue));
  assert.ok(found, `expected an object cued on "${cue}"; got ${objects.map((o) => o.statement).join(" · ")}`);
  return found;
}

// ── THE ROUND TRIP ───────────────────────────────────────────────────────────────────────────────

test("the reading survives model → JSON → readDocumentModel → extraction, unchanged", () => {
  const model = fatigueLecture();
  const context = acrossTheBoundary(model);

  // Computed directly from the context, which is what the module promises.
  const direct = sourceImportance(importanceIndex(context), objectFor(extractKnowledgeObjects(context).objects, "Fatigue limit"));
  assert.ok(direct.importance, "a term the document returns to and headlines should read");

  // Computed by the extractor and carried on the object, then put through JSON as a jsonb column
  // would be. 🔴 THIS IS THE ASSERTION SIX FIELDS DIED FOR: producing the value proves nothing about
  // whether a consumer can read it back.
  const minted = objectFor(extractKnowledgeObjects(context).objects, "Fatigue limit");
  const stored = JSON.parse(JSON.stringify(minted)) as KnowledgeObject;
  assert.deepEqual(stored.importance, direct.importance);
});

test("the observations, not just the grade, cross the boundary", () => {
  const context = acrossTheBoundary(fatigueLecture());
  const minted = JSON.parse(
    JSON.stringify(objectFor(extractKnowledgeObjects(context).objects, "Fatigue limit")),
  ) as KnowledgeObject;

  // 🔴 A GRADE WITH NO TRACE IS THE OPAQUE FLOAT THIS MODULE EXISTS TO AVOID. "Why is this central?"
  // has to be answerable from the stored value, or the field is a number nobody can correct.
  assert.deepEqual(
    minted.importance?.observations.map((observation) => observation.signal).sort(),
    ["carries-emphasis", "named-as-a-heading", "returned-to"].filter((signal) =>
      minted.importance?.observations.some((observation) => observation.signal === signal),
    ).sort(),
  );
  const returned = minted.importance?.observations.find((o) => o.signal === "returned-to");
  assert.equal(returned?.foregrounded, true);
  assert.ok((returned?.count ?? 0) >= 1, "the count behind the observation must cross too");
});

// ── UNKNOWN NEVER BECOMES A VALUE ────────────────────────────────────────────────────────────────

test("an untraceable cue is refused by name and leaves NO importance on the object", () => {
  const context = acrossTheBoundary(
    buildDocument({
      blocks: [
        { headingPath: [], kind: "heading", level: 1, text: "Conversion", unit: 0 },
        {
          headingPath: ["Conversion"],
          kind: "table",
          table: { headerRows: 0, rows: [["5", "31"], ["6", "42"], ["7", "53"]] },
          text: "| 5 | 31 |\n| 6 | 42 |\n| 7 | 53 |",
          unit: 0,
        },
      ],
      format: "pdf",
      title: "Conversion",
      units: [{ index: 0, kind: "page" }],
    }),
  );
  const extraction = extractKnowledgeObjects(context);
  assert.ok(extraction.objects.length >= 3, "the grid should still yield its pairs");

  for (const object of extraction.objects) {
    // 🔴 NOT `importance.standing === "peripheral"`. A bare number cannot be traced through a
    // document, so we did not look — and "we did not look" must never be stored as "we looked and
    // found nothing", which is the reading a controller would act on.
    assert.equal(object.importance, undefined);
    assert.ok(!("importance" in object), "an unread object must not carry the key at all");
  }
  assert.deepEqual(
    [...new Set(extraction.importanceRefusals.map((refusal) => refusal.reason))],
    ["cue-not-traceable"],
  );
  assert.equal(extraction.importanceRefusals.length, extraction.objects.length, "every refusal is counted");
});

test("a cue that is one of the document's own column names is refused, not scored", () => {
  // The shape that produces this in production: one grid prints its header, a continuation fragment
  // of the same grid does not — so the second fragment's header row is read as data.
  const context = acrossTheBoundary(
    buildDocument({
      blocks: [
        { headingPath: [], kind: "heading", level: 1, text: "Schedule", unit: 0 },
        {
          headingPath: ["Schedule"],
          kind: "table",
          table: { headerRows: 1, rows: [["Topic", "Instructor"], ["Bearings", "Dr Alvarez"]] },
          text: "| Topic | Instructor |\n| Bearings | Dr Alvarez |",
          unit: 0,
        },
        {
          headingPath: ["Schedule"],
          kind: "table",
          table: { headerRows: 0, rows: [["Topic", "Instructor"], ["Gear trains", "Dr Alvarez"]] },
          text: "| Topic | Instructor |\n| Gear trains | Dr Alvarez |",
          unit: 1,
        },
      ],
      format: "pdf",
      title: "Schedule",
      units: [{ index: 0, kind: "page" }, { index: 1, kind: "page" }],
    }),
  );
  const extraction = extractKnowledgeObjects(context);
  const headerRow = extraction.objects.find((object) => object.pair?.left === "Topic");
  assert.ok(headerRow, "the fragment with no stated header does read its header row as data");
  assert.equal(headerRow.importance, undefined);
  assert.ok(
    extraction.importanceRefusals.some((refusal) => refusal.reason === "cue-is-a-column-name"),
    "the refusal must name what it is about — a header cell, not a subject",
  );
});

// ── `central` NEEDS CORROBORATION ────────────────────────────────────────────────────────────────

test("one observation alone is `supporting`; it takes two to say `central`", () => {
  const context = acrossTheBoundary(fatigueLecture());
  const index = importanceIndex(context);
  const objects = extractKnowledgeObjects(context).objects;

  // Returned to in prose AND named as a heading → two independent observations.
  const both = sourceImportance(index, objectFor(objects, "Fatigue limit")).importance;
  assert.equal(both?.standing, "central");
  assert.equal(both?.observations.filter((observation) => observation.foregrounded).length, 2);

  // 🔴 THE CALIBRATION THIS TEST EXISTS FOR. Ranked on recurrence alone, the top terms of the
  // owner's production syllabus are `Quiz`, `Instructor`, `Campus`, `Memphis` and `Dr. Peters` —
  // every count correct, and every one of them a campus, a staff member or a column header. A
  // standing built on one count promotes those above a diagnostic threshold.
  const onlyRecurs = sourceImportance(index, {
    id: "x",
    pair: { id: "x", left: "Specimen count", right: "12" },
    sourceAnchors: [{ sourceId: "s1", unitId: objectFor(objects, "Fatigue limit").sourceAnchors![0]!.unitId }],
    statement: "Specimen count — 12",
    type: "association",
    unanchoredProvenance: [],
  }).importance;
  assert.equal(onlyRecurs?.standing, "supporting");
});

test("nothing the document foregrounds means `peripheral`, and only when something was looked at", () => {
  const context = acrossTheBoundary(fatigueLecture());
  const index = importanceIndex(context);
  const reading = sourceImportance(index, {
    id: "y",
    pair: { id: "y", left: "Rockwell hardness", right: "58 HRC" },
    sourceAnchors: [{ sourceId: "s1", unitId: context.units[1]!.id }],
    statement: "Rockwell hardness — 58 HRC",
    type: "association",
    unanchoredProvenance: [],
  }).importance;

  assert.equal(reading?.standing, "peripheral");
  assert.ok(reading!.observations.length > 0, "`peripheral` is only sayable when a signal actually ran");
  assert.ok(reading!.observations.every((observation) => !observation.foregrounded));
});

// ── THE FLOOR RULE: UNLOCATED LOSS DEGRADES EVERY UNIT ───────────────────────────────────────────

test("a document whose parse recovered no emphasis says so on EVERY reading, confident ones included", () => {
  const context = acrossTheBoundary(fatigueLecture());
  const index = importanceIndex(context);

  // 🔴 `emphasis-not-recovered`, NEVER `carries-emphasis: false`. Measured across production on
  // 2026-08-15: bold survived in 451 of 999 units of a .pptx and in 0 of 149 and 0 of 275 units of
  // the two PDFs. On a PDF, "the author emphasised nothing" is a claim we have no evidence for.
  assert.deepEqual(index.blindSpots.map((spot) => spot.reason), ["emphasis-not-recovered"]);
  assert.ok(!index.blindSpots.some((spot) => spot.signal === "returned-to"));

  const readings = extractKnowledgeObjects(context)
    .objects.map((object) => object.importance)
    .filter((importance) => importance !== undefined);
  assert.ok(readings.length > 0, "this document must produce readings, or the test proves nothing");
  for (const reading of readings) {
    // The floor rule, implemented: refinement must never make unlocated loss vanish, so it rides on
    // the confident readings too rather than only on the doubtful ones.
    assert.deepEqual(reading!.blindSpots.map((spot) => spot.reason), ["emphasis-not-recovered"]);
    assert.ok(!reading!.observations.some((observation) => observation.signal === "carries-emphasis"));
  }
});

test("a document whose parse DID recover emphasis asks the emphasis question instead", () => {
  const context = acrossTheBoundary(
    buildDocument({
      blocks: [
        { headingPath: [], kind: "heading", level: 1, text: "Allele function", unit: 0 },
        { headingPath: ["Allele function"], kind: "paragraph", text: "A **no function** allele produces nothing.", unit: 0 },
        {
          headingPath: ["Allele function"],
          kind: "table",
          table: { headerRows: 1, rows: [["Allele", "Function"], ["*4", "**no function**"]] },
          text: "| Allele | Function |\n| *4 | **no function** |",
          unit: 0,
        },
      ],
      format: "pptx",
      title: "Alleles",
      units: [{ index: 0, kind: "page" }],
    }),
  );
  const index = importanceIndex(context);

  assert.deepEqual(index.blindSpots, [], "with emphasis recovered there is nothing blind about it");
  const reading = sourceImportance(index, {
    id: "z",
    pair: { id: "z", left: "no function", right: "produces nothing" },
    sourceAnchors: [{ sourceId: "s1", unitId: context.units.find((unit) => unit.type === "table")!.id }],
    statement: "no function — produces nothing",
    type: "association",
    unanchoredProvenance: [],
  }).importance;
  assert.equal(reading?.observations.find((observation) => observation.signal === "carries-emphasis")?.foregrounded, true);
});

test("first-class emphasis works when the stored text contains no Markdown delimiters", () => {
  const context = acrossTheBoundary(
    buildDocument({
      blocks: [
        {
          emphasis: [{ kind: "highlight", text: "probabilities sum to 1" }],
          headingPath: [],
          kind: "paragraph",
          text: "Probabilities sum to 1 for a complete distribution.",
          unit: 0,
        },
      ],
      format: "pdf",
      title: "Probability constraints",
      units: [{ index: 0, kind: "page" }],
    }),
  );
  const index = importanceIndex(context);
  assert.ok(
    !index.blindSpots.some((spot) => spot.reason === "emphasis-not-recovered"),
    "structured emphasis means this document is not blind to emphasis",
  );
  const reading = sourceImportance(index, {
    id: "constraint",
    sourceAnchors: [{ sourceId: "s1", unitId: context.units[0]!.id }],
    statement: "Probabilities sum to 1",
    type: "conceptual_system",
    unanchoredProvenance: [],
  }).importance;
  assert.equal(reading?.observations.find((observation) => observation.signal === "carries-emphasis")?.foregrounded, true);
});

// ── THE TWO MATCHING RULES THAT WERE MEASURABLY WRONG FIRST TIME ─────────────────────────────────

test("a longer term is not a recurrence of the shorter one it contains", () => {
  const context = acrossTheBoundary(
    buildDocument({
      blocks: [
        { headingPath: [], kind: "heading", level: 1, text: "Designations", unit: 0 },
        { headingPath: ["Designations"], kind: "paragraph", text: "Compare Inconel 718 with Inconel 7182.", unit: 0 },
        {
          headingPath: ["Designations"],
          kind: "table",
          table: { headerRows: 1, rows: [["Alloy", "Yield"], ["Inconel 71", "760 MPa"]] },
          text: "| Alloy | Yield |\n| Inconel 71 | 760 MPa |",
          unit: 0,
        },
      ],
      format: "pdf",
      title: "Designations",
      units: [{ index: 0, kind: "page" }],
    }),
  );
  const index = importanceIndex(context);
  const reading = sourceImportance(index, {
    id: "g",
    pair: { id: "g", left: "Inconel 71", right: "760 MPa" },
    sourceAnchors: [{ sourceId: "s1", unitId: context.units.find((unit) => unit.type === "table")!.id }],
    statement: "Inconel 71 — 760 MPa",
    type: "association",
    unanchoredProvenance: [],
  }).importance;

  // 🔴 PLAIN CONTAINMENT WAS WRONG AND THE MEASUREMENT SAID SO. In production it was `*1/*1` sitting
  // inside `*1/*10` and `*1/*1xN`; matching on containment inflated 45 of 225 syllabus counts and 20
  // of 69 .pptx counts, all of them in the direction of calling something more prominent than it is.
  assert.equal(reading?.observations.find((observation) => observation.signal === "returned-to")?.count, 0);
});

test("a continuation fragment of the same grid is not the source returning to an idea", () => {
  const context = acrossTheBoundary(
    buildDocument({
      blocks: [
        { headingPath: [], kind: "heading", level: 1, text: "Alloy schedule", unit: 0 },
        {
          headingPath: ["Alloy schedule"],
          kind: "table",
          table: { headerRows: 1, rows: [["Alloy", "Yield"], ["Inconel 718", "1030 MPa"]] },
          text: "| Alloy | Yield |\n| Inconel 718 | 1030 MPa |",
          unit: 0,
        },
        {
          headingPath: ["Alloy schedule"],
          kind: "table",
          table: { headerRows: 0, rows: [["Inconel 718", "cold rolled"]] },
          text: "| Inconel 718 | cold rolled |",
          unit: 1,
        },
      ],
      format: "pdf",
      title: "Alloys",
      units: [{ index: 0, kind: "page" }, { index: 1, kind: "page" }],
    }),
  );
  const index = importanceIndex(context);
  const reading = sourceImportance(index, {
    id: "a",
    pair: { id: "a", left: "Inconel 718", right: "1030 MPa" },
    sourceAnchors: [{ sourceId: "s1", unitId: context.units.find((unit) => unit.type === "table")!.id }],
    statement: "Inconel 718 — 1030 MPa",
    type: "association",
    unanchoredProvenance: [],
  }).importance;

  // The second fragment is the same table being long, not the document coming back to the alloy.
  // Counting it would let every wide grid corroborate itself into `central`.
  assert.equal(reading?.observations.find((observation) => observation.signal === "returned-to")?.count, 0);
});

test("a heading naming the cue does not also count as the prose returning to it", () => {
  const context = acrossTheBoundary(fatigueLecture());
  const index = importanceIndex(context);
  const objects = extractKnowledgeObjects(context).objects;
  const reading = sourceImportance(index, objectFor(objects, "Fatigue limit")).importance;

  // 🔴 THE TWO SIGNALS MUST BE DISJOINT OR CORROBORATION IS THEATRE. A heading is also a unit; if
  // `returned-to` counted headings, one piece of evidence would fire both signals and a term named
  // once in a heading would come out `central` on the strength of that single fact.
  const returned = reading?.observations.find((observation) => observation.signal === "returned-to")?.count ?? 0;
  const named = reading?.observations.find((observation) => observation.signal === "named-as-a-heading")?.count ?? 0;
  assert.equal(named, 1, "the document headlines the term exactly once");
  assert.equal(returned, 2, "and returns to it in two paragraphs — the heading is not among them");
});

// ── THE OBJECT MUST BE LOCATABLE AT ALL ──────────────────────────────────────────────────────────

test("knowledge with no anchor, or an anchor into another document, is refused by name", () => {
  const context = acrossTheBoundary(fatigueLecture());
  const index = importanceIndex(context);
  const base: KnowledgeObject = {
    id: "n",
    pair: { id: "n", left: "Fatigue limit", right: "210 MPa" },
    statement: "Fatigue limit — 210 MPa",
    type: "association",
    unanchoredProvenance: ["model"],
  };

  assert.equal(sourceImportance(index, base).refusal?.reason, "no-anchor");
  assert.equal(sourceImportance(index, base).importance, undefined);

  const elsewhere = { ...base, sourceAnchors: [{ sourceId: "other", unitId: "b999" }] };
  assert.equal(sourceImportance(index, elsewhere).refusal?.reason, "unit-not-in-document");
  assert.equal(sourceImportance(index, elsewhere).importance, undefined);
});

test("a reading and a refusal are never both present, and never both absent", () => {
  const context = acrossTheBoundary(fatigueLecture());
  const index = importanceIndex(context);
  for (const object of extractKnowledgeObjects(context).objects) {
    const reading = sourceImportance(index, object);
    assert.equal(
      Boolean(reading.importance) !== Boolean(reading.refusal),
      true,
      `exactly one of importance/refusal for ${object.statement}`,
    );
  }
});

console.log("learn/source-importance.test.ts: source-prominence assertions passed");
