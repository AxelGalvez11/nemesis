/**
 * Sub-cell segmentation, tested on the shapes the owner's real drug chart actually prints.
 *
 * 🔴 EVERY FIXTURE BELOW IS COPIED FROM THE REAL DOCUMENT, not invented. A test written against an
 * imagined `"a; b; c"` cell would pass while the real chart — which uses hyphens, inline colons,
 * `5-10mg/day` ranges and mid-item hyphens — behaved completely differently.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { segmentCell } from "./cell-segmentation";

// ── The claim must not be split into tokens ────────────────────────────────

test("🔴 a cell with no list marker is ONE proposition and stays whole", () => {
  // Verbatim from the chart's Dosing column. "avoid in severe hepatic impairment" is a single
  // claim; three tokens would be three false ones.
  const segments = segmentCell("Reduce dose in hepatic impairment (Caution in cirrhosis patients)");
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.value, "Reduce dose in hepatic impairment (Caution in cirrhosis patients)");
  assert.equal(segments[0]?.qualifier, undefined);
});

test("🔴 a hyphen inside a word or a number is not a bullet", () => {
  // `5-10mg/day` and `anti-hypertensive` would each become two claims under a naive split.
  const dosing = segmentCell("HTN: Amlodipine 5-10mg/day Felodipine 2.5-10mg/d");
  assert.equal(dosing.length, 1);
  const interaction = segmentCell("NSAIDs: DEC anti-hypertensive effect= avoid / monitor");
  assert.equal(interaction.length, 1);
});

// ── The sub-label is part of the claim ─────────────────────────────────────

test("🔴🔴 `Rare, but serious` survives, because dropping it teaches a rare harm as a common one", () => {
  // Verbatim from the chart's Adverse Drug Reactions column.
  const segments = segmentCell(
    "Common: -peripheral edema -flushing -dizziness -headache -pulmonary edema Rare, but serious: -hepatoxicity -thrombocytopenia",
  );
  assert.equal(segments.length, 7);
  assert.deepEqual(
    segments.filter((s) => s.qualifier === "Common").map((s) => s.value),
    ["peripheral edema", "flushing", "dizziness", "headache", "pulmonary edema"],
  );
  assert.deepEqual(
    segments.filter((s) => s.qualifier === "Rare, but serious").map((s) => s.value),
    ["hepatoxicity", "thrombocytopenia"],
  );
  // 🔴 The two groups must not be confusable. If this ever collapses, hepatotoxicity is filed
  // beside flushing and a student learns that a rare serious harm is routine.
  assert.notEqual(
    segments.find((s) => s.value === "hepatoxicity")?.qualifier,
    segments.find((s) => s.value === "flushing")?.qualifier,
  );
});

test("an item carrying its own colon is not mistaken for a heading", () => {
  // `-Vitals^: BP, HR` — verbatim. The colon is inside the claim, not closing a heading.
  const segments = segmentCell("Safety: -s/s of peripheral edema -Vitals^: BP, HR -Labs^: LFTs");
  assert.equal(segments.length, 3);
  assert.ok(segments.every((s) => s.qualifier === "Safety"));
  assert.equal(segments[1]?.value, "Vitals^: BP, HR");
});

// ── Scope: the whole point ─────────────────────────────────────────────────

test("🔴🔴 A CLASS-LEVEL CLAIM STAYS ON THE CLASS — nothing fans out to the members", () => {
  // The row subject is a drug CLASS and this cell lists its members. Nothing in this module may
  // attach the class's adverse effects to any of them: the table never said that.
  const members = "Amlodipine (Norvasc) Felodipine (Plendil) Isradipine (DynaCirc)";
  const segments = segmentCell("Common: -peripheral edema -flushing", [members]);
  assert.equal(segments.length, 2);
  // 🔴 NOT scoped to amlodipine, even though amlodipine is right there in the row.
  assert.ok(segments.every((s) => s.scopedTo === undefined));
});

test("🔴 …UNLESS the source itself scopes it, which it does by naming a thing it already listed", () => {
  // Verbatim from the Drug-Drug Interactions column. `Amlodipine:` is the author explicitly
  // narrowing the next claim to one member — and `Amlodipine` appears in the members cell of the
  // same row, which is the structural evidence. Nothing here knows what a drug is.
  const members = "Amlodipine (Norvasc) Felodipine (Plendil) Nifedipine (Adalat CC, Procardia XL)";
  const segments = segmentCell(
    "- NSAIDs: DEC anti-hypertensive effect= avoid / monitor -Tacrolimus: INC risk of tacrolimus toxicity= monitor Amlodipine: -INC simva conc = NTE simva 20mg/d if used together",
    [members],
  );
  const scoped = segments.filter((s) => s.scopedTo);
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0]?.scopedTo, "Amlodipine");
  assert.match(scoped[0]?.value ?? "", /INC simva conc/);
  // The earlier claims stay on the row subject.
  assert.ok(segments.slice(0, 2).every((s) => s.scopedTo === undefined));
});

test("🔴 a heading naming something the row never mentioned is a QUALIFIER, not a scope change", () => {
  // `Counseling:` is not an entity. Treating it as one would move every counselling point onto a
  // thing that does not exist.
  const segments = segmentCell("Counseling: -avoid alcohol -may cause dizziness", ["Amlodipine (Norvasc)"]);
  assert.equal(segments.length, 2);
  assert.ok(segments.every((s) => s.qualifier === "Counseling" && s.scopedTo === undefined));
});

test("🔴 a short or partial-word match never re-scopes — an accidental match moves a claim onto the wrong thing", () => {
  // "BP" is too short to be evidence of anything, and must not match `BP` inside another cell.
  const segments = segmentCell("BP: -check at baseline -recheck weekly", ["Efficacy: -BP -HR"]);
  assert.ok(segments.every((s) => s.scopedTo === undefined));
  assert.ok(segments.every((s) => s.qualifier === "BP"));

  // "Nifed" appears inside "Nifedipine" but is not the same word.
  const partial = segmentCell("Nifed: -something", ["Nifedipine (Adalat CC)"]);
  assert.equal(partial[0]?.scopedTo, undefined);
});

test("a cell that opens with a bullet does not keep the dash as punctuation", () => {
  const segments = segmentCell("- CYP3A/5 inducers: INC CCB metabolism -NSAIDs: DEC effect");
  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.value, "CYP3A/5 inducers: INC CCB metabolism");
});

test("an empty cell yields nothing rather than an empty claim", () => {
  assert.deepEqual(segmentCell(""), []);
  assert.deepEqual(segmentCell("   "), []);
});

