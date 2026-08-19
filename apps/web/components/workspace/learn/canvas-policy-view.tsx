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

import { CONTINUE_LABEL } from "@/lib/learn/canvas-continue";
import { VERDICT_HEADLINE, verdictIsPass } from "@/lib/learn/canvas-judge";
import { advancesItself, type Exposition } from "@/lib/learn/cognitive-mode";

import { normalizeForIdentity } from "@/lib/learn/knowledge-identity";
import type { FigureKnowledge } from "@/lib/learn/knowledge-types";
import type { FigureLabel } from "@/lib/learn/figure-labels";
import { routeVisual } from "@/lib/learn/visual-route";
import { workedExampleFor } from "@/lib/learn/worked-example";

import { StoredFigureOcclusion } from "./figure-occlusion";
import { LearnerUtterance } from "./learner-utterance";
import type { PolicyRuntime } from "./use-policy-runtime";
import { correctionLead } from "./correction-copy";

/**
 * The affordance that turns a recognition screen into "produce it if you can, pick it if you cannot".
 *
 * 🔴🔴 A BUTTON RATHER THAN A TIMER, AND THE PRODUCT OBJECTIVE IS WHY. The learning-science finding
 * is that a chance to retrieve BEFORE seeing options is worth having; the laboratory protocol that
 * established it uses a forced delay. Nemesis optimises durable understanding per unit of ATTENTION,
 * so a countdown that makes every learner wait — the one who already knows it and the one who never
 * will alike — spends the very thing being optimised in order to reproduce an experimental control.
 * A press costs nothing to anyone who wants the options, and the learner who can produce the answer
 * types it and is credited with a production instead of a recognition.
 *
 * 🔴 EXPORTED SO A TEST CAN ASSERT THE SCREEN RATHER THAN THE STRING. A copy of this label in a test
 * file passes forever after the button is deleted.
 */
export const SHOW_CHOICES_LABEL = "Show the options";

/** `Verdict` is declared but not exported by canvas-judge, and that file is Runtime's — so the
 *  type is derived from the exported map rather than reaching across a lane boundary to add an
 *  export. It also means a new verdict cannot be added there without this map failing to compile,
 *  which is the behaviour I want: every verdict must be given a colour deliberately. */
type Verdict = keyof typeof VERDICT_HEADLINE;

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
  onContinue = null,
}: {
  runtime: PolicyRuntime;
  sharing?: boolean;
  /** §38 — non-null when THIS region is the one carrying a reading requirement right now. Decided
   *  by `continueOwner` for the whole surface, never here: a correction and an unread passage can
   *  legitimately be on screen together, and only one of them may offer a way on. */
  onContinue?: (() => void) | null;
}) {
  return (
    <>
      {runtime.forced && <ForcedNotice runtime={runtime} />}
      {/* 🔴 OPACITY ONLY, 140ms, AND NO TRANSFORM. Someone drilling fifty facts crosses this
          boundary fifty times; a slide or a scale would become the dominant impression of the
          surface and make retrieval feel like an interface being waited on rather than a question
          being answered. */}
      <div className={sharing ? "canvas-swap" : "canvas-swap min-h-full"} key={screenKey(runtime)}>
        <PolicyScreen onContinue={onContinue} runtime={runtime} sharing={sharing} />
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
      <p className="rounded-full bg-(--ui-bg-warning,#3a2f14) px-3 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        Ownership bypassed:{" "}
        {unrepresented === 1 ? "1 part of this canvas is" : `${unrepresented} parts of this canvas are`} hidden
      </p>
    </div>
  );
}

