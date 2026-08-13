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

import { useEffect, useRef, useState } from "react";

import { VERDICT_HEADLINE, verdictIsPass } from "@/lib/learn/canvas-judge";

import type { PolicyRuntime } from "./use-policy-runtime";

/** `Verdict` is declared but not exported by canvas-judge, and that file is Runtime's — so the
 *  type is derived from the exported map rather than reaching across a lane boundary to add an
 *  export. It also means a new verdict cannot be added there without this map failing to compile,
 *  which is the behaviour I want: every verdict must be given a colour deliberately. */
type Verdict = keyof typeof VERDICT_HEADLINE;

/** What colour the learner's own words take once they have been read.
 *
 *  🔴 THE COLOUR IS THE FEEDBACK, which is why a pass needs no sentence. Green means it landed,
 *  amber means part of it did, red means it did not.
 *
 *  🔴 THIS IS NOT `--ui-action`. The accent is a MUTED green (oklch chroma ~0.06); success here is
 *  `--ui-green` at ~0.11, nearly twice the chroma, and it appears as TEXT rather than as a filled
 *  control. They are deliberately not the same green: one means "press this", the other means "you
 *  were right", and a learner should never have to work out which. */
const VERDICT_TONE: Record<Verdict, string> = {
  strong: "text-(--ui-green)",
  understood: "text-(--ui-green)",
  partial: "text-(--ui-yellow)",
  incorrect: "text-(--ui-red)",
  misconception: "text-(--ui-red)",
};

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

/**
 * @param sharing This task is on a surface that also holds reading material.
 *
 * 🔴 A COMPOSITION FACT, NOT A STYLE. It answers one question — does the task claim the whole
 * viewport, or does it size to itself so the document below stays reachable? Before step 7b it was
 * always the former, because the policy took the page and there was nothing underneath. Now a
 * canvas can hold both, and `min-h-full` would push the document a full screen down: technically
 * coexisting, practically invisible, and the learner would still see exactly one thing.
 *
 * 🔴 IT DOES NOT DECIDE WHAT THE TASK LOOKS LIKE. Type, spacing, weight and motion stay where they
 * were. When a task needs a genuinely different presentation — a causal reconstruction, an ordering
 * interaction — that is a surface for UI to design, and `runtime.task.tempo` is the signal for it.
 */
export function CanvasPolicyView({
  runtime,
  sharing = false,
}: {
  runtime: PolicyRuntime;
  sharing?: boolean;
}) {
  return (
    <>
      {runtime.forced && <ForcedNotice runtime={runtime} />}
      {/* 🔴 OPACITY ONLY, 140ms, AND NO TRANSFORM. Someone drilling fifty facts crosses this
          boundary fifty times; a slide or a scale would become the dominant impression of the
          surface and make retrieval feel like an interface being waited on rather than a question
          being answered. */}
      <div className={sharing ? "canvas-swap" : "canvas-swap min-h-full"} key={screenKey(runtime)}>
        <PolicyScreen runtime={runtime} sharing={sharing} />
      </div>
    </>
  );
}

/** How the policy's region sizes itself: the whole surface, or only what it needs. */
function regionHeight(sharing: boolean): string {
  return sharing ? "py-12" : "min-h-full pb-40";
}

/**
 * This session is running on a canvas the policy does not own.
 *
 * 🔴 IT IS ON SCREEN BECAUSE A BYPASS THAT LOOKED LIKE THE PRODUCT WORKING WOULD BE WORSE THAN NO
 * BYPASS AT ALL. The whole reason the previous `?policy=1` had to go is that a forced session and a
 * real one were indistinguishable, so "is ownership working?" could not be answered by using the
 * thing. This says which it is, and how much of the canvas is being hidden to do it.
 *
 * 🔴 AND IT DOES NOT VIOLATE "THE QUESTION IS THE WHOLE SCREEN". It appears only when someone has
 * deliberately typed `?policy=force`, so it can never reach a learner drilling facts. It sits above
 * the fade rather than inside it, so it does not re-animate between questions.
 */
