import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPOSED_LINES,
  PAGE_READ_SCORER_VERSION,
  READ_SCORE,
  READ_TOKEN_FLOOR,
  scorePagesRead,
  type PageReadDecision,
} from "./page-read";

/** One page, scored alone. Most of these are single-page documents on purpose: the
 *  document-relative signal is off below five readable pages, which keeps every
 *  test below about the signal it names. */
const one = (text: string): PageReadDecision => scorePagesRead([text])[0]!;

/** A document of `n` dense pages, so the document-relative signal has a reference. */
const dense = (n: number) => Array.from({ length: n }, () => "word ".repeat(600).trim());

// ── The multilingual bug this replaced ───────────────────────────────────────
//
// Every page below is under the old 120-character floor and every one of them is a
// real content page. Under the character rule all four were sent to be re-read as
// pictures: slower, paid for, and a machine transcription put in place of words the
// document already had.

test("a Chinese page of real content is read, though it is under 120 characters", () => {
  const page =
    "药物代谢主要发生在肝脏，其中细胞色素P450酶系负责大部分氧化反应。" +
    "第二相反应包括葡萄糖醛酸化和硫酸化，使药物更易于经肾脏排泄。" +
    "肝功能受损的患者清除率下降，需要相应调整剂量。";
  assert.ok(page.length < 120, "the page is under the old character floor");
  const decision = one(page);
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "text-layer");
  assert.ok(decision.score > 0.7, `scored ${decision.score}`);
});

test("a Japanese page of real content is read, though it is under 120 characters", () => {
  const page =
    "本章では契約の成立要件について述べる。申込みと承諾が合致した時点で契約は成立し、" +
    "当事者双方に履行義務が生じる。錯誤や詐欺があった場合には取消しの余地がある。";
  assert.ok(page.length < 120);
  const decision = one(page);
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "text-layer");
});

test("a Korean page of real content is read, though it is under 120 characters", () => {
  const page =
    "재료의 인장 강도는 단면적에 작용하는 최대 하중으로 정의된다. " +
    "설계 단계에서는 안전 계수를 곱하여 허용 응력을 결정하며, 피로 하중이 반복되는 경우에는 별도의 검토가 필요하다.";
  assert.ok(page.length < 120);
  const decision = one(page);
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "text-layer");
});

// Arabic is priced at the Latin rate by the shared token estimate — the honest gap
// that file documents — so this page is not carried by the script-aware half of the
// rule. It is here because it must still read: a paragraph is a paragraph.
test("an Arabic paragraph is read", () => {
  const page =
    "تنص المادة الثانية عشرة على أن يقدم الطلب خلال ثلاثين يوماً من تاريخ الإخطار، " +
    "وأن ترفق به المستندات المؤيدة. ويجوز للجنة أن تطلب إيضاحات إضافية قبل البت في الطلب، " +
    "على أن يصدر القرار مسبباً وأن يبلغ إلى ذوي الشأن.";
  const decision = one(page);
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "text-layer");
});

// The narrow margin, pinned rather than described. A single Arabic sentence is a
// whole line of a legal notice and lands at 31 tokens — one token over the floor,
// where the same sentence in Chinese would be at 60 and in English at 45. It reads,
// but barely, and if the Latin rate is ever measured properly for these scripts
// this is the test that will move.
test("an Arabic page in the thin band reads, with the margin it actually has", () => {
  const page =
    "يقدم الطلب خلال ثلاثين يوماً من تاريخ الإخطار، وترفق به المستندات المؤيدة، " +
    "ويصدر القرار مسبباً خلال مدة لا تجاوز ستين يوماً.";
  const decision = one(page);
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "text-layer");
  assert.ok(decision.score < 0.55, `the margin is thin: ${decision.score}`);
  assert.ok(decision.signals.tokens > READ_TOKEN_FLOOR);
});

// The trade the token floor takes, in the other direction: thirty-five characters
// of a dense script is thirty-five tokens, so a caption stranded above a full-page
// figure now clears the floor where the old character rule caught it. Deliberate —
// the alternative condemned every real page in the same script — and the
// document-relative signal is what catches this page in a document of ordinary
// pages. This test exists so the trade cannot be made again by accident.
test("a dense-script caption over a figure clears the floor when it stands alone", () => {
  const caption = "肝脏首过效应与生物利用度的关系如下图所示，请结合图中曲线理解各参数的意义与相互影响。";
  assert.ok(caption.length < 50, "it is a caption, not a page of content");
  assert.equal(one(caption).read, true);
  assert.equal(scorePagesRead([...dense(8), caption])[8]!.read, false);
});

