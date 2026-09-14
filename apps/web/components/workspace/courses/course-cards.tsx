"use client";

// The flashcard screen, in Anki's shape.
//
// Owner, 2026-09-04: *"the flashcards are a bit small ... maybe it could be like Anki where it
// gives you like a screen of like how many cards there are ... and I don't know if it has the FSRS
// in there too."*
//
// It does now. Three things changed from the small card that was here before:
//   1. THE DECK HAS A FRONT DOOR. Anki's whole home screen is three numbers: new, learning, due.
//      Starting a sitting without knowing how long it will be is the thing that makes a deck feel
//      bottomless.
//   2. THE CARD FILLS THE COLUMN. A flashcard you have to lean towards is not a flashcard.
//   3. AGAIN / HARD / GOOD / EASY, each printing the real interval it would give you.
//
// 🔴 THE SCHEDULER IS `lib/workspace/study-scheduler.ts` AND NOTHING HERE DUPLICATES IT. That file
// is FSRS-6 and it is pinned to agree with the `grade_study_card` function in Postgres to the
// decimal. Writing a second set of intervals for the courses lane would be two schedulers giving a
// learner two different answers about the same card.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyAnswer,
  countDeck,
  elapsedFor,
  freshMemory,
  memoryKey,
  saveCardMemory,
  type CardMemory,
} from "@/lib/courses/card-memory";
import { type Flashcard, type Lesson } from "@/lib/courses/lesson";
import { buildReviewQueue } from "@/lib/workspace/study-review-queue";
import {
  answerStudyCard,
  describeDelay,
  previewAnswers,
  type StudyGrade,
} from "@/lib/workspace/study-scheduler";

const GRADES: readonly StudyGrade[] = ["again", "hard", "good", "easy"];
const LABEL: Record<StudyGrade, string> = { again: "Again", easy: "Easy", good: "Good", hard: "Hard" };

/**
 * 🔴 ANKI'S OWN THREE COLOURS, AND THAT IS THE POINT. New is blue, learning is red, review is
 * green. Somebody who has used Anki reads these counts without being told what they mean, and the
 * owner asked for the colour by name (2026-09-04). The tokens are defined for both themes in
 * `globals.css`; the light values are unreadable on black and the dark ones wash out on white.
 */
const COUNT_COLOUR: Record<string, string> = {
  learning: "var(--course-learning)",
  new: "var(--course-new)",
  "to review": "var(--course-review)",
};

/** Anki's epoch trick: a card nobody has seen is due now, so the queue treats it like any other. */
const EPOCH = new Date(0).toISOString();

function Count({ n, what }: { n: number; what: string }) {
  // A zero is not worth colouring: nothing is there to act on, and a bright zero reads as work.
  const colour = n > 0 ? COUNT_COLOUR[what] : undefined;
  return (
    <div className="flex flex-col items-center gap-[2px]">
      <span
        className="text-[26px] font-semibold tabular-nums leading-none"
        style={{ color: colour ?? "var(--course-meta)" }}
      >
        {n}
      </span>
      <span className="text-[12px] text-(--course-meta)">{what}</span>
    </div>
  );
}

/** The same three counts on one line, for the header during a sitting. */
function CountStrip({ fresh, learning, due }: { fresh: number; learning: number; due: number }) {
  const parts: readonly [number, string][] = [
    [fresh, "new"],
    [learning, "learning"],
    [due, "to review"],
  ];
  return (
    <span className="flex gap-[10px] tabular-nums">
      {parts.map(([n, what]) => (
        <span key={what} style={{ color: n > 0 ? COUNT_COLOUR[what] : "var(--course-meta)" }}>
          {n} {what}
        </span>
      ))}
    </span>
  );
}

