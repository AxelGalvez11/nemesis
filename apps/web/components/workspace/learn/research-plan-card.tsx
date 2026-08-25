"use client";

// What a Deep research run is about to go and find out, shown BEFORE it spends anything.
//
// 🔴🔴 THIS CARD IS THE SAFETY PROPERTY, NOT A FLOURISH. A run is about a minute of wall-clock and
// several metered searches out of a monthly budget shared with ordinary chat search. The thing that
// makes an expensive action safe is not making it cheaper; it is showing somebody what is about to
// happen while they can still stop it. Planning costs one model call and no searches, so the
// preview is affordable and everything expensive waits behind Start.
//
// 🔴 IT IS NOT A CLARIFYING QUESTION. `canvas-clarification.tsx` parks a turn because the model
// could not tell what was meant. Nothing is ambiguous here: the learner declared Deep research and
// the plan is Nemesis reporting what it understood. So the card asks for confirmation, never for
// information, and Cancel is a complete and normal answer rather than a refusal to engage.
//
// 🔴 NO COUNTDOWN, AND THAT IS A DELIBERATE DIFFERENCE FROM THE REFERENCE. ChatGPT's version starts
// itself after about a minute. A timer that spends a metered budget because somebody walked away
// from their desk is the one behaviour this card exists to prevent, so Nemesis waits.

import { Codicon } from "@/components/desktop-ui/codicon";

export interface ResearchPlanCardProps {
  question: string;
  subQuestions: readonly string[];
  onStart: () => void;
  onCancel: () => void;
  /** True once Start has been pressed, so the card cannot be fired twice. */
  starting?: boolean;
}

export function ResearchPlanCard({ question, subQuestions, onStart, onCancel, starting = false }: ResearchPlanCardProps) {
  return (
    // 🔴 `ring-1 ring-(--ui-stroke-secondary)`, MATCHING canvas-clarification.tsx, and it is not a
    // style preference. The first version used `border-(--ui-border-secondary)`, and that token
    // does not exist: measured in the browser it resolves to the empty string, so the card shipped
    // with an invisible border and looked deliberate. Two other places in this folder still use it
    // and are transparent for the same reason.
    <section
      aria-label="Research plan"
      className="canvas-swap my-3 rounded-2xl p-4 text-(--ui-text-primary) ring-1 ring-(--ui-stroke-secondary)"
    >
      <h3 className="m-0 text-[length:var(--canvas-text-body)] font-medium">{question}</h3>
      <ul className="mt-3 mb-0 grid list-none gap-2.5 p-0">
        {subQuestions.map((sub) => (
          <li className="flex items-start gap-2.5" key={sub}>
            {/* Open circles rather than ticks: nothing has been done yet, and a tick beside work
                that has not started is the kind of small lie that makes a progress display
                worthless. */}
            <Codicon className="mt-0.5 shrink-0 text-(--ui-text-quaternary)" name="circle-large-outline" size="15px" />
            <span className="text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)">{sub}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-end gap-2">
        {/* 🔴 THE TWO MUST NOT LOOK ALIKE, and this is the one place in the card where that is a
            correctness question rather than a taste one: Start spends about a minute and several
            metered searches, Cancel spends nothing. Quiet outline against filled, so the
            money-spending one is the one that looks like a commitment.

            🔴 `bg-(--ui-action) text-(--ui-bg-editor)` IS THE COMPOSER'S OWN SEND BUTTON, copied
            rather than invented. My first two attempts used `--ui-text-primary` and then
            `--ui-accent-ink`; the second does not exist at all, which I found by reading the
            computed value in a browser rather than by reading the code. A colour token that does
            not resolve fails silently and looks intentional. */}
        <button
          className="rounded-full bg-transparent px-3.5 py-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) disabled:opacity-50"
          disabled={starting}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-full bg-(--ui-action) px-4 py-1.5 text-[length:var(--canvas-text-small)] font-medium text-(--ui-bg-editor) transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={starting}
          onClick={onStart}
          type="button"
        >
          {starting ? "Starting…" : "Start"}
        </button>
      </div>
    </section>
  );
}