test("an English page of the same weight of content is read too", () => {
  const page =
    "Drug metabolism happens mostly in the liver, where the cytochrome P450 enzymes carry out " +
    "most oxidation reactions. Phase two reactions such as glucuronidation and sulfation make a " +
    "compound easier for the kidney to excrete.";
  const decision = one(page);
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "text-layer");
});

// The corpus page that made the case for a floor rather than a test for zero: it
// extracts its heading and nothing a reader came for.
test("a heading stranded above a full-page screenshot is not read", () => {
  const decision = one("Breastfeeding Considerations: Enoxaparin LexiDrug");
  assert.equal(decision.read, false);
  assert.equal(decision.reason, "thin-text-layer");
  assert.ok(decision.score < READ_SCORE);
});

test("a page with nothing on it says exactly that", () => {
  const decision = one("   \n\n \t ");
  assert.equal(decision.read, false);
  assert.equal(decision.reason, "no-text-layer");
  assert.equal(decision.score, 0);
  assert.equal(decision.signals.tokens, 0);
});

// ── The short page that is not a hole ────────────────────────────────────────
//
// Several stacked lines, complete in themselves. The page is short because that is
// all it says, not because the rest of it is a picture — and the difference is
// visible in the line count, which is the one structural signal that survives
// having no geometry.

test("a title page is short and is left alone", () => {
  const decision = one(
    "CONTRACT LAW II\nCases and Materials\nThird Edition\nA. Ruiz and B. Osei\nUniversity Press, 2026",
  );
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "short-composed-page");
  assert.ok(decision.signals.tokens < READ_TOKEN_FLOOR, "and it really is under the floor");
});

test("a section divider of a few lines is left alone", () => {
  const decision = one("Part Two\nRemedies\nSections 40 to 72");
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "short-composed-page");
});

// The other side of the same rule, and the reason it is drawn at lines rather than
// at length: from text alone, one line above a full-page screenshot is exactly what
// a one-line divider looks like, and mistaking the screenshot is the expensive
// error. So an orphan line is still sent to be read.
test("a one-line divider is still sent to be read, because a screenshot looks the same", () => {
  const decision = one("Lactation 04");
  assert.equal(decision.read, false);
  assert.equal(decision.reason, "thin-text-layer");
});

test("a two-line heading over a screenshot stays unread", () => {
  const decision = one("Breastfeeding Considerations\nEnoxaparin, LexiDrug");
  assert.equal(decision.read, false);
});

test("four lines of page furniture do not buy a page its way out", () => {
  const decision = one("1\n2\n3\n4");
  assert.equal(decision.read, false);
  assert.equal(decision.signals.lines, COMPOSED_LINES);
});

// ── Text that is long enough and still says nothing ──────────────────────────

test("a page of private-use rubbish is not read, however long it is", () => {
  // What a broken font map produces: the character map points into a range Unicode
  // assigns no meaning, so the page has plausible length and no content at all.
  const page = " ".repeat(80);
  const decision = one(page);
  assert.ok(decision.signals.chars > 400, "long enough to pass any length test");
  assert.ok(decision.signals.tokens > READ_TOKEN_FLOOR * 3, "and long enough by tokens too");
  assert.equal(decision.read, false);
  assert.equal(decision.reason, "garbled-text-layer");
  assert.ok(decision.score < 0.1, `scored ${decision.score}`);
});

test("a page whose decoder gave up is not read", () => {
  const page = "����� ".repeat(90);
  const decision = one(page);
  assert.equal(decision.read, false);
  assert.equal(decision.reason, "garbled-text-layer");
});

test("a page of one repeated glyph is not read", () => {
  const page = "ﬁﬁﬁﬁﬁﬁﬁﬁﬁﬁ ".repeat(60);
  const decision = one(page);
  assert.ok(decision.signals.tokens > READ_TOKEN_FLOOR * 3);
  assert.equal(decision.read, false);
  assert.equal(decision.reason, "garbled-text-layer");
  assert.equal(decision.signals.letterDominance, 1);
});

// The flavour this cannot catch, said out loud so nobody reads the tests above as a
// promise: an encoding shifted by a constant produces gibberish with the entropy
// and the letter distribution of ordinary prose, and no text-only signal separates
// it from a page in a language nobody here reads. It takes the pixels.
// What WORD_MIN_LETTERS gives up, pinned so the trade is visible rather than
// described. A font map broken badly enough to collapse the alphabet has collapsed
// the space glyph with it and arrives as one long run, which is still caught above —
// this is the same rubbish with the spaces intact, and it reads.
test("single-glyph rubbish with the spaces intact is NOT detected, and that is the trade", () => {
  const page = "ﬁ ".repeat(200).trim();
  const decision = one(page);
  assert.ok(decision.signals.tokens > READ_TOKEN_FLOOR);
  assert.equal(decision.signals.letters, 0, "every glyph stands alone, so there is no sample");
  assert.equal(decision.read, true);
});

