// Which runs of list items a document ORDERED, and which it merely listed.
//
// 🔴 THE MARKER DECIDES, NEVER THE WORDS. A numbered list is the author stating that these things
// happen in this sequence; a bulleted list states no such thing, and reading one as a procedure
// invents an order the document never claimed — then drills the learner on it. Deciding from the
// content instead ("do these sentences look like instructions?") needs a vocabulary per field and
// could not read `Serve the opposing party` and `Torque the head bolts` by one rule.
//
// 🔴 AND THE NUMBERS MUST ACTUALLY RUN. A marker that parses as an ordinal is not enough: a list
// marked `1. 1. 1.` is a template someone never renumbered, and `3. 7. 12.` is a set of references
// to a numbering that lives somewhere else. Only a consecutive ascending run is a sequence, and
// requiring that is what keeps this from reading any numbered thing as a set of steps.
//
// 🔴 THE SCHEME IS INFERRED FROM THE RUN, NOT FROM THE FIRST MARKER. `i.` is the ninth letter and
// the first roman numeral, so a single marker cannot say which. `i. ii. iii.` is consecutive as
// roman and is `i, j, k` gibberish as letters; testing every scheme across the WHOLE run and
// keeping the one that comes out consecutive is what resolves it without guessing.

/** A step, as the document printed it. */
export interface ProcedureStep {
  /** The item's own marker — `3.`, `c)`, `iv.`. */
  marker: string;
  /** The item's text, with its marker still on the front exactly as the source rendered it. */
  text: string;
  /** Unit id, so a step resolves back to a place in the document. */
  unitId: string;
}

/** A run of list items the document numbered in order. */
export interface OrderedRun {
  /** The heading the run sits under — the source's own name for the procedure, when it gave one. */
  heading?: string;
  /** Nesting depth. Two runs at different depths are two lists. */
  depth: number;
  /** The steps, in the order printed. Always two or more. */
  steps: readonly ProcedureStep[];
}

/** The minimum a claim of order can rest on. One item is not a sequence, and two barely is. */
const MIN_STEPS = 2;

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, ix: 9, v: 5, vi: 6, vii: 7, viii: 8, x: 10 };

/** The ordinal a marker denotes under one scheme, or null when it does not parse as one. */
function ordinalIn(scheme: "numeric" | "alpha" | "roman", marker: string): number | null {
  const bare = marker.trim().replace(/[.)\]}:—-]+$/, "").replace(/^[([{]+/, "").toLowerCase();
  if (!bare) return null;
  if (scheme === "numeric") return /^[0-9]+$/.test(bare) ? Number(bare) : null;
  if (scheme === "roman") return ROMAN[bare] ?? null;
  return /^[a-z]$/.test(bare) ? bare.charCodeAt(0) - 96 : null;
}

/** Does every marker parse under this scheme AND form a consecutive ascending run? */
function runsConsecutively(scheme: "numeric" | "alpha" | "roman", markers: readonly string[]): boolean {
  const ordinals = markers.map((marker) => ordinalIn(scheme, marker));
  if (ordinals.some((value) => value === null)) return false;
  return ordinals.every((value, index) => index === 0 || value === ordinals[index - 1]! + 1);
}

/**
 * Is this run ordered — i.e. did the document number it, consecutively, under some scheme?
 *
 * 🔴 A BULLET CAN NEVER SATISFY THIS, which is the whole point. `•` parses as no ordinal under any
 * scheme, so a bulleted run is refused before any question of consecutiveness arises.
 */
export function isOrderedRun(markers: readonly string[]): boolean {
  if (markers.length < MIN_STEPS) return false;
  return (["numeric", "roman", "alpha"] as const).some((scheme) => runsConsecutively(scheme, markers));
}

/** One list item as this lane needs to see it. */
export interface ListUnit {
  id: string;
  type: string;
  text?: string;
  marker?: string;
  depth?: number;
  anchor?: { headingPath?: readonly string[] };
}

/** Group adjacent list items that belong to the same list. */
function adjacentRuns(units: readonly ListUnit[]): ListUnit[][] {
  const runs: ListUnit[][] = [];
  let current: ListUnit[] = [];
  const breaks = (unit: ListUnit, previous: ListUnit): boolean =>
    (unit.depth ?? 0) !== (previous.depth ?? 0) ||
    headingOf(unit) !== headingOf(previous);

  for (const unit of units) {
    // 🔴 ADJACENCY IS IN THE UNIT ORDER, so anything that is not a list item ENDS the run. A
    // paragraph between two numbered lists is the document saying they are two lists; splicing
    // across it would join `1. 2. 3.` to a second `1. 2.` and read six steps where there are three.
    if (unit.type !== "listItem" || !unit.marker) {
      if (current.length) runs.push(current);
      current = [];
      continue;
    }
    const previous = current[current.length - 1];
    if (previous && breaks(unit, previous)) {
      runs.push(current);
      current = [];
    }
    current.push(unit);
  }
  if (current.length) runs.push(current);
  return runs;
}

function headingOf(unit: ListUnit): string | undefined {
  const path = unit.anchor?.headingPath;
  return path?.length ? path[path.length - 1] : undefined;
}

/**
 * Every run of list items the document numbered in order.
 *
 * 🔴 `[]` IS THE COMMON AND CORRECT ANSWER. Most lists in most documents are bulleted, and a
 * bulleted list is a set rather than a sequence. Returning nothing for them is the honest result.
 */
export function orderedRunsIn(units: readonly ListUnit[]): OrderedRun[] {
  const found: OrderedRun[] = [];
  for (const run of adjacentRuns(units)) {
    if (run.length < MIN_STEPS) continue;
    if (!isOrderedRun(run.map((unit) => unit.marker!))) continue;
    const heading = headingOf(run[0]!);
    found.push({
      depth: run[0]!.depth ?? 0,
      steps: run.map((unit) => ({ marker: unit.marker!, text: (unit.text ?? "").trim(), unitId: unit.id })),
      ...(heading ? { heading } : {}),
    });
  }
  return found;
}
