"use client";

// The last step: ask your first question.
//
// This is the second half of the core loop, and the reason the whole flow
// exists. A student who has just added a reading should leave onboarding
// already asking about it, not staring at an empty composer wondering what
// this thing does.
//
// THREE EXAMPLE PROMPTS, ALL FIELD-AGNOSTIC. Each one works for a case brief
// and for a thermodynamics chapter, because none of them names a subject. They
// are buttons, not text to copy: one press closes onboarding and puts the words
// in the composer, ready to send or edit. Nothing is sent on the student's
// behalf.
//
// The prompts change slightly depending on whether any material was added, so
// a student who skipped the previous step is not asked about "what I just
// added" when they added nothing.

import { MessageCircle } from "@/lib/workspace/icons";

interface StepQuestionProps {
  /** Whether at least one file landed in the Library on the previous step. */
  hasMaterial: boolean;
  /** The student's course names, so a prompt can name one where there is
   *  exactly one. With several, the prompt stays generic. */
  courses: readonly string[];
  onPick: (prompt: string) => void;
}

/** The prompts offered. Exported so a test can check they never name a field. */
export function firstQuestionPrompts(hasMaterial: boolean, courses: readonly string[]): string[] {
  const course = courses.length === 1 ? courses[0] : null;
  if (hasMaterial) {
    return [
      "Explain the hardest idea in what I just added",
      course ? `Make me a study plan for ${course}` : "Make me a study plan for this course",
      "Quiz me on this material",
    ];
  }
  return [
    course ? `What should I focus on first in ${course}?` : "What should I focus on first in my course?",
    course ? `Make me a study plan for ${course}` : "Make me a study plan for this course",
    "Explain a hard idea from my course in plain words",
  ];
}

export function StepQuestion({ courses, hasMaterial, onPick }: StepQuestionProps) {
  const prompts = firstQuestionPrompts(hasMaterial, courses);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Ask your first question</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasMaterial
            ? "Nemesis has read what you added. Pick a question to start with, or skip and type your own."
            : "Pick a question to start with, or skip and type your own. You can add material any time."}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {prompts.map((prompt) => (
          <li key={prompt}>
            <button
              className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-(--ui-accent) hover:bg-(--ui-accent)/5"
              onClick={() => onPick(prompt)}
              type="button"
            >
              <MessageCircle className="shrink-0 text-muted-foreground" size={16} />
              <span>{prompt}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-[0.6875rem] text-muted-foreground">
        The words land in the chat box for you to edit or send. Nothing is sent until you press send.
      </p>
    </div>
  );
}
