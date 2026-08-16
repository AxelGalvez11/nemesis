// A semantically dense cell becomes atomic claims — WITHOUT changing what the source claimed about.
//
// 🔴🔴 THE FAILURE THIS EXISTS TO PREVENT IS NOT "THE CELL WAS TOO LONG". It is a scope change.
// A real row of the owner's drug chart is about `Dihydropyridine CCBs` — a CLASS — and one of its
// cells lists the members of that class. Splitting naively and fanning out gives:
//
//     amlodipine  → adverse effect → peripheral edema      ← THE SOURCE NEVER SAID THIS
//     felodipine  → adverse effect → peripheral edema      ← NOR THIS
//
// The table asserted those at the class level. Nemesis may later reason that amlodipine is in that
// class, but the knowledge compiler must not silently turn a class-level assertion into a
// drug-level one. So every claim here stays attached to the ROW SUBJECT, and the only thing that
// moves it is the source explicitly saying so — see `scopedTo`.
//
// 🔴 DETERMINISTIC, AND IT SEGMENTS ONLY WHERE THE SOURCE PRINTED A MARKER. No model is asked what
// a cell means. `- peripheral edema - flushing - headache` is three items because the author typed
// three bullets, which is a typographic fact. A cell with no marker is left WHOLE — which is also
// what keeps `Reduce dose in hepatic impairment (Caution in cirrhosis patients)` one proposition
// rather than three tokens.
//
// 🔴 AND THE SUB-LABEL IS PART OF THE CLAIM, NEVER DECORATION. Measured on the real chart:
//
//     "Common: -peripheral edema -flushing  Rare, but serious: -hepatoxicity -thrombocytopenia"
//
// Dropping `Rare, but serious` files hepatotoxicity beside flushing and teaches a student that a
// rare serious harm is a common one. That is a false claim, not a lost detail.

/** One atomic claim taken from a cell. */
export interface CellSegment {
  /** The claim, in the source's own words. */
  value: string;
  /**
   * The source's own sub-heading over this item — `Rare, but serious`, `Counseling`, `Efficacy`.
   *
   * 🔴 IT REFINES THE RELATION, so it has to reach identity. Two items under different sub-labels
   * are different claims even when the column and the subject are identical.
   */
  qualifier?: string;
  /**
   * The thing the source explicitly scoped this item to, when that is NOT the row subject.
   *
   * 🔴 SET ONLY ON SOURCE EVIDENCE, NEVER ON INFERENCE. The test is structural: the sub-label's own
   * text appears as a value elsewhere in the SAME ROW, so the document itself has both named that
   * thing and then written a heading for it. Measured on the real chart, where the interactions
   * cell reads `… -Tacrolimus: … Amlodipine: -INC simva conc = NTE simva 20mg/d` — `Amlodipine`
   * being one of the members listed two cells to the left.
   *
   * Nothing here knows what a drug is. It knows the author repeated a string they had already used
   * in this row and put a colon after it.
   */
  scopedTo?: string;
}

/** A bullet the author actually typed: whitespace (or the start), a hyphen, then content.
 *
 *  🔴 ANCHORED SO IT CANNOT EAT REAL HYPHENS. `5-10mg/day`, `Adalat CC`, `CYP3A/5` and
 *  `-Nifedipine- Cardiogenic shock` all survive: the hyphen has to be preceded by space and
 *  followed by a non-space to count as a marker. */
const BULLET = /\s+[-•·]\s*(?=\S)/;

/** A short heading the author closed with a colon, at the END of a chunk — so it introduces what
 *  follows rather than qualifying what precedes it. Bounded in length because a sentence ending in
 *  a colon is not a heading. */
const TRAILING_LABEL = /^([\s\S]*?)[\s]+([A-Z][^:]{1,40}):$/;
/** The same heading when it opens the cell — `Common: -peripheral edema …`. */
const LEADING_LABEL = /^\s*([A-Z][^:]{1,40}):\s*$/;

/** Loose comparison for "did the author already use this string in this row". */
const compare = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Whether a sub-label names something the row already listed elsewhere.
 *
 * 🔴 WHOLE-WORD CONTAINMENT, AND A MINIMUM LENGTH. A two-letter label would match almost any cell
 * by accident, and an accidental match here moves a claim onto the wrong entity — the exact error
 * this module exists to prevent. When in doubt this returns false, which leaves the claim on the
 * row subject: the larger, source-backed structure.
 */
function namedElsewhereInRow(label: string, otherCells: readonly string[]): boolean {
  const needle = compare(label);
  if (needle.length < 4) return false;
  return otherCells.some((cell) => {
    const hay = compare(cell);
    if (!hay.includes(needle)) return false;
    // Guard against matching inside a longer word.
    const index = hay.indexOf(needle);
    const before = index === 0 ? " " : hay[index - 1]!;
    const after = index + needle.length >= hay.length ? " " : hay[index + needle.length]!;
    return before === " " && after === " ";
  });
}

/**
 * Break one cell into the atomic claims its author printed.
 *
 * `otherCells` are the OTHER cells of the same row, used only for the `scopedTo` evidence test.
 *
 * Returns a single whole-cell segment when the author printed no list — which is the common case
 * for prose, and is deliberately not treated as a failure.
 */
export function segmentCell(text: string, otherCells: readonly string[] = []): CellSegment[] {
  // 🔴 A LEADING MARKER IS STRIPPED BEFORE SPLITTING, and a real cell is why. `BULLET` requires
  // whitespace before the hyphen so it cannot eat `5-10mg/day` — which also means a cell that
  // OPENS with one (`- CYP3A/5 inducers: …`) keeps it, and the first claim of the list arrives
  // wearing a dash the author meant as punctuation.
  const trimmed = text.trim().replace(/^[-•·]\s*/, "");
  if (!trimmed) return [];

  const chunks = trimmed.split(BULLET);
  // No marker anywhere: one proposition, left exactly as written.
  if (chunks.length < 2) return [{ value: trimmed }];

  const segments: CellSegment[] = [];
  let qualifier: string | undefined;
  let scopedTo: string | undefined;

  const applyLabel = (label: string) => {
    if (namedElsewhereInRow(label, otherCells)) {
      // The source named a thing it had already listed, and then wrote a heading for it. From here
      // the claims are ABOUT that thing, and they carry no sub-label of their own.
      scopedTo = label.trim();
      qualifier = undefined;
    } else {
      qualifier = label.trim();
    }
  };

  // The preamble before the first bullet is either a heading (`Common:`) or stray text.
  const preamble = chunks[0] ?? "";
  const leading = LEADING_LABEL.exec(preamble);
  if (leading?.[1]) applyLabel(leading[1]);
  else if (preamble.trim()) segments.push({ value: preamble.trim() });

  for (const chunk of chunks.slice(1)) {
    const piece = chunk.trim();
    if (!piece) continue;
    // A chunk may end with the heading for the NEXT group — `…pulmonary edema Rare, but serious:`
    const trailing = TRAILING_LABEL.exec(piece);
    if (trailing?.[1]?.trim() && trailing[2]) {
      segments.push({
        value: trailing[1].trim(),
        ...(qualifier ? { qualifier } : {}),
        ...(scopedTo ? { scopedTo } : {}),
      });
      applyLabel(trailing[2]);
      continue;
    }
    segments.push({
      value: piece,
      ...(qualifier ? { qualifier } : {}),
      ...(scopedTo ? { scopedTo } : {}),
    });
  }

  return segments;
}

