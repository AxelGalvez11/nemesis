"use client";

// Stats — a DESTINATION that exists and says what it will hold. Deliberately not built out.
//
// 🔴 WHAT LIVES INSIDE IS UNSPECIFIED, SO NOTHING IS INVENTED HERE (§L, owner 2026-08-13).
// Stats is named in the navigation spec as "what Nemesis knows about your cognition" and as the
// surface §K sends learner-facing progress to — for learners who deliberately ask. The spec stops
// there, and a page that guessed at charts would be a claim about the learner made up by the UI.
//
// 🔴 AND THAT IS THE INVARIANT THIS LANE EXISTS TO PROTECT, not merely scope discipline.
// Presentation may never turn Nemesis's uncertainty into a claim about the learner. An empty
// progress bar reads as zero; a "0%" reads as failure; a chart with no data reads as a learner who
// has done nothing. `unknown` is not the bottom of a scale — it sits outside the ordering. So this
// page says what it is FOR and says plainly that it is not ready, which is the one honest thing a
// surface with no data can do.

export default function StatsPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[42rem] flex-col justify-center px-6 py-16">
      <h1 className="text-[1.5rem] font-medium tracking-[-0.01em] text-(--ui-text-primary)">Stats</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">
        This is where what Nemesis has learned about your thinking will live: which ideas are
        holding, which are fading, and when they are due to come back.
      </p>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">
        It is not built yet. Nothing is shown here rather than a number that would have to be
        invented. An empty chart would say you had done nothing, which is a different claim from
        Nemesis not having asked you yet.
      </p>
    </div>
  );
}
