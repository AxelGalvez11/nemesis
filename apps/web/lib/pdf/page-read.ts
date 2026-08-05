// Did this page actually get read, or is its content still sitting in a picture?
//
// WHY THIS IS NOT A CHARACTER COUNT ANY MORE. The first version of this rule was a
// floor of 120 characters, measured on the owner's real course — 83 PDFs of English
// lecture material. It is the right decision for that corpus and the wrong decision
// for the same page in another script. A Chinese page says in 120 characters what
// English needs about 400 for, so page after page of real content came in under the
// floor and was sent to be re-read from its pixels: slower, more expensive, and a
// machine transcription substituted for words the document already had. Scripts
// that run longer than English fail the other way — the page clears the floor on
// character count alone while saying almost nothing.
//
// So the unit is TOKENS, not characters, via the script-aware estimate in
// packages/shared/src/doc-chunk.ts. That estimate prices CJK codepoints at roughly
// one token each and Latin-ish text at four characters each, which is the whole
// difference above. 120 English characters is ~30 tokens, so a floor of 30 tokens
// is the SAME decision this corpus was measured for, expressed in a unit that
// survives translation.
//
// AND IT IS NOT A SINGLE THRESHOLD. A floor of any kind cannot tell a title page
// from a heading stranded above a screenshot, and it cannot tell readable text from
// a broken font map that yields four hundred characters of rubbish. So the answer
// is a score built from several measured signals — how much text there is in
// script-aware tokens, how the page's lines are laid out, whether its glyphs carry
// any information at all, and how the page compares with the rest of its own
// document — plus a machine-readable reason saying which signal decided it. The
// reason is what makes a routing decision auditable months later: "page 7 went to
// vision" is not reviewable, "page 7 went to vision because its text layer was
// garbled" is.
//
// 🔴 NOTHING HERE ASKS WHAT THE DOCUMENT IS. Every signal is structural — counts,
// ratios, codepoint categories, distribution. A lease, a machine drawing, a resume,
// a scanned form and a lecture deck take exactly the same route, and no rule below
// would read strangely for any of them. There is no word list, in any language.
//
// 🔴 WHAT IS NOT MEASURABLE HERE, AND SO IS NOT USED. Image dominance (how much of
// the page is picture) and text coverage of the page area are the signals a human
// would reach for first, and this layer cannot see either: unpdf's extractText
// keeps each text item's characters and line breaks and DISCARDS its position, so
// the per-page strings this module consumes contain no geometry whatsoever — the
// same measurement lib/pdf/pdf-parse.ts records for its absent boxes. Guessing an
// image ratio would be an invented measurement, which is worse than an absent one
// because a consumer cannot tell the difference. A future pass that reads
// page.getTextContent() geometry and the page resource dictionary could add both;
// until it exists, the document-relative signal below is the measurable half of
// "how much of this page came back", and it is computed from pages, not pixels.
//
// WHERE THIS RULE IS WEAKEST, said plainly so nobody reads the tests as a promise:
//
//   * The token estimate prices Arabic, Thai, Devanagari and Cyrillic at the Latin
//     rate, which packages/shared admits and this module cannot fix from here.
//     Those scripts pack more meaning into a character than English does, so a page
//     of one of them sitting near the floor is judged with less margin than the
//     same page in Chinese or English would be. It errs toward READING the page,
//     which is the safe direction, but the margin is genuinely thinner.
//   * A heading in a dense script stranded above a full-page figure can now clear
//     the floor on its own — thirty-five characters of Chinese is thirty-five
//     tokens — where the old character rule would have caught it. That is the exact
//     trade this change asks for, taken deliberately: the alternative was condemning
//     every real Chinese page in the corpus, which is the same mistake at a hundred
//     times the volume. In a document of ordinary pages the document-relative signal
//     catches it anyway.
//   * An encoding shifted by a constant produces gibberish with the letter
//     distribution of ordinary prose. Nothing measurable in a text layer separates
//     it from a page in a language nobody here reads. It takes the pixels.

import { estimateTokens } from "@nemesis/shared";

/**
 * The build of this decision. A new value means pages may be routed differently
 * than they were, so a stored coverage report can be read against the rules that
 * actually produced it. Bump it whenever a constant or a signal below changes.
 *
 * page-read-2: the shape signals stopped counting a letter that stands alone, so a
 * page whose only letters are marks in a grid is no longer called a broken font map.
 */
export const PAGE_READ_SCORER_VERSION = "page-read-2";

/**
 * The score at or above which a page counts as read from its own text layer.
 *
 * A half. It is deliberately the midpoint of the curve below rather than a tuned
 * number, so the thing being tuned is always a signal, never the bar.
 */