function PolicyScreen({
  onContinue,
  runtime,
  sharing,
}: {
  onContinue: (() => void) | null;
  runtime: PolicyRuntime;
  sharing: boolean;
}) {
  const { citations, decision, feedback, prompt } = runtime;

  // Feedback outranks the next prompt: someone who has just answered should read what it showed
  // before being asked the next thing, even though the policy has already moved on underneath.
  if (feedback) {
    return (
      <FeedbackScreen
        // 🔴 THE ACTION SURVIVES THE MASK, THE EXPOSITION DOES NOT — and this reads the one that
        // is still true. While a verdict is up, `use-policy-runtime` deliberately overwrites
        // `decision.exposition` with the VERDICT's, so the queued correction's own mode is not
        // legible from here. `decision.action` is untouched by that spread, so "is a correction
        // waiting?" is answerable and "how long would it hold?" is not — which is exactly why the
        // budget is handed over rather than split.
        correctionQueued={decision?.action.type === "show_correction"}
        exposition={runtime.exposition}
        onContinue={onContinue}
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
      <Frame onContinue={onContinue} sharing={sharing}>
        <h2 className="text-[length:var(--canvas-text-lead)] font-medium text-(--ui-text-primary)">
          {nothingReadable
            ? "Nemesis couldn't read this material"
            : partlyReadable
              ? "Nemesis could only partly read this material"
              : "Nothing to practise here right now"}
        </h2>
        <p className="mt-3 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)">
          {nothingReadable
            ? "The file is attached and safe. This is about our reading of it, not about your material."
            : partlyReadable
              ? "What came through is covered here. The rest wasn't read clearly enough to ask about. That's a gap in our reading, not a gap in what you know."
              : "You've shown everything this material asks for. Add more material, or come back to it later."}
        </p>
      </Frame>
    );
  }

  // 🔴 TWO ACTIONS SHARE THIS SCREEN, AND THAT IS THE PRODUCT RULE RATHER THAN A SAVING. §33: "the
  // learner never sees a difficulty setting change; the Canvas simply changes the task." A faded
  // worked example is a different TASK, not a different mode — no banner naming it, no label saying
  // this one is easier, nothing for a learner to choose between. What differs on screen is what the
  // question says and the part of the solution above it.
  if ((decision.action.type === "retrieve" || decision.action.type === "complete") && prompt) {
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
    // 🔴 §46.6 — A SPATIAL OBJECTIVE RENDERS ITS DIAGRAM, AND THE ENGINE CHOSE THAT, NOT A MODE.
    // The rule: image occlusion "should not become a separate 'image occlusion mode' the learner
    // manually manages. The cognition engine decides when a visual retrieval interaction is
    // useful." So this is the SAME `retrieve` action, on the same screen, with the same one
    // composer underneath — it simply has a picture to show because the knowledge is a diagram.
    // §48: the Canvas changes representation because the cognitive task changed, never because
    // the learner picked a mode.
    const occluded = occlusionFor(decision);

    return (
      <div className={`flex ${regionHeight(sharing)} flex-col items-center justify-center gap-6 px-6`}>
        {/* 🔴 THE PART OF THE SOLUTION THAT WAS SUPPLIED, AND THE EVIDENCE ROW ALREADY SAYS SO. This
            is the only thing that separates a completion from an ordinary ask on screen, and the
            `completion` rung on the row it writes is the claim that it was here. A completion whose
            `given` never rendered would be an unaided question filed as an assisted one. */}
        {prompt.given && prompt.given.length > 0 && (
          <ol className="w-full max-w-(--canvas-column) space-y-2 rounded-2xl px-5 py-4 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary)">
            {prompt.given.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ol>
        )}
        {occluded && (
          <StoredFigureOcclusion
            caption={occluded.figure.caption}
            hidden={occluded.hidden}
            labels={occluded.figure.labels}
            // 🔴 `assetPath`, NEVER `imageRef`. The latter names the figure inside its original
            // container and is not a URL; `occlusionFor` refuses a figure without a stored asset
            // precisely so this cannot fall back to it.
            path={occluded.figure.assetPath!}
          />
        )}
        <h2
          // Optically centred rather than mathematically: the composer occupies the bottom of the
          // screen, so true centre reads as low. `pb-40` above lifts the block into where the eye
          // expects the subject of the page to be.
          className="w-full max-w-(--canvas-column) text-center text-[length:var(--canvas-text-question)] font-medium leading-[1.4] text-balance text-(--ui-text-primary)"
        >
          {prompt.prompt}
        </h2>
      </div>
    );
  }

  if (decision.action.type === "recognise" && prompt?.choices) {
    // ── The recognition presentation ────────────────────────────────────────
    //
    // 🔴 THE SAME SCREEN AS A RETRIEVAL, WITH THE ANSWER SURFACE ON IT. Question at the top, nothing
    // else, and the options directly underneath. There is no card, no "select one" instruction, no
    // A/B/C/D lettering and no score: the learner presses the thing they think is right, which needs
    // no explaining, and every letter on screen would be one more thing read before the answer is
    // produced. Lettering would also have to survive the position balancer, which is exactly how a
    // stale letter comes to name the wrong option.
    //
    // 🔴🔴 THE QUESTION COMES FIRST AND THE OPTIONS COME ON REQUEST, WHICH IS A CHANGE OF SUBSTANCE
    // RATHER THAN OF LAYOUT. Painting the options with the question denies the learner the one thing
    // that would produce the stronger evidence: a moment to retrieve before the answer set is on
    // screen. The composer now receives an answer on this screen too — `use-policy-runtime` hosts a
    // task for every asking action — so someone who can produce it simply types it, and the row that
    // gets written says `independent` rather than `recognition` because that is what happened.
    //
    // 🔴 A BUTTON, NOT A COUNTDOWN, AND THE OBJECTIVE IS WHY. See `SHOW_CHOICES_LABEL`: the finding
    // is about the opportunity to retrieve, not about the waiting, and Nemesis is optimising
    // understanding per unit of ATTENTION — a forced delay spends exactly what is being optimised in
    // order to reproduce a laboratory control. Nobody waits, and nobody is blocked.
    //
    // 🔴 AND IT IS NOT A MODE. Nothing here was switched on; the policy decided, from this learner's
    // evidence, that this one question is better asked this way, and the next one will very probably
    // be typed again.
    const busy = runtime.judging || runtime.recording;
    return (
      <div className={`flex ${regionHeight(sharing)} flex-col items-center justify-center gap-8 px-6`}>
        <h2 className="w-full max-w-(--canvas-column) text-center text-[length:var(--canvas-text-question)] font-medium leading-[1.4] text-balance text-(--ui-text-primary)">
          {prompt.prompt}
        </h2>
        {runtime.choicesRevealed ? (
        <ul className="flex w-full max-w-(--canvas-column) flex-col gap-2">
          {prompt.choices.options.map((option) => (
            <li key={option.text}>
              <button
                className="w-full rounded-2xl px-4 py-3 text-left text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) disabled:opacity-50"
                disabled={busy}
                // 🔴 THE TEXT, NEVER THE INDEX. An index is only true of the layout that produced it,
                // and the layout is rebuilt whenever the canvas's pool changes. The durable row
                // stores this same string, so what the learner pressed stays readable with no stored
                // layout to resolve it against.
                onClick={() => void runtime.choose(option.text)}
                type="button"
              >
                {option.text}
              </button>
            </li>
          ))}
        </ul>
        ) : (
          // 🔴 AN ORDINARY BUTTON, SO KEYBOARD, TOUCH AND SCREEN READERS REACH IT FOR FREE. It is
          // also disabled while an answer is being read, for the same reason the options are: two
          // ways to resolve one question, both live, is two rows racing for one response id.
          <button
            className="rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) disabled:opacity-50"
            disabled={busy}
            onClick={runtime.revealChoices}
            type="button"
          >
            {SHOW_CHOICES_LABEL}
          </button>
        )}
      </div>
    );
  }

  if (decision.action.type === "worked_example") {
    // ── The demonstration ───────────────────────────────────────────────────
    //
    // 🔴 THE PROCESS, NOT THE CLAIM, WHICH IS THE WHOLE DIFFERENCE FROM THE `teach` SCREEN BELOW.
    // That one prints `cue → answer` and the source's sentence. This one prints the moves: where you
    // start, what you look up, how the parts compose, what you end up saying. A learner who could
    // not perform the operation gains nothing from meeting the conclusion a second time.
    //
    // 🔴 IT SHOWS THE ANSWER ON PURPOSE AND WRITES NOTHING. Modelling is not testing. Nothing about
    // what this learner has demonstrated changes as a result, because no evidence row exists to
    // change it — see `assistance-evidence.test.ts`.
    const modelled = workedExampleFor(decision);
    // 🔴 NO SILENT FALLBACK TO A DIFFERENT SCREEN. The controller only chooses this move after the
    // same builder said yes, so an empty result is a defect rather than a state. Dropping through to
    // the hold screen below would tell a learner to "come back shortly" in answer to a decision that
    // said the opposite — which is exactly the invisible failure this repo keeps finding.
    if (modelled.modelled) {
      return (
        <Frame onContinue={onContinue} sharing={sharing}>
          <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
            {modelled.modelled.lead}
          </p>
          <ol className="mt-4 list-decimal space-y-3 pl-5">
            {modelled.modelled.steps.map((step, index) => (
              <li
                className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)"
                key={`${index}-${step}`}
              >
                {step}
              </li>
            ))}
          </ol>
          <SourceTrail citations={citations} />
        </Frame>
      );
    }
  }

  if (decision.action.type === "show_correction") {
    // 🔴 THREE STATES SHARE THIS COMPONENT AND KEEP THEIR MEANINGS. `incorrect` had something to
    // repair, `partial` had something right worth keeping, and `not_demonstrated` had no attempt
    // at all — so the last one is never told it was wrong. They will diverge into different
    // teaching; sharing a first renderer is not the same as merging the states.
    const said = decision.state.status;
    return (
      // 🔴🔴 `advance` IS WHAT MAKES THIS SCREEN ENDABLE AT ALL, AND ITS ABSENCE WAS A DEAD END.
      // MEASURED IN A BROWSER, on a real pharmacokinetics lecture: a wrong typed answer produced
      // *"Here's the one to fix. Constant → Amount removed/time"* and then NOTHING — no Continue, no
      // timer, no way on, surviving a reload. The learner's canvas was over.
      //
      // The two halves each looked right on their own. `expositionFor({kind:"correction"})` returns
      // `transient` for an association recalled — one line, read in about a second — so §39 says the
      // screen ends ITSELF and `readingRequirementOf` correctly withholds the Continue. But the only
      // implementation of "ends itself" was inside `FeedbackScreen`. A screen that declares a timer
      // to a component that does not own one is a screen with no exit.
      <Frame
        advance={{ blocked: runtime.recording, exposition: runtime.exposition, onAcknowledge: runtime.acknowledge }}
        onContinue={onContinue}
        sharing={sharing}
      >
        {/* 🔴 FROM `correction-copy.ts`, NOT INLINE. Voice mode reads this same sentence, and two
            copies of it are two wordings that agree until somebody edits one. */}
        <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
          {correctionLead(said)}
        </p>
        <h2 className="mt-3 text-[length:var(--canvas-text-lead)] font-medium leading-snug text-(--ui-text-primary)">
          {decision.objective.cue} → {decision.objective.answer}
        </h2>
        <p className="mt-3 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)">
          {decision.knowledge.statement}
        </p>
        <SourceTrail citations={citations} />
        {/* 🔴 THE "Got it" BUTTON IS GONE — §I. Moving on is the composer's `✓` now, so the Canvas
            introduces no separate Next, Continue or Done reading. The behaviour it used to carry is
            not lost: this screen wrote no evidence, and something still has to say the learner has
            read it, which is exactly what `✓` means. What is lost is a second control competing
            with the composer for the same job. */}
      </Frame>
    );
  }

  if (decision.action.type === "teach" || decision.action.type === "simplify") {
    // 🔴🔴 A SEPARATE BRANCH FROM `show_correction`, AND THE DIFFERENCE IS A CLAIM ABOUT THE LEARNER.
    // That screen opens with "Here's the one to fix" because an attempt fell short. These two are
    // owed to material nobody has met, or to a learner tripping over the words, and neither of those
    // is being wrong. Routing them through the correction renderer would tell someone they had
    // failed at something they were never asked, which is the kind of false claim about a person
    // this codebase refuses everywhere else.
    //
    // 🔴 AND THEY SHARE ONE BRANCH BECAUSE THEY ARE ONE SCREEN. Both put the material in front of
    // the learner and wait; what differs is the language it arrives in, which is the controller's to
    // choose and not the renderer's. Two near-identical components would drift.
    const simplifying = decision.action.type === "simplify";
    return (
      // Same exit rule as the correction above, for the same reason: these declare an exposition and
      // must obey whichever ending it names.
      <Frame
        advance={{ blocked: runtime.recording, exposition: runtime.exposition, onAcknowledge: runtime.acknowledge }}
        onContinue={onContinue}
        sharing={sharing}
      >
        <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
          {simplifying ? "Same idea, plainer words." : "Worth having in front of you first."}
        </p>
        <h2 className="mt-3 text-[length:var(--canvas-text-lead)] font-medium leading-snug text-(--ui-text-primary)">
          {decision.objective.cue} → {decision.objective.answer}
        </h2>
        <p className="mt-3 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)">
          {decision.knowledge.statement}
        </p>
        {/* Same rule as the two screens below: a claim shown here keeps the origin it would have
            anywhere else, or the Canvas reads as having lost the source. */}
        <SourceTrail citations={citations} />
      </Frame>
    );
  }

  if (decision.action.type === "contrast") {
    return (
      // Declares `deliberate` today, so this changes nothing — passed anyway so that EVERY screen
      // carrying an exposition obeys the same exit rule. The dead end above happened because one
      // screen was the exception.
      <Frame
        advance={{ blocked: runtime.recording, exposition: runtime.exposition, onAcknowledge: runtime.acknowledge }}
        onContinue={onContinue}
        sharing={sharing}
      >
        <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">Two of these are getting mixed up.</p>
        <h2 className="mt-3 text-[length:var(--canvas-text-lead)] font-medium leading-snug text-(--ui-text-primary)">
          {decision.objective.cue} → {decision.objective.answer}
        </h2>
        {/* The list has a real marker now. Each row used to open with an em dash, which was the
            list's ONLY marker because the <ul> had none of its own — so the punctuation was doing
            structural work. That is a reason the design was wrong, not a reason to keep the em
            dash: a marker that means "list item" is better than one that means "aside", and the
            owner's rule is no em dashes on the Canvas. */}
        <ul className="mt-4 list-disc space-y-2 pl-5">
          {decision.action.competingWith.map((competing) => (
            <li className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)" key={competing}>
              not {competing}
            </li>
          ))}
        </ul>
        {/* 🔴 THE SAME CLAIM MUST NOT LOSE ITS ORIGIN BY CHANGING SCREENS. This branch shows a claim
            out of `decision` exactly as `show_correction` does, so a citation there and silence here
            would read as "we lost the source" — the disclosure failure canvas-provenance.ts exists
            to argue against. One component, both screens, one rule. */}
        <SourceTrail citations={citations} />
        {/* Its "Got it" is gone for the same reason as `show_correction`'s — see there. */}
      </Frame>
    );
  }

  // `defer` — everything here was acted on moments ago, and asking again now would measure working
  // memory rather than learning.
  return (
    <Frame onContinue={onContinue} sharing={sharing}>
      <h2 className="text-[length:var(--canvas-text-lead)] font-medium text-(--ui-text-primary)">Come back to this shortly</h2>
      <p className="mt-3 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)">
        You've just worked through everything here. Asking again this soon wouldn't tell either of us
        anything new.
      </p>
    </Frame>
  );
}


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
/**
 * The diagram this decision is asking about, and which part of it is covered — or null (§46.6).
 *
 * 🔴 IT READS THE OBJECTIVE'S OWN `labelKey`, NOT A COUNTER. Which label is hidden is part of WHAT
 * WAS ASKED: the objective identity carries it, so the figure shown is the figure that objective is
 * about, and a replay of the evidence can reconstruct exactly what the learner saw. Choosing here
 * — by round, by random, by anything local — would mean the screen and the evidence disagreed
 * about which part was covered, and the learner would be marked on a question nobody recorded.
 */
