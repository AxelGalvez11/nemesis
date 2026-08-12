"use client";

// The Learning Canvas surface.
//
// One page that becomes whatever the learner needs next. There is no message list, no
// assistant column, and no route change between reading, recalling and being tested — the
// canvas itself is the interface, and the command bar is the only control.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Codicon } from "@/components/desktop-ui/codicon";
import { canvasCapture } from "@/lib/learn/canvas-analytics";
import type { CanvasBlock } from "@/lib/learn/canvas-model";
import { buildAnchor, surroundingSentence, type CanvasSelection } from "@/lib/learn/canvas-selection";
import { nextAction } from "@/lib/learn/canvas-state";
import type { PolicyOverride } from "@/lib/learn/policy-override";
import type { MarkedTerm } from "@/lib/learn/canvas-vocabulary";

import { CanvasComposer } from "./canvas-composer";
import { CanvasDocument } from "./canvas-document";
import { CanvasHeader } from "./canvas-header";
import { CanvasPolicyView } from "./canvas-policy-view";
import { CanvasThinking } from "./canvas-thinking";
import { CanvasSelectionMenu, type SelectionAnswer } from "./canvas-selection-menu";
import { useCanvasSelection } from "./use-canvas-selection";
import {
  CanvasComplete,
  CanvasDiagnosis,
  CanvasEmpty,
  CanvasRecall,
  CanvasTest,
} from "./canvas-stages";
import { useCanvasSession, type ActiveTask } from "./use-canvas-session";
import { usePolicyRuntime } from "./use-policy-runtime";

