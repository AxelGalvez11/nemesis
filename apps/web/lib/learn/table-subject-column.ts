// Which column a grid is ABOUT — the one question that turns an n-column table into knowledge.
//
// 🔴 THIS IS THE RULE THE TWO-COLUMN LANE REFUSED TO GUESS, AND ITS REASONING STILL STANDS. From
// `knowledge-extraction.ts`: *"a three-column schedule — date, topic, room — would yield '8-17 ↔
// Exam 1', which is a calendar entry wearing an association's clothes, and a student would then be
// drilled on it. When a wider grid genuinely holds pairs, the right answer is a rule that can say
// WHICH two columns and why, not a default to the first two."*
//
// This file is that rule. It does not relax the refusal — it narrows it to the grids that genuinely
// cannot be read, and leaves everything else refused with a reason.
//
// 🔴 STRUCTURAL AND TYPOGRAPHIC SIGNALS ONLY, NEVER SUBJECT MATTER. Nothing here knows what a drug,
// a statute or an alloy is. The same rules decide `Drug | Class | Indication`, `Case | Holding |
// Jurisdiction` and `Material | Yield strength | Density`, because all three share one shape: a
// column of distinct things, and other columns stating something about each of them.
//
// 🔴 AND THE SCHEDULE CASE IS DEFEATED TYPOGRAPHICALLY, NOT SEMANTICALLY. `Date | Topic | Room` has
// the SAME shape as `Drug | Class | Indication` — a unique first column, repeating others — so
// uniqueness alone cannot tell them apart. What separates them is that a date is written like an
// index: digits and separators. "Is this column written as numbers or dates?" is a question about
// characters, and it generalises; "is this column a calendar?" is a question about meaning, and it
// does not.

/** A cell longer than this is a paragraph. Mirrors `MAX_CELL_CHARS` in the extraction lane. */
const MAX_SUBJECT_CHARS = 200;

/**
 * A value written as an index rather than as a thing.
 *
 * 🔴 FORM, NOT MEANING. Pure numbers, dates in any common order, ordinals, and numbered labels
 * like `1.` or `#3`. A row number, a date and a question number are all indexes into a document —
 * they identify WHERE something sits, not WHAT it is, and an association built on one teaches a
 * learner the layout of a page.
 *
 * 🔴 IT MUST NOT SWALLOW REAL SUBJECTS THAT MERELY CONTAIN DIGITS. `CYP2D6`, `Article 5`,
 * `Boeing 747` and `1,3-butadiene` are things, not indexes, so the test is anchored: the WHOLE
 * value has to be index-shaped, never merely start with a digit.
 */
