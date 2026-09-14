// Practice drawn from a lesson that is already written.
//
// 🔴 THE POINT OF THIS FILE IS THAT IT COSTS NOTHING. Nemesis had two ways to practise, multiple
// choice and a flashcard, against wondering.app's nine (measured in their own bundle: Flashcard,
// Multiple Choice, Binary Choice, Type In, Click & Fill, Order Steps, Explain, Compare & Contrast,
// Match Pairs). Three of the seven we were missing need no new writing at all, because a lesson
// already carries the material they are made of: its vocabulary, and the sentences that vocabulary
// appears in. 208 written lessons gain three exercise types the moment this file exists.
//
// The four NOT derived here are honest about why. Binary Choice needs a plausible false statement,
// which is a writing job. Order Steps needs a sequence, and a lesson has no reliable one. Explain
// and Compare & Contrast are graded by a model against a rubric, so they need the rubric written.
// Deriving those badly would be worse than not having them: a wrong practice question teaches the
// wrong thing, and unlike a wrong sentence nobody reads past it.

import { plainText, type Lesson, type LessonTerm } from "./lesson";

export type Practice =
  | {
      readonly kind: "type_in";
      /** The page whose prose this quotes, or null when the lesson has no pages. */
      readonly fromPage: number | null;
      readonly term: string;
      readonly prompt: string;
      readonly answer: string;
      readonly why: string;
    }
  | {
      readonly kind: "pool_fill";
      /** The page whose prose this quotes, or null when the lesson has no pages. */
      readonly fromPage: number | null;
      readonly term: string;
      readonly prompt: string;
      readonly answer: string;
      readonly pool: readonly string[];
      readonly why: string;
    }
  | {
      readonly kind: "match";
      readonly pairs: readonly { readonly term: string; readonly definition: string }[];
    };

/**
 * Where a blank goes in a `type_in` or `pool_fill` prompt.
 *
 * A literal sentinel rather than whitespace, because the renderer has to FIND the gap to draw an
 * input in it. Runs of ordinary spaces collapse in HTML and would leave no visible gap at all,
 * which is how the first version of this shipped a fill-in-the-blank with no blank in it.
 */
export const BLANK = "____";

/* ---------------------------------------------------------------- sentences */

/**
 * The sentences of a lesson's passage, markers removed.
 *
 * Splitting on `.` alone breaks on "e.g." and on "0.5 mm", both of which are everywhere in a
 * science textbook. Requiring the full stop to be followed by whitespace and a capital letter costs
 * nothing and removes both.
 */
export function sentencesOf(lesson: Lesson): string[] {
  // 🔴 THE SENTENCES HAVE TO COME FROM WHAT THE LEARNER ACTUALLY READ. A lesson that authors
  // `pages` has two versions of its prose: the pages the deck shows, and the older `blocks` the
  // scroll view shows. Reading `blocks` here would quote a sentence from the version on screen only
  // half the time, so a fill-in could ask about a word the learner never met.
  return placedSentences(lesson).map((s) => s.text);
}

