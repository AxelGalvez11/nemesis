// Telling a caption from a catalogue record.
//
// 🔴🔴 1,235 OF THE SHELF'S 5,829 ROWS CARRY NO CAPTION AT ALL — THEY CARRY THE BOOK'S BLURB.
// Bulk uploads to Wikimedia Commons inherit whatever the uploader put in the description field,
// and for the OpenStax/CNX collections that is a record ABOUT THE SOURCE rather than about the
// picture. Commons knows: every one of these files sits in `Category:CNX missing caption`.
// Measured 2026-08-24, three shapes account for all of them:
//
//     "Name: Biology ID: 185cbf87-c72e-48f5-b51e-f14f21b5eabd@9.17 Language: English Summary: …"
//     "Image or illustration from the book: Chemistry Caption : Missing, please see book …"
//     "Illustration from Anatomy Physiology, Connexions Web site. http://cnx.org/content/col11496"
//
// 🔴🔴 IT IS NOT ONLY UGLY — IT IS A MATCHING HAZARD, AND THAT IS THE REAL REASON THIS EXISTS.
// The harvester makes `concepts` out of the description, so all 1,130 rows of the OpenStax Biology
// collection share ONE IDENTICAL concept string. `searchCurated` scores by word overlap, so any
// question wide enough to touch that blurb — "biology", "science", "course" — scores all 1,130
// equally and hands back whichever the sort happened to leave on top. A learner asking about
// meiosis would get an arbitrary figure from a biology textbook, presented as an answer, and a
// curated row SHADOWS the live provider that would otherwise have found the real diagram.
//
// So a row like this must not compete. Dropping it costs nothing: it was never reachable by any
// question it could have honestly answered, and the live Commons search covers those subjects
// well — verified against production for meiosis, glycolysis, the Krebs cycle and photosynthesis,
// all four of which resolve to real, correctly-named diagrams.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md). Every rule below is about the SHAPE of a
// catalogue record — stacked `Label:` pairs, a versioned identifier, an explicit admission that
// the caption is missing. None of them reads a word of biology, chemistry or law, so a French
// legal-history collection uploaded the same way is caught by the same code.
//
// PURE. No I/O, no clock, no React.

/** A UUID with a version suffix — `185cbf87-…-f14f21b5eabd@9.17`. The mark of a book record. */
const VERSIONED_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[\d.]+/i;

/**
 * The catalogue's own admission that nobody wrote a caption.
 *
 * 🔴 SPACING IS DELIBERATELY LOOSE. The uploads render as "Caption : Missing" — a space before the
 * colon — because the template was built from wiki markup rather than typed. Matching only the
 * typographically correct form would miss every real row.
 */
const MISSING_CAPTION = /caption\s*:\s*missing/i;

/** Openers that announce a record about a source rather than a description of a picture. */
const RECORD_OPENERS = [
  /^image or illustration from the book\b/i,
  /^illustration from\b[^.]*\bweb site\b/i,
  /^name:\s*\S/i,
];

/**
 * `Label: value` pairs stacked into a record — "Name: … ID: … Language: … Summary: …".
 *
 * 🔴 THREE, NOT TWO, AND THE FLOOR WAS MEASURED RATHER THAN GUESSED. Real captions do use one
 * colon ("Photosynthesis: light in, glucose out") and occasionally two. Three capitalised labels
 * in the first stretch of a string is a record; the shelf holds no genuine caption shaped that way.
 */
const RECORD_LABELS = /\b(?:Name|ID|Language|Summary|Book summary|Book ID|Title|Author|Subject|Licence|License)\s*:/g;
const MIN_RECORD_LABELS = 3;

/**
 * Is this string a catalogue record about the source rather than a description of the image?
 *
 * 🔴 EMPTY IS NOT BOILERPLATE. A row with no caption has nothing wrong with it — the caller
 * decides what an absent caption means, and reporting "" as boilerplate would make an honest
 * blank indistinguishable from a poisoned one.
 */
export function isCatalogueRecord(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (MISSING_CAPTION.test(text)) return true;
  if (VERSIONED_ID.test(text)) return true;
  if (RECORD_OPENERS.some((pattern) => pattern.test(text))) return true;
  // `matchAll` needs the /g regex reset between calls; counting from a fresh match array avoids
  // the shared-lastIndex trap entirely.
  return (text.match(RECORD_LABELS) ?? []).length >= MIN_RECORD_LABELS;
}

/**
 * The caption to show under a picture, or "" when the stored one describes a book.
 *
 * 🔴 NOTHING IS INVENTED IN ITS PLACE. A figure with no caption still shows its picture, its
 * licence and its credit; a figure captioned with a stranger's book blurb tells the learner
 * something false about what they are looking at. Absence is the honest outcome.
 */
export function readableCaption(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  return !text || isCatalogueRecord(text) ? "" : text;
}

/**
 * The concepts a row may actually be matched on.
 *
 * 🔴🔴 THIS IS THE HALF THAT PREVENTS THE WRONG PICTURE, not just the ugly one. See the header:
 * a boilerplate concept is shared verbatim by every row from the same upload, so leaving it in
 * makes a thousand rows tie on any query that brushes it.
 */
export function matchableConcepts(concepts: readonly string[]): readonly string[] {
  return concepts.filter((concept) => concept.trim().length > 0 && !isCatalogueRecord(concept));
}