export function isIndexShaped(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  return (
    // 12 · 12.5 · 1,200 · -3
    /^-?\d+(?:[.,]\d+)*$/.test(text) ||
    // 8-17 · 2026-08-14 · 14/08/2026 · 8.17.26
    /^\d{1,4}[-/.]\d{1,2}(?:[-/.]\d{1,4})?$/.test(text) ||
    // 1. · 2) · #3 · (4)
    /^[#(]?\d+[.):]?$/.test(text)
  );
}

/** One short word carrying a number and nothing else — `Week 3`, `Exam 1`, `Q1`, `Lecture 12`. */
const WORD_THEN_NUMBER = /^[A-Za-z]{1,10}\s?\d{1,3}$/;

/**
 * A whole COLUMN written as an enumeration, even though no single value looks like a number.
 *
 * 🔴 THIS HAD TO MOVE UP FROM THE VALUE TO THE COLUMN, AND A FAILING TEST IS WHY. `Week 3` and
 * `Boeing 747` are the same string shape — a short word and a number — so no value-level rule can
 * separate them, and the first version of this file destroyed `Boeing 747`, `Article 5` and
 * `Type 2 diabetes` trying to catch `Week 3`.
 *
 * A column is different. `Week 1 · Week 2 · Week 3` is an enumeration *because every value in the
 * column is built that way*; `Boeing 747 · Cessna 172 · Airbus 320` is a list of things that happen
 * to carry model numbers — and, being the same form, it is refused too.
 *
 * 🔴 THAT FALSE REFUSAL IS ACCEPTED ON PURPOSE. A column of aircraft models or `Mark 3`-style
 * product names will be read as an enumeration and produce nothing. The codebase's standing trade
 * applies: *refusing costs a missed glossary; guessing costs a false one*, and a false one is drilled
 * into a learner.
 */
function isEnumeratedColumn(values: readonly string[]): boolean {
  return values.length > 0 && values.every((value) => WORD_THEN_NUMBER.test(value.trim()));
}

export interface SubjectColumn {
  /** Zero-based index into each row. */
  index: number;
  /** How many data rows carry a usable value there. */
  populated: number;
}

/**
 * The column whose values name what each row is about, or `null` when nothing defensibly does.
 *
 * 🔴 `null` IS THE COMMON, CORRECT ANSWER FOR A MATRIX AND IT MUST STAY CHEAP TO RETURN. A grid of
 * numbers with row and column labels, a scoring rubric, a timetable — none has a subject column,
 * and inventing one produces exactly the confident nonsense the extraction lane exists to refuse.
 *
 * The signals, all structural:
 *
 *   1. **Distinct values.** A subject column names a different thing on every row. A column that
 *      repeats is stating a property shared by several rows, which makes it an object, not a
 *      subject.
 *   2. **Populated.** Nearly every row has one. A column that is mostly blank is a spacer or an
 *      occasional annotation.
 *   3. **Not index-shaped.** See above — this is what separates a schedule from a subject.
 *   4. **Leftmost wins.** When more than one column qualifies, position breaks the tie. This is a
 *      convention rather than a truth, and it is the weakest signal here, which is why it is only
 *      ever a tiebreak between columns that already passed 1–3.
 */
export function subjectColumnOf(
  dataRows: readonly (readonly string[])[],
  width: number,
): SubjectColumn | null {
  if (width < 2 || dataRows.length === 0) return null;

  // A single data row cannot demonstrate that anything is distinct — with one row EVERY column is
  // trivially unique, so the strongest signal is unavailable and the leftmost column would win by
  // default. Refusing is the honest answer; one row is not a pattern.
  if (dataRows.length < 2) return null;

  // 🔴🔴 AN INDEX-KEYED TABLE HAS NO SUBJECT AT ALL, AND THIS IS A RULE ABOUT THE TABLE RATHER THAN
  // ABOUT ANY ONE COLUMN. Skipping the index column and reading on is not enough: in
  // `Week 1 | Foundations | Room 214` the second column is distinct, ordinary text, and utterly
  // indistinguishable from a real subject — so a per-column rule hands back `Foundations`, and the
  // learner is drilled on which week covered which topic.
  //
  // When an author keys rows by a date or a counter, they are presenting a SEQUENCE — a schedule,
  // an agenda, a numbered list — and what the columns state is where something sits, not what it is.
  //
  // 🔴 THE COST IS REAL AND IS ACCEPTED: a numbered glossary (`# | Term | Definition`) is refused
  // along with the timetable, because nothing structural separates them. Both are one lane's
  // refusal, recorded with a reason, and neither is a false claim about a learner.
  const leading = dataRows.map((row) => (row[0] ?? "").trim()).filter(Boolean);
  if (leading.length > 0 && (leading.every((value) => isIndexShaped(value)) || isEnumeratedColumn(leading))) {
    return null;
  }

  for (let column = 0; column < width; column += 1) {
    const values = dataRows.map((row) => (row[column] ?? "").trim());
    const usable = values.filter((value) => value.length > 0 && value.length <= MAX_SUBJECT_CHARS);
    // Mostly-blank columns are not subjects. Two thirds is deliberately loose: real tables carry
    // the occasional gap, and a stricter bar would reject good grids to avoid a rare bad one.
    if (usable.length < Math.ceil(dataRows.length * 0.67)) continue;

    const distinct = new Set(usable.map((value) => value.toLowerCase()));
    if (distinct.size !== usable.length) continue;

    // 🔴 EVERY populated value has to be a thing, not merely most of them. A column of dates with
    // one stray word in it is still a date column, and the stray word is not a subject.
    if (usable.every((value) => isIndexShaped(value))) continue;
    if (isEnumeratedColumn(usable)) continue;

    return { index: column, populated: usable.length };
  }

  return null;
}
