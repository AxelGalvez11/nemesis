// Which teaching period a course belongs to.
//
// PURE. Text in, a label out. No DOM, no portal knowledge beyond the shapes
// below, and no opinion about what any of it means.
//
// WHY THIS EXISTS. A student who has been at one school for three years has
// every course they have ever taken sitting in the portal's list. Measured on a
// real account: 31 course entries across two pages, a mix of open, closed and
// future-locked. Importing all of them buries this semester's four courses
// under twenty-seven dead ones. The picker needs to group by period, so the
// obvious first move — "just this term" — is one click.
//
// 🔴 READ BY POSITION, NEVER BY WORD LIST. The tempting implementation is a
// list of season names: spring, fall, autumn, winter, summer. That breaks the
// moment a portal is in Spanish, French or Portuguese, and it is the same
// mistake as a subject keyword list — see the note at the top of ultra.ts,
// where matching the English word "Folder" would have broken every non-English
// installation.
//
// What IS universal is the YEAR. Every academic calendar on earth numbers its
// years with the same four digits, and a portal that names a period virtually
// always writes the period's own word directly beside the year:
//
//     "Spring 2026: Integrated Pharmacotherapy 3"   → Spring 2026
//     "2026 Otoño — Derecho Constitucional"         → 2026 Otoño
//     "Automne 2026 - Chimie"                       → Automne 2026
//
// So: find the year, take the word touching it, and keep both — WITHOUT ever
// knowing what the word means. A label we cannot read is still a label we can
// group by, which is the entire job.

/** How long a term label may be before it has stopped being one. A period name
 *  plus a year is short in every language; anything longer is a sentence that
 *  happens to contain a year. */
export const MAX_TERM_CHARS = 40;

/**
 * Years we are willing to believe. PURE.
 *
 * 🔴 THE CEILING IS 2099 BECAUSE COURSE NUMBERS LIVE AT 21xx. This started as
 * `20\d{2}|21\d{2}`, reaching into the 2100s so nothing would need revisiting.
 * A unit test killed it: "PSYC 2100 Cognition" came back as the term "PSYC
 * 2100". Four-digit course numbers in the 1000–2999 range are the commonest
 * numbering scheme there is, so every extra century of headroom collides with
 * thousands of real course titles.
 *
 * The collision is not eliminated — "MATH 2026" is a possible course number
 * and would read as a term. It is reduced to the one century where a false
 * positive is at least plausibly right, and a wrong grouping is visible and
 * fixable in the picker, where a wrong DATE would not be.
 */
const YEAR = /\b(19[89]\d|20\d{2})\b/;

/**
 * A word sitting immediately beside a year, if there is one.
 *
 * "Word" here means a run of letters — Unicode letters, so "Otoño", "Frühling"
 * and "Automne" all qualify. Digits are excluded on purpose: in
 * "PHCY1216_24951_202620" the thing beside the year is more digits, and
 * "24951 2026" is not a term name.
 *
 * Checked on BOTH sides because word order is not universal: English writes
 * "Spring 2026", and plenty of portals write "2026 Spring".
 */