/**
 * Where the claim on screen came from, or nothing at all.
 *
 * 🔴 SILENCE IS A RENDERED STATE HERE, NOT AN OVERSIGHT. `citations` has already been resolved
 * through `groundCanonicalAnchor`, which returns null for an anchor this canvas cannot honestly
 * point at: a document it does not hold, a source that was never filed, a quote a reparse
 * dissolved. An empty list IS that refusal arriving at the surface. So there is no else branch, no
 * "source unknown", no greyed-out placeholder — a citation the learner could follow and find
 * nothing behind is worse than no citation, and this component is the only place that mistake
 * could be made.
 *
 * 🔴 ONE COMPONENT BECAUSE THE RULE IS ONE RULE. Two screens show a claim; both must disclose its
 * origin the same way, or the same fact appears sourced on one and unsourced on the other.
 */
function SourceTrail({ citations }: { citations: PolicyRuntime["citations"] }) {
  if (citations.length === 0) return null;

  return (
    <p className="mt-4 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
      From{" "}
      {citations
        .map((citation) => (citation.label ? `${citation.sourceTitle}, ${citation.label}` : citation.sourceTitle))
        .join(" · ")}
    </p>
  );
}

/**
 * The diagram this decision is asking about, and which part of it is covered — decided by the
 * ROUTER, not here (§41).
 *
 * 🔴 THE RULES USED TO LIVE IN THIS FUNCTION, AND THAT WAS THE SECOND VISUAL SYSTEM. §41 is
 * explicit that the router "must absorb that path; a second, parallel visual system is how one
 * product ends up with two of everything" — and it was already true: a source figure appeared
 * because of the four conditions written out here, while a semantic visual appeared because a
 * block happened to carry one, with nothing in the product comparing the two. Every condition
 * below now lives in `routeVisual`, where it is a pure function with tests, and this asks it.
 *
 * 🔴 THE NORMALISER IS PASSED IN RATHER THAN IMPORTED BY THE ROUTER. Which label matches an
 * objective is an IDENTITY question, and identity belongs to `knowledge-identity.ts` — a pure
 * routing module reaching for it would decide, in passing, that its notion of sameness is the
 * product's.
 */
