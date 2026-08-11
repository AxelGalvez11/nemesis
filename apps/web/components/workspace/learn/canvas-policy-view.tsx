"use client";

// What the policy decided, on the page.
//
// 🔴 A RENDERER, NOT A STAGE. There is no "next" button that advances a pipeline, no step counter,
// no Learn → Recall → Test. The page shows one action; the learner does it; evidence lands; the
// policy is asked again and the page shows whatever it says then. If it says the same thing twice
// that is because the learner's state deserves it, not because a sequence had two steps left.
//
// 🔴 AND THERE IS NO ANSWER BOX HERE. The persistent composer is the one answer surface on the
// canvas; a retrieval prompt that grew its own textarea would put two of them on screen, which is
// the exact thing the composer's own header says it exists to prevent.

import { Codicon } from "@/components/desktop-ui/codicon";
import { VERDICT_HEADLINE } from "@/lib/learn/canvas-judge";

import type { PolicyRuntime } from "./use-policy-runtime";

export function CanvasPolicyView({ runtime }: { runtime: PolicyRuntime }) {
  const { decision, feedback, prompt } = runtime;

  // Feedback outranks the next prompt: someone who has just answered should read what it showed
  // before being asked the next thing, even though the policy has already moved on underneath.
  if (feedback) {
    return (
      <Frame>
        <p className="text-[0.8125rem] text-(--ui-text-quaternary)">You said “{feedback.answer}”</p>
        <h2 className="mt-3 text-[1.375rem] font-medium leading-snug text-(--ui-text-primary)">
          {VERDICT_HEADLINE[feedback.evaluation.verdict]}
        </h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-(--ui-text-secondary)">
          {feedback.evaluation.feedback}
        </p>
        <button
          className="mt-8 rounded-lg bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor)"
          onClick={runtime.acknowledge}
          type="button"
        >
          Continue
        </button>
      </Frame>
    );
  }

  if (!decision) {
    // 🔴 THE HONEST EMPTY STATE, AND IT SAYS WHICH EMPTY IT IS. "Nothing is owed here" and "we
    // could not read your file" are opposite facts that both produce no objectives.
    const nothingReadable = runtime.outcome === "failed";
    return (
      <Frame>
        <h2 className="text-[1.25rem] font-medium text-(--ui-text-primary)">
          {nothingReadable ? "Nemesis couldn't read this material" : "Nothing to practise here right now"}
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">
          {nothingReadable
            ? "The file is attached and safe — this is about our reading of it, not about your material."
            : "You've shown everything this material asks for. Add more material, or come back to it later."}
        </p>
      </Frame>
    );
  }

  if (decision.action.type === "retrieve" && prompt) {
    return (
      <Frame>
        {/* 🔴 NO ORIENTATION SCREEN, NO LEVEL QUESTION, NO "I've read this". Nemesis has no evidence
            for this objective, and the fastest honest way to get some is to ask. Telling first
            would assert something about the learner that nobody has observed. */}
        <h2 className="text-[1.5rem] font-medium leading-snug text-(--ui-text-primary)">{prompt.prompt}</h2>
        <p className="mt-4 text-[0.8125rem] text-(--ui-text-quaternary)">
          Answer below. If you don't know it, say so — that's useful too.
        </p>
        <button
          className="mt-6 text-[0.8125rem] text-(--ui-text-tertiary) underline underline-offset-4 hover:text-(--ui-text-primary) disabled:opacity-40"
          disabled={runtime.judging}
          onClick={() => void runtime.admitUnknown()}
          type="button"
        >
          I don't know this one
        </button>
        {runtime.judging && (
          <p className="mt-6 flex items-center gap-2 text-[0.8125rem] text-(--ui-text-tertiary)">
            <Codicon name="loading" size="0.8125rem" />
            Reading your answer…
          </p>
        )}
      </Frame>
    );
  }

  if (decision.action.type === "show_correction") {
    // 🔴 THREE STATES SHARE THIS COMPONENT AND KEEP THEIR MEANINGS. `incorrect` had something to
    // repair, `partial` had something right worth keeping, and `not_demonstrated` had no attempt
    // at all — so the last one is never told it was wrong. They will diverge into different
    // teaching; sharing a first renderer is not the same as merging the states.
    const said = decision.state.status;
    return (
      <Frame>
        <p className="text-[0.8125rem] text-(--ui-text-quaternary)">
          {said === "partial"
            ? "You had part of this."
            : said === "not_demonstrated"
              ? "No attempt came back on this one — here it is."
              : "Here's the one to fix."}
        </p>
        <h2 className="mt-3 text-[1.375rem] font-medium leading-snug text-(--ui-text-primary)">
          {decision.objective.cue} → {decision.objective.answer}
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">
          {decision.knowledge.statement}
        </p>
        <button
          className="mt-8 rounded-lg bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor)"
          onClick={runtime.acknowledge}
          type="button"
        >
          Got it
        </button>
      </Frame>
    );
  }

  if (decision.action.type === "contrast") {
    return (
      <Frame>
        <p className="text-[0.8125rem] text-(--ui-text-quaternary)">Two of these are getting mixed up.</p>
        <h2 className="mt-3 text-[1.375rem] font-medium leading-snug text-(--ui-text-primary)">
          {decision.objective.cue} → {decision.objective.answer}
        </h2>
        <ul className="mt-4 space-y-2">
          {decision.action.competingWith.map((competing) => (
            <li className="text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)" key={competing}>
              — not {competing}
            </li>
          ))}
        </ul>
        <button
          className="mt-8 rounded-lg bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor)"
          onClick={runtime.acknowledge}
          type="button"
        >
          Got it
        </button>
      </Frame>
    );
  }

  // `defer` — everything here was acted on moments ago, and asking again now would measure working
  // memory rather than learning.
  return (
    <Frame>
      <h2 className="text-[1.25rem] font-medium text-(--ui-text-primary)">Come back to this shortly</h2>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">
        You've just worked through everything here. Asking again this soon wouldn't tell either of us
        anything new.
      </p>
    </Frame>
  );
}

/** The single measure the rest of the canvas is set to, so the policy's page reads as the same
 *  column as the document and the composer rather than a fourth centred thing. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-6 pb-40">
      <div className="w-full max-w-(--canvas-column)">{children}</div>
    </div>
  );
}
