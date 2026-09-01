import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { documentTitle, looksLikeTitle, nameFromFile, TITLE_MAX } from "./document-title";

test("🔴🔴 the reported case: a table header row never becomes a title", () => {
  // Verbatim from the owner's canvas, 2026-08-26. It is the first line of the parse, and for most
  // documents the first line IS the title — which is exactly why nothing downstream questioned it.
  const row =
    "| Class/ Mechanism of Action | Generic (Brand) | Indications | Dosage/ Adjustments | " +
    "Common/ Important Adverse Drug Reactions | Monitoring/ Contraindications | " +
    "Drug-Drug Interactions | Clinical Pearls and Counseling Points |";
  assert.equal(looksLikeTitle(row), false);
  assert.equal(documentTitle(row, "IPT4 top drugs table.pdf"), "IPT4 top drugs table");
});

test("a row of cells is recognised by its separators, not by what is in the cells", () => {
  // 🔴 STRUCTURAL, NEVER SUBJECT MATTER. The same shape has to fail for a law student and a
  // mechanical engineer, so the test is "two or more bars", never a word list.
  for (const row of [
    "| Case | Court | Year | Holding |",
    "Part number | Material | Tolerance | Finish",
    "| Verb | Present | Preterite | Subjunctive |",
  ]) {
    assert.equal(looksLikeTitle(row), false, row);
  }
  // 🔴 ONE BAR IS PUNCTUATION, NOT A TABLE. Rejecting it would throw away real titles.
  assert.equal(looksLikeTitle("Chapter 4 | Negligence"), true);
});

test("a separator row, a rule and a line of symbols are not titles", () => {
  for (const junk of ["| --- | --- |", "-------------", "===", "   ", "###"]) {
    assert.equal(looksLikeTitle(junk), false, junk);
  }
});

test("🔴 a long FIRST PARAGRAPH is replaced; a long TITLE is trimmed", () => {
  // These are different failures and they need different answers. A paragraph cut at 72 characters
  // reads like a title while saying nothing, so it is thrown away for the file name. A genuine
  // title that ran on keeps its beginning.
  const paragraph = "When the pressure gradient turns adverse, ".repeat(6);
  assert.equal(looksLikeTitle(paragraph), false);
  assert.equal(documentTitle(paragraph, "boundary-layer-notes.pdf"), "boundary layer notes");

  const longTitle = "Separation of the turbulent boundary layer over a smoothly curved surface in flow";
  assert.ok(longTitle.length > TITLE_MAX);
  const cut = documentTitle(longTitle, "x.pdf");
  assert.ok(cut.endsWith("…"), cut);
  assert.ok(cut.length <= TITLE_MAX + 1, cut);
  assert.ok(!cut.includes("  ") && !cut.includes(" …"), `the cut fell mid-space: ${cut}`);
});

test("an ordinary title survives untouched, hashes and trailing punctuation aside", () => {
  assert.equal(documentTitle("Cardiac action potentials", "lecture.pdf"), "Cardiac action potentials");
  assert.equal(documentTitle("# Glycolysis", "x.pdf"), "Glycolysis");
  assert.equal(documentTitle("Nephron anatomy:", "x.pdf"), "Nephron anatomy");
});

test("the file name is read the way a person reads it", () => {
  assert.equal(nameFromFile("IPT4_top-drugs_table.pdf"), "IPT4 top drugs table");
  assert.equal(nameFromFile("lecture 3.pptx"), "lecture 3");
  // 🔴 AND A HYPHEN IS A SEPARATOR EVEN WHEN IT IS PART OF A WORD, which is a real cost stated
  // rather than hidden: "x-ray-basics.pdf" becomes "x ray basics". Nothing in a file name
  // distinguishes the hyphen in "x-ray" from the one in "boundary-layer", and file names use them
  // as separators far more often than as spelling. Getting "x ray" wrong is a worse title than
  // "boundary-layer-notes" is, and only one of the two can be right.
  assert.equal(nameFromFile("x-ray-basics.pdf"), "x ray basics");
});

test("both unusable means unnamed, never invented", () => {
  assert.equal(documentTitle("| --- |", "----.pdf"), "");
  assert.equal(documentTitle(undefined, ""), "");
});

test("🔴 the two doors a document title comes through both use this", () => {
  // Calibration: drop either call site and this reddens. One decision, one place — otherwise the
  // canvas header, the sidebar row and the citation can each be named differently.
  const session = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
  assert.match(session, /documentTitle\(/, "the extraction door names documents some other way again");
  const store = readFileSync(new URL("./canvas-store.ts", import.meta.url), "utf8");
  assert.match(store, /documentTitle\(source\.title\)/, "a source can title a canvas without passing the shape tests");
});

test("🔴🔴 the name the learner dropped in wins, and two files stay TELLABLE APART", () => {
  // Owner's own two uploads, 2026-09-01: *"the titles were changed to something that was simpler.
  // And so it makes it more difficult to see what's actually the file that I'm looking for."*
  //
  // Each document's first line begins "Integrated Pharmacotherapy 4", so deriving from content
  // produced two shelf rows that were indistinguishable — and the 72-character cut then deleted
  // the words that were the ONLY difference between them.
  const deck = documentTitle(
    "Integrated Pharmacotherapy 4 Steroid Chemistry Systemic and Pulmonary Steroids Med Chem Practice Questions",
    "IPT4_Steroid_Med_Chem_Practice_Questions_Hevener_8_2026.pptx",
  );
  const lecture = documentTitle(
    "Integrated Pharmacotherapy 4",
    "Hevener_Systemic_and_Inhalational_Steroids_Lecture_2026 (1).pdf",
  );
  assert.equal(deck, "IPT4 Steroid Med Chem Practice Questions Hevener 8 2026");
  assert.equal(lecture, "Hevener Systemic and Inhalational Steroids Lecture 2026 (1)");
  assert.notEqual(deck, lecture);
  // The real bug was not length, it was collision: the first four words used to be identical.
  assert.notEqual(deck.split(" ").slice(0, 4).join(" "), lecture.split(" ").slice(0, 4).join(" "));
});

test("🔴 a STUB file name still loses to a real title — the reversal is conditional", () => {
  // The same defect pointing the other way: renaming a well-titled paper after `lecture.pdf`.
  assert.equal(documentTitle("Cardiac action potentials", "lecture.pdf"), "Cardiac action potentials");
  assert.equal(documentTitle("Cardiac action potentials", "x.pdf"), "Cardiac action potentials");
  // Two words is enough to be a name someone chose.
  assert.equal(documentTitle("Cardiac action potentials", "week 3.pdf"), "week 3");
  // And a stub is still better than nothing when the document offered nothing usable.
  assert.equal(documentTitle("| --- |", "scan.pdf"), "scan");
});