/** Each sentence with the page it sits on, so a question can be asked where the reader just was. */
export function placedSentences(lesson: Lesson): { text: string; page: number | null }[] {
  const parts = lesson.pages?.length
    ? lesson.pages.map((page, i) => ({ page: i as number | null, blocks: page.blocks }))
    : [{ page: null as number | null, blocks: lesson.blocks }];

  return parts.flatMap(({ page, blocks }) => {
    const prose = blocks
      .filter((b) => b.kind === "text")
      .map((b) => plainText((b as { text: string }).text))
      .join(" ");
    return prose
      .split(/(?<=[.!?])\s+(?=[A-Z(])/)
      .map((text) => text.trim())
      .filter((text) => text.length > 0)
      .map((text) => ({ text, page }));
  });
}

/**
 * The best sentence to blank a term out of.
 *
 * 🔴 THE SENTENCE THAT DEFINES THE TERM IS THE WORST ONE TO USE, and it is the one a naive search
 * finds first because it is where the term is marked. "A cation is an atom that has lost an
 * electron" with `cation` blanked is answerable by anyone who has ever met the word, because the
 * rest of the sentence IS the definition. A later sentence that merely USES the term is a real
 * retrieval question. So: prefer a sentence that does not contain the definition's own words, and
 * fall back to the defining sentence only when the term appears nowhere else.
 */
export function sentenceFor(term: LessonTerm, sentences: readonly string[]): string | null {
  const word = new RegExp(`\\b${escapeForRegex(term.term)}\\b`, "i");
  const holding = sentences.filter((s) => word.test(s) && s.split(/\s+/).length >= 8);
  if (holding.length === 0) return null;

  // Words the definition leans on, so a sentence repeating them is recognised as the defining one.
  const defining = new Set(
    term.definition
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 5),
  );
  const overlap = (s: string): number =>
    s
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => defining.has(w)).length;

  // Least overlap wins; among equals the longer sentence, which carries more recoverable context.
  return [...holding].sort((a, b) => overlap(a) - overlap(b) || b.length - a.length)[0] ?? null;
}

/**
 * Replace one occurrence of a term with the blank.
 *
 * 🔴 A TERM CAN LIVE INSIDE A LONGER TERM, and blanking the wrong one produces nonsense. Anatomy 1.1
 * defines both "physiology" and "cardiovascular physiology", so the naive replace turned "...
 * cardiovascular physiology the heart and vessels ..." into "... cardiovascular ____ the heart and
 * vessels ...", which reads as a typo rather than a question. Occurrences sitting inside a longer
 * known term are skipped; if every occurrence is inside one, the sentence is left alone and the
 * question is dropped by the caller.
 */
