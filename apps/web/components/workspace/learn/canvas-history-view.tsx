"use client";

// The Canvas while the learner is looking at something that already happened.
//
// 🔴 IT REPLACES THE LIVE SURFACE RATHER THAN JOINING IT, AND IT IS NOT A REGION IN
// `composeSurface`. That function decides which LIVE things may share the sheet — a reply, a
// teaching screen, a document — and its whole subject is competition for attention between things
// that are all happening now. History is not competing with them; it is a different mode of the
// whole Canvas. Adding it as a region would have made every existing rule in that file answer a
// question it was not written for.
//
// 🔴 READ-ONLY, AND NOTHING HERE CAN WRITE. There is no composer, no Continue, no answer sink.
// `reconstructMoment` returns a value and the learner model is a projection of an append-only
// table, so "rewinding does not roll back mastery" holds by construction rather than by care.
//
// 🔴 THE BANNER IS RESTRAINED AND PERMANENT WHILE IT APPLIES. Owner: *"Clearly see that I am
// viewing history."* One line, one control, no colour, no icon — but never absent, because the one
// genuinely dangerous state for this feature is a learner who thinks an old answer is the new one.
//
// 🔴🔴 THIS IS THE ONE PLACE THE LEARNER'S OWN WORDS APPEAR AS A BUBBLE, AND THE OWNER DREW THAT
// LINE HIMSELF (2026-08-26): *"the Canvas should pretty much just be like a regular conversation in
// ChatGPT. We're pretty much just gonna hide the messaging bubble except when user goes back with
// the rail. And then it pretty much just makes it easier to navigate."*
//
// The live canvas keeps contract rule 2: one exchange on the surface, the learner's sentence not
// rendered at all, the answer standing alone. That rule is about ATTENTION — what you are looking
// at NOW — and it has nothing to say about a moment you have deliberately gone back to read. There,
// the question is the only thing that makes the answer legible: "it depends on the solvent" means
// nothing without what was asked. So a rewound moment is drawn as the EXCHANGE it was.
//
// 🔴 `LearnerUtterance`, NOT A SECOND TREATMENT OF THE SAME THING. That component's header states
// the rule: §46.2 asks that a learner "be able to distinguish instantly: This came from me / This
// came from Nemesis", and that only holds if their words look the same every time they appear. What
// was here before was a grey left-bordered quote under an uppercase "You asked" label, invented for
// this screen alone, so the learner's words looked one way in the policy lane and another way here.
//
// 🔴 AND THE UPPERCASE LABELS WENT WITH IT. "YOU ASKED" over the learner's own sentence and
// "NEMESIS" over the answer are stage directions: the bubble already says whose words those are,
// which is the entire argument `LearnerUtterance` was written on. `Question` and `Correction` keep
// theirs, because those come from the policy lane and are NOT the same object as a chat answer.
//
// 🔴🔴 ALL OF THAT NOW LIVES IN `canvas-moment-body.tsx`, AND THIS FILE KEEPS ONLY THE BANNER.
// Owner, 2026-08-26: *"a different view, a different way to view outputs"* — which added a SECOND
// surface that draws a recorded moment, the whole conversation read end to end. The paragraph above
// is precisely the argument against letting the two style it independently, so the drawing moved to
// one component the day the second caller existed. What is left here is the only thing that is
// true of a REWIND and not of the conversation: this surface can be mistaken for the live Canvas,
// so it carries a banner saying it is not, and a way back.

import type { HistoricalMoment } from "@/lib/learn/canvas-history";
import { momentClock } from "@/lib/learn/canvas-history";

import { CanvasMomentBody } from "./canvas-moment-body";

export function CanvasHistoryView({
  moment,
  onReturn,
}: {
  moment: HistoricalMoment;
  onReturn: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-(--canvas-column) px-6 pt-8">
      {/* ── the banner ──────────────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-(--ui-stroke-secondary) pb-3">
        <span className="min-w-0 truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          Viewing earlier moment
          {momentClock(moment.occurredAt) && ` · ${momentClock(moment.occurredAt)}`}
        </span>
        <button
          className="shrink-0 rounded-md px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) transition-colors duration-150 hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--ui-stroke-primary)"
          onClick={onReturn}
          type="button"
        >
          Return to now
        </button>
      </div>

      {/* ── what happened ───────────────────────────────────────────────────────────────── */}
      {/* 🔴🔴 THE SAME COMPONENT THE CONVERSATION VIEW DRAWS, AND THAT IS WHY THIS FILE IS SHORT
          NOW. Both surfaces show one recorded moment; the only thing this one adds is the banner
          above, because it is the one that can be mistaken for the live Canvas. The bubble, the
          labels, the "Attached" list and the truncation notice all moved to
          `canvas-moment-body.tsx` the day a second surface needed them — see that file's header for
          the rule (§46.2: the learner's words must look the same every time they appear). */}
      <div className="canvas-swap">
        <CanvasMomentBody moment={moment} />
      </div>
    </div>
  );
}