function occlusionFor(decision: PolicyRuntime["decision"]): { figure: FigureKnowledge; hidden: FigureLabel } | null {
  if (!decision) return null;
  const route = routeVisual({
    knowledge: decision.knowledge,
    labelKey: decision.objective.parameters.labelKey,
    normalizeLabel: normalizeForIdentity,
    operation: decision.objective.capability,
  });
  if (route.decision !== "render" || route.representation !== "source_figure") return null;
  return { figure: route.figure, hidden: route.hidden };
}

function FeedbackScreen({
  correctionQueued,
  exposition,
  feedback,
  sharing,
  onAcknowledge,
  onContinue,
  recording,
}: {
  /** The policy has a `show_correction` ready for the moment this verdict is acknowledged, so the
   *  emission's exposure budget belongs to that screen rather than to this one. */
  correctionQueued: boolean;
  /** What is on screen to take in, and for how long — the runtime's §39 property, never derived
   *  here from the verdict, the action type or the length of the text. */
  exposition: Exposition;
  feedback: NonNullable<PolicyRuntime["feedback"]>;
  sharing: boolean;
  onAcknowledge: () => void;
  onContinue: (() => void) | null;
  recording: boolean;
}) {
  const verdict = feedback.evaluation.verdict;
  // 🔴 `passed` NOW DECIDES ONLY WHAT IS SHOWN, NEVER WHETHER THE SCREEN MOVES ON (§39). It still
  // selects the headline weight and whether the judge's prose renders, because those genuinely
  // depend on whether the answer was right. Advancement is `exposition` and nothing else.
  const passed = verdictIsPass(verdict);

  // ── §39: cognitive mode advances the screen, correctness does not ───────────
  //
  // 🔴 THIS INVERTS THE OLD RULE, IN BOTH DIRECTIONS. It used to be `passed` — a correct answer
  // moved on by itself and a wrong one waited for a press. §39: *"Correctness does not determine
  // advancement; cognitive mode does."* So a **deliberate** screen now waits even when the answer
  // was right (a correct association whose explanation is worth reading), and a **transient** one
  // advances even when it was wrong (`Valsartan → Losartan` — one word, about a second).
  //
  // 🔴 READ FROM `exposition`, NOT FROM `declaredCognitiveMode(decision)`. There is one case only
  // the runtime property can see: answer the last objective on a canvas and `decideNext` returns
  // null while the verdict is still up. Through the decision that reads as "the policy said
  // nothing" — which resolves to *requires reading* and puts a Continue on a passed association.
  //
  // 🔴 AND THE DURATION IS THE POLICY'S, WHICH IS WHY IT IS READ OFF THE UNION RATHER THAN
  // DEFAULTED. `exposureMs` exists only on the transient member, so there is no branch in which
  // this component could supply a number nobody chose. The old `MIN_VERDICT_READ_MS = 2000` was
  // this file's own constant and is deliberately gone.
  /**
   * How long this screen holds before it is eligible to move on.
   *
   * 🔴 ZERO WHEN A TRANSIENT CORRECTION IS ALREADY QUEUED, AND THAT IS THE WHOLE POINT.
   * `TRANSIENT_EXPOSURE_MS` is documented as *"the window for the WHOLE transient emission, not
   * per screen"*. A miss produces TWO screens — this verdict, then `show_correction` — and that is
   * measured rather than assumed: `decideNext` with one associative objective and a recorded miss
   * returns `show_correction` carrying its own `{ mode: "transient", exposureMs: 1500 }`. If both
   * spent it, an association miss would be three seconds and two fades, which is not "roughly 1–2
   * seconds" and is the exact `mini-lecture → Continue → retrieve` shape §39 bans.
   *
   * 🔴 THE BUDGET IS SPENT BY THE SCREEN CARRYING THE ANSWER, WHICH IS THE CORRECTION, NOT THIS
   * ONE. This screen shows the learner their own words back; the correction shows `cue → answer`.
   * The learner already knows what they typed, so holding it is the half of the emission worth
   * dropping. Zero is not "instant" in practice either — `recording` still gates the advance, and
   * that is a real wait on a real evidence write rather than an invented one.
   *
   * 🔴 IT IS NOT A FIX FOR THE FUSED SHAPE, AND SHOULD NOT BE MISTAKEN FOR ONE. Two screens with
   * one budget still fades twice. Rendering the verdict and the correction as ONE emission is the
   * better answer and is a content decision — what to drop when the judge's prose and
   * `knowledge.statement` both want the same beat — so it is Brain's, not this file's. Recorded on
   * #505 rather than quietly approximated here.
   */
  const holdMs = exposition.mode === "transient" ? (correctionQueued ? 0 : exposition.exposureMs) : null;

  // 🔴 THE TIMER MOVED INTO `Frame`, AND THAT MOVE IS A BUG FIX. It lived here, so only the VERDICT
  // screen could end itself — while `show_correction`, `teach` and `simplify` declare exactly the
  // same `transient` exposition and had no timer at all. See `Frame`.
  return (
    <Frame
      advance={{ blocked: recording, exposition, holdMs, onAcknowledge }}
      onContinue={onContinue}
      sharing={sharing}
    >
      {/* The learner's own words. They stay on screen — the verdict below is ABOUT them — but the
          attribution in front of them does not (§K): it tells the learner something they already
          know, in a voice that exists only to stage the exchange.
          🔴 THE QUOTE MARKS AND THE 24.75px ARE GONE, REPLACED BY THE BUBBLE (§46.2/§46.3).
          Quotation marks are punctuation, not ownership — they read as "someone said this", which
          is true of every line on the screen — and size was doing the rest of the work, which
          §46.3 forbids. `LearnerUtterance` says authorship structurally instead, at body size.
          🔴 A §K guard in canvas-policy-view.test.ts strips comments before checking, so prose
          like this cannot trip it; an earlier version grepped raw source and failed on this file's
          own header. A guard that cannot tell rendered copy from a comment about it gets "fixed"
          by deleting the explanation. */}
      <LearnerUtterance via={feedback.via}>{feedback.answer}</LearnerUtterance>

      {/* 🔴 NEMESIS'S VERDICT, AS A SENTENCE, ON EVERY OUTCOME INCLUDING A PASS.
          It used to render only on a miss, because the colour on the quote above carried the
          result — and the old comment said so: *"a score rendered as a sentence… the colour already
          says it"*. THAT ARGUMENT INVERTS ONCE THE COLOUR IS GONE. With blue meaning authorship,
          this is the only thing left that can carry the verdict, so it stops being redundant and
          becomes the entire signal.
          🔴 AND SILENCE WOULD BE AMBIGUOUS HERE IN A WAY IT IS NOT ELSEWHERE. Nemesis judges by
          MEANING, so a learner answering in their own informal words genuinely cannot tell whether
          they were understood. If a partial answer produced a headline and a pass produced nothing,
          silence would be the signal for success — and silence is also what a broken system
          produces. The learner could not tell "right" from "that didn't register".
          🔴 NOT A `✓`. That glyph already means two things (dictation's confirm, §12's Continue);
          a third would make it mean nothing. §17 licenses "a small ✓, a subtle state change, or
          simply the next thing" — this is the middle option, and it mints nothing new.
          🔴 NOT A CONTROL. It is read, not pressed. A pass still advances on its own after the
          readability floor; §17's ban is on the button, never on the sentence. */}
      <h2
        className={
          passed
            ? // Quieter on a pass, and that ordering is the contract's rather than a preference:
              // feedback intensity scales with information value. A pass carries little — three
              // words — so it is set at the secondary weight and does not compete with the answer
              // it is confirming. A miss carries the most and keeps its full weight and prose.
              "mt-4 text-[length:var(--canvas-text-body)] font-normal leading-snug text-(--ui-text-tertiary)"
            : "mt-4 text-[length:var(--canvas-text-lead)] font-medium leading-snug text-(--ui-text-primary)"
        }
      >
        {VERDICT_HEADLINE[verdict]}
      </h2>

      {!passed && (
        <>
          <p className="mt-3 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)">{feedback.evaluation.feedback}</p>
          {/* 🔴 THE "Continue" BUTTON IS GONE — §I. It is worth naming what it was: renaming `Next`
              to `Continue` once satisfied §K's banned-word list while leaving the prohibited
              behaviour — a control the learner must press to proceed — completely intact. Deleting
              the word was never the fix. Moving the job to the composer's `✓` is. */}
        </>
      )}
    </Frame>
  );
}