export function blankOut(sentence: string, term: string, known: readonly LessonTerm[]): string | null {
  const longer = known
    .map((t) => t.term)
    .filter((t) => t.length > term.length && t.toLowerCase().includes(term.toLowerCase()));

  // Spans covered by a longer term, which this term may not be blanked out of.
  const covered: [number, number][] = [];
  for (const other of longer) {
    for (const m of sentence.matchAll(new RegExp(`\\b${escapeForRegex(other)}\\b`, "gi"))) {
      covered.push([m.index, m.index + m[0].length]);
    }
  }

  for (const m of sentence.matchAll(new RegExp(`\\b${escapeForRegex(term)}\\b`, "gi"))) {
    const at = m.index;
    if (covered.some(([from, to]) => at >= from && at < to)) continue;
    return sentence.slice(0, at) + BLANK + sentence.slice(at + m[0].length);
  }
  return null;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ---------------------------------------------------------------- the deck */

/**
 * Every exercise a written lesson can supply without anyone writing anything more.
 *
 * A term needs a usable sentence to become a fill-in, so a lesson's deck is smaller than its
 * vocabulary and that is correct: a term used once, inside its own definition, has no question in
 * it. Match Pairs needs at least three terms to be a puzzle rather than a giveaway, and is capped at
 * five so the grid stays on one screen.
 */
/**
 * How many fill-ins one lesson may ask.
 *
 * 🔴 A LESSON WITH FIFTEEN TERMS WOULD OTHERWISE STOP THE READER FIFTEEN TIMES. Anatomy 1.1 defines
 * fifteen words, and every one of them can be blanked out of a sentence, so the unbounded version
 * turned a seven-screen lesson into a twenty-two-screen one where two thirds of the screens were
 * questions. Three is enough to make the reading active and few enough that Continue still feels
 * like progress. Everything the cap drops is still in the flashcards and the test.
 */
const MOST_FILLS = 3;

export function practiceFrom(lesson: Lesson): Practice[] {
  const placed = placedSentences(lesson);
  const sentences = placed.map((s) => s.text);
  const out: Practice[] = [];

  // 🔴 ONLY WORDS THE LESSON ACTUALLY SAYS. `terms` and the prose can disagree: Anatomy 1.1 still
  // carried "Dissection" from an earlier draft that mentioned it, and Match Pairs duly asked a
  // learner to define a word that appears nowhere in what they just read. The prose is the truth
  // about what was taught, so the vocabulary is filtered against it rather than trusted.
  const met = lesson.terms.filter((t) =>
    sentences.some((line) => new RegExp(`\\b${escapeForRegex(t.term)}\\b`, "i").test(line)),
  );

  const fillable = met
    .map((term) => ({ term, sentence: sentenceFor(term, sentences) }))
    .filter((row): row is { term: LessonTerm; sentence: string } => row.sentence !== null);

  for (const { term, sentence } of fillable.slice(0, MOST_FILLS)) {
    const prompt = blankOut(sentence, term.term, met);
    // Every occurrence sat inside a longer term, so there is no honest question here.
    if (prompt === null) continue;
    const fromPage = placed.find((s) => s.text === sentence)?.page ?? null;
    // A pool of one is not a choice. Distractors are the lesson's OTHER vocabulary, which is what
    // makes this harder than multiple choice: every option is a word from this same lesson.
    //
    // 🔴 A DISTRACTOR THAT CONTAINS THE ANSWER IS NOT A DISTRACTOR. Anatomy 1.1 defines "anatomy",
    // "microscopic anatomy" and "regional anatomy", and the first pool it produced offered all three
    // for a blank whose answer was "anatomy". Every option was arguably right, which teaches the
    // learner that the exercise is broken rather than that they are wrong.
    const others = met
      .map((t) => t.term)
      .filter((t) => {
        const a = t.toLowerCase();
        const b = term.term.toLowerCase();
        return a !== b && !a.includes(b) && !b.includes(a);
      });
    if (others.length >= 3) {
      // 🔴 THE ANSWER CANNOT SIT IN THE SAME PLACE EVERY TIME, and the first version of this file
      // put it first in every pool. That is the same fault the test bank had (`--fix` exists to
      // rotate written answers) arriving by a different route: a learner who notices scores without
      // reading. Distractors are drawn from a rotating start too, so five questions in one lesson
      // do not offer the identical four words five times.
      const seed = hash(term.term);
      const drawn = rotate(others, seed).slice(0, 4);
      out.push({
        kind: "pool_fill",
        fromPage,
        term: term.term,
        prompt,
        answer: term.term,
        pool: rotate([term.term, ...drawn], seed),
        why: term.definition,
      });
    } else {
      out.push({ kind: "type_in", fromPage, term: term.term, prompt, answer: term.term, why: term.definition });
    }
  }

  if (met.length >= 3) {
    out.push({
      kind: "match",
      pairs: met.slice(0, 5).map((t) => ({ term: t.term, definition: t.definition })),
    });
  }
  return out;
}

/**
 * Is a typed answer right?
 *
 * 🔴 A SPELLING MISTAKE IS NOT A WRONG ANSWER. Someone who types "mitochondrion" for "mitochondria",
 * or misses the second `r` in "endoplasmic reticulum", knows the thing. Marking that wrong teaches
 * the learner that the exercise is unfair, and they stop typing. Case, surrounding space and a
 * trailing plural are all forgiven, and so is one wrong character in a word of six or more.
 */
export function accepts(typed: string, answer: string): boolean {
  const a = typed.trim().toLowerCase().replace(/s$/, "");
  const b = answer.trim().toLowerCase().replace(/s$/, "");
  if (a === b) return true;
  if (b.length < 6) return false;
  return distance(a, b) <= 1;
}

/** Deterministic from the term, so a lesson shows the same paper twice and a test can rerun it. */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function rotate<T>(list: readonly T[], seed: number): T[] {
  if (list.length < 2) return [...list];
  const by = seed % list.length;
  return [...list.slice(by), ...list.slice(0, by)];
}

/** Levenshtein, bounded by the fact that both strings are single terms. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[b.length]!;
}