function ForcedNotice({ runtime }: { runtime: PolicyRuntime }) {
  const { unrepresented } = runtime.coverage;
  return (
    <div className="pointer-events-none sticky top-0 z-30 flex justify-center pt-1">
      <p className="rounded-full bg-(--ui-bg-warning,#3a2f14) px-3 py-1 text-[0.6875rem] text-(--ui-text-tertiary)">
        Ownership bypassed:{" "}
        {unrepresented === 1 ? "1 part of this canvas is" : `${unrepresented} parts of this canvas are`} hidden
      </p>
    </div>
  );
}

function PolicyScreen({ runtime, sharing }: { runtime: PolicyRuntime; sharing: boolean }) {
  const { decision, feedback, prompt } = runtime;

  // Feedback outranks the next prompt: someone who has just answered should read what it showed
  // before being asked the next thing, even though the policy has already moved on underneath.
  if (feedback) {
    return (
      <FeedbackScreen
        feedback={feedback}
        onAcknowledge={runtime.acknowledge}
        recording={runtime.recording}
        sharing={sharing}
      />
    );
  }


  if (!decision) {
    // 🔴 THE HONEST EMPTY STATE, AND IT SAYS WHICH EMPTY IT IS. "Nothing is owed here", "we could
    // not read your file at all" and "we could only partly read your file" are three different
    // facts and must not collapse into one message (UI-001: a source gap is not a learner gap).
    //
    // 🔴 `degraded` USED TO FALL INTO THE MASTERY BRANCH. Before this, a canvas the parser could
    // only partly read, with nothing left to decide, told the learner "you've shown everything
    // this material asks for" — a claim about THEM fabricated from a gap in OUR reading, in the
    // opposite direction from the failure this component already guarded against. The sources
    // panel already shows `coverageNote` for exactly this canvas; this screen was contradicting it.
    const nothingReadable = runtime.outcome === "failed";
    const partlyReadable = runtime.outcome === "degraded";
    return (
      <Frame sharing={sharing}>
        <h2 className="text-[1.25rem] font-medium text-(--ui-text-primary)">
          {nothingReadable
            ? "Nemesis couldn't read this material"
            : partlyReadable
              ? "Nemesis could only partly read this material"
              : "Nothing to practise here right now"}
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">
          {nothingReadable
            ? "The file is attached and safe. This is about our reading of it, not about your material."
            : partlyReadable
              ? "What came through is covered here. The rest wasn't read clearly enough to ask about. That's a gap in our reading, not a gap in what you know."
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
      <div className={`flex ${regionHeight(sharing)} items-center justify-center px-6`}>
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
      <Frame sharing={sharing}>
        <p className="text-[0.8125rem] text-(--ui-text-quaternary)">
          {said === "partial"
            ? "You had part of this."
            : said === "not_demonstrated"
              ? "No attempt came back on this one. Here it is."
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
      <Frame sharing={sharing}>
        <p className="text-[0.8125rem] text-(--ui-text-quaternary)">Two of these are getting mixed up.</p>
        <h2 className="mt-3 text-[1.375rem] font-medium leading-snug text-(--ui-text-primary)">
          {decision.objective.cue} → {decision.objective.answer}
        </h2>
        {/* The list has a real marker now. Each row used to open with an em dash, which was the
            list's ONLY marker because the <ul> had none of its own — so the punctuation was doing
            structural work. That is a reason the design was wrong, not a reason to keep the em
            dash: a marker that means "list item" is better than one that means "aside", and the
            owner's rule is no em dashes on the Canvas. */}
        <ul className="mt-4 list-disc space-y-2 pl-5">
          {decision.action.competingWith.map((competing) => (
            <li className="text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)" key={competing}>
              not {competing}
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
    <Frame sharing={sharing}>
      <h2 className="text-[1.25rem] font-medium text-(--ui-text-primary)">Come back to this shortly</h2>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">
        You've just worked through everything here. Asking again this soon wouldn't tell either of us
        anything new.
      </p>
    </Frame>
  );
}

/** How long a passed retrieval holds its verdict before it is even eligible to move on by itself.
 *
 *  🔴 A READABILITY FLOOR, NOT A CORRECTNESS GATE. What decides when it is SAFE to advance is
 *  `recording`; this only decides how long the answer is guaranteed to sit still when the write
 *  happens to be fast, so a pass never flashes and vanishes. Advancing waits for the LATER of the
 *  two. */
const MIN_VERDICT_READ_MS = 2000;

/** The verdict, worn by the learner's own words.
 *
 *  🔴 GREEN IS THE PUNCTUATION. A correct answer used to print "That's it." above the quote. That
 *  is a score rendered as a sentence: it carries no information the learner does not already have,
 *  and the colour already says it (`canvas-interaction-model.md` §G — the colour selects the
 *  intensity). So on a pass the words turn green and NOTHING ELSE APPEARS.
 *
 *  🔴 SILENCE IS FOR `correct` ONLY. `partial`, `incorrect` and `misconception` keep their
 *  headline and their feedback, because there they carry something the learner does not have.
 *  Flattening all four into the same silence would be minimal mistaken for contextless.
 *
 *  🔴 AND A PASS DOES NOT WAIT FOR A CLICK. A "Continue" button passed the §K vocabulary check —
 *  the banned literal is "Next" — while failing the behaviour the rule exists for. The next thing
 *  materialises on its own. A correction keeps its button: that is a passage the learner needs
 *  time with, and `show_correction`/`contrast` wrote no evidence, so the click is the only thing
 *  stopping the same card being served again.
 *
 *  🔴 THE RACE IS CLOSED ON BOTH SIDES. `submit()` sets feedback BEFORE the evidence write
 *  finishes, so a timer alone could advance mid-write — and the learner could answer again with
 *  the answer still on screen, recording that echo as a real demonstration. `recording` is true
 *  for the whole span in which evidence disagrees with what the learner just did. `acknowledge()`
 *  also refuses outright while recording, so a bug in this gate costs a missed advance, never a
 *  fabricated one. The ref (not the callback) is in the deps: `acknowledge` is keyed on `decision`,
 *  which legitimately changes while this screen is up. */
function FeedbackScreen({
  feedback,
  sharing,
  onAcknowledge,
  recording,
}: {
  feedback: NonNullable<PolicyRuntime["feedback"]>;
  sharing: boolean;
  onAcknowledge: () => void;
  recording: boolean;
}) {
  const verdict = feedback.evaluation.verdict;
  const passed = verdictIsPass(verdict);

  const latestAcknowledge = useRef(onAcknowledge);
  latestAcknowledge.current = onAcknowledge;

  const [minReadDone, setMinReadDone] = useState(false);
  useEffect(() => {
    if (!passed) return;
    setMinReadDone(false);
    const timer = window.setTimeout(() => setMinReadDone(true), MIN_VERDICT_READ_MS);
    return () => window.clearTimeout(timer);
  }, [passed]);

  useEffect(() => {
    if (!passed || !minReadDone || recording) return;
    latestAcknowledge.current();
  }, [minReadDone, passed, recording]);

  return (
    <Frame sharing={sharing}>
      {/* The learner's own words, in the verdict's colour. The quote stays — the verdict is ABOUT
          these words — but the attribution in front of it does not (§K): it tells the learner
          something they already know, in a voice that exists only to stage the exchange.
          🔴 A §K guard in canvas-policy-view.test.ts strips comments before checking, so prose
          like this cannot trip it; an earlier version grepped raw source and failed on this file's
          own header. A guard that cannot tell rendered copy from a comment about it gets "fixed"
          by deleting the explanation. */}
      <p className={`text-[1.375rem] font-medium leading-snug ${VERDICT_TONE[verdict]}`}>“{feedback.answer}”</p>

      {!passed && (
        <>
          <h2 className="mt-4 text-[1.125rem] font-medium leading-snug text-(--ui-text-primary)">
            {VERDICT_HEADLINE[verdict]}
          </h2>
          <p className="mt-3 text-[1rem] leading-relaxed text-(--ui-text-secondary)">{feedback.evaluation.feedback}</p>
          <button
            className="mt-8 rounded-lg bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor)"
            onClick={onAcknowledge}
            type="button"
          >
            Continue
          </button>
        </>
      )}
    </Frame>
  );
}

/** The single measure the rest of the canvas is set to, so the policy's page reads as the same
 *  column as the document and the composer rather than a fourth centred thing. */
function Frame({ children, sharing = false }: { children: React.ReactNode; sharing?: boolean }) {
  return (
    <div className={`flex ${regionHeight(sharing)} items-center justify-center px-6`}>
      <div className="w-full max-w-(--canvas-column)">{children}</div>
    </div>
  );
}
