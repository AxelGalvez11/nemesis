// Finding the learning objectives in a lecture.
//
// Nearly every lecture deck opens with a slide that says, in some wording, "by the
// end of this you should be able to ...". That slide is the single most valuable
// page in the deck: it is the instructor telling the student what the exam will ask.
// Until now nothing in the product read it — flashcards and practice tests were
// generated from whatever text happened to survive the clip.
//
// Two reasons this is a separate module rather than a few lines in the generator:
//
//   1. ORDER MATTERS. study-artifact-content.ts clips source material to
//      MATERIAL_CHAR_LIMIT (9,000 chars) before sending it to the model. A 5MB deck
//      is far longer than that, so the objectives — which sit on slide 2 — usually
//      survive, but anything read from the END of a deck does not. Objectives are
//      extracted from the FULL text here and injected ahead of the clipped body, so
//      they are never the thing that gets cut.
//   2. Pure and testable. Heading detection is fiddly and every deck words it
//      differently; that deserves tests, not a regex buried in a prompt builder.
//
// Deliberately conservative: this reports objectives it can point at, and reports
// none rather than guessing. A wrong objective is worse than no objective, because
// it silently steers every card and question generated afterwards.

/** Objective lists longer than this are a table of contents, not objectives. */
export const MAX_OBJECTIVES = 12;
/** One objective is a sentence, not a paragraph. */
export const MAX_OBJECTIVE_CHARS = 240;
/** Below this an "objective" is a fragment like "Objectives" or "3". */
const MIN_OBJECTIVE_CHARS = 12;
/** How many lines after the heading to keep scanning before giving up. Objective
 *  slides are short; scanning further starts collecting body content. */
const SCAN_LINES = 20;

/**
 * Headings that introduce an objective list. Ordered longest-intent first so
 * "learning outcomes" is not matched by the looser "outcomes".
 */
const HEADING_PATTERNS: ReadonlyArray<RegExp> = [
  /^\W*(?:slide\s*\d+\W*)?(?:learning|course|session|lecture|module|unit)\s+(?:objectives?|outcomes?|goals?)\W*$/i,
  /^\W*(?:objectives?|learning\s+aims?)\W*$/i,
  /^\W*(?:at\s+the\s+end\s+of|by\s+the\s+end\s+of|upon\s+completion\s+of|after\s+(?:this|completing))\b.*$/i,
  /^\W*(?:you|students?|learners?|participants?)\s+(?:should|will)\s+be\s+able\s+to\b.*$/i,
];

/**
 * Verbs an objective is written with (Bloom's taxonomy, as every curriculum office
 * teaches it). Used only to RESCUE an objective list whose heading was merged into
 * the first line by the extractor — never to invent objectives out of body text.
 */
const OBJECTIVE_VERBS =
  /^(?:describe|explain|identify|list|compare|contrast|define|apply|analyz|analys|evaluate|calculate|interpret|discuss|outline|summariz|summaris|differentiate|distinguish|recogniz|recognis|state|predict|classify|demonstrate|select|recommend|justify|review|understand|know|perform|prepare|develop|assess|determine|construct|derive|solve|name)/i;

export interface LearningObjectives {
  objectives: string[];
  /** The heading line the list was found under, for showing the student where it
   *  came from. Null when objectives were rescued without a clean heading. */
  heading: string | null;
}

const EMPTY: LearningObjectives = { heading: null, objectives: [] };

/**
 * Pull the objective list out of a lecture's full text. Returns an empty list when
 * there is nothing that clearly reads as objectives.
 */
export function findLearningObjectives(text: string): LearningObjectives {
  if (!text.trim()) return EMPTY;
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    if (!line) continue;
    const pattern = HEADING_PATTERNS.find((candidate) => candidate.test(line));
    if (!pattern) continue;

    // "By the end of this lecture you will be able to: describe X; explain Y" —
    // the whole list can live on the heading line itself.
    const inline = objectivesFromInline(line);
    const following = collectAfter(lines, index + 1);
    const objectives = dedupe([...inline, ...following]);
    if (objectives.length > 0) return { heading: line, objectives: objectives.slice(0, MAX_OBJECTIVES) };
  }

  return EMPTY;
}

/** Everything after a colon on the heading line, split on list punctuation. */
function objectivesFromInline(line: string): string[] {
  const colon = line.indexOf(":");
  if (colon < 0) return [];
  const tail = line.slice(colon + 1).trim();
  if (!tail) return [];
  return tail
    .split(/\s*[;•]\s*|\s+\d+[.)]\s+/)
    .map(cleanObjective)
    .filter((item): item is string => item !== null);
}

/**
 * Collect the objective lines that follow a heading. Stops at the next heading, at
 * a line that is plainly body content, or once the list is long enough to be
 * something other than objectives.
 */
function collectAfter(lines: string[], start: number): string[] {
  const found: string[] = [];
  let blanks = 0;

  for (let index = start; index < lines.length && index < start + SCAN_LINES; index += 1) {
    const raw = lines[index] ?? "";
    const line = raw.trim();

    if (!line) {
      // One blank line inside a bulleted list is normal; two ends the slide.
      blanks += 1;
      if (blanks >= 2 && found.length > 0) break;
      continue;
    }
    blanks = 0;

    // A second objectives heading means we have run into the next section.
    if (HEADING_PATTERNS.some((pattern) => pattern.test(line))) break;

    const bullet = stripBullet(line);
    const isListItem = bullet !== line;
    const looksLikeObjective = isListItem || OBJECTIVE_VERBS.test(bullet);
    if (!looksLikeObjective) {
      if (found.length > 0) break;
      continue;
    }

    const clean = cleanObjective(bullet);
    if (clean) found.push(clean);
    if (found.length >= MAX_OBJECTIVES) break;
  }

  return found;
}

/** Remove a leading bullet, dash, or "1." / "1)" marker. Returns the line
 *  unchanged when there was no marker — the caller uses that to tell a list item
 *  from a sentence. */
function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•▪◦‣·–—]|\d{1,2}\s*[.)]|[a-z]\s*[.)])\s+/i, "").trim();
}

function cleanObjective(value: string): string | null {
  const compact = value.trim().replace(/\s+/g, " ").replace(/[.;:,]+$/, "").trim();
  if (compact.length < MIN_OBJECTIVE_CHARS) return null;
  if (compact.length > MAX_OBJECTIVE_CHARS) return `${compact.slice(0, MAX_OBJECTIVE_CHARS - 1).trimEnd()}…`;
  return compact;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * The block injected AHEAD of clipped source material, so a generator is told what
 * the lecture is actually for even when most of the deck did not fit. Returns ""
 * when nothing was found, so callers can concatenate unconditionally.
 */
export function objectivesPromptBlock(found: LearningObjectives): string {
  if (found.objectives.length === 0) return "";
  return [
    "The instructor's stated learning objectives for this material — these are what the student will be examined on, so cover every one of them first:",
    ...found.objectives.map((objective, index) => `${index + 1}. ${objective}`),
  ].join("\n");
}