export const READ_SCORE = 0.5;

/**
 * The half-way point of the text-volume curve, in script-aware tokens.
 *
 * PROVENANCE: 120 characters of English is ~30 tokens at the four-characters-per-
 * token rate packages/shared prices Latin script with, and 120 characters is what
 * the real corpus measured — section dividers ("Lactation 04") and full-page
 * screenshots under a heading ("Breastfeeding Considerations: Enoxaparin LexiDrug",
 * 49 characters) both land below it, and pages carrying their own content land well
 * above. This is that measurement, in the unit that holds across scripts.
 *
 * It is a HALF-WAY point, not a cliff: a page at exactly 30 tokens scores 0.5 and
 * every other signal can still move it either way. That is the difference between a
 * scored decision and a threshold wearing a costume.
 */
export const READ_TOKEN_FLOOR = 30;

/**
 * Lines at which a short page reads as a composed whole rather than a fragment.
 *
 * A title page, a part divider or a colophon is short because that is ALL the page
 * says — several separate short lines, stacked, complete in themselves. A heading
 * stranded above a full-page screenshot is short because the rest of the page is a
 * picture, and it arrives as one orphan line. Line count is the one structural
 * difference between them that survives having no geometry, and unpdf does report
 * line breaks (it keeps each item's own hasEOL marker), so this is measured.
 *
 * 🔴 THIS IS A DELIBERATE, NARROW REVERSAL of the corpus note in lib/pdf/pages.ts,
 * which sends one-line dividers to be read on the grounds that reading one costs a
 * fraction of a cent and returns its own title. That still holds for ORPHAN lines,
 * and they are still sent: from text alone, a single line above a full-page
 * screenshot is indistinguishable from a single-line divider, and mistaking the
 * screenshot is by far the more expensive error. What changes is that a page with
 * several composed lines is no longer sent to be re-read merely for being short.
 */
export const COMPOSED_LINES = 4;

/** A composed page still has to say something. Four lines of one character each
 *  ("1 / 2 / 3 / 4") is a strip of page furniture, not a title page, and it must
 *  not earn the credit below by shape alone. */
export const COMPOSED_MIN_TOKENS = 5;

/**
 * How much of the remaining doubt a fully composed page recovers.
 *
 * Applied to the GAP between the page's volume score and certainty, not added flat:
 * a page with almost no text cannot be rescued into a confident read by its line
 * count alone, and a page already close to the floor needs very little help. Sixty
 * per cent is what carries a three-line divider (~7 tokens) over the bar while
 * leaving a two-line heading over a screenshot (~13 tokens) below it.
 */
export const COMPOSITION_RESCUE = 0.6;

/**
 * Codepoints that never occur in healthy extracted text, as a share of non-space
 * characters, at which a page is certainly damaged.
 *
 * These are DISPOSITIVE — they scale the whole score toward zero rather than
 * nudging it — because their false-positive rate is as close to nil as a signal
 * gets. The replacement character means a decoder already gave up, and private-use
 * codepoints mean a font's character map points into a range Unicode assigns no
 * meaning: the page looks read, has plausible length, and says nothing. One
 * character in ten is far past any plausible accident.
 */
export const DAMAGED_RATIO_FULL = 0.1;

/**
 * Letters needed before the SHAPE of the glyph distribution says anything.
 *
 * A twelve-character divider has a tiny alphabet for entirely innocent reasons.
 * Below this many letters the entropy and dominance signals are switched off
 * completely rather than run on a sample too small to mean anything.
 */
export const SHAPE_MIN_LETTERS = 60;

/**
 * Letters a run has to hold before its letters join the shape sample.
 *
 * 🔴 A LETTER STANDING ALONE BETWEEN SPACES IS A MARK, NOT A WORD, and without
 * this the shape signals condemn an ordinary page. A fitment matrix, a
 * clause-applicability grid and an interaction chart are all a row of labels and
 * a field of "X": every letter on the page is the same letter, dominance reads
 * 1.0, and the page is called a broken font map. The identical grid drawn with
 * "✓" sails through, because a check mark is not a letter — so the verdict turned
 * on which glyph the producer happened to pick for a tick, which is typography,
 * not a measurement of whether the page was read. Marks stand alone; writing does
 * not, in any script.
 *
 * WHAT THIS GIVES UP, stated because it is the one thing the change loosens: a
 * broken font map that emitted its single glyph in isolation — "ﬁ ﬁ ﬁ ﬁ" — now
 * has an empty sample and is judged on volume alone. It is the unlikely flavour:
 * unpdf joins text items with no separator at all, so every space on the page is
 * a space the PDF itself drew, and a character map broken badly enough to collapse
 * the alphabet has collapsed the space glyph with it — which produces one long run,
 * the flavour that is still caught.
 */