/** The single measure the rest of the canvas is set to, so the policy's page reads as the same
 *  column as the document and the composer rather than a fourth centred thing. */
/**
 * How a screen that is not asking anything ENDS. Exactly one implementation, for every such screen.
 *
 * 🔴🔴 IT USED TO LIVE INSIDE `FeedbackScreen`, WHICH MEANT ONLY THE VERDICT COULD END ITSELF —
 * AND A WRONG ANSWER LEFT THE LEARNER WITH NO WAY FORWARD AT ALL. Measured in a browser on a real
 * lecture: a wrong typed answer produced *"Here's the one to fix. Constant → Amount removed/time"*
 * and then nothing. No Continue, no timer, surviving a reload. The canvas was over.
 *
 * The two halves were each individually correct, which is why it survived. §39 says a one-line
 * association is `transient` — it ENDS ITSELF after about a second — so `readingRequirementOf`
 * rightly withholds the Continue, since offering one would be a button on a screen that is already
 * leaving. But "ends itself" was implemented in one component and declared by four. A screen that
 * names a timer to a component with no timer is a screen with no exit.
 *
 * 🔴 `blocked` STAYS IN THE GATE, AND DROPPING IT WOULD INVERT THE SAFE FAILURE. `submit()` sets
 * feedback BEFORE the evidence write finishes, so a timer alone could advance mid-write and the
 * learner could answer again with the answer still on screen — recording that echo as a real
 * demonstration. Advancing waits for the LATER of the two, so a bug here costs a missed advance,
 * never a fabricated one.
 */