// 🔴 ONE LETTER IS A WHOLE WORD in Chinese, Japanese and Korean: a portal
// writing "2026 秋" names its term in a single character. The minimum was 2
// characters until a test caught it, which would have quietly dropped the term
// for every CJK installation while looking perfectly correct in English.
const BEFORE = /([\p{L}][\p{L}.'-]{0,19})\s*[,:—–-]?\s*$/u;
const AFTER = /^\s*[,:—–-]?\s*([\p{L}][\p{L}.'-]{0,19})/u;

/**
 * The term a piece of text names, or null. PURE.
 *
 * Returns the year on its own when nothing readable sits beside it, which is
 * the honest answer for "BIOL 204 2026" — the student still gets a usable
 * grouping, just a coarser one.
 */
export function termFromText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const match = YEAR.exec(text);
  if (!match || match.index === undefined) return null;
  const year = match[1] as string;

  const left = text.slice(0, match.index);
  const right = text.slice(match.index + year.length);

  // BEFORE wins ties: "Spring 2026: Integrated Pharmacotherapy" has a word on
  // both sides, and only one of them is the term.
  const before = BEFORE.exec(left)?.[1];
  if (before) return `${before} ${year}`.slice(0, MAX_TERM_CHARS);
  const after = AFTER.exec(right)?.[1];
  if (after) return `${year} ${after}`.slice(0, MAX_TERM_CHARS);
  return year;
}

/**
 * The term a registrar's code encodes, or null. PURE.
 *
 * Measured on a real Blackboard account: course codes read
 * `PHCY1216_24951_202620` and `PHCY2112_44997_202640`. The trailing group is a
 * year followed by a two-digit period number — 202620 and 202640 are two
 * different terms of 2026, and courses in the same one share the whole token.
 *
 * 🔴 THE PERIOD NUMBER IS NOT DECODED, ONLY KEPT DISTINCT. Whether "20" means
 * spring, autumn or the second block is an institution's private convention;
 * two schools using the same digits for different seasons is entirely normal.
 * Naming it would be a guess printed as a fact. Grouping by it is correct
 * regardless, so the label stays the bare year and the code carries the split.
 */
export function termFromCode(raw: unknown): { year: string; period?: string } | null {
  if (typeof raw !== "string") return null;
  // 🔴 THE LAST RUN OF DIGITS, NOT THE FIRST MATCH. Scanning left to right for
  // a year found "2112" inside the subject code of "PHCY2112_44997_202640" and
  // reported the year 2112 — the term token is at the END, and a course code
  // is full of digits that are not years. Caught by a unit test.
  const runs = raw.trim().match(/\d+/g);
  const last = runs?.[runs.length - 1];
  if (!last) return null;
  const match = /^(19[89]\d|20\d{2})(\d{2})?$/.exec(last);
  if (!match) return null;
  const year = match[1] as string;
  const period = match[2];
  return period ? { period, year } : { year };
}

/**
 * The best term label for one course. PURE.
 *
 * The visible NAME is preferred over the code, because the name is what the
 * institution chose to show the student and the picker has to read back to
 * them. "Spring 2026" is a heading a student recognises; "202620" is not.
 *
 * Returns null when neither says anything, and null is a real answer: those
 * courses group under their own heading rather than being guessed into a term
 * they may not belong to.
 */
export function courseTerm(course: { name?: string; code?: string }): string | null {
  return termFromText(course.name) ?? (termFromCode(course.code)?.year ?? null);
}

/**
 * Order terms newest first. PURE.
 *
 * Sorted on the YEAR inside the label rather than alphabetically, so "Fall
 * 2026" lands above "Spring 2025" instead of under it. Same-year labels fall
 * back to text order, which is arbitrary but stable — the alternative is
 * decoding season names, which is exactly what this module refuses to do.
 *
 * Labels with no year sort last, which is where "No term" belongs.
 */
export function compareTerms(a: string, b: string): number {
  const yearOf = (label: string) => Number(YEAR.exec(label)?.[1] ?? 0);
  const byYear = yearOf(b) - yearOf(a);
  return byYear !== 0 ? byYear : a.localeCompare(b);
}

/**
 * Group course names by term, newest first. PURE.
 *
 * `null` collects everything with no readable term, under the caller's own
 * heading — this module does not name it, because that is a UI string.
 */
export function groupByTerm<T extends { name?: string; code?: string }>(
  courses: readonly T[],
): Array<{ term: string | null; courses: T[] }> {
  const buckets = new Map<string | null, T[]>();
  for (const course of courses) {
    const term = courseTerm(course);
    const bucket = buckets.get(term);
    if (bucket) bucket.push(course);
    else buckets.set(term, [course]);
  }
  return [...buckets.entries()]
    .map(([term, list]) => ({ courses: list, term }))
    .sort((a, b) => {
      // No-term always last, whichever side it is on.
      if (a.term === null) return 1;
      if (b.term === null) return -1;
      return compareTerms(a.term, b.term);
    });
}