export function LearningCanvas({
  canvasId,
  openingAsk = null,
  policyOverride = null,
}: {
  canvasId: string | null;
  /** What the learner typed on the home surface before this canvas existed.
   *
   *  Carried through so starting from the landing composer does not make them say it twice —
   *  the home has no canvas to send it to yet, so the instruction travels in the URL and is
   *  consumed exactly once here. */
  openingAsk?: string | null;
  /** What the URL asked for, if anything — a stop, or a deliberate bypass of ownership.
   *
   *  🔴 THE DEFAULT IS THE POINT, AND IT IS `null`. Whether the policy takes this canvas is decided
   *  from what its sources contain (`policyOwnsCanvas`), so there is nothing here for an ordinary
   *  visit to say. See policy-override.ts. */
  policyOverride?: PolicyOverride;
}) {
  const router = useRouter();
  const session = useCanvasSession(canvasId);
  const { canvas, busy, error } = session;
  const policy = usePolicyRuntime(canvas, policyOverride);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selected = useMemo(
    () => canvas.blocks.filter((block) => selectedIds.includes(block.id)),
    [canvas.blocks, selectedIds],
  );

  // 🔴 `selectionchange` fires continuously while a drag is in progress, so recording an event
  // per call produced dozens of canvas_text_selected rows for one highlight — and the canvas it
  // was given was a fabricated `{id:"", state:"learn"}`, so `canvas_id` was blank and nothing
  // could be joined to it. One event per distinct selection, carrying the real canvas.
  const lastSelection = useRef<string>("");
  const onSelect = useCallback(
    (ids: string[]) => {
      setSelectedIds(ids);
      const key = ids.join(",");
      if (key === lastSelection.current) return;
      lastSelection.current = key;
      canvasCapture("canvas_text_selected", canvas, { blocks: ids.length });
    },
    [canvas],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    lastSelection.current = "";
    window.getSelection()?.removeAllRanges();
  }, []);

  // ── Point at the exact words, not the paragraph ─────────────────────────
  //
  // The block-level selection above still feeds the composer's scoped commands. This is the
  // finer layer on top: the precise character range, and the toolbar that turns it into an
  // answer without the learner having to describe where they were looking.
  const text = useCanvasSelection(true);
  const [answer, setAnswer] = useState<SelectionAnswer | null>(null);

  // A clicked vocabulary mark. Held separately from the browser's selection because nothing was
  // selected — but it produces the SAME shape, so it feeds the same popover by the same path.
  // Two definition surfaces that merely resembled each other would drift apart within a month.
  const [term, setTerm] = useState<{ selection: CanvasSelection; rect: DOMRect } | null>(null);
  const pointed = text.selection ?? term;

  // The weakest signal in the log, and recorded anyway: a selection nobody asked a question
  // about still says where attention snagged. One row per settled selection, not per
  // `selectionchange` — the hook already debounces, or a single drag would write dozens.
  const loggedSelection = useRef<string>("");
  useEffect(() => {
    const picked = text.selection?.selection;
    if (!picked) return;
    // A real highlight supersedes an open term popover. Without this the term stays in state
    // behind the selection and reappears, positioned at a word the learner has moved on from,
    // the moment the selection clears.
    setTerm(null);
    const key = `${picked.regionId}:${picked.startOffset}:${picked.endOffset}`;
    if (key === loggedSelection.current) return;
    loggedSelection.current = key;
    session.recordEvent({
      type: "selection_created",
      ...(picked.blockId ? { blockId: picked.blockId } : {}),
      ...(picked.conceptIds ? { conceptIds: picked.conceptIds } : {}),
      selectedText: picked.selectedText,
    });
  }, [session, text.selection]);

  const dismissSelection = useCallback(() => {
    setAnswer(null);
    setTerm(null);
    session.clearSelectionAnswer();
    text.clear();
  }, [session, text]);

  // Clicking a marked term is exactly "select this word, press Define" — so it builds the same
  // selection a drag would have produced and takes the same route, which is what keeps the event
  // log, the sentence context and the provenance check identical between the two.
  const lookUpTerm = useCallback(
    async (block: CanvasBlock, mark: MarkedTerm, rect: DOMRect) => {
      const selection: CanvasSelection = {
        regionId: block.id,
        blockId: block.id,
        selectedText: mark.term,
        startOffset: mark.start,
        endOffset: mark.end,
        surroundingText: surroundingSentence(block.content, mark.start, mark.end),
        anchor: buildAnchor(block.content, mark.start, mark.end),
        rewritable: true,
        ...(mark.conceptId
          ? { conceptIds: [mark.conceptId] }
          : block.conceptIds?.length
            ? { conceptIds: block.conceptIds }
            : {}),
      };
      setAnswer(null);
      setTerm({ selection, rect });
      const result = await session.askAboutSelection(selection, "define");
      if (result) setAnswer(result);
    },
    [session],
  );

  const act = useCallback(
    async (action: Parameters<typeof session.askAboutSelection>[1]) => {
      const picked = pointed?.selection;
      if (!picked) return;
      // 🔴 Captured BEFORE the call. "Simpler" replaces the block the offsets index, so reading
      // the selection again afterwards would measure against text that no longer exists.
      const result = await session.askAboutSelection(picked, action);
      if (action === "simpler") {
        dismissSelection();
        return;
      }
      if (result) setAnswer(result);
    },
    [dismissSelection, pointed, session],
  );

  // Consume the opening instruction exactly once, when the canvas is ready and still empty.
  // 🔴 Guarded by a ref rather than by state: `begin` updates the canvas, which re-runs this
  // effect, and without the latch the same topic would start a second lesson over the first.
  const askedOnce = useRef(false);
  useEffect(() => {
    if (!openingAsk || askedOnce.current || !session.ready) return;
    if (canvas.state !== "empty") return;
    askedOnce.current = true;
    session.begin(openingAsk);
  }, [canvas.state, openingAsk, session]);

  // Leaving a canvas that was started but never finished is the number the pilot is being
  // judged on as much as completion is. Recorded on unmount, reading a ref so the value is the
  // state at the moment of leaving rather than the one captured when the effect was set up.
  const leaving = useRef(canvas);
  leaving.current = canvas;
  useEffect(
    () => () => {
      const last = leaving.current;
      if (last.state !== "complete" && last.state !== "empty") {
        canvasCapture("canvas_abandoned", last, {
          blocks: last.blocks.length,
          answered: last.answers.length,
          activeMs: last.activeMs,
        });
      }
    },
    [],
  );

  const submit = useCallback(
    async (text: string) => {
      // "Where did this come from?" is answered about the highlighted passage rather than by
      // rewriting it — asking about a claim should never silently change the claim.
      const only = selected.length === 1 ? selected[0] : null;
      if (only && /^(where|which source|what source)\b/i.test(text)) {
        canvasCapture("canvas_source_asked", canvas, {});
        await session.askAbout(only, text);
        return;
      }
      await session.command(text, selected);
      clearSelection();
    },
    [canvas, clearSelection, selected, session],
  );

  // 🔴 EVERY state prints its own primary action in the page, and the top controls carry none.
  //
  // They used to: a filled button sat in the header, which is why "See where I stand" appeared
  // twice on one screen during a test — once at the end of the last question, once in the bar.
  // The move forward belongs where the thing being finished is. Reading is the only state whose
  // content has no natural end control, so the document prints it after the last block; recall
  // and the test advance themselves off their last card, and the diagnosis and completion
  // screens already own theirs.
  const next = nextAction(canvas);
  const advance = useCallback(() => {
    if (!next) return;
    if (next.to === "recall") void session.startRecall();
    else if (next.to === "test") void session.startTest();
    else if (next.to === "diagnose") session.finishTest();
    else if (next.to === "targeted_relearn") void session.relearn();
    else if (next.to === "retest") void session.startRetest();
    else if (next.to === "complete") session.finish();
  }, [next, session]);

  // 🔴 `loading` IS WAITED FOR, NOT TREATED AS "NO". Resolving this canvas's knowledge is a round
  // trip, and painting the legacy runtime in the meantime would not merely flicker — the stage
  // machine's own effects would start generating a lesson for a canvas the policy is about to own.
  if (!session.ready || policy.status === "loading") {
    return (
      <main className="relative flex h-full items-center justify-center bg-(--ui-bg-editor)">
        {/* 🔴 USUALLY NOTHING RENDERS HERE AT ALL. Resolving a canvas's knowledge normally finishes
            far inside the threshold, and a caption that appeared and vanished in 200ms would be a
            flicker rather than information. It surfaces only when a step has genuinely been running
            long enough to be worth naming — and it names the step that IS running. */}
        {policy.thinking && policy.phase && <CanvasThinking phase={policy.phase} />}
      </main>
    );
  }

  // ── The one branch ────────────────────────────────────────────────────────
  //
  // 🔴 ONE BRANCH, AS HIGH AS IT GOES, AND DELIBERATELY NOT FIVE NEGATIONS ADDED TO THE STATE
  // CHECKS BELOW. Once the policy owns this canvas the six-stage machine must not paint anything:
  // "the policy said retrieve and the Learn stage rendered anyway" is precisely the failure this
  // pivot exists to end, and it is the shape a per-condition guard drifts into on the first edit
  // that forgets one.
  const policyOwns = policy.status === "active";

  const policyTask: ActiveTask | null =
    policyOwns && policy.prompt && !policy.feedback
      ? {
          answered: false,
          id: policy.prompt.id,
          index: 0,
          kind: "question",
          placeholder: "Type your answer…",
          prompt: policy.prompt.prompt,
          total: 1,
        }
      : null;

  // The empty and orientation states have their own inputs and would be muddled by a second
  // one. Everywhere else the composer is present and FULL STRENGTH.
  //
  // 🔴 It used to fade to 45% opacity during recall and the test, from a time when those states
  // had their own answer boxes and this bar was a distraction beneath them. Those boxes are
  // gone: this IS the answer field now, and a half-faded primary input reads as disabled.
  // 🔴 `orient` IS NO LONGER HIDDEN FROM THE COMPOSER. It used to be, which is what made the level
  // picker a wall rather than a suggestion: a learner could not type a word until they had chosen
  // one of four labels. The state survives only for canvases stored before it was removed, and
  // those should be able to talk to Nemesis like any other.
  const showComposer = policyOwns || !["empty", "complete"].includes(canvas.state);

  return (
    // One uninterrupted sheet. The controls and the composer float on it; nothing divides it.
    // `--canvas-column` is the single measure every part of the surface is set to — document,
    // question, diagnosis and composer — so the page reads as one column rather than four
    // things that happen to be centred.
    <main
      className="relative h-full min-h-0 bg-(--ui-bg-editor)"
      style={{ ["--canvas-column" as string]: "680px" }}
    >
      {/* A scrim, NOT a header. Without it, scrolled paragraphs print straight through the
          floating title and neither is readable. It is the page's own colour fading to nothing
          over 88px — the same device the composer already uses at the bottom — so it draws no
          line, no rectangle and no edge: there is no row where the colour steps. The acceptance
          check measures exactly that (the largest colour change between adjacent rows), because
          "is there a divider" is a question about steps, not about whether anything is painted. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[88px] bg-gradient-to-b from-(--ui-bg-editor) via-(--ui-bg-editor)/90 to-transparent" />

      <CanvasHeader
        activeTaskId={session.activeTask?.id ?? null}
        canvas={canvas}
        onDelete={() => {
          void session.remove().then(() => router.push("/sessions"));
        }}
        onExit={() => router.push("/sessions")}
        // 🔴 The whole policy runtime, not only the instant a question is on screen. Flipping the
        // title and the controls back on for the feedback beat and off again for the next question
        // would put a flicker of chrome between every answer and the next — more distracting than
        // the chrome itself. A session is one continuous state.
        minimal={policyOwns}
        onFiles={(files) => void session.attachFiles(files)}
        onRename={session.rename}
      />

      {/* Clearance for the floating controls, expressed as padding on the scroller. It is NOT a
          header height — nothing is reserved, painted or bounded up there; the page simply
          starts below where the controls sit (16px inset + 32px control + 24px breathing room). */}
      <div className="relative h-full overflow-y-auto pt-[72px]">
        {policyOwns ? (
          <CanvasPolicyView runtime={policy} />
        ) : (
          <>
        {canvas.state === "empty" && (
          <CanvasEmpty
            busy={busy.kind === "source"}
            onFiles={(files) => void session.attachFiles(files)}
            onTopic={(topic) => session.begin(topic)}
          />
        )}

        {canvas.state === "sources_attached" && <SourcesAttached session={session} />}

        {["learn", "targeted_relearn"].includes(canvas.state) && (
          <CanvasDocument
            aside={session.aside}
            busy={busy.kind !== null}
            busyBlockIds={busy.blockIds ?? []}
            canvas={canvas}
            next={next}
            onAdvance={advance}
            onAskSource={(block: CanvasBlock) => void session.askAbout(block, "Where in my material did this come from?")}
            onDismissAside={session.dismissAside}
            onMarkKnown={session.markKnown}
            onSelect={onSelect}
            onTerm={(block, mark, rect) => void lookUpTerm(block, mark, rect)}
            onToggleCollapsed={session.toggleCollapsed}
            selectedIds={selectedIds}
          />
        )}

        {canvas.state === "recall" && (
          <CanvasRecall
            canvas={canvas}
            cards={canvas.recall}
            index={session.activeTask?.index ?? 0}
            judging={session.judging}
            onDone={() => void session.startTest()}
            onNext={session.advanceTask}
            onUnknown={() => void session.admitUnknown()}
          />
        )}

        {["test", "retest"].includes(canvas.state) && (
          <CanvasTest
            canvas={canvas}
            index={session.activeTask?.index ?? 0}
            judging={session.judging}
            onAnswer={session.answer}
            onFinish={session.finishTest}
            onNext={session.advanceTask}
            onUnknown={() => void session.admitUnknown()}
          />
        )}

        {canvas.state === "diagnose" && (
          <CanvasDiagnosis
            busy={busy.kind === "relearn"}
            canvas={canvas}
            onFinish={session.finish}
            onRelearn={() => void session.relearn()}
          />
        )}

        {canvas.state === "complete" && <CanvasComplete canvas={canvas} onReset={session.reset} />}

        {/* A whole-page job says so once, in the middle, rather than blanking the document. */}
        {(busy.kind === "lesson" || busy.kind === "recall" || busy.kind === "test" || busy.kind === "relearn") &&
          canvas.state !== "orient" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-(--ui-bg-editor)/70">
              <p className="flex items-center gap-2 text-[0.875rem] text-(--ui-text-secondary)">
                <Codicon name="loading" size="0.875rem" spinning />
                {busy.label}…
              </p>
            </div>
          )}
          </>
        )}
      </div>

      {(policyOwns ? policy.error : error) && (
        <div className="absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <div className="flex max-w-[38rem] items-start gap-3 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-4 py-3 shadow-lg">
            <p className="text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">
              {policyOwns ? policy.error : error}
            </p>
            <button
              aria-label="Dismiss"
              className="mt-0.5 text-(--ui-text-quaternary) hover:text-(--ui-text-primary)"
              onClick={session.dismissError}
              type="button"
            >
              <Codicon name="close" size="0.6875rem" />
            </button>
          </div>
        </div>
      )}

      {/* 🔴 ALONGSIDE THE QUESTION, NOT OVER IT. A judgement that runs long leaves the stimulus
          exactly where it was — the learner keeps the thing they just answered in view, so nothing
          has to be reconstructed when the verdict lands. This is the replacement for the 70% scrim,
          which is why that overlay lives inside the legacy arm and can never paint here. */}
      {policyOwns && policy.thinking && policy.phase && <CanvasThinking phase={policy.phase} />}

      {pointed && (
        <CanvasSelectionMenu
          answer={answer}
          busy={session.selectionBusy}
          error={session.selectionError}
          forceOpen={!text.selection && Boolean(term)}
          onAct={(action) => void act(action)}
          onDismiss={dismissSelection}
          rect={pointed.rect}
          selection={pointed.selection}
        />
      )}

      {showComposer && (
        <CanvasComposer
          busy={policyOwns ? policy.judging : busy.kind === "command"}
          busyLabel={policyOwns ? "Reading your answer" : busy.label}
          // 🔴 THE SAME COMPOSER, CARRYING A DIFFERENT MEANING — not a second answer box built for
          // the policy. What a submission IS comes from whether something is currently being
          // asked, which is the rule this component already ran on.
          onAnswer={
            policyOwns
              ? (text, via, tookMs) => void policy.submit(text, via, tookMs)
              : (text, via, tookMs) => void session.answerActiveTask(text, via, tookMs)
          }
          inSession={policyOwns}
          onAsk={(text) => void submit(text)}
          onClearSelection={clearSelection}
          onFiles={(files) => void session.attachFiles(files)}
          selected={selected}
          task={policyOwns ? policyTask : session.activeTask}
        />
      )}
    </main>
  );
}

/** The moment between "material is in" and "teach me" — one button, because the learner has
 *  already said what they want by dropping the file. */
function SourcesAttached({ session }: { session: ReturnType<typeof useCanvasSession> }) {
  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="w-full max-w-[30rem] text-center">
        <p className="text-[0.8125rem] text-(--ui-text-quaternary)">
          {session.canvas.sources.length} source{session.canvas.sources.length === 1 ? "" : "s"} attached
        </p>
        <h2 className="mt-2 text-[1.25rem] font-medium text-(--ui-text-primary)">{session.canvas.title}</h2>
        <button
          className="mt-8 rounded-lg bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor) disabled:opacity-50"
          disabled={session.busy.kind !== null}
          // Wrapped, not passed by reference: `begin` now takes an optional topic, and handing
          // it straight to onClick would pass the click event in as the title.
          onClick={() => session.begin()}
          type="button"
        >
          Help me learn this
        </button>
      </div>
    </div>
  );
}
