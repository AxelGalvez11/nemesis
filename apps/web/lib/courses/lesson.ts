// A written lesson: the passage, its vocabulary, its figures, and the questions drawn from it.
//
// A course row carries the book's contents and objectives. A LESSON is what Nemesis wrote from
// those objectives, stored in `course_lessons` and read by every learner. Written once, ahead of
// time, because the owner's rule is that courses are pre-built rather than generated on open.
//
// PURE apart from the two loaders at the foot. No React, no clock in the logic.

import { supabase } from "@/lib/supabase";

export type LessonBlock =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "figure"; readonly fig: string; readonly caption: string }
  | {
      readonly kind: "check";
      readonly objective: number;
      readonly question: string;
      readonly choices: readonly string[];
      readonly answer: number;
      readonly why: string;
    };

export interface LessonTerm {
  readonly term: string;
  readonly definition: string;
}

export interface LessonFigure {
  readonly url: string;
  readonly alt: string;
  readonly credit: string;
}

export interface Flashcard {
  readonly front: string;
  readonly back: string;
  readonly objective: number;
}

export interface TestItem {
  readonly objective: number;
  readonly question: string;
  readonly choices: readonly string[];
  readonly answer: number;
  readonly why: string;
}

/**
 * One screen of a lesson: a signpost and the beats under it.
 *
 * 🔴 A PAGE HEADING IS A SIGNPOST, NOT A SENTENCE, and that reverses this repo's own rule. The
 * written standard says a heading states the idea ("Anatomy is the study of structure") so that
 * someone reading only the headings learns the section. That is right for a page you SCROLL,
 * where headings are the only landmarks. It is wrong for a page you ADVANCE THROUGH, where the
 * heading sits at the top of a screen you are about to read anyway and a full sentence just says
 * the paragraph twice. Measured in wondering.app's own bundle: "The Big Four", "The Problem",
 * "Under the Hood", "Multi-Seat Locking". Two to four words.
 */
export interface LessonPage {
  readonly heading: string;
  readonly blocks: readonly LessonBlock[];
}

export interface Lesson {
  readonly sectionOrdinal: number;
  readonly minutes: number;
  readonly blocks: readonly LessonBlock[];
  readonly terms: readonly LessonTerm[];
  readonly figures: Readonly<Record<string, LessonFigure>>;
  readonly flashcards: readonly Flashcard[];
  readonly items: readonly TestItem[];
  /**
   * The question the lesson answers, asked before any of it is explained.
   *
   * 🔴 THIS IS THE ONE FIELD THAT MAKES A LESSON FEEL UNLIKE A TEXTBOOK, and it is a top-level
   * field precisely so it CANNOT leak into the prose. A textbook opens by naming its topic; a
   * course opens by giving you a reason to keep reading. Every lesson in wondering.app's own
   * sample set carries one: "How does Redis let you lock a single seat across dozens of servers
   * in under a millisecond?" Written once, in a box, where the ban on rhetorical questions in the
   * passage does not reach it, and where it cannot be mistaken for teaching.
   */
  readonly hook?: string;
  /** Why the four minutes are worth spending. Also its own field, for the same reason as `hook`. */
  readonly meaning?: string;
  /** Authored pages. Absent on everything written before the format changed: see `pagesOf`. */
  readonly pages?: readonly LessonPage[];
}

/* ---------------------------------------------------------------- vocabulary */

export type Segment =
  | { readonly kind: "plain"; readonly text: string }
  | { readonly kind: "term"; readonly text: string; readonly definition: string };

const MARKER = /\[\[([^\]]+)\]\]/g;