export const WORD_MIN_LETTERS = 2;

/**
 * Bits of entropy per letter: healthy above, degenerate below.
 *
 * 🔴 MEASURED OVER THE LETTERS OF WORDS ONLY — never over digits or punctuation,
 * and never over a letter standing alone — and that is the whole reason this signal
 * is safe. A sparse numeric table ("0 0 0 1 0 0 …"), a table of contents built from
 * dot leaders and a page of dimension callouts all have tiny alphabets and are all
 * perfectly well read; they are also nearly all digits and punctuation, so they
 * never reach this test. A grid of "X" marks is the same page with a letter for its
 * mark, and WORD_MIN_LETTERS is what keeps it out. Letters inside words are what a
 * broken font map corrupts.
 *
 * The healthy bar is deliberately far below any real prose. Natural language in
 * every script measured sits above 2.5 bits (the least informative sequence in
 * these tests, "word word word" repeated, is 2.0), so 1.2 condemns only an alphabet
 * of two or three distinct letters — and even that is a nudge, not a verdict, until
 * dominance agrees. The gap exists because legitimate pages do sit low: a form
 * whose cells all read "N/A" measures exactly 1.0, and it is a page that was read.
 */
export const HEALTHY_LETTER_ENTROPY = 1.2;
export const DEGENERATE_LETTER_ENTROPY = 0.4;

/**
 * Share of the letters taken by the single commonest one: healthy below,
 * degenerate above.
 *
 * The companion to entropy, and it catches the flavour entropy is weakest on — one
 * glyph repeated over and over, which is what a font map that resolves everything
 * to the same fallback produces. Natural language sits far below a half in every
 * script measured (English "e" is about 12 per cent of letters; a Chinese page's
 * commonest character is lower still), and so does a page of repeated short cells,
 * which is why the bar is at a half rather than at the tightest value prose allows.
 */
export const HEALTHY_LETTER_DOMINANCE = 0.5;
export const DEGENERATE_LETTER_DOMINANCE = 0.85;

/**
 * How many plainly-read pages a document needs before it can be compared with
 * itself, and how dense they must be.
 *
 * Below these, the document-relative signal is off entirely. A three-page handout
 * has no meaningful "typical page", and a document whose own pages are all sparse
 * (a photo book with captions, a deck of one-line slides) must not manufacture a
 * penalty for being what it is.
 */
export const DOC_REFERENCE_MIN_PAGES = 5;
export const DOC_REFERENCE_MIN_TOKENS = 90;

/** Fractions of the document's typical page: at or above the first, nothing is
 *  odd; at or below the second, this page plainly did not come back the way its
 *  neighbours did. */
export const DOC_RELATIVE_OK = 0.2;
export const DOC_RELATIVE_LOST = 0.05;

/**
 * The most the document-relative signal can take off a page's score.
 *
 * Small on purpose. It exists to catch the page that clears the absolute floor and
 * is still plainly a hole — thirty-five tokens in a textbook whose pages run six
 * hundred — and it must never be able to condemn a page on its own, because a
 * document is allowed to have a short page.
 */
export const DOC_RELATIVE_PENALTY = 0.2;

/** Why a page was judged the way it was. Machine-readable on purpose: this travels
 *  into the coverage report, and a routing decision that can only be explained in
 *  prose cannot be audited in aggregate. */
export type PageReadReason =
  /** Nothing at all came back for this page. */
  | "no-text-layer"
  /** Some text, far below what a page of this document carries — the heading above
   *  a screenshot. */
  | "thin-text-layer"
  /** Enough text by volume, but its glyphs carry no information: a broken font map
   *  yields plausible length and unusable characters. */
  | "garbled-text-layer"
  /** Clears the absolute floor, yet is a fraction of what this document's own pages
   *  return. */
  | "thin-for-this-document"
  /** Short, and composed rather than orphaned — a title page or a divider, read. */
  | "short-composed-page"
  /** An ordinary page that carried its own words. */
  | "text-layer";

/** Everything the decision was made from, kept so a score can be re-explained
 *  without re-deriving it. All measured; none inferred. */
