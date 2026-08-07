import assert from "node:assert/strict";
import test from "node:test";

import { buildDocument, describeLocator, type DocumentModel } from "./document-model.ts";
import { extractFacts, type DocFact } from "./document-facts.ts";
import { fillOutlinePoints, proposeArtifacts } from "./document-artifacts.ts";

const describe = (fact: DocFact) => describeLocator(fact.locator);

/**
 * 🔴 TWO DOCUMENTS, TWO FIELDS, NO SHARED VOCABULARY.
 *
 * Same structural shapes — a glossary run, a numbered procedure, a dated line, a
 * table of shares summing to a whole — expressed in law and in welding. If the
 * artifact builder produces different KINDS of thing for them, something in it
 * is reading subject matter, which is the one thing this layer may never do.
 */
function lawSyllabus(): DocumentModel {
  return buildDocument({
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Contract formation", unit: 0 },
      { headingPath: ["Contract formation"], kind: "paragraph", text: "Offer — a manifestation of willingness to enter a bargain.", unit: 0 },
      { headingPath: ["Contract formation"], kind: "paragraph", text: "Acceptance — assent to the terms of an offer.", unit: 0 },
      { headingPath: ["Contract formation"], kind: "paragraph", text: "Consideration — a bargained-for exchange of legal value.", unit: 0 },
      { headingPath: [], kind: "heading", level: 1, text: "Filing a motion", unit: 1 },
      { headingPath: ["Filing a motion"], kind: "listItem", marker: "1.", text: "Draft the notice of motion.", unit: 1 },
      { headingPath: ["Filing a motion"], kind: "listItem", marker: "2.", text: "Serve every opposing party.", unit: 1 },
      { headingPath: ["Filing a motion"], kind: "listItem", marker: "3.", text: "File proof of service with the clerk.", unit: 1 },
      { headingPath: [], kind: "heading", level: 1, text: "Assessment", unit: 2 },
      { headingPath: ["Assessment"], kind: "paragraph", text: "The moot court brief is due 14 March 2026.", unit: 2 },
      {
        headingPath: ["Assessment"],
        kind: "table",
        table: { headerRows: 1, rows: [["Component", "Weight"], ["Brief", "40%"], ["Oral argument", "35%"], ["Participation", "25%"]] },
        text: "",
        unit: 2,
      },
    ],
    format: "pdf",
    title: "Contracts I",
    units: [{ index: 0, kind: "page" }, { index: 1, kind: "page" }, { index: 2, kind: "page" }],
  });
}

function weldingManual(): DocumentModel {
  return buildDocument({
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Electrode terms", unit: 0 },
      { headingPath: ["Electrode terms"], kind: "paragraph", text: "Arc length — the distance from electrode tip to weld pool.", unit: 0 },
      { headingPath: ["Electrode terms"], kind: "paragraph", text: "Undercut — a groove melted into the base metal beside the weld.", unit: 0 },
      { headingPath: ["Electrode terms"], kind: "paragraph", text: "Slag inclusion — non-metallic matter trapped in the weld metal.", unit: 0 },
      { headingPath: [], kind: "heading", level: 1, text: "Striking an arc", unit: 1 },
      { headingPath: ["Striking an arc"], kind: "listItem", marker: "1.", text: "Set the amperage for the electrode diameter.", unit: 1 },
      { headingPath: ["Striking an arc"], kind: "listItem", marker: "2.", text: "Scratch the electrode across the plate.", unit: 1 },
      { headingPath: ["Striking an arc"], kind: "listItem", marker: "3.", text: "Lift to the correct arc length and hold.", unit: 1 },
      { headingPath: [], kind: "heading", level: 1, text: "Marking scheme", unit: 2 },
      { headingPath: ["Marking scheme"], kind: "paragraph", text: "The practical test is scheduled for 14 March 2026.", unit: 2 },
      {
        headingPath: ["Marking scheme"],
        kind: "table",
        table: { headerRows: 1, rows: [["Component", "Weight"], ["Bead appearance", "40%"], ["Penetration", "35%"], ["Safety", "25%"]] },
        text: "",
        unit: 2,
      },
    ],
    format: "pdf",
    title: "Shielded metal arc welding",
    units: [{ index: 0, kind: "page" }, { index: 1, kind: "page" }, { index: 2, kind: "page" }],
  });
}

test("two fields with no shared words yield the same kinds of artifact", () => {
  const law = proposeArtifacts(lawSyllabus(), describe);
  const weld = proposeArtifacts(weldingManual(), describe);

  for (const [name, a, b] of [
    ["cards", law.cards.length, weld.cards.length],
    ["events", law.events.length, weld.events.length],
    ["schemes", law.schemes.length, weld.schemes.length],
    ["outline", law.outline.length, weld.outline.length],
  ] as const) {
    assert.equal(a, b, `${name}: law ${a}, welding ${b}`);
    assert.ok(a > 0, `${name}: nothing was built from either`);
  }
});

