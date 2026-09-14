// The book's shape, as a reader needs it: one chapter at a time, in reading order.
//
// `outlineOf` in `course-detail.tsx` folds sections into units and then chapters, which is right
// for a contents page you scan before choosing. A READER wants the opposite emphasis: the chapter
// it is inside, flat and complete, plus a way to step out of it. So this file exists.
//
// PURE. No React, no I/O, no clock.

import type { CourseSection } from "./catalogue";

export interface ReadingChapter {
  /** Stable across renders and safe in a URL. Index-based, because titles repeat between units. */
  readonly key: string;
  readonly unit: string | null;
  /** The chapter's label as the book gives it, e.g. "Chapter 1 An Introduction to the Human Body". */
  readonly title: string;
  readonly sections: readonly CourseSection[];
}

/**
 * Group an ordered section list into chapters, without sorting.
 *
 * 🔴 READING ORDER IS TEACHING ORDER. A book that reuses a chapter name in two units gets two
 * chapters here, which is correct — they are different chapters that happen to share a name.
 */
export function chaptersOf(sections: readonly CourseSection[]): ReadingChapter[] {
  const chapters: { key: string; unit: string | null; title: string; sections: CourseSection[] }[] = [];
  let current: { unit: string | null; title: string } | null = null;
  for (const section of sections) {
    const unit = section.unit ?? null;
    const title = section.chapter ?? "";
    if (!current || current.unit !== unit || current.title !== title) {
      current = { unit, title };
      chapters.push({ key: `c${chapters.length}`, unit, title, sections: [] });
    }
    chapters[chapters.length - 1]!.sections.push(section);
  }
  return chapters;
}

/** The chapter a section belongs to, by its ordinal, or null when nothing holds it. */
export function chapterHolding(
  chapters: readonly ReadingChapter[],
  ordinal: number,
): ReadingChapter | null {
  return chapters.find((c) => c.sections.some((s) => s.ordinal === ordinal)) ?? null;
}

export interface SplitTitle {
  /** "Chapter 1", "Unit 2", "3" — whatever numbering the book put in front. Null when there is none. */
  readonly label: string | null;
  /** What is left once the numbering is taken off the front. Never empty. */
  readonly name: string;
}

// A well-formed Roman numeral, so "Part IV" splits and "Chapter DNA" does not. Bounded to four
// characters because chapter numbering does not reach into the hundreds.
const ROMAN = /^(?=[IVXLCDM]{1,4}\b)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/**
 * Pull the numbering off the front of a chapter or unit title.
 *
 * 🔴 STRUCTURAL, NOT A WORD LIST. It matches "one optional word, then a number" — so it splits
 * "Chapter 1 An Introduction", "Unit 2 Support and Movement", "Part IV Regulation", "3. Contracts"
 * and "Week 5 Torts" without ever knowing what those words mean. A law book, an engineering book
 * and a nursing book all number their chapters; none of them share vocabulary. The one thing it is
 * blind to is a book that numbers in another language, which loses a small piece of typography and
 * nothing else: the whole title survives as `name`.
 */
export function splitTitle(raw: string): SplitTitle {
  const title = raw.trim();
  const match = /^(\p{Lu}\p{L}*\s+)?([0-9]+|[IVXLCDM]{1,4})\b[\s.:)–—-]*(.+)$/u.exec(title);
  if (!match) return { label: null, name: title };
  const [, word, numeral, rest] = match;
  if (/^[IVXLCDM]+$/.test(numeral!) && !ROMAN.test(numeral!)) return { label: null, name: title };
  const name = rest!.trim();
  if (!name) return { label: null, name: title };
  return { label: `${word ? word.trim() + " " : ""}${numeral}`, name };
}

/** Every objective in a chapter, in order. What the chapter promises you will be able to do. */
export function objectivesOf(chapter: ReadingChapter): string[] {
  return chapter.sections.flatMap((s) => [...s.objectives]);
}

/* ---------------------------------------------------------------- what is on screen */

/**
 * Which of a course's surfaces the middle column is showing.
 *
 * 🔴 IT RIDES THE URL, like `at` does. The flashcards and the test are places in the course, not
 * modes of a component: a learner mid-deck who reloads should land back in the deck, and a link to
 * a chapter test should open a chapter test. Same lesson as `chat-had-no-address`.
 */
export type CourseView = "lesson" | "cards" | "test" | "chapter";

const VIEWS: readonly CourseView[] = ["lesson", "cards", "test", "chapter"];

export function readView(raw: string | null): CourseView {
  return VIEWS.includes(raw as CourseView) ? (raw as CourseView) : "lesson";
}