/**
 * Split a passage into plain text and clickable vocabulary.
 *
 * 🔴🔴 A TERM IS CLICKABLE EVERY TIME IT APPEARS, NOT ONLY WHERE IT WAS MARKED. Owner, 2026-09-04:
 * *"the key vocab terms have to pop up everywhere in the section, since that makes users not have
 * to scroll up to read."* That is the real complaint: you meet `cation` in paragraph two, hit it
 * again in paragraph six, and the only way to recover the definition is to scroll back and hunt
 * for the one underlined instance.
 *
 * 🔴 THIS REVERSES A DECISION THIS FILE USED TO ARGUE FOR, and the old reasoning is worth keeping
 * because half of it still holds. It said matching was wrong on two counts: it misses inflections
 * ("cells" never matches "cell"), and it "lights up words used in passing". The first was a real
 * defect and is handled below. The second was never a defect, it was the feature described from
 * the other side: a word used in passing is exactly the one a reader has forgotten.
 *
 * What the authored `[[marker]]` still decides is WHICH words are vocabulary at all, and where the
 * writer chose to introduce each one. Nothing here invents a term. It only says that once a word is
 * vocabulary, it stays vocabulary for the rest of the section.
 *
 * Three limits, each one there to stop the passage turning into a field of dotted underlines:
 *
 *   - `MIN_MATCHED` (4 characters). Short words like "ion" or "pH" appear constantly and inside
 *     other words; underlining every one of them is noise rather than help.
 *   - Word boundaries only. "ion" must not chip the middle of "region", and "cell" must not chip
 *     "excellent".
 *   - Longest term first. "hydrogen bond" wins over "bond", so the more specific definition is the
 *     one the reader gets.
 *
 * An unknown marker degrades to plain text rather than throwing. A missing definition is a writing
 * bug, and a lesson that will not render is a worse way to report one than a word without a chip.
 */
const MIN_MATCHED = 4;