export function CourseCards({
  lesson,
  sectionTitle,
  sectionOrdinal,
  courseId,
  userId,
  memories,
  onRemember,
  onFinish,
}: {
  lesson: Lesson;
  sectionTitle: string;
  sectionOrdinal: number;
  courseId: string;
  userId: string | null;
  memories: ReadonlyMap<string, CardMemory>;
  onRemember: (memory: CardMemory) => void;
  onFinish: () => void;
}) {
  const [started, setStarted] = useState(false);
  const [shown, setShown] = useState(false);
  // One clock for the whole sitting. Reading `new Date()` inside render would make the queue and
  // the button previews disagree by however long the render took.
  const [now, setNow] = useState(() => new Date());
  // The key listener is bound once per sitting, so it reads these instead of closing over state
  // that would be stale by the second card.
  const shownRef = useRef(false);
  const gradeRef = useRef<((g: StudyGrade) => void) | null>(null);

  const cards: readonly Flashcard[] = lesson.flashcards;

  const memoryFor = useCallback(
    (index: number) => memories.get(memoryKey(sectionOrdinal, index)) ?? freshMemory(sectionOrdinal, index),
    [memories, sectionOrdinal],
  );

  const counts = useMemo(
    () =>
      countDeck(
        cards.map((_, i) => memoryFor(i)).filter((m) => m.repetitions > 0),
        cards.length,
        now,
      ),
    [cards, memoryFor, now],
  );

  const queue = useMemo(
    () =>
      buildReviewQueue({
        cards: cards.map((_, i) => {
          const memory = memoryFor(i);
          return {
            deckId: "deck",
            dueAt: memory.dueAt ?? EPOCH,
            id: String(i),
            state: memory.state,
            suspended: false,
          };
        }),
        deckId: "deck",
        now,
      }),
    [cards, memoryFor, now],
  );

  const head = queue[0];
  const index = head ? Number(head.id) : -1;
  const card = index >= 0 ? cards[index] : undefined;
  const memory = index >= 0 ? memoryFor(index) : null;

  const previews = useMemo(
    () => (memory ? previewAnswers(memory, elapsedFor(memory, now)) : null),
    [memory, now],
  );

  useEffect(() => {
    setShown(false);
  }, [index]);

  const grade = useCallback(
    (g: StudyGrade) => {
      if (!memory) return;
      const at = new Date();
      const answer = answerStudyCard(memory, g, elapsedFor(memory, at));
      const next = applyAnswer(memory, answer, at);
      onRemember(next);
      void saveCardMemory(userId, courseId, next);
      setNow(new Date());
    },
    [courseId, memory, onRemember, userId],
  );

  // Kept in step on every render, so the one key listener below always sees the current card
  // rather than the one it was bound on.
  shownRef.current = shown;
  gradeRef.current = grade;

  /**
   * 🔴 THE KEYBOARD IS THE POINT OF ANKI, NOT A SHORTCUT ON TOP OF IT. Space reveals, then 1 to 4
   * grade, and space again is Good. Somebody working a deck never touches the mouse, and a card app
   * that makes you aim at a button between every card is a different, slower thing.
   *
   * Bound to the window rather than to a focused element on purpose: there is nothing sensible to
   * focus, and requiring a click before the keys work is exactly the friction this removes. It
   * stands down while a field has focus, so typing in the chat never grades a card.
   */
  useEffect(() => {
    if (!started) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!shownRef.current) setShown(true);
        else gradeRef.current?.("good");
        return;
      }
      const pick = ["1", "2", "3", "4"].indexOf(e.key);
      if (pick >= 0 && shownRef.current) {
        e.preventDefault();
        gradeRef.current?.(GRADES[pick]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started]);

  if (cards.length === 0) return null;

  /* ---------------------------------------------------------------- the front door */

  if (!started) {
    return (
      <section className="flex flex-col items-center gap-[26px] pt-[40px]">
        <div className="flex flex-col items-center gap-[6px] text-center">
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.01em] text-(--ui-text-primary)">Flashcards</h1>
          <p className="m-0 text-[14px] text-(--course-quiet)">{sectionTitle}</p>
        </div>

        <div className="flex gap-[40px] rounded-[16px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-[40px] py-[22px]">
          <Count n={counts.fresh} what="new" />
          <Count n={counts.learning} what="learning" />
          <Count n={counts.due} what="to review" />
        </div>

        {queue.length > 0 ? (
          <button
            className="h-[42px] rounded-[10px] bg-(--ui-action) px-[26px] text-[15px] font-medium text-(--ui-action-glyph)"
            onClick={() => setStarted(true)}
            type="button"
          >
            Study now
          </button>
        ) : (
          // 🔴 NOT "well done", NOT a streak. Nothing here is a reward for turning up: it says what
          // is true, which is that the deck has nothing ready, and offers the way onward.
          <div className="flex flex-col items-center gap-[14px]">
            <p className="m-0 text-[14px] text-(--course-quiet)">Nothing is due in this deck right now.</p>
            <button
              className="h-[38px] rounded-[10px] border border-(--ui-stroke-tertiary) px-[18px] text-[14px] text-(--ui-text-primary) hover:bg-(--ui-bg-quaternary)"
              onClick={onFinish}
              type="button"
            >
              Take the test instead
            </button>
          </div>
        )}

        {!userId ? (
          <p className="m-0 max-w-[420px] text-center text-[12px] leading-[1.5] text-(--course-quiet)">
            Sign in to keep the schedule. Without an account the cards still work, but the spacing
            resets when you leave.
          </p>
        ) : null}
      </section>
    );
  }

  /* ---------------------------------------------------------------- the sitting */

  if (!card || !memory || !previews) {
    return (
      <section className="flex flex-col items-center gap-[20px] pt-[60px]">
        <p className="m-0 text-[15px] text-(--ui-text-primary)">That is the deck finished for now.</p>
        <div className="flex gap-[10px]">
          <button
            className="h-[38px] rounded-[10px] bg-(--ui-action) px-[18px] text-[14px] font-medium text-(--ui-action-glyph)"
            onClick={onFinish}
            type="button"
          >
            Go to the test
          </button>
          <button
            className="h-[38px] rounded-[10px] border border-(--ui-stroke-tertiary) px-[18px] text-[14px] text-(--ui-text-primary) hover:bg-(--ui-bg-quaternary)"
            onClick={() => setStarted(false)}
            type="button"
          >
            Back to the deck
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col pt-[10px]">
      <div className="flex items-center justify-between pb-[14px] text-[12px] tabular-nums text-(--course-meta)">
        <span>{sectionTitle}</span>
        <CountStrip due={counts.due} fresh={counts.fresh} learning={counts.learning} />
      </div>

      {/* 🔴 A FIXED HEIGHT, SO THE GRADE BUTTONS DO NOT MOVE BETWEEN CARDS. A box that grows to its
          content puts Good in a different place on every card, and a deck is worked by muscle memory
          at one card every few seconds. Filling the whole column instead left a short answer floating
          in a cavern. Long cards scroll inside the box rather than pushing the buttons down. */}
      <div className="flex h-[340px] flex-col justify-center overflow-y-auto rounded-[16px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-[38px] py-[36px] text-center">
        <p className="m-0 text-[22px] font-medium leading-[1.4] text-(--ui-text-primary)">{card.front}</p>
        {shown ? (
          <p className="m-0 mt-[26px] border-t border-(--ui-stroke-tertiary) pt-[26px] text-[17px] leading-[1.6] text-(--course-quiet)">
            {card.back}
          </p>
        ) : null}
      </div>

      <div className="pt-[16px]">
        {shown ? (
          // 🔴 THE INTERVAL IS PRINTED ON THE BUTTON, which is what Anki does and what makes the four
          // grades mean anything. Without it the only way to learn that Good is three days is to
          // press it and lose the card for three days.
          <div className="grid grid-cols-4 gap-[8px]">
            {GRADES.map((g) => (
              <button
                className="flex h-[52px] flex-col items-center justify-center gap-[2px] rounded-[10px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) hover:bg-(--ui-bg-quaternary)"
                key={g}
                onClick={() => grade(g)}
                type="button"
              >
                <span className="text-[11px] tabular-nums text-(--course-meta)">
                  {describeDelay(previews[g])}
                </span>
                <span className="text-[14px] font-medium text-(--ui-text-primary)">{LABEL[g]}</span>
              </button>
            ))}
          </div>
        ) : (
          <button
            className="h-[52px] w-full rounded-[10px] bg-(--ui-action) text-[15px] font-medium text-(--ui-action-glyph)"
            onClick={() => setShown(true)}
            type="button"
          >
            Show answer
          </button>
        )}
        {/* Said once, quietly. A keyboard shortcut nobody is told about is a keyboard shortcut
            nobody uses, and this is the difference between clicking through a deck and working one. */}
        <p className="m-0 pt-[10px] text-center text-[12px] text-(--course-quiet)">
          {shown ? "1 to 4 to grade, or space for Good" : "Space to reveal"}
        </p>
      </div>
    </section>
  );
}