interface ScreenExit {
  readonly exposition: Exposition;
  /** Advancing is refused while true — the last answer's evidence is still being written. */
  readonly blocked: boolean;
  /** Overrides the exposition's own window. `0` when a queued correction owns the budget instead;
   *  `null`/absent means "use what the policy declared". */
  readonly holdMs?: number | null;
  readonly onAcknowledge: () => void;
}

function useScreenExit(exit: ScreenExit | null): void {
  const latest = useRef(exit?.onAcknowledge);
  latest.current = exit?.onAcknowledge;
  const exposition = exit?.exposition ?? null;
  const blocked = exit?.blocked ?? false;
  // 🔴 THE DURATION IS THE POLICY'S, WHICH IS WHY IT IS READ OFF THE UNION RATHER THAN DEFAULTED.
  // `exposureMs` exists only on the transient member, so there is no branch in which this component
  // could supply a number nobody chose.
  const declared = exposition && exposition.mode === "transient" ? exposition.exposureMs : null;
  const holdMs = exit?.holdMs ?? declared;
  const selfAdvancing = exposition ? advancesItself(exposition) : false;

  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (holdMs === null) return;
    setHeld(false);
    const timer = window.setTimeout(() => setHeld(true), holdMs);
    return () => window.clearTimeout(timer);
  }, [holdMs]);

  useEffect(() => {
    if (!selfAdvancing || !held || blocked) return;
    latest.current?.();
  }, [blocked, held, selfAdvancing]);
}

