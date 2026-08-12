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

import { VERDICT_HEADLINE } from "@/lib/learn/canvas-judge";

import type { PolicyRuntime } from "./use-policy-runtime";

/**
 * What is on screen right now, as one value.
 *
 * 🔴 THE FADE IS KEYED ON THIS AND NOTHING ELSE. React remounts on a changed key, which is what
 * makes the 140ms entry fade run exactly once per real change of state — and, just as importantly,
 * NOT run when the same question re-renders because evidence reloaded or the clock moved. A fade
 * that retriggered on every render would strobe the question while the learner was reading it.
 */
function screenKey(runtime: PolicyRuntime): string {
  if (runtime.feedback) return `feedback:${runtime.feedback.answer}`;
  if (!runtime.decision) return "empty";
  return `${runtime.decision.action.type}:${runtime.prompt?.id ?? runtime.decision.objective.identityKey}`;
}

export function CanvasPolicyView({ runtime }: { runtime: PolicyRuntime }) {
  return (
    // 🔴 OPACITY ONLY, 140ms, AND NO TRANSFORM. Someone drilling fifty facts crosses this boundary
    // fifty times; a slide or a scale would become the dominant impression of the surface and make
    // retrieval feel like an interface being waited on rather than a question being answered.
    <div className="canvas-swap min-h-full" key={screenKey(runtime)}>
      <PolicyScreen runtime={runtime} />
    </div>
  );
}

function PolicyScreen({ runtime }: { runtime: PolicyRuntime }) {
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
    // ── The retrieval presentation ──────────────────────────────────────────
    //
    // 🔴 THE QUESTION IS THE WHOLE SCREEN, AND EVERYTHING REMOVED FROM HERE WAS REMOVED ON PURPOSE.
    // An associative fact is answered in about a second, so anything else on the page is read
    // BEFORE the answer is produced and costs exactly the thing being measured. Gone: the "answer
    // below" instruction (the composer is the only control, blinking), and the "I don't know this
    // one" button — a learner who does not know can say so, and `isAdmissionOfNotKnowing` sends it
    // down the same no-demonstration path the button used, so the MEANING survives the control.
    //
    // 🔴 AND NOTHING TOOK THEIR PLACE. No card, no border, no hint, no progress count, no "1 of 4".
    // The empty space IS the design: question, silence, one place to answer.
    //
    // 🔴 NO SPINNER EITHER. Judging already disables the composer and changes its placeholder, so a
    // second "reading your answer" line would be a status message the learner reads while waiting
    // — the only thing on screen competing with the question they just answered.
    //
    // This is for FAST RETRIEVAL specifically. A conceptual or diagnostic interaction may need
    // scaffolding, and it should render its own thing rather than loosening this one.
    return (
      <div className="flex min-h-full items-center justify-center px-6 pb-40">
        <h2
          // Optically centred rather than mathematically: the composer occupies the bottom of the
          // screen, so true centre reads as low. `pb-40` above lifts the block into where the eye
          // expects the subject of the page to be.
          className="w-full max-w-(--canvas-column) text-center text-[1.75rem] font-medium leading-snug text-balance text-(--ui-text-primary)"
        >
          {prompt.prompt}
        </h2>
      </div>
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
