// The lane that reads the grids the pair lane refuses.
//
// `knowledge-extraction.ts` refuses every grid three columns wide with reason `table-not-pairs`,
// and its own comment says that refusal is a fact about us rather than about the document: *"a
// later lane that can say WHICH columns pair and why should extract both. What is refused here is
// guessing, not the table."* This file is that lane for one shape — the grid that sorts things
// into categories.
//
// 🔴 STRUCTURAL ONLY, NEVER SUBJECT MATTER. Nothing here knows what a drug, a statute or an alloy
// is. `Case | Holding | Jurisdiction` and `Material | Failure mode | Density` are read by one rule,
// because they share one shape: a column of distinct things, and another column whose values REPEAT
// across those things.
//
// 🔴 REPETITION IS THE WHOLE SIGNAL, AND IT IS WHAT MAKES THIS NOT AN ASSOCIATION. A column as
// distinct as the subject states one fact per row — `Material | Density` is a pair, and the pair
// lane already reads it. A column with FEWER values than rows groups them, and grouping is the only
// thing that makes "which of these does X belong to, and what makes it that rather than its
// neighbour" a question with a defensible answer. A column with ONE value across every row groups
// nothing; it is a constant, and it is refused for the same reason.
//
// 🔴 EVERY GROUPING COLUMN IS AN AXIS, BECAUSE PICKING ONE WOULD BE THE GUESS THIS LANE EXISTS TO
// AVOID. `Genotype | Allele function | Variation type | Metabolizer status` groups three different
// ways, and all three are real classifications a learner could be asked about. Choosing "the" class
// column by position or cardinality would be exactly the arbitrary slice `table-not-pairs` refused.

import { isIndexShaped, type SubjectColumn } from "./table-subject-column";

/** A cell longer than this is a paragraph, not a category label. Mirrors the extraction lane. */
const MAX_CELL_CHARS = 200;

/** One class on an axis: the label, and the subjects the grid put under it. */
export interface KnowledgeClass {
  /** The category label, verbatim from the source — never normalised for display. */
  label: string;
  /** Subject values the grid placed in this class, in row order. */
  members: readonly string[];
}

/** A categorical axis: one column that sorts the grid's subjects into classes. */
export interface ClassAxis {
  /** Zero-based index of the column holding the class labels. */
  column: number;
  /** The source's own header word for this column, when the grid named it. */
  name?: string;
  /** The classes on this axis, in first-appearance order. Always two or more. */
  classes: readonly KnowledgeClass[];
  /** Columns that are neither the subject nor this axis — where a discriminating feature lives. */
  featureColumns: readonly number[];
}

/** A cell that can carry a category label. */
function isUsableCell(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_CELL_CHARS;
}

/**
 * Group the grid's subjects by one column's values.
 *
 * 🔴 FIRST-APPEARANCE ORDER, NOT SORTED. The order classes are introduced is the order the document
 * taught them, and a learner meeting `Normal → Intermediate → Poor` in the source should meet them
 * that way again. Sorting would silently reorder every axis whose labels are not alphabetical.
 */
function classesInColumn(
  dataRows: readonly (readonly string[])[],
  column: number,
  subjectIndex: number,
): KnowledgeClass[] {
  const byLabel = new Map<string, string[]>();
  for (const row of dataRows) {
    const label = row[column];
    const member = row[subjectIndex];
    if (!isUsableCell(label) || !isUsableCell(member)) continue;
    const key = label.trim();
    const existing = byLabel.get(key);
    if (existing) existing.push(member.trim());
    else byLabel.set(key, [member.trim()]);
  }
  return [...byLabel].map(([label, members]) => ({ label, members }));
}

/**
 * Every categorical axis in a grid, or an empty list when none is defensible.
 *
 * 🔴 `[]` IS A COMMON AND CORRECT ANSWER. A grid of measurements, a timetable, a grid whose
 * non-subject columns are all as distinct as the subject — none holds a classification, and
 * inventing one produces exactly the confident nonsense the extraction lane exists to refuse.
 */
export function classAxesOf(
  dataRows: readonly (readonly string[])[],
  width: number,
  subject: SubjectColumn,
  columnNames?: readonly string[],
): ClassAxis[] {
  // Two columns is a pair, and the pair lane owns it. Reading it here would mint two knowledge
  // objects over identical cells and teach the same fact twice under different types.
  if (width < 3) return [];
  // One row cannot demonstrate that anything repeats — with a single row every column is trivially
  // unique, so the grouping signal is unavailable. Two rows is the minimum that can show a shared
  // value, and it is the same threshold `subjectColumnOf` applies to distinctness.
  if (dataRows.length < 2) return [];

  const axes: ClassAxis[] = [];
  for (let column = 0; column < width; column += 1) {
    if (column === subject.index) continue;
    const classes = classesInColumn(dataRows, column, subject.index);
    // Fewer classes than rows is the grouping signal; two or more classes is what makes the
    // question answerable. One class is a constant column and groups nothing.
    if (classes.length < 2) continue;
    const grouped = classes.reduce((total, entry) => total + entry.members.length, 0);
    if (classes.length >= grouped) continue;
    // 🔴 A COLUMN WRITTEN AS AN INDEX IS NOT A CATEGORY, and this is the same typographic test that
    // stops `Date | Topic | Room` becoming knowledge. Activity scores of 1.0 / 0.5 / 0 repeat
    // exactly like class labels do; what separates them is that they are written as numbers.
    if (classes.every((entry) => isIndexShaped(entry.label))) continue;
    const featureColumns: number[] = [];
    for (let other = 0; other < width; other += 1) {
      if (other !== subject.index && other !== column) featureColumns.push(other);
    }
    const name = columnNames?.[column]?.trim();
    axes.push({ classes, column, featureColumns, ...(name ? { name } : {}) });
  }
  return axes;
}