test("shifted-encoding gibberish is NOT detected, and that is the known limit", () => {
  const page = "Tqf rvjdl cspxo gpy kvnqt pwfs uif mbaz eph. ".repeat(12);
  assert.equal(one(page).read, true);
});

// ── The garbage detector must not fire on legitimate pages ───────────────────
//
// These are the pages a naive rubbish detector destroys: tiny alphabets, heavy
// punctuation, almost no prose. Every one of them is perfectly well read, and
// sending one to be re-read as a picture would be the same class of mistake as the
// character floor. This is why the shape signals are measured over LETTERS only.

test("a sparse numeric table is read", () => {
  const page = Array.from({ length: 14 }, (_, row) => `${row}  0  0  1  0  0  0  1  0  0`).join("\n");
  const decision = one(page);
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "text-layer");
});

test("a table of contents built from dot leaders is read", () => {
  const page = Array.from(
    { length: 18 },
    (_, row) => `Chapter ${row + 1} . . . . . . . . . . . . . . . . ${row * 7 + 3}`,
  ).join("\n");
  const decision = one(page);
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "text-layer");
});

test("a page of dimension callouts is read", () => {
  const page = Array.from(
    { length: 16 },
    (_, row) => `${row + 1}. Ø12.5 ±0.1 ×4 / R3.2 ±0.05 / 45° ⌀ 8H7`,
  ).join("\n");
  assert.equal(one(page).read, true);
});

test("a form of repeated N/A cells is read", () => {
  const page = Array.from({ length: 20 }, () => "N/A | N/A | N/A | N/A | N/A").join("\n");
  assert.equal(one(page).read, true);
});

// The false positive that made WORD_MIN_LETTERS necessary, and the property that
// has to hold rather than the outcome: a grid of marks reads the same whether its
// mark is a letter or a symbol. Before, the "X" grid scored 0.112 and was called a
// broken font map while its "✓" twin scored 0.887, so the verdict turned on which
// glyph the producer picked for a tick — typography, not a measurement. A fitment
// matrix, a clause-applicability grid and an interaction chart are all this page.
test("a grid of marks is read whichever glyph the mark is", () => {
  const grid = ["      A1  A2  A3  A4  A5  A6  A7  A8"]
    .concat(Array.from({ length: 18 }, (_, row) => `R${row + 1}    X   X       X   X       X   X`))
    .join("\n");
  const asLetter = one(grid);
  const asSymbol = one(grid.replaceAll("X", "✓"));
  assert.equal(asLetter.read, true);
  assert.equal(asLetter.reason, "text-layer");
  assert.equal(asSymbol.read, true);
  // Every letter on the letter version stands alone, so the shape signals have no
  // sample at all and cannot fire — the same place the symbol version starts from.
  assert.equal(asLetter.signals.letters, 0);
  assert.equal(asLetter.signals.letterDominance, 0);
});

test("a column of bare tick marks is read", () => {
  const page = Array.from({ length: 24 }, (_, row) => `${row + 1}.  X`).join("\n");
  assert.equal(one(page).read, true);
});

test("a page of chemical formulae is read", () => {
  const page = Array.from(
    { length: 12 },
    (_, row) => `C${row + 6}H${row * 2 + 12}O2 + 2 NaOH -> C${row + 6}H${row * 2 + 11}O2Na + H2O`,
  ).join("\n");
  assert.equal(one(page).read, true);
});

// ── The page compared with its own document ──────────────────────────────────

test("a page that clears the floor is still unread when its document runs far denser", () => {
  // Thirty-five tokens is above the absolute floor and a fiftieth of what every
  // other page of this book returns. A page like this is a hole, and the absolute
  // floor alone calls it read.
  const hole = "Figure 7.4 The clearance pathway described in the preceding section, shown in outline; the full derivation is given in the appendix at the end of this chapter.";
  const decision = scorePagesRead([...dense(8), hole])[8]!;
  assert.ok(decision.signals.tokens > READ_TOKEN_FLOOR, "it clears the absolute floor");
  assert.equal(decision.read, false);
  assert.equal(decision.reason, "thin-for-this-document");
});

test("the same page in a document of its own size is read", () => {
  const hole = "Figure 7.4 The clearance pathway described in the preceding section, shown in outline; the full derivation is given in the appendix at the end of this chapter.";
  const decision = one(hole);
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "text-layer");
});

