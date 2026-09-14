"use client";

// One answer option, and how a marked one shows what happened.
//
// 🔴 COLOUR AND MARK TOGETHER, NEVER COLOUR ALONE. This was monochrome first, on the reasoning that
// the owner had settled (#28fb6c82) that the character is the app's only accent. He corrected that
// on 2026-09-04: *"it also feels a bit too monochrome, add red and green for tests."* The rule he
// set was about the product's identity, and right-versus-wrong is information rather than identity.
//
// The tick and the cross STAY. Roughly one man in twelve cannot separate these two hues, and colour
// is also the first thing lost to a bad screen or a photocopy. Colour is the fast signal; the mark
// is the one that always works. Removing either would be a downgrade.
//
// Shared by the passage's checks and by the test, so the two can never drift into saying the same
// thing two different ways.

export type ChoiceMark = "unmarked" | "chosen" | "correct" | "wrong" | "passed-over";

export function markFor(index: number, picked: number | null, answer: number, marked: boolean): ChoiceMark {
  if (!marked) return index === picked ? "chosen" : "unmarked";
  if (index === answer) return "correct";
  if (index === picked) return "wrong";
  return "passed-over";
}

function Tick() {
  return (
    <svg aria-hidden="true" fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="15">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

function Cross() {
  return (
    <svg aria-hidden="true" fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 16 16" width="15">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

const LETTERS = "ABCDEFGH";

export function AnswerChoice({
  label,
  index,
  mark,
  onPick,
}: {
  label: string;
  index: number;
  mark: ChoiceMark;
  onPick: () => void;
}) {
  const style =
    mark === "correct"
      ? { background: "var(--course-right-wash)", borderColor: "var(--course-right)" }
      : mark === "wrong"
        ? { background: "var(--course-wrong-wash)", borderColor: "var(--course-wrong)" }
        : mark === "chosen"
          ? { borderColor: "var(--ui-text-primary)" }
          : mark === "passed-over"
            ? { opacity: 0.5 }
            : undefined;

  return (
    <button
      className="flex w-full items-start gap-[10px] rounded-[10px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-[13px] py-[9px] text-left text-[14px] leading-[1.45] text-(--ui-text-primary) disabled:cursor-default"
      disabled={mark !== "unmarked" && mark !== "chosen"}
      onClick={onPick}
      style={style}
      type="button"
    >
      <span className="shrink-0 pt-[1px] text-(--course-meta)">{LETTERS[index]}</span>
      <span className="grow">{label}</span>
      {/* The mark sits at the end of the row so a column of them reads down the list. */}
      {mark === "correct" ? (
        <span className="shrink-0 pt-[1px]" style={{ color: "var(--course-right)" }} title="The right answer">
          <Tick />
        </span>
      ) : mark === "wrong" ? (
        <span className="shrink-0 pt-[1px]" style={{ color: "var(--course-wrong)" }} title="What you picked">
          <Cross />
        </span>
      ) : null}
    </button>
  );
}
