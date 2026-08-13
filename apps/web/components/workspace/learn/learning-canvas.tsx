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
import { answerSink, composeSurface } from "@/lib/learn/canvas-hosting";
import type { CanvasBlock } from "@/lib/learn/canvas-model";
import { buildAnchor, surroundingSentence, type CanvasSelection } from "@/lib/learn/canvas-selection";
import { nextAction } from "@/lib/learn/canvas-state";
import type { PolicyOverride } from "@/lib/learn/policy-override";
import { THINKING_COPY } from "@/lib/learn/thinking-phases";
import type { MarkedTerm } from "@/lib/learn/canvas-vocabulary";

import { verdictIsPass } from "@/lib/learn/canvas-judge";

import { CanvasComposer } from "./canvas-composer";
import { CanvasRecorder } from "./canvas-recorder";
import { offersAdvance } from "./canvas-progression";
import { takePending } from "./pending-attachment";
import { CanvasDocument } from "./canvas-document";
import { CanvasHeader } from "./canvas-header";
import { modelKnowledgeDisclosed } from "./canvas-provenance";
import { CanvasPolicyView } from "./canvas-policy-view";
import { CanvasThinking } from "./canvas-thinking";
import { CanvasSelectionMenu, type SelectionAnswer } from "./canvas-selection-menu";
import { CanvasSurface } from "./canvas-surface";
import { useCanvasSelection } from "./use-canvas-selection";
import { CanvasThinkingPreview } from "./canvas-thinking-preview";
import { useCanvasSession } from "./use-canvas-session";
import { usePolicyRuntime } from "./use-policy-runtime";

/**
 * Where the `×` puts the learner down.
 *
 * 🔴 `/learn`, WAS `/sessions` — a deliberate change, called out here so it can be reversed in one
 * line. `/sessions` is the CHAT surface; it is not where canvases live. That was tolerable while
 * the nav rail was one click away from every canvas, because a learner who landed somewhere odd
 * could simply navigate. §38.1 removes the rail from inside a canvas and §38.2 makes this control
 * the only way out — so the one place it leads had better be the front door, which is `/learn`:
 * the composer, with the learner's own canvases listed beneath it.
 */