export interface PageReadSignals {
  /** Codepoints after layout whitespace is collapsed — not UTF-16 units, so a
   *  surrogate pair counts once. */
  chars: number;
  /** Script-aware token estimate — the volume signal, and the multilingual fix. */
  tokens: number;
  /** Non-empty lines the text layer reported. */
  lines: number;
  /** Letters (Unicode category L) that sit in a run of WORD_MIN_LETTERS or more of
   *  them — the sample the shape signals run on. Marks standing alone are excluded,
   *  so this is smaller than the page's letter count and deliberately so. */
  letters: number;
  /** Bits of entropy per letter, or 0 when there were too few letters to ask. */
  letterEntropy: number;
  /** Share of letters taken by the commonest one, or 0 when too few to ask. */
  letterDominance: number;
  /** Share of non-space characters that are replacement or private-use codepoints. */
  damagedRatio: number;
  /** This page's tokens as a fraction of the document's typical page, or null when
   *  the document had too few readable pages to have one. */
  documentRatio: number | null;
}

/** One page's decision, with the evidence and the reason attached. */
export interface PageReadDecision {
  /** 0-based page index, carried so a decision survives being filtered or sorted. */
  index: number;
  read: boolean;
  /** 0–1, rounded to three places. Rounded BEFORE `read` is decided, so a stored
   *  score and the routing it explains can never disagree at the boundary. */
  score: number;
  reason: PageReadReason;
  signals: PageReadSignals;
}

/** Knobs. Only the bar is adjustable; every signal is a measurement, not a
 *  preference. */