export function splitOnTerms(text: string, terms: readonly LessonTerm[]): Segment[] {
  const known = new Map(terms.map((t) => [t.term.toLowerCase(), t.definition]));

  // Pass one: honour the authored markers, which may sit anywhere in the text.
  const authored: Segment[] = [];
  let at = 0;
  for (const match of text.matchAll(MARKER)) {
    const start = match.index ?? 0;
    if (start > at) authored.push({ kind: "plain", text: text.slice(at, start) });
    const word = match[1] ?? "";
    const definition = known.get(word.toLowerCase());
    authored.push(definition ? { kind: "term", text: word, definition } : { kind: "plain", text: word });
    at = start + match[0].length;
  }
  if (at < text.length) authored.push({ kind: "plain", text: text.slice(at) });

  // Pass two: every OTHER occurrence of a known term, inside the plain stretches only. A segment
  // the writer already marked is never re-examined, so a marker can never be split in half.
  const matchable = [...known.keys()]
    .filter((t) => t.length >= MIN_MATCHED)
    .sort((a, b) => b.length - a.length);
  if (matchable.length === 0) return authored;

  // 🔴 `s?` AND `es?` ARE THE WHOLE INFLECTION STORY HERE, DELIBERATELY. A stemmer would catch
  // "arteries" from "artery" and would also chip words that merely share a stem. Textbook
  // vocabulary is overwhelmingly regular, and a term this misses is a term that is still clickable
  // where it was introduced, which is exactly where it was before this function changed.
  const pattern = new RegExp(`\\b(${matchable.map(escapeForRegex).join("|")})(e?s)?\\b`, "gi");

  const out: Segment[] = [];
  for (const segment of authored) {
    if (segment.kind !== "plain") {
      out.push(segment);
      continue;
    }
    let cursor = 0;
    for (const hit of segment.text.matchAll(pattern)) {
      const start = hit.index ?? 0;
      const definition = known.get((hit[1] ?? "").toLowerCase());
      if (!definition) continue;
      if (start > cursor) out.push({ kind: "plain", text: segment.text.slice(cursor, start) });
      out.push({ definition, kind: "term", text: hit[0] });
      cursor = start + hit[0].length;
    }
    if (cursor < segment.text.length) out.push({ kind: "plain", text: segment.text.slice(cursor) });
  }
  return out;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The passage with every marker removed. What a screen reader or a search index should see. */
export function plainText(text: string): string {
  return text.replace(MARKER, "$1");
}

/* ---------------------------------------------------------------- the test */

/**
 * Draw a test from the bank.
 *
 * 🔴 REGENERATING IS DRAWING AGAIN, NOT GENERATING AGAIN. The owner asked for tests you can retake
 * "until you completely know it". Calling a model for each retake would cost money and seconds every
 * time and would drift in difficulty; drawing from a written bank is instant, free, and every item
 * has already been checked. When the bank is exhausted is the moment to write more, and that is a
 * background job rather than something a learner waits on.
 *
 * `weakObjectives` are the ones missed last time. Items covering them are drawn FIRST, so a retake
 * is not a fresh shuffle but a second look at what you did not know. `avoid` holds the questions
 * just seen, so a retake is a different paper wherever the bank is deep enough to allow it.
 */
export function drawTest(
  items: readonly TestItem[],
  size: number,
  options: { readonly weakObjectives?: readonly number[]; readonly avoid?: readonly string[]; readonly seed?: number } = {},
): TestItem[] {
  const weak = new Set(options.weakObjectives ?? []);
  const avoid = new Set(options.avoid ?? []);
  const rng = mulberry(options.seed ?? 1);

  // Three tiers, best first: weak and unseen, unseen, then anything. Shuffled inside each tier so
  // two draws with different seeds differ, and concatenated so priority survives the shuffle.
  const tier = (item: TestItem) =>
    weak.has(item.objective) && !avoid.has(item.question) ? 0 : avoid.has(item.question) ? 2 : 1;
  const buckets: TestItem[][] = [[], [], []];
  for (const item of items) buckets[tier(item)]!.push(item);
  return buckets.flatMap((b) => shuffle(b, rng)).slice(0, size);
}

/** Which objectives an attempt got wrong. An objective counts as weak if ANY item on it was missed. */
export function weakFrom(items: readonly TestItem[], answers: readonly (number | null)[]): number[] {
  const weak = new Set<number>();
  items.forEach((item, i) => {
    if (answers[i] !== item.answer) weak.add(item.objective);
  });
  return [...weak].sort((a, b) => a - b);
}

export function scoreOf(items: readonly TestItem[], answers: readonly (number | null)[]): number {
  return items.reduce((n, item, i) => (answers[i] === item.answer ? n + 1 : n), 0);
}

/** Deterministic, so a test can be reproduced from its seed. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/* ---------------------------------------------------------------- loading */

function toLesson(row: Record<string, unknown>): Lesson {
  return {
    sectionOrdinal: Number(row.section_ordinal ?? 0),
    minutes: Number(row.minutes ?? 8),
    blocks: (row.blocks as LessonBlock[]) ?? [],
    terms: (row.terms as LessonTerm[]) ?? [],
    figures: (row.figures as Record<string, LessonFigure>) ?? {},
    flashcards: (row.flashcards as Flashcard[]) ?? [],
    items: (row.items as TestItem[]) ?? [],
    hook: (row.hook as string | null) ?? undefined,
    meaning: (row.meaning as string | null) ?? undefined,
    pages: (row.pages as LessonPage[] | null) ?? undefined,
  };
}

/** Every written lesson for a course, keyed by section ordinal. */
export async function listLessons(courseId: string): Promise<Map<number, Lesson>> {
  const { data, error } = await supabase
    .from("course_lessons")
    .select("section_ordinal,minutes,blocks,terms,figures,flashcards,items,hook,meaning,pages")
    .eq("course_id", courseId)
    .order("section_ordinal");
  if (error || !data) return new Map();
  return new Map(data.map((row) => [Number(row.section_ordinal), toLesson(row)]));
}

/* ---------------------------------------------------------------- the chapter test */

export interface Pool {
  readonly items: readonly TestItem[];
  /** What to call objective `n` of the pool. Indexed by the remapped objective number. */
  readonly labels: readonly string[];
}

/**
 * Every written question in a chapter, as one bank.
 *
 * 🔴 THE OBJECTIVE NUMBERS HAVE TO BE REMAPPED, AND FORGETTING TO IS A SILENT WRONG ANSWER. Inside
 * a lesson an item's `objective` is an index into THAT section's objectives, so objective 0 exists
 * seven times over in a seven-section chapter. Pooling them without remapping would make a chapter
 * test report "worth another look: compare and contrast anatomy and physiology" for a question
 * about medical imaging, and the retake would then weight towards the wrong material. Every
 * objective gets a chapter-wide number here, and a label that names the section it came from.
 */
export function poolForChapter(
  sections: readonly { ordinal: number; number: string | null; objectives: readonly string[] }[],
  lessons: ReadonlyMap<number, Lesson>,
): Pool {
  const items: TestItem[] = [];
  const labels: string[] = [];
  for (const section of sections) {
    const base = labels.length;
    for (const objective of section.objectives) {
      labels.push(section.number ? `${section.number} · ${objective}` : objective);
    }
    const lesson = lessons.get(section.ordinal);
    if (!lesson) continue;
    for (const item of lesson.items) {
      // An item naming an objective the section does not have is dropped rather than remapped to
      // something arbitrary. It would be a writing bug, and a wrong label is worse than no question.
      if (item.objective < 0 || item.objective >= section.objectives.length) continue;
      items.push({ ...item, objective: base + item.objective });
    }
  }
  return { items, labels };
}

/* ---------------------------------------------------------------- the lesson's own contents */

export interface LessonHeading {
  /** The element id in the rendered passage. Anchors and rail rows share this one function so a
   *  rename in either place cannot leave the rail pointing at nothing. */
  readonly id: string;
  readonly text: string;
}

/**
 * A lesson as a sequence of screens.
 *
 * 🔴 EVERY LESSON WRITTEN BEFORE THIS FORMAT EXISTED IS ALREADY PAGED, and that is the whole point
 * of deriving rather than requiring. 208 lessons hold headings already, because the standard made
 * every one of them start a beat with a heading. Splitting there turns all 208 into decks for
 * nothing, today, with no rewrite and no model call. A lesson that authors `pages` explicitly wins;
 * one that does not gets its headings read as page breaks.
 *
 * Blocks before the first heading are a real case (a lesson that opens with a figure), and they get
 * their own opening page rather than being silently attached to the first heading's screen.
 */
export function pagesOf(lesson: Lesson): LessonPage[] {
  if (lesson.pages?.length) return [...lesson.pages];

  const out: LessonPage[] = [];
  let current: { heading: string; blocks: LessonBlock[] } | null = null;
  for (const block of lesson.blocks) {
    if (block.kind === "heading") {
      if (current) out.push(current);
      current = { heading: block.text, blocks: [] };
      continue;
    }
    if (!current) current = { heading: "", blocks: [] };
    current.blocks.push(block);
  }
  if (current) out.push(current);
  return out.filter((page) => page.blocks.length > 0 || page.heading !== "");
}

/**
 * 🔴 ONE ID SPACE FOR BOTH VIEWS, KEYED ON THE PAGE. It used to be keyed on the block index, which
 * was fine while a lesson had exactly one rendering. It has two now, and a block index means
 * different things in each: the deck drops heading blocks and the scroll view keeps them, so a rail
 * row pointing at block 7 landed in a different place depending on which view was open. A page
 * exists identically in both, so it is the thing the rail can name.
 */
export function headingId(sectionOrdinal: number, pageIndex: number): string {
  return `s${sectionOrdinal}-p${pageIndex}`;
}

/** Which page a rail id refers to, or null if it is not one of ours. */
export function pageOfId(id: string): number | null {
  const at = /-p(\d+)$/.exec(id);
  return at ? Number(at[1]) : null;
}

/**
 * The headings inside a lesson, in reading order.
 *
 * 🔴 THIS IS THE TABLE OF CONTENTS, NOT A ROW SAYING "Lesson". The owner asked why the rail did not
 * show the section's own headers, and the answer was that it showed a link called Lesson instead,
 * which tells you nothing you did not already know from the section title above it. The headings
 * are the only thing in the rail that says what is actually inside a section.
 */
export function headingsOf(lesson: Lesson, sectionOrdinal: number): LessonHeading[] {
  return pagesOf(lesson).flatMap((page, i) =>
    page.heading ? [{ id: headingId(sectionOrdinal, i), text: page.heading }] : [],
  );
}