const CANVAS_EXIT_ROUTE = "/learn";

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
  // 🔴 DEFINED BEFORE THE EARLY RETURN, so both render branches use the same one. The processing
  // branch below returns before most of this component exists; anything the exit needs has to be
  // above it, and a second inline handler down in the JSX is how the two would drift apart.
  const leave = useCallback(() => router.push(CANVAS_EXIT_ROUTE), [router]);
  const session = useCanvasSession(canvasId);
  const { canvas, busy, error } = session;
  const policy = usePolicyRuntime(canvas, policyOverride);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Record mode. Local to this surface: the recorder owns its own capture state, and a canvas
   *  that is not recording must carry no trace of it. */
  const [recording, setRecording] = useState(false);

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

  // Material chosen on the landing page, before this canvas existed. Same shape as the opening
  // instruction above and latched the same way.
  //
  // 🔴 THE LATCH IS THE WHOLE SAFETY. `attachFiles` updates the canvas, which re-runs this effect;
  // without it the same PDF would be ingested repeatedly — a real cost, since extraction is the
  // expensive step. `takePending()` also clears as it reads, so the two guards are independent:
  // even a mount ordering nobody predicted cannot attach the same files twice.
  //
  // 🔴 NOT GATED ON `canvas.state === "empty"`. A file dropped onto the front door arrives while
  // the canvas is being minted, and the state it lands in is not something this effect gets to
  // assume — attaching material is valid on any canvas, which is exactly what the composer's own
  // attach control does mid-session.
  const claimedFiles = useRef(false);
  useEffect(() => {
    if (claimedFiles.current || !session.ready) return;
    const files = takePending();
    claimedFiles.current = true;
    if (files?.length) void session.attachFiles(files);
  }, [session]);

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
  //
  // 🔴 AND IT CARRIES THE EXIT, WHICH IT DID NOT (UX brief §38.2). This branch used to return a
  // bare `<main>` with a caption in it: no header, therefore no way out. Harmless while the shell
  // still floated a rail toggle in the corner; under §38.1, which takes the rail away inside a
  // canvas, it is a page a learner cannot leave — on the exact entry paths (deep link, hard
  // refresh, fresh sign-in) that land here first. `CanvasSurface` renders the `×` above the
  // branch, so this state cannot be reached without one.
  if (!session.ready || policy.status === "loading") {
    return (
      <CanvasSurface onExit={leave}>
        <div className="flex h-full items-center justify-center">
          {/* 🔴 USUALLY NOTHING RENDERS HERE AT ALL. Resolving a canvas's knowledge normally
              finishes far inside the threshold, and a caption that appeared and vanished in 200ms
              would be a flicker rather than information. It surfaces only when a step has genuinely
              been running long enough to be worth naming — and it names the step that IS running. */}
          {policy.thinking && policy.phase && <CanvasThinking phase={policy.phase} />}
        </div>
      </CanvasSurface>
    );
  }

  // ── Composition, not ownership ────────────────────────────────────────────
  //
  // 🔴 THIS REPLACES "THE ONE BRANCH", AND THE PROPERTY THAT BRANCH PROTECTED SURVIVES IT.
  //
  // Until step 7b exactly one thing painted: `policyOwns ? <CanvasPolicyView/> : <six stages/>`.
  // That was safe by construction — two surfaces could not be on screen, so two could not both
  // claim the composer — and it cost the product everything the policy could not represent: §12
  // measured it owning 0 of 6 production canvases, because a single unsupported paragraph refused
  // the whole page.
  //
  // The Canvas now owns the surface and the policy CONTRIBUTES to it. Reading material and a
  // question coexist; two ANSWER surfaces still never do. That asymmetry is the whole rule, and it
  // lives in `composeSurface` rather than in conditions here, because conditions here are what
  // drift on the first edit that forgets one.
  //
  // 🔴 `policy.decision` AND `policy.feedback`, NOT JUST THE QUESTION. A correction and a verdict
  // occupy the surface exactly as a prompt does, and must not sit beside a recall card either.
  const policyPresenting =
    policy.status === "ready" && (policy.feedback !== null || policy.decision !== null);
  const regions = composeSurface({ canvasState: canvas.state, policyPresenting });

  // 🔴 ONE PLACE DECIDES WHO RECEIVES THE ANSWER, AND IT CANNOT NAME TWO. The composer used to pick
  // with `policyOwns ? … : …`, which was safe only while ownership was all-or-nothing. Now that a
  // task can sit beside a document, a ternary would happily route an answer typed at a recall card
  // to the policy's prompt id — evidence written against a question nobody was asked, with every
  // test still green. See canvas-hosting.ts.
  const sink = answerSink({
    hosted: policy.task,
    regions,
    stageTask: session.activeTask,
  });

  /** This canvas has not begun: no lesson, no task, no evidence — only whatever material is
   *  waiting. The one state in which a submission MEANS "start", which is why it is named once
   *  here and read in three places rather than re-tested inline in each. */
  const preContent = canvas.state === "empty" || canvas.state === "sources_attached";

  // 🔴 THE COMPOSER IS NOW PRESENT BEFORE THE CANVAS HAS BEGUN, AND THAT IS THE WHOLE OF §15.
  //
  // This line used to read `!["empty", "complete"].includes(canvas.state)`, and the comment above
  // it explained that the empty state "has its own input and would be muddled by a second one".
  // That was true and it was backwards: suppressing the ONE persistent composer is precisely what
  // forced two more to be built — `canvas-empty.tsx` grew a topic input and an upload box, and the
  // front door grew a third pill. §15 asks for one component across "Canvas home, active Canvas,
  // source upload, retrieval and freeform questions", so the fix is to stop hiding it rather than
  // to keep styling its replacements to match.
  //
  // 🔴 It used to fade to 45% opacity during recall and the test, from a time when those states
  // had their own answer boxes and this bar was a distraction beneath them. Those boxes are
  // gone: this IS the answer field now, and a half-faded primary input reads as disabled.
  // 🔴 `orient` IS NO LONGER HIDDEN FROM THE COMPOSER. It used to be, which is what made the level
  // picker a wall rather than a suggestion: a learner could not type a word until they had chosen
  // one of four labels. The state survives only for canvases stored before it was removed, and
  // those should be able to talk to Nemesis like any other.
  const showComposer = regions.policy || canvas.state !== "complete";

  return (
    // One uninterrupted sheet. The controls and the composer float on it; nothing divides it —
    // the sheet, its scrim, the floating strip and the `×` all come from `CanvasSurface`, which
    // owns them so that no render branch can omit the exit. See the note at the top of that file.
    <CanvasSurface
      onExit={leave}
      chrome={
      <CanvasHeader
        activeTaskId={session.activeTask?.id ?? null}
        canvas={canvas}
        // 🔴 THE SOURCES PANEL HAS TO BE ABLE TO SAY "THE MODEL" (N10). `policy.territories` is
        // the resolved supported knowledge for this canvas — the same list the focus picker is
        // built from — so a non-empty one means knowledge genuinely exists rather than being
        // assumed from the canvas being sourceless. The predicate lives in `canvas-provenance.ts`
        // with the reasoning for the durability test, which is the runtime's own branch condition
        // and not `sources.length`.
        modelKnowledge={modelKnowledgeDisclosed(canvas.sources, policy.territories.length)}
        onDelete={() => {
          void session.remove().then(() => router.push(CANVAS_EXIT_ROUTE));
        }}
        // 🔴 The whole policy runtime, not only the instant a question is on screen. Flipping the
        // title and the controls back on for the feedback beat and off again for the next question
        // would put a flicker of chrome between every answer and the next — more distracting than
        // the chrome itself. A session is one continuous state.
        // 🔴 THE POLICY HAS THE SURFACE TO ITSELF — NOT "IS ANSWERING", AND NOT "IS PRESENT".
        //
        // The original rule was the whole policy session, deliberately: flipping the title and
        // controls back on for the feedback beat and off again for the next question puts a flicker
        // of chrome between every answer, which is more distracting than the chrome. Keying this on
        // the answer sink would reintroduce exactly that oscillation, because `task` is null while a
        // verdict is on screen.
        //
        // What composition adds is the other half: when a document is sharing the surface the
        // learner may be reading rather than answering, and stripping the title and navigation from
        // someone who is reading takes away their way out. So: quiet when the policy is alone,
        // continuous across question and feedback, never quiet over a document.
        minimal={regions.policy && !regions.sharing}
        onFiles={(files) => void session.attachFiles(files)}
        onRename={session.rename}
      />
      }
    >
      {/* Clearance for the floating controls, expressed as padding on the scroller. It is NOT a
          header height — nothing is reserved, painted or bounded up there; the page simply
          starts below where the controls sit (12px inset + 28px control + 24px breathing room,
          compact-UI pass -- was 16+32+24=72, tightened alongside the header it clears). */}
      <div className="relative h-full overflow-y-auto pt-[64px]">
        {/* 🔴 THE POLICY'S CONTRIBUTION COMES FIRST IN THE FLOW, NOT OVER THE TOP OF THE DOCUMENT.
            An overlay would hide the very material 7b exists to keep visible, and a learner who
            wanted to look something up would have to dismiss the question to do it. It sits above
            the reading and the reading continues beneath it — one continuous surface, which is why
            neither is in a panel, a modal or a column of its own. */}
        {regions.policy && <CanvasPolicyView runtime={policy} sharing={regions.sharing} />}

        {regions.document && (
          <>
        {/* 🔴 THE TWO PRE-CONTENT SCREENS ARE DELETED, NOT HIDDEN (UX brief §1). `CanvasEmpty`
            painted "What do you want to learn?" over a large dashed upload box with its own topic
            input; `SourcesAttached` painted "1 source attached" over a "Help me learn this"
            button. §1 names all three by description and §26 turns them into acceptance criteria.

            Nothing replaces them. A canvas that has not begun is the canvas, with the persistent
            composer already docked — which is §4 exactly ("no further onboarding screen") and §19
            ("the interface should almost disappear"). The composer carries the attached material
            as chips and the send control; see `showComposer` below, which used to exclude these
            two states and is the single line that forced a second and third composer to exist. */}
        {preContent && busy.kind !== null && <CanvasThinkingPreview label={busy.label} />}

        {["learn", "targeted_relearn"].includes(canvas.state) && (
          <CanvasDocument
            aside={session.aside}
            busy={busy.kind !== null}
            busyBlockIds={busy.blockIds ?? []}
            canvas={canvas}
            next={next}
            onAdvance={advance}
            onDismissAside={session.dismissAside}
            onSelect={onSelect}
            onTerm={(block, mark, rect) => void lookUpTerm(block, mark, rect)}
            onToggleCollapsed={session.toggleCollapsed}
            selectedIds={selectedIds}
          />
        )}

          </>
        )}

        {/* 🔴 THE EVIDENCE-COLLECTING STAGE ARM IS GONE, NOT DISABLED. `CanvasRecall`,
            `CanvasTest`, `CanvasDiagnosis` and `CanvasComplete` painted here and are deleted with
            `canvas-stages.tsx`. Nothing replaces them: a task now COMPOSES on top of reading
            material through `CanvasPolicyView` above, rather than replacing the page with a stage.
            That is why there is no second answer surface left to guard against — the invariant the
            old comment here defended (never two answer surfaces on one composer) is now structural
            rather than conditional, because there is only one.

            The states themselves are unreachable in both directions and stay that way without any
            help from this file: `canvas-state.ts` refuses any transition INTO an evidence stage,
            and `canvas-store.ts` coerces a canvas already stored in one to `learn` on read. */}

        {/* A whole-page job says so once, in the middle, rather than blanking the document.
            🔴 AND NEVER WHILE THE POLICY IS CONTRIBUTING. This greys everything beneath it, which
            under composition includes the question the learner is answering AND the document they
            would look at to answer it — the ambient `CanvasThinking` exists precisely so a judged
            answer does not destroy the context being held. Before 7b the legacy branch made this
            impossible structurally; now it is a guard, so it is asserted in canvas-motion.test.ts. */}
        {!regions.policy &&
          (busy.kind === "lesson" || busy.kind === "recall" || busy.kind === "test" || busy.kind === "relearn") &&
          canvas.state !== "orient" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-(--ui-bg-editor)/70">
              <p className="flex items-center gap-2 text-[0.875rem] text-(--ui-text-secondary)">
                <Codicon name="loading" size="0.875rem" spinning />
                {busy.label}…
              </p>
            </div>
          )}
      </div>

      {/* 🔴 THE POLICY'S ERROR WINS ONLY WHEN THE POLICY IS ON SCREEN. Both runtimes can now hold an
          error at once — a failed judge and a failed lesson generation are different events — and
          showing the invisible one would report a failure the learner cannot place. */}
      {(regions.policy ? policy.error ?? error : error) && (
        <div className="absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <div className="flex max-w-[38rem] items-start gap-3 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-4 py-3 shadow-lg">
            <p className="text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">
              {regions.policy ? policy.error ?? error : error}
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
      {regions.policy && policy.thinking && policy.phase && <CanvasThinking phase={policy.phase} />}

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

      {/* 🔴 THE RECORDER TAKES THE COMPOSER'S PLACE RATHER THAN SITTING ON TOP OF IT. While a lecture
          is being captured there is exactly one thing to do, and leaving the text box live beneath a
          recording panel offers a second one. Same position, same width — the surface transforms,
          it does not gain a layer. */}
      {showComposer && recording && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4 pt-14 bg-gradient-to-t from-(--ui-bg-editor) via-(--ui-bg-editor)/85 to-transparent">
          <div className="pointer-events-auto w-full">
            <CanvasRecorder
              // The canvas's ordinary attach path — the identical one a dropped file takes, which is
              // what makes a recorded lecture a real source rather than a fourth kind of thing.
              attach={async (files) => { await session.attachFiles(files); }}
              onClose={() => setRecording(false)}
            />
          </div>
        </div>
      )}

      {showComposer && !recording && (
        <CanvasComposer
          busy={sink.kind === "policy" ? policy.judging : busy.kind === "command"}
          busyLabel={sink.kind === "policy" ? THINKING_COPY.reading_answer : busy.label}
          // 🔴 THE SAME COMPOSER, CARRYING A DIFFERENT MEANING — not a second answer box built for
          // the policy. What a submission IS comes from whether something is currently being
          // asked, which is the rule this component already ran on.
          // 🔴 ONE ROUTE, CHOSEN BY THE SINK. This used to read `policyOwns ? … : …`, which was a
          // safe ternary only because ownership was all-or-nothing. `sink` is a union that cannot
          // name two receivers, so there is no combination of states in which both branches are
          // live — see canvas-hosting.ts.
          onAnswer={
            sink.kind === "policy"
              ? (text, via, tookMs) => void policy.submit(text, via, tookMs)
              : (text, via, tookMs) => void session.answerActiveTask(text, via, tookMs)
          }
          inSession={sink.kind === "policy"}
          // §I — the composer is the only progression control. `✓` appears only where the policy is
          // presenting something the learner reads and then moves past, and NEVER while a
          // demonstration is required. The predicate is in canvas-progression.ts with its own test,
          // because "which states may be skipped" is exactly the kind of condition that drifts.
          //
          // 🔴 IT IS WIRED TO `acknowledge`, WHICH WRITES NO LEARNER EVIDENCE (N1). It clears the
          // feedback, bumps the round and records that this objective was acted on. Nothing about
          // it touches `learner_evidence` — and the proof of that is measuring the table across the
          // press, not reading this line.
          onAdvance={
            regions.policy && offersAdvance({
              actionType: policy.decision?.action.type ?? null,
              // 🔴 GATED ON THE ACTION TYPE, NOT ON `prompt` ALONE. `prompt` is cleared by an
              // EFFECT when the action stops being `retrieve` (use-policy-runtime.ts:313), so there
              // is one render in which a correction screen still holds the previous question's
              // prompt. Keyed on `prompt` alone, that render would report a demonstration in
              // progress, withhold the `✓`, and leave the learner on a screen with no control at
              // all — a one-frame flicker at best, and the only way forward at worst.
              awaitingDemonstration:
                policy.decision?.action.type === "retrieve" && Boolean(policy.prompt) && !policy.feedback,
              feedbackPassed: policy.feedback ? verdictIsPass(policy.feedback.evaluation.verdict) : false,
              hasFeedback: policy.feedback !== null,
            })
              ? policy.acknowledge
              : null
          }
          // 🔴 The press is refused while the last answer's evidence is still being written
          // (`acknowledge` returns early), so the control has to say it is working rather than
          // ignore the learner. Now that this is the only way forward, a dead press blocks them.
          advanceBusy={policy.recording}
          onAsk={(text) => void submit(text)}
          onClearSelection={clearSelection}
          onFiles={(files) => void session.attachFiles(files)}
          onRecord={() => setRecording(true)}
          // 🔴 SEND STARTS THE CANVAS; ATTACHING DOES NOT (§2). `onFiles` above only ingests, and
          // it deliberately does not begin — the learner may add a second file or type an
          // instruction first. This is the commit, and it is the same control they would press to
          // send anything else, which is what makes it "the composer is the entry point" rather
          // than a differently-shaped "Help me learn this".
          //
          // 🔴 `null` ONCE THE CANVAS HAS CONTENT, so the composer goes back to asking and
          // answering. Passing it unconditionally would route every mid-lesson question into
          // `begin`, which re-titles the canvas and regenerates it.
          //
          // The empty string is a real argument here: `begin()` with no topic on a canvas that
          // has sources is §3's "learn this material with me", inferred rather than asked for.
          onStart={preContent ? (asked: string) => session.begin(asked || undefined) : null}
          pendingSources={preContent ? canvas.sources.map((source) => ({ id: source.id, title: source.title })) : []}
          selected={selected}
          task={sink.kind === "none" ? null : sink.task}
        />
      )}
    </CanvasSurface>
  );
}