export interface PageReadOptions {
  /** The score at or above which a page counts as read. Defaults to READ_SCORE. */
  readScore?: number;
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** A linear ramp between two named points, clamped, and safe when they coincide. */
function ramp(value: number, zeroAt: number, oneAt: number): number {
  if (zeroAt === oneAt) return value >= oneAt ? 1 : 0;
  return clamp01((value - zeroAt) / (oneAt - zeroAt));
}

/** Codepoints that mean the extraction failed rather than that the page said
 *  something unusual: the replacement character, and the three private-use ranges a
 *  broken font map lands in. */
function isDamagedCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0xfffd ||
    (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
    (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
    (codePoint >= 0x100000 && codePoint <= 0x10fffd)
  );
}

const LETTER = /\p{L}/u;

/**
 * Count what the page is made of.
 *
 * 🔴 ITERATES CODEPOINTS, NOT `.length`. A surrogate pair is one character and must
 * be counted once — the same hazard packages/shared documents for its token
 * estimate. Every ratio here would be wrong for extension-B ideographs otherwise.
 * PURE.
 */
function measurePage(text: string): Omit<PageReadSignals, "documentRatio"> {
  const flat = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;

  let chars = 0;
  let nonSpace = 0;
  let damaged = 0;
  for (const ch of flat) {
    chars++;
    if (ch === " ") continue;
    nonSpace++;
    if (isDamagedCodePoint(ch.codePointAt(0) ?? 0)) damaged++;
  }

  // The shape sample, gathered one whitespace-delimited run at a time so that a
  // lone letter can be left out of it — see WORD_MIN_LETTERS for why a mark must
  // not be counted as writing. `flat` has already collapsed every run of layout
  // whitespace to one space, so splitting on it is splitting on what the page drew.
  let letters = 0;
  const letterCounts = new Map<string, number>();
  for (const run of flat ? flat.split(" ") : []) {
    const own: string[] = [];
    for (const ch of run) {
      if (LETTER.test(ch)) own.push(ch);
    }
    if (own.length < WORD_MIN_LETTERS) continue;
    letters += own.length;
    for (const ch of own) letterCounts.set(ch, (letterCounts.get(ch) ?? 0) + 1);
  }

  let entropy = 0;
  let dominance = 0;
  if (letters >= SHAPE_MIN_LETTERS) {
    let top = 0;
    for (const count of letterCounts.values()) {
      const share = count / letters;
      entropy -= share * Math.log2(share);
      if (count > top) top = count;
    }
    dominance = top / letters;
  }

  return {
    chars,
    tokens: flat ? estimateTokens(flat) : 0,
    lines,
    letters,
    letterEntropy: entropy,
    letterDominance: dominance,
    damagedRatio: nonSpace > 0 ? damaged / nonSpace : 0,
  };
}

/**
 * The document's typical page, in tokens — the median of the pages that plainly
 * read, not of every page.
 *
 * Taking the median over ALL pages is what makes this signal useless: in a scan
 * where half the pages came back empty, the median is zero and every page looks
 * normal beside it. The reference has to be built from the pages that are not in
 * question. Returns null whenever the document is too small or too sparse to have
 * an opinion, and null switches the signal off rather than defaulting it. PURE.
 */
function referenceTokens(pages: readonly { tokens: number }[]): number | null {
  const readable = pages
    .map((page) => page.tokens)
    .filter((tokens) => tokens >= READ_TOKEN_FLOOR)
    .sort((a, b) => a - b);
  if (readable.length < DOC_REFERENCE_MIN_PAGES) return null;
  const middle = readable.length >> 1;
  const median =
    readable.length % 2 === 1
      ? (readable[middle] ?? 0)
      : ((readable[middle - 1] ?? 0) + (readable[middle] ?? 0)) / 2;
  return median >= DOC_REFERENCE_MIN_TOKENS ? median : null;
}

/**
 * Score every page of one document, in page order.
 *
 * DOCUMENT-LEVEL ON PURPOSE, and there is no per-page entry point beside it: one
 * of the signals compares a page with the rest of its document, so scoring a SLICE
 * would silently give a different answer for the same page. Making that
 * unrepresentable is cheaper than documenting it.
 *
 * The arithmetic, in order:
 *   volume    — tokens on a saturating curve whose half-way point is the floor.
 *               No cliff: 13 tokens scores 0.30, 30 scores 0.50, 120 scores 0.80.
 *   composed  — a short page that is several stacked lines recovers part of the
 *               gap to certainty, so a title page is not re-read for being short.
 *   relative  — a page far below its own document's typical page loses a little,
 *               and a composed page is exempt: a fragment is judged against its
 *               neighbours, a composition is judged on its own.
 *   degraded  — glyph entropy and single-glyph dominance scale the result down.
 *               Scaling rather than subtracting is what lets a LONG page of rubbish
 *               fail; a capped subtraction could never move a page with hundreds of
 *               tokens, which is exactly the page a broken font map produces.
 *   damaged   — replacement and private-use codepoints scale it to nothing.
 *
 * PURE: same pages in, same decisions out, every time.
 */
export function scorePagesRead(
  perPageText: readonly string[],
  options: PageReadOptions = {},
): PageReadDecision[] {
  const bar = options.readScore ?? READ_SCORE;
  const measured = perPageText.map((text) => measurePage(text));
  const reference = referenceTokens(measured);

  return measured.map((signals, index) => {
    const volume = signals.tokens / (signals.tokens + READ_TOKEN_FLOOR);
    const composed =
      signals.tokens >= COMPOSED_MIN_TOKENS
        ? ramp(signals.lines, 1, COMPOSED_LINES) * COMPOSITION_RESCUE
        : 0;
    const withComposition = volume + (1 - volume) * composed;

    const documentRatio = reference === null ? null : signals.tokens / reference;
    const shortfall =
      documentRatio === null ? 0 : ramp(documentRatio, DOC_RELATIVE_OK, DOC_RELATIVE_LOST);
    const relative = withComposition - DOC_RELATIVE_PENALTY * shortfall * (1 - composed);

    const degraded =
      signals.letters >= SHAPE_MIN_LETTERS
        ? Math.max(
            ramp(signals.letterEntropy, HEALTHY_LETTER_ENTROPY, DEGENERATE_LETTER_ENTROPY),
            ramp(signals.letterDominance, HEALTHY_LETTER_DOMINANCE, DEGENERATE_LETTER_DOMINANCE),
          )
        : 0;
    const damage = ramp(signals.damagedRatio, 0, DAMAGED_RATIO_FULL);

    const score = Math.round(clamp01(relative * (1 - degraded) * (1 - damage)) * 1000) / 1000;
    const read = signals.tokens > 0 && score >= bar;

    return {
      index,
      read,
      score,
      reason: reasonFor({ signals, read, volume, withComposition, bar, shortfall, degraded, damage }),
      signals: { ...signals, documentRatio },
    };
  });
}

/**
 * Which signal decided it — the cheapest true statement about this page.
 *
 * "Would have read on its own text volume" is the pivot: when a page had the words
 * and still failed, something took them away, and naming which one is the whole
 * point of the reason. When it never had the words, the volume is the reason and
 * anything else would overstate what was found. PURE.
 */
function reasonFor(input: {
  signals: Omit<PageReadSignals, "documentRatio">;
  read: boolean;
  volume: number;
  withComposition: number;
  bar: number;
  shortfall: number;
  degraded: number;
  damage: number;
}): PageReadReason {
  if (input.signals.tokens === 0) return "no-text-layer";
  if (input.read) return input.volume >= input.bar ? "text-layer" : "short-composed-page";
  const hadTheWords = input.withComposition >= input.bar;
  if (hadTheWords && (input.damage > 0 || input.degraded > 0)) return "garbled-text-layer";
  if (hadTheWords && input.shortfall > 0) return "thin-for-this-document";
  return "thin-text-layer";
}
