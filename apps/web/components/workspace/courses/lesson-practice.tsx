"use client";

// The three ways to practise that a written lesson already contains.
//
// Nemesis had multiple choice and a flashcard. wondering.app has nine kinds, and three of the seven
// we lacked need no new writing at all: a lesson's vocabulary and the sentences it appears in are
// the whole material. `lib/courses/practice.ts` derives them; this file is what they look like.
//
// 🔴 EVERY ONE OF THESE MARKS ITSELF AND EXPLAINS EITHER WAY, and none of them is scored. That is
// the same rule the `check` block in the reading path follows: a stop to think is not an exam, and
// putting a mark on it turns reading into a test and makes people stop clicking. The test is a
// separate surface, reached deliberately.

import { useState } from "react";

import { accepts, BLANK, type Practice } from "@/lib/courses/practice";

/* ---------------------------------------------------------------- shared */

function Verdict({ right, children }: { right: boolean; children: React.ReactNode }) {
  return (
    <div className="mt-[16px] border-t border-(--ui-stroke-tertiary) pt-[13px] text-[14px] leading-[1.6] text-(--course-quiet)">
      <span className="font-semibold" style={{ color: right ? "var(--course-right)" : "var(--course-wrong)" }}>
        {right ? "That is right. " : "Not quite. "}
      </span>
      {children}
    </div>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-[22px] py-[20px]">
      <div className="text-[12px] uppercase tracking-[0.06em] text-(--course-meta)">{label}</div>
      <div className="mt-[12px]">{children}</div>
    </div>
  );
}

/**
 * A prompt with its gap shown as a real gap.
 *
 * The sentinel is a literal `____` so the prompt still reads as a question in plain text, in a
 * screen reader, and anywhere the string is logged. Here it becomes the slot.
 */
function Prompt({ text, slot }: { text: string; slot: React.ReactNode }) {
  const [before, ...rest] = text.split(BLANK);
  return (
    <p className="m-0 text-[17px] leading-[1.75] text-(--ui-text-primary)">
      {before}
      {slot}
      {rest.join(BLANK)}
    </p>
  );
}

/* ---------------------------------------------------------------- type in */

function TypeIn({ practice, onAnswered }: { practice: Extract<Practice, { kind: "type_in" }>; onAnswered: () => void }) {
  const [typed, setTyped] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const right = accepts(typed, practice.answer);

  const submit = (): void => {
    if (typed.trim().length === 0 || submitted) return;
    setSubmitted(true);
    onAnswered();
  };

  return (
    <Frame label="Type in">
      <Prompt
        slot={
          <input
            aria-label="the missing word"
            className="mx-[3px] w-[170px] rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[10px] py-[4px] text-[16px] text-(--ui-text-primary) outline-none focus:border-(--ui-action) disabled:opacity-70"
            disabled={submitted}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            style={submitted ? { borderColor: right ? "var(--course-right)" : "var(--course-wrong)" } : undefined}
            value={typed}
          />
        }
        text={practice.prompt}
      />
      {submitted ? (
        <Verdict right={right}>
          {right ? "" : `The word is ${practice.answer}. `}
          {practice.why}
        </Verdict>
      ) : (
        <button
          className="mt-[16px] cursor-pointer rounded-[10px] border border-(--ui-stroke-tertiary) bg-transparent px-[16px] py-[8px] text-[14px] font-medium text-(--course-quiet) transition-colors duration-[90ms] hover:bg-(--ui-bg-tertiary) disabled:opacity-40"
          disabled={typed.trim().length === 0}
          onClick={submit}
          type="button"
        >
          Check
        </button>
      )}
    </Frame>
  );
}

/* ---------------------------------------------------------------- click and fill */