function Frame({
  children,
  sharing = false,
  onContinue = null,
  advance = null,
}: {
  children: React.ReactNode;
  sharing?: boolean;
  /** §38 — the one button, when this screen is what the learner was asked to process. Null
   *  otherwise, and the decision is NOT made here: `continueTarget` answers it once for the whole
   *  surface, so the reading passage and the correction can never both offer one. */
  onContinue?: (() => void) | null;
  /**
   * How this screen ends when it does NOT get the button.
   *
   * 🔴 EVERY SCREEN CARRYING AN EXPOSITION MUST PASS THIS. `onContinue` and `advance` are the only
   * two exits there are, and `continueOwner` gives the button to at most one region — so a screen
   * with neither is a canvas the learner cannot leave. See `useScreenExit`.
   */
  advance?: ScreenExit | null;
}) {
  useScreenExit(advance);
  return (
    <div className={`flex ${regionHeight(sharing)} items-center justify-center px-6`}>
      <div className="w-full max-w-(--canvas-column)">
        {children}
        {/* §38 — below the material, exactly as it sits below a reading passage. Same word, same
            shape, same meaning: "I have finished processing this." The `✓` that used to carry this
            job lived in the composer; it moved here so there is ONE control with ONE label rather
            than a tick in one place and a word in another. */}
        {onContinue && (
          <button
            className="mt-8 rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            onClick={onContinue}
            type="button"
          >
            {CONTINUE_LABEL}
          </button>
        )}
      </div>
    </div>
  );
}