test("the grading scheme is found without the word grading", () => {
  const law = proposeArtifacts(lawSyllabus(), describe);
  const weld = proposeArtifacts(weldingManual(), describe);
  assert.equal(law.schemes[0]!.total, 100);
  assert.equal(weld.schemes[0]!.total, 100);
  // The section's own name, in each document's own language. Nothing here knows
  // what "Marking scheme" or "Assessment" means; the author supplied both.
  assert.deepEqual(law.schemes[0]!.provenance.headingPath, ["Assessment"]);
  assert.deepEqual(weld.schemes[0]!.provenance.headingPath, ["Marking scheme"]);
});

test("every artifact carries the blocks it came from", () => {
  const proposal = proposeArtifacts(lawSyllabus(), describe);
  const all = [...proposal.cards, ...proposal.events, ...proposal.schemes, ...proposal.outline];
  assert.ok(all.length > 0);
  for (const artifact of all) {
    assert.ok(artifact.provenance.blockIds.length > 0, "an artifact with no provenance");
    assert.ok(artifact.provenance.where.length > 0);
  }
});

test("a card is the author's words, not new prose", () => {
  const doc = lawSyllabus();
  const card = proposeArtifacts(doc, describe).cards.find((c) => c.from === "definition");
  assert.ok(card);
  const source = doc.blocks.map((block) => block.text).join(" ");
  // Both halves must appear verbatim in the document, so the card is quotable
  // as the source's own text rather than as something we wrote about it.
  assert.ok(source.includes(card!.front), `front invented: ${card!.front}`);
  assert.ok(source.includes(card!.back), `back invented: ${card!.back}`);
});

test("a date with no unambiguous form produces no calendar entry", () => {
  const doc = buildDocument({
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Dates", unit: 0 },
      // 03/04 is two different days on two continents. An entry on the wrong day
      // is worse than no entry, and the extractor deliberately leaves it unparsed.
      { headingPath: ["Dates"], kind: "paragraph", text: "The report is due 03/04/2026.", unit: 0 },
    ],
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
  });
  assert.equal(proposeArtifacts(doc, describe).events.length, 0);
});

test("a Word document's artifacts carry no page number", () => {
  const doc = buildDocument({
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Terms", unit: 0 },
      { headingPath: ["Terms"], kind: "paragraph", text: "Offer — a manifestation of willingness to bargain.", unit: 0 },
      { headingPath: ["Terms"], kind: "paragraph", text: "Acceptance — assent to the terms of an offer.", unit: 0 },
      { headingPath: ["Terms"], kind: "paragraph", text: "Consideration — a bargained-for exchange.", unit: 0 },
    ],
    format: "docx",
    title: null,
    units: [{ index: 0, kind: "body" }],
  });
  const proposal = proposeArtifacts(doc, describe);
  assert.ok(proposal.cards.length > 0);
  for (const card of proposal.cards) {
    // 🔴 Word paginates at layout time. An artifact carrying an invented page
    // passes every later check of it, which is what makes it worse than none.
    assert.equal(card.provenance.unit, undefined);
    assert.ok(!/page/i.test(card.provenance.where), card.provenance.where);
  }
});

test("a one-step procedure builds no card", () => {
  const doc = buildDocument({
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Process", unit: 0 },
      { headingPath: ["Process"], kind: "listItem", marker: "1.", text: "Do the thing.", unit: 0 },
    ],
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
  });
  const proposal = proposeArtifacts(doc, describe);
  assert.equal(proposal.cards.filter((c) => c.from === "procedure").length, 0);
});

test("facts that built nothing are counted, not dropped", () => {
  const doc = lawSyllabus();
  const facts = extractFacts(doc);
  const proposal = proposeArtifacts(doc, describe, facts);
  const built =
    proposal.cards.length + proposal.events.length + proposal.schemes.length + proposal.outline.length;
  const skipped = Object.values(proposal.unused).reduce((sum, n) => sum + n, 0);
  // Every fact is accounted for. "We found nothing" and "we built nothing from
  // what we found" are different problems, and only counting tells them apart.
  assert.equal(built + skipped, facts.length);
});

test("a note section carries the document's own following text", () => {
  const doc = lawSyllabus();
  const proposal = proposeArtifacts(doc, describe);
  const filled = fillOutlinePoints(doc, proposal.outline);
  const formation = filled.find((section) => section.heading === "Contract formation");
  assert.ok(formation);
  assert.ok(formation!.points.length >= 3);
  assert.match(formation!.points[0]!, /Offer/);
  // It stops at the next heading rather than running into the next section.
  assert.ok(!formation!.points.some((point) => /notice of motion/.test(point)));
});
