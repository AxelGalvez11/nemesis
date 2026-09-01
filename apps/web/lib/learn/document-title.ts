// What a document is called, when the document did not say.
//
// 🔴🔴 THIS EXISTS BECAUSE A CANVAS WAS NAMED AFTER A TABLE HEADER ROW. Owner, 2026-08-26, after
// dropping a drugs table into a canvas: *"the title of the canvas became really long after adding
// the docs."* The header read:
//
//     | Class/ Mechanism of Action | Generic (Brand) | Indications | Dosage/ Adjustments |
//     Common/ Important Adverse Drug Reactions | Monitoring/ Contraindications | …
//
// That is the first line of the parsed document, and the extractor offered it as the title in good
// faith: it IS the first line, and for most documents the first line is the title. For a document
// that opens on a table it is a row of column names, and every reader downstream then repeated it —
// the canvas header, the sidebar row, the source pill, any citation.
//
// 🔴 STRUCTURAL, NEVER SUBJECT MATTER (CLAUDE.md). Nothing here knows what a drug is, or a statute,
// or a bearing load. A title is rejected for its SHAPE — it is a row of cells, or it is longer than
// anything anyone writes as a title, or it has no words in it — and those tests read the same for a
// law student's case table and a mechanical engineer's tolerance chart.
//
// PURE. No React, no I/O, no network. One decision, one place, so the canvas, the pill and the
// citation cannot disagree about what a document is called.

/**
 * The longest a title may be.
 *
 * 🔴 A LENGTH, NOT A TRUNCATION POINT, and the two are different decisions. Something this long is
 * not a title that ran on; it is a different KIND of string — a paragraph, a row, an abstract — and
 * cutting it at 72 characters produces a fragment that reads like a title while saying nothing.
 * A real title that happens to run long is truncated (see `trimmed` below); a candidate that fails
 * the shape tests is replaced.
 */
export const TITLE_MAX = 72;

/** Two or more separators is a ROW OF CELLS. One can be ordinary punctuation — "Pride | Prejudice",
 *  "Ch. 4 | Torts" — so a single bar is not evidence of anything. */
const TABLE_ROW = /\|[^|]*\|/;

/** Anything a person would call a word: a letter or a digit in any script. Rejects "---", "|||",
 *  "===", the separator rows and rules that lead a great many parsed documents. */
const HAS_WORDS = /[\p{L}\p{N}]/u;

/** Tidy without judging: this runs on both the candidate and the fallback. */
function normalise(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    // Markdown leading hashes and the bars a table row is wrapped in. Only the OUTER bars: an
    // inner one is what `TABLE_ROW` is looking for and must survive to be seen.
    .replace(/^#+\s*/, "")
    .replace(/^\|\s*/, "")
    .replace(/\s*\|$/, "")
    .replace(/\s*[:.\-–—]+$/, "")
    .trim();
}

/**
 * Whether a file name carries information, or is a stub.
 *
 * 🔴 STRUCTURAL, NOT A LIST OF WORDS (CLAUDE.md). Nothing here knows that "lecture" is generic and
 * "Hevener" is not — it counts words and characters, which reads the same for a law student's
 * `Contracts_Week3_Consideration.pdf` and an engineer's `beam_deflection_lab.pdf`. A vocabulary of
 * "boring file names" would be a keyword list, and keyword lists never generalise.
 *
 * Two words, or twelve characters. `lecture` and `x` fail; `boundary layer notes` and
 * `IPT4 Steroid Med Chem Practice Questions Hevener 8 2026` pass.
 */
function namesSomething(value: string): boolean {
  return value.split(" ").filter(Boolean).length >= 2 || value.length >= 12;
}

/** A title that genuinely ran long keeps its beginning, cut at a word. */
function trimmed(value: string): string {
  if (value.length <= TITLE_MAX) return value;
  const cut = value.slice(0, TITLE_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_MAX * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Whether a string is shaped like something a person would write at the top of a page. */
export function looksLikeTitle(value: string): boolean {
  const clean = normalise(value);
  if (!clean) return false;
  if (!HAS_WORDS.test(clean)) return false;
  if (TABLE_ROW.test(clean)) return false;
  // 🔴 THE LENGTH TEST IS ON THE RAW CANDIDATE, not on a truncation of it. A 400-character first
  // paragraph is not a long title, and treating it as one puts its first 72 characters in the
  // sidebar for ever.
  return clean.length <= TITLE_MAX * 3;
}

/** A file name as a person would read it: no extension, no separators pretending to be spaces. */
export function nameFromFile(fileName: string): string {
  return normalise(
    fileName
      .replace(/\.[A-Za-z0-9]{1,8}$/, "")
      .replace(/[_]+/g, " ")
      // Hyphens between words become spaces; a hyphen inside a word (e-mail, X-ray) stays.
      .replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, " "),
  );
}

/**
 * What to call a document.
 *
 * `candidate` is whatever the extractor offered — often the first line of the parse. `fallback` is
 * what the learner already recognises, normally the file name. Either may be missing; the result is
 * "" only when both are unusable, and a caller that gets "" should leave the thing unnamed rather
 * than invent something.
 */
export function documentTitle(candidate: string | undefined | null, fallback = ""): string {
  // 🔴🔴 THE NAME THE LEARNER DROPPED IN WINS, AND THIS PRECEDENCE IS THE FIX OF 2026-09-01.
  // Owner, comparing his own two uploads: *"the sources I dropped in… the titles were changed to
  // something that was simpler. And so it makes it more difficult to see what's actually the file
  // that I'm looking for."*
  //
  // He dropped in `IPT4_Steroid_Med_Chem_Practice_Questions_Hevener_8_2026.pptx` and
  // `Hevener_Systemic_and_Inhalational_Steroids_Lecture_2026.pdf` — two names nobody could confuse.
  // The extractor offered each document's own first line, both of which begin "Integrated
  // Pharmacotherapy 4", and those won. The shelf then read:
  //
  //     Integrated Pharmacotherapy 4 Steroid Chemistry Systemic and Pulmonary…
  //     Integrated Pharmacotherapy 4
  //
  // 🔴 THE COLLISION IS THE WORST PART, NOT THE LENGTH. Two distinct files became two strings with
  // the same first four words, so the practice deck and the lecture are indistinguishable in a list
  // — and `trimmed` had cut the longer one at 72 characters, deleting the words ("Med Chem Practice
  // Questions") that were the only thing separating them.
  //
  // 🔴 THIS FILE'S ORIGINAL DEFECT STAYS FIXED, AND IS BETTER FIXED. It was written because a table
  // header row became a canvas title; the answer then was to reject the candidate's SHAPE. Every
  // shape test below still runs — they now decide the case where there is no file name at all (a
  // pasted URL, a scanned page), which is the only case where the extractor's guess is all we have.
  //
  // 🔴 "WINS" IS CONDITIONAL, AND THE CONDITION IS THE WHOLE DESIGN. A flat reversal would rename
  // a well-titled paper after a file called `lecture.pdf` or `x.pdf`, which is the same defect
  // pointing the other way. `namesSomething` is the test: a name that is more than one short stub
  // is a name its owner chose, and a name its owner chose is the one they will look for.
  const own = nameFromFile(fallback);

  if (own && HAS_WORDS.test(own) && namesSomething(own)) return trimmed(own);

  if (candidate && looksLikeTitle(candidate)) return trimmed(normalise(candidate));

  // A stub file name is still better than nothing, when the document offered nothing.
  if (own && HAS_WORDS.test(own)) return trimmed(own);

  return "";
}