// Four pages is not a distribution. The same page that is a hole in a book above is
// simply a page here, because three dense neighbours cannot establish what this
// document's typical page looks like.
test("a document too small to have a typical page does not invent one", () => {
  const hole =
    "Figure 7.4 The clearance pathway described in the preceding section, shown in outline; the full derivation is given in the appendix at the end of this chapter.";
  const decisions = scorePagesRead([...dense(3), hole]);
  assert.equal(decisions[3]?.signals.documentRatio, null);
  assert.equal(decisions[3]?.read, true);
});

test("a document whose pages are all sparse does not penalise itself", () => {
  // Ten slides of a sentence each. Nothing here is a hole; they are simply short,
  // and a deck is allowed to be a deck.
  const slides = Array.from(
    { length: 10 },
    (_, index) =>
      `Slide ${index + 1}\nWhat the reader should take away from this step of the argument, and why it matters for the next one.`,
  );
  const decisions = scorePagesRead(slides);
  assert.ok(decisions.every((decision) => decision.read));
  assert.ok(decisions.every((decision) => decision.signals.documentRatio === null));
});

test("a composed short page is judged on its own, not against its document", () => {
  const title = "CONTRACT LAW II\nCases and Materials\nThird Edition\nA. Ruiz and B. Osei\nUniversity Press, 2026";
  const decision = scorePagesRead([title, ...dense(8)])[0]!;
  assert.equal(decision.read, true);
  assert.equal(decision.reason, "short-composed-page");
});

// ── It is not one threshold wearing a costume ────────────────────────────────
//
// Three pages, three different signals deciding: one fails despite having the
// words, one passes despite not having them, one fails on a comparison no length
// test could make. A single number cannot produce all three.

test("signals other than length decide the outcome in both directions", () => {
  const garbled = one(" ".repeat(80));
  const composed = one("Part Two\nRemedies\nSections 40 to 72");
  const relative = scorePagesRead([
    ...dense(8),
    "Figure 7.4 The clearance pathway described in the preceding section, shown in outline; the full derivation is given in the appendix at the end of this chapter.",
  ])[8]!;

  assert.ok(garbled.signals.tokens > READ_TOKEN_FLOOR && !garbled.read);
  assert.ok(composed.signals.tokens < READ_TOKEN_FLOOR && composed.read);
  assert.ok(relative.signals.tokens > READ_TOKEN_FLOOR && !relative.read);
  assert.deepEqual(
    [garbled.reason, composed.reason, relative.reason],
    ["garbled-text-layer", "short-composed-page", "thin-for-this-document"],
  );
});

// ── The shape of the answer ──────────────────────────────────────────────────

test("every page comes back with its index, its score and the evidence", () => {
  const decisions = scorePagesRead(["", "word ".repeat(200).trim()]);
  assert.deepEqual(
    decisions.map((decision) => decision.index),
    [0, 1],
  );
  assert.ok(decisions.every((decision) => decision.score >= 0 && decision.score <= 1));
  assert.ok(decisions.every((decision) => decision.signals.tokens >= 0));
  assert.equal(decisions[1]?.signals.lines, 1);
});

test("the bar is adjustable and the signals are not", () => {
  const page = ["Breastfeeding Considerations: Enoxaparin LexiDrug"];
  assert.equal(scorePagesRead(page)[0]?.read, false);
  assert.equal(scorePagesRead(page, { readScore: 0.2 })[0]?.read, true);
  assert.equal(scorePagesRead(page)[0]?.signals.tokens, scorePagesRead(page, { readScore: 0.2 })[0]?.signals.tokens);
});

test("scoring is deterministic and does not touch its input", () => {
  const pages = Object.freeze(["", "word ".repeat(80).trim(), "Part Two\nRemedies\nSections 40 to 72"]);
  assert.deepEqual(scorePagesRead(pages), scorePagesRead(pages));
  assert.deepEqual(pages, ["", "word ".repeat(80).trim(), "Part Two\nRemedies\nSections 40 to 72"]);
});

test("an empty document scores nothing rather than failing", () => {
  assert.deepEqual(scorePagesRead([]), []);
});

test("the scorer names its own build, so a stored decision can be read against it", () => {
  assert.match(PAGE_READ_SCORER_VERSION, /^page-read-\d+$/);
});

// A surrogate pair is ONE character. Counting UTF-16 units would score an
// extension-B ideograph as two Latin-ish characters and understate its tokens —
// the same hazard the shared token estimate documents.
test("an extension-B ideograph counts once, not twice", () => {
  const decision = one("\u{20000}\u{20001}\u{20002}");
  assert.equal(decision.signals.chars, 3);
});