function PoolFill({ practice, onAnswered }: { practice: Extract<Practice, { kind: "pool_fill" }>; onAnswered: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const right = picked?.toLowerCase() === practice.answer.toLowerCase();

  return (
    <Frame label="Click and fill">
      <Prompt
        slot={
          <span
            className="mx-[3px] inline-block min-w-[130px] rounded-[8px] border-b-2 px-[10px] text-center align-baseline font-medium text-(--ui-text-primary)"
            style={{
              borderColor: picked ? (right ? "var(--course-right)" : "var(--course-wrong)") : "var(--ui-stroke-secondary)",
            }}
          >
            {picked ?? " "}
          </span>
        }
        text={practice.prompt}
      />
      <div className="mt-[18px] flex flex-wrap gap-[8px]">
        {practice.pool.map((word) => (
          <button
            className="cursor-pointer rounded-[999px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-[15px] py-[7px] text-[14px] text-(--ui-text-primary) transition-colors duration-[90ms] hover:bg-(--ui-bg-tertiary) disabled:cursor-default disabled:opacity-45"
            disabled={picked !== null}
            key={word}
            onClick={() => {
              setPicked(word);
              onAnswered();
            }}
            type="button"
          >
            {word}
          </button>
        ))}
      </div>
      {picked ? (
        <Verdict right={right}>
          {right ? "" : `The word is ${practice.answer}. `}
          {practice.why}
        </Verdict>
      ) : null}
    </Frame>
  );
}

/* ---------------------------------------------------------------- match pairs */

/**
 * Term on the left, definition on the right, click one of each.
 *
 * 🔴 THE DEFINITIONS ARE SHUFFLED BY A FIXED RULE, NOT BY `Math.random`. A random order makes the
 * screen different on every render React decides to do, which moves the row under a learner's
 * finger mid-click. Reversing the list is enough to break the giveaway of a matched pair sitting on
 * the same row, and it is stable.
 */
function MatchPairs({ practice, onAnswered }: { practice: Extract<Practice, { kind: "match" }>; onAnswered: () => void }) {
  const rights = [...practice.pairs].reverse();
  const [held, setHeld] = useState<string | null>(null);
  const [joined, setJoined] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const done = joined.size === practice.pairs.length;

  const chooseDefinition = (definition: string): void => {
    if (held === null) return;
    const correct = practice.pairs.find((p) => p.term === held)?.definition === definition;
    const next = new Map(joined).set(held, correct);
    setJoined(next);
    setHeld(null);
    if (next.size === practice.pairs.length) onAnswered();
  };

  const edge = (state: boolean | undefined, active: boolean): string =>
    state === true ? "var(--course-right)" : state === false ? "var(--course-wrong)" : active ? "var(--ui-action)" : "var(--ui-stroke-tertiary)";

  return (
    <Frame label="Match the pairs">
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-[10px]">
        <div className="flex flex-col gap-[8px]">
          {practice.pairs.map((pair) => (
            <button
              className="cursor-pointer rounded-[10px] border bg-(--ui-bg-elevated) px-[13px] py-[10px] text-left text-[14px] font-medium text-(--ui-text-primary) transition-colors duration-[90ms] disabled:cursor-default disabled:opacity-55"
              disabled={joined.has(pair.term)}
              key={pair.term}
              onClick={() => setHeld(pair.term)}
              style={{ borderColor: edge(joined.get(pair.term), held === pair.term) }}
              type="button"
            >
              {pair.term}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-[8px]">
          {rights.map((pair) => {
            const takenBy = [...joined.keys()].find(
              (term) => practice.pairs.find((p) => p.term === term)?.definition === pair.definition,
            );
            return (
              <button
                className="cursor-pointer rounded-[10px] border bg-(--ui-bg-elevated) px-[13px] py-[10px] text-left text-[13px] leading-[1.45] text-(--course-quiet) transition-colors duration-[90ms] disabled:cursor-default disabled:opacity-55"
                disabled={held === null || takenBy !== undefined}
                key={pair.definition}
                onClick={() => chooseDefinition(pair.definition)}
                style={{ borderColor: takenBy ? edge(joined.get(takenBy), false) : "var(--ui-stroke-tertiary)" }}
                type="button"
              >
                {pair.definition}
              </button>
            );
          })}
        </div>
      </div>
      {done ? (
        <Verdict right={[...joined.values()].every(Boolean)}>
          {[...joined.values()].every(Boolean)
            ? "All five pairs matched."
            : "The pairs marked in red went to the wrong definition."}
        </Verdict>
      ) : null}
    </Frame>
  );
}

/* ---------------------------------------------------------------- the screen */

export function PracticeScreen({ practice, onAnswered }: { practice: Practice; onAnswered: () => void }) {
  switch (practice.kind) {
    case "type_in":
      return <TypeIn onAnswered={onAnswered} practice={practice} />;
    case "pool_fill":
      return <PoolFill onAnswered={onAnswered} practice={practice} />;
    case "match":
      return <MatchPairs onAnswered={onAnswered} practice={practice} />;
  }
}
