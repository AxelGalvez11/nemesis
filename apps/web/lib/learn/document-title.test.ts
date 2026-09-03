import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { attachedFileTitle, documentTitle, looksLikeTitle, nameFromFile, TITLE_MAX } from "./document-title";

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
  // 🔴 MOVED, NOT WEAKENED, 2026-09-03. This used to pin `documentTitle(source.title)`. A source
  // title is now the learner's own file name, extension and all (`attachedFileTitle`), so the store
  // reads it as a file name before applying the shape tests — otherwise the first document dropped
  // into a canvas would name the whole conversation `08-insulin.pdf`. The INVARIANT this guard
  // protects is unchanged and is the reason it still exists: nothing may title a canvas without
  // passing through `documentTitle`, whichever door it came in by.
  const store = readFileSync(new URL("./canvas-store.ts", import.meta.url), "utf8");
  assert.match(
    store,
    /documentTitle\(nameFromFile\(source\.title\)\)/,
    "a source can title a canvas without passing the shape tests",
  );
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

test("🔴🔴 the reported case: an attached file keeps the name the learner gave it", () => {
  // Owner, 2026-09-03, looking at his own uploads: *"these are being renamed. Shouldn't they keep
  // their original file names? Sources need to be the original file names."* Both of these were
  // read off production before the fix: the shelf, the pills and the citations all showed the
  // right-hand string, and `library_sources.file_name` held the left-hand one the whole time.
  assert.equal(attachedFileTitle("08-insulin.pdf"), "08-insulin.pdf");
  assert.equal(attachedFileTitle("49-hypoglycemic-agents.pdf"), "49-hypoglycemic-agents.pdf");
  // Calibration: this is exactly what the canvas was doing, and it is what must not come back.
  assert.equal(documentTitle(undefined, "08-insulin.pdf"), "08 insulin");
  assert.notEqual(attachedFileTitle("08-insulin.pdf"), documentTitle(undefined, "08-insulin.pdf"));
});

test("🔴 the extension, the underscores and the capitals all survive", () => {
  // 🔴 STRUCTURAL, NOT SUBJECT MATTER (CLAUDE.md). Nothing here knows what any of these files are
  // about; the rule is "hand back the string", which reads the same for a law student's docket and
  // an engineer's tolerance chart.
  for (const name of [
    "IPT4_Steroid_Med_Chem_Practice_Questions_Hevener_8_2026.pptx",
    "Palsgraf v. Long Island R.R..pdf",
    "beam-deflection-lab.xlsx",
    "Kapitel 3 — Wärmeübertragung.docx",
    "x-ray-basics.png",
  ]) {
    assert.equal(attachedFileTitle(name), name);
  }
});

test("🔴 a file name with nothing in it falls back to the shape tests, exactly as before", () => {
  // The whole of the old behaviour, kept for the one case it was right about: there is no name to
  // hand back, so the extractor's offer is all there is.
  assert.equal(attachedFileTitle("", "Cardiac action potentials"), "Cardiac action potentials");
  assert.equal(attachedFileTitle("   ", "Cardiac action potentials"), "Cardiac action potentials");
  assert.equal(attachedFileTitle("---.pdf", "Cardiac action potentials"), "Cardiac action potentials");
  // And a table header row is still not a title, whichever way it arrives.
  assert.equal(attachedFileTitle("----", "| Case | Court | Year |"), "");
});

test("🔴 a stub file name now WINS, and that is the point rather than a regression", () => {
  // `documentTitle` deliberately lets a real title beat `lecture.pdf`, because it is naming a
  // canvas and "Cardiac action potentials" is the better conversation name. A SOURCE is a file the
  // learner has a copy of, so `lecture.pdf` is the string they will scan the shelf for — even
  // though, and precisely because, it tells you nothing about what is inside.
  assert.equal(documentTitle("Cardiac action potentials", "lecture.pdf"), "Cardiac action potentials");
  assert.equal(attachedFileTitle("lecture.pdf", "Cardiac action potentials"), "lecture.pdf");
});

test("🔴🔴 the upload door hands back the file name; the web door still does not", () => {
  // Calibration: send the upload branch back through `documentTitle(extracted.title, file.name)`
  // and the first assertion reddens.
  //
  // 🔴 THE WEB HALF IS NOT AN OVERSIGHT. A promoted page has no file — `prepareWebSourcePromotion`
  // invents `<page title>.md` one line earlier — so handing that name back verbatim would show a
  // learner an extension no page they visited ever had.
  const session = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
  const code = session.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /attachedFileTitle\(file\.name, extracted\.title\)/, "an uploaded file is being renamed again");
  assert.match(code, /sourceUrl\s*\n?\s*\?\s*documentTitle\(extracted\.title, file\.name\)/, "a promoted web page lost its page title");
});

test("🔴 the canvas is still named like a conversation, not like a file", () => {
  // The other half of the same change. Sources now carry `08-insulin.pdf`, and the first source
  // attached names the canvas — so without `nameFromFile` in front of it the sidebar, the browser
  // tab and every chat row would read `08-insulin.pdf`.
  assert.equal(documentTitle(nameFromFile("08-insulin.pdf")), "08 insulin");
  // And the 2026-08-26 defect stays fixed through the new path: stripping a would-be extension off
  // a row of column names leaves a row of column names, which is still not a title.
  assert.equal(documentTitle(nameFromFile("| Case | Court | Year | Holding |")), "");
});
