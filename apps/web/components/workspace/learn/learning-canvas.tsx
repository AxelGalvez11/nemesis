"use client";

// The Learning Canvas surface.
//
// One page that becomes whatever the learner needs next. There is no message list, no
// assistant column, and no route change between reading, recalling and being tested — the
// canvas itself is the interface, and the command bar is the only control.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Codicon } from "@/components/desktop-ui/codicon";
import { hostnameOf } from "@/lib/favicon";
import { canvasCapture } from "@/lib/learn/canvas-analytics";
import { actionKey, answerSink, materialOwnsAttention } from "@/lib/learn/canvas-hosting";
import type { CanvasBlock } from "@/lib/learn/canvas-model";
import { buildAnchor, surroundingSentence, type CanvasSelection } from "@/lib/learn/canvas-selection";
import type { PolicyOverride } from "@/lib/learn/policy-override";
import type { TeachingStrategyId } from "@/lib/learn/teaching-strategy";
import { THINKING_COPY } from "@/lib/learn/thinking-phases";
import type { MarkedTerm } from "@/lib/learn/canvas-vocabulary";


import { isOrdinaryChatQuestion } from "./canvas-chat-routing";
import { CanvasComposer } from "./canvas-composer";
import { nextExplanationState, type ExplanationEvent } from "./canvas-explanation-turn";
import { canvasPresentation } from "./canvas-presence";
import { CanvasQuiet } from "./canvas-quiet";
import { CanvasRecorder } from "./canvas-recorder";
import { takePending } from "./pending-attachment";
import { CanvasDocument } from "./canvas-document";
import { CanvasHeader } from "./canvas-header";
import { modelKnowledgeDisclosed } from "./canvas-provenance";
import { CanvasPolicyView } from "./canvas-policy-view";
import { CanvasThinking } from "./canvas-thinking";
import { CanvasSelectionMenu, type SelectionAnswer } from "./canvas-selection-menu";
import { CanvasSurface } from "./canvas-surface";
import { continueBelongsTo, continueOwner, readingRequirementOf } from "@/lib/learn/canvas-continue";
import { routeComposerText } from "@/lib/learn/canvas-phrases";
import { unreadChunk } from "@/lib/learn/canvas-reading";
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

/** What "send" means when a passage is staged and nothing was typed.
 *
 *  🔴 A CONSTANT, NOT A LITERAL AT THE CALL SITE, because it is a sentence a MODEL reads and the
 *  wording is therefore behaviour rather than decoration. It is also deliberately plain: no subject
 *  matter, no assumption about what kind of passage this is, so it reads correctly over a statute,
 *  a mechanism and a worked calculation alike. */
const EXPLAIN_THIS = "Explain this.";

export function LearningCanvas({
  canvasId,
  openingAsk = null,
  policyOverride = null,
  strategyOverride = null,
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
  /** Which teaching controller to run, when a URL asked for one — the internal development switch.
   *
   *  🔴 THE DEFAULT IS `null`, WHICH IS `nemesis_policy`. There is no control for this anywhere on
   *  the surface and there must not be: contract §27 rules that a learner must not keep choosing
   *  which engine to invoke, and an arm picker is exactly that. See the parameter's own comment in
   *  the `/learn` page, where the rules live. */
  strategyOverride?: TeachingStrategyId | null;
}) {
  const router = useRouter();
  // 🔴 DEFINED BEFORE THE EARLY RETURN, so both render branches use the same one. The processing
  // branch below returns before most of this component exists; anything the exit needs has to be
  // above it, and a second inline handler down in the JSX is how the two would drift apart.
  const leave = useCallback(() => router.push(CANVAS_EXIT_ROUTE), [router]);
  const session = useCanvasSession(canvasId);
  const { canvas, busy, error } = session;
  const policy = usePolicyRuntime(canvas, policyOverride, strategyOverride);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Record mode. Local to this surface: the recorder owns its own capture state, and a canvas
   *  that is not recording must carry no trace of it. */
  const [recording, setRecording] = useState(false);
  /**
   * WHICH cognitive action was in flight when the learner last asked for something to read.
   *
   * 🔴 THE ACTION, NOT A BOOLEAN, AND THE BOOLEAN WAS A LIVE DEFECT. This was `askedForContent`,
   * set true by the command path and never cleared — so one *"explain this"* put general material
   * back underneath every question for the rest of the session, and the owner's overview returned
   * one interaction later. Recording the action instead makes attention return by itself the moment
   * the policy moves on: nothing to clear, so nothing to forget to clear. See
   * `materialOwnsAttention`. 🔴 Never durable — a generated overview and a summary they requested
   * are the same rows, so the only honest discriminator is what the learner was doing.
   */
  const [materialRequestedDuring, setMaterialRequestedDuring] = useState<string | null>(null);

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

  // 🔴 CONTRACT RULE 2, WIRED — see canvas-explanation-turn.ts for the decision itself. Both ad hoc
  // explanation surfaces (`aside`, the Define/Example/Why popover) read their CURRENT presence here
  // and hand it to the pure function, so every call site below dispatches an EVENT rather than
  // deciding for itself whether to clear — which is what kept the aside alive past the answer-a-
  // task path before this: `askAbout`'s "disappears" was true only of the ask path, because nothing
  // on the answer path had ever been told to clear it.
  //
  // 🔴 `hasPopover` READS `answer`/`term` DIRECTLY, NOT `Boolean(pointed)` — and the first version
  // of this line did, which was a real defect rather than a simplification. `pointed = text.selection
  // ?? term`, and `new_turn` deliberately never touches `text.selection` (a live highlight must
  // survive an unrelated question — see `dismissSelection`'s own comment on why `text.clear()` stays
  // out of this function). So `Boolean(pointed)` can still be true immediately after this reports
  // `hasPopover: false`: the reducer's verdict and the state it is supposedly describing would
  // disagree. Reading the two fields this function can actually clear keeps the claim honest — a
  // live selection with nothing looked up yet still shows its quick-action toolbar afterwards, which
  // is correct: an un-opened toolbar is not the stale ANSWER rule 2 is about.
  const applyExplanationEvent = useCallback(
    (event: ExplanationEvent) => {
      const current = { hasAside: session.aside !== null, hasPopover: answer !== null || term !== null };
      const next = nextExplanationState(current, event);
      if (current.hasAside && !next.hasAside) session.dismissAside();
      if (current.hasPopover && !next.hasPopover) {
        setAnswer(null);
        setTerm(null);
        session.clearSelectionAnswer();
      }
    },
    [answer, session, term],
  );

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
    // 🔴 `text.clear()` STAYS OUTSIDE `applyExplanationEvent` DELIBERATELY. It calls
    // `removeAllRanges()`, which is correct for an explicit dismiss — the learner pressed the
    // popover's own × — but would be wrong on a `new_turn`: it would wipe a highlight the learner
    // is still pointing at while they type an unrelated composer message. Keeping it here, rather
    // than folding it into the shared event handler, is what keeps that side effect scoped to the
    // one event that actually asked for it.
    applyExplanationEvent({ kind: "dismiss_popover" });
    text.clear();
  }, [applyExplanationEvent, text]);

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

  /**
   * Start a canvas from a blank slate, OR just answer what was typed.
   *
   * 🔴 THE FIRST THING A NEW LEARNER TYPES IS OFTEN A QUESTION, NOT A TOPIC, AND UNTIL THIS EXISTED
   * IT WAS SWALLOWED EITHER WAY. `begin()` treats whatever text arrives as the canvas's TITLE and a
   * goal signal for what to teach ("Teach me organic chemistry from scratch" already says where to
   * start) — right for a topic, wrong for a question. "What's the difference between a covalent and
   * an ionic bond" typed on the front door became a canvas titled exactly that, which then either
   * asked the learner a diagnostic question about it or sat generating nothing, and the question
   * itself was never actually answered.
   *
   * 🔴 ONLY WHEN NOTHING IS ATTACHED. Once a source exists, typed text at this point is an
   * INSTRUCTION about what to do with it (§3: attach + type + send means "learn this material this
   * way") — an established, tested behaviour this must not disturb. So the question-shaped
   * interception is scoped to the one case it was built for: a canvas that holds no material at
   * all, where there is nothing else the text could reasonably mean.
   */
  const beginOrAnswer = useCallback(
    (asked: string) => {
      applyExplanationEvent({ kind: "new_turn" });
      const trimmed = asked.trim();
      if (trimmed && canvas.sources.length === 0 && isOrdinaryChatQuestion(trimmed)) {
        void session.askGeneral(trimmed);
        return;
      }
      session.begin(asked || undefined);
    },
    [applyExplanationEvent, canvas.sources.length, session],
  );

  // Consume the opening instruction exactly once, when the canvas is ready and still empty.
  // 🔴 Guarded by a ref rather than by state: `begin` updates the canvas, which re-runs this
  // effect, and without the latch the same topic would start a second lesson over the first.
  const askedOnce = useRef(false);
  useEffect(() => {
    if (!openingAsk || askedOnce.current || !session.ready) return;
    if (canvas.state !== "empty") return;
    askedOnce.current = true;
    beginOrAnswer(openingAsk);
  }, [beginOrAnswer, canvas.state, openingAsk, session.ready]);

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
      // 🔴 CONTRACT RULE 2 — "normal chat responses may remain only until the next turn." Fired
      // ONCE, before any branch below, so every route out of this function (explain-this, where-
      // from, rewrite, refused, ordinary) gets it for free rather than five branches each needing
      // to remember. Safe ahead of `only` below: it touches `aside`/the selection popover only,
      // never `selected` — see canvas-explanation-turn.ts.
      applyExplanationEvent({ kind: "new_turn" });

      // "Where did this come from?" is answered about the highlighted passage rather than by
      // rewriting it — asking about a claim should never silently change the claim.
      const only = selected.length === 1 ? selected[0] : null;
      // 🔴 SEND WITH A PASSAGE STAGED AND NOTHING TYPED MEANS "EXPLAIN THIS". The composer now
      // offers send whenever a selection is staged, because the placeholder asks "What should
      // Nemesis do with this?" and a question with no answerable control is worse than no question.
      // What the learner meant is not a guess: it is the same thing the selection toolbar offers
      // first, routed through the same call, so there is one explanation path rather than two.
      if (!text.trim() && only) {
        await session.askAbout(only, EXPLAIN_THIS);
        return;
      }
      if (only && /^(where|which source|what source)\b/i.test(text)) {
        canvasCapture("canvas_source_asked", canvas, {});
        await session.askAbout(only, text);
        return;
      }
      // §11 + brief §15 — *"Make this simpler"* typed into the composer rewrites the passage IN
      // PLACE, exactly as the selection toolbar's "Simpler" does. Until now only a selection could
      // do it and typing the phrase appended another explanation underneath, which is the precise
      // behaviour §11 exists to prevent.
      //
      // 🔴 THE REFERENT IS READ, NEVER GUESSED — see canvas-phrases.ts. "Most recent block" and
      // "nearest the viewport" are inventions about time and gaze; the active reading region is
      // derived from Continue presses the learner made themselves.
      const routing = routeComposerText(text, {
        // 🔴 THE RUNTIME'S OWN ANSWER, NOT A THIRD COPY OF THE TEST. This read
        // `action.type === "retrieve"` and would have gone stale the moment a second kind of ask
        // existed: a learner sitting in front of an unanswered recognition task would have had their
        // typing routed as a question about the material. See `PolicyRuntime.awaitingAnswer`.
        awaitingDemonstration: policy.awaitingAnswer,
        hasReadingMaterial: canvas.blocks.length > 0,
        selectedBlockId: only?.id ?? null,
        unreadBlockIds: unreadChunk(canvas.blocks).map((block) => block.id),
      });

      if (routing.kind === "rewrite") {
        const block = canvas.blocks.find((candidate) => candidate.id === routing.blockId);
        if (block) {
          // The same path the toolbar takes, so there is one rewrite implementation rather than
          // two that drift. `rewritable` is true because a document block is exactly where a
          // rewrite has somewhere to land.
          await session.askAboutSelection(
            {
              anchor: { exact: block.content.slice(0, 64), prefix: "", suffix: "" },
              blockId: block.id,
              endOffset: block.content.length,
              regionId: block.id,
              rewritable: true,
              selectedText: block.content,
              startOffset: 0,
              surroundingText: block.content,
            },
            "simpler",
          );
          clearSelection();
          return;
        }
      }

      // 🔴 A REFUSAL IS SAID OUT LOUD. Silence here is indistinguishable from the feature being
      // broken — the learner typed an instruction and would be left wondering whether Nemesis
      // heard it. The message names the action that resolves the ambiguity rather than reporting
      // an internal state.
      if (routing.kind === "refused") {
        session.showNotice(routing.message);
        return;
      }

      // 🔴 PRODUCT MANDATE RULE 1 (owner, 2026-08-15) — "the learner must be able to ask ordinary
      // questions about their sources WITHOUT being forced into tutoring behaviour." Everything
      // below this point writes into the document (`session.command`), through a system prompt
      // that says outright "you are not chatting". "What does osmolarity mean" typed with nothing
      // selected used to take that same path and come back as a paragraph permanently inserted
      // into the study document. See canvas-chat-routing.ts for the decision and canvas-chat.ts
      // for what answers it.
      //
      // 🔴 `selected.length === 0` ONLY. A single block selected already has its own, more specific
      // routes above (empty send = "explain this", "where/which source" = ask about it) — anything
      // else with a selection is a scoped edit instruction about that exact passage, which is a
      // different thing from an open-ended question and must keep mutating the document as it
      // does today.
      if (routing.kind === "ordinary" && selected.length === 0 && isOrdinaryChatQuestion(text)) {
        await session.askGeneral(text);
        return;
      }

      // `ordinary` and `defer-to-policy` both take the normal path: the second is a scaffolding
      // request (§33), which is the policy's to answer, not a rewrite.
      // 🔴 THE LEARNER ASKED, SO WHAT COMES BACK IS THE ACTION — until the policy moves on. The
      // action in flight is stamped here rather than a bare `true`, which is what makes attention
      // return by itself; see `materialOwnsAttention`. This is the only place a learner request
      // writes blocks.
      setMaterialRequestedDuring(actionKey(policy.decision?.action ?? null));
      await session.command(text, selected);
      clearSelection();
    },
    [applyExplanationEvent, canvas, clearSelection, policy.decision, policy.feedback, policy.prompt, selected, session],
  );

  // 🔴 EVERY state prints its own primary action in the page, and the top controls carry none.
  //
  // They used to: a filled button sat in the header, which is why "See where I stand" appeared
  // twice on one screen during a test — once at the end of the last question, once in the bar.
  // The move forward belongs where the thing being finished is. Reading is the only state whose
  // content has no natural end control, so the document prints it after the last block; recall
  // and the test advance themselves off their last card, and the diagnosis and completion
  // screens already own theirs.
  // 🔴 `nextAction` AND ITS HANDLER ARE DELETED (owner, §38). They drove "Retest me" and "Fix my
  // weak spots", which #585 proved unreachable in every state a canvas can be observed in, and
  // which the owner has now said should not come back: *"The only button should be 'continue'
  // below reading passages, thats it."* The six session methods they called went with them.

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

  // 🔴 A STEP IS RUNNING, ANSWERED HONESTLY AND IN ONE PLACE. `thinking-phases.ts` is explicit that
  // a caption on a timer "would look exactly like a system thinking and would be theatre", so this
  // reports work that is genuinely in flight and nothing else. It is what separates "Nemesis is
  // busy" from "Nemesis has nothing for you", which are opposite things to say to a learner.
  //
  // 🔴 `policy.status === "loading"` IS DELIBERATELY ABSENT, AND THE COMPILER IS WHY. Writing it
  // here is a type error: the branch above returns on `loading`, so by this point the status is
  // provably `ready | unavailable`. That is worth recording rather than working around, because it
  // narrows the defect — a canvas reaching this render with nothing to show is NEVER a canvas that
  // is still thinking. It has finished, and it has nothing. `canvasPresence` still accepts the
  // input so the value stays correct if that early return is ever removed.
  const working = busy.kind !== null;

  // 🔴 WHAT PAINTS AND WHETHER ANYTHING PAINTS ARE ONE DERIVATION NOW — see canvas-presence.ts.
  //
  // This line used to call `composeSurface` directly, and it did so WITHOUT `hasReadingMaterial`,
  // which that module's own documentation names as a defect ("absent means assume there is", and a
  // task then makes room for a document that is not there). Worse, the question composeSurface
  // cannot answer — is there anything on this surface at all? — was left to inline conditions
  // further down, and they said no in a state that had no way back. A canvas that had begun with
  // nothing generated into it painted an empty page for ever.
  const { presence, regions } = canvasPresentation({
    blocks: canvas.blocks.length,
    canvasState: canvas.state,
    // 🔴 THE MATERIAL IS THE ACTION ONLY WHILE THAT ACTION IS STILL IN FLIGHT. Answering the
    // question lands evidence, the policy picks a different action, this flips to false and the
    // task has attention back — with no handler anywhere having to remember to clear anything.
    materialIsTheAction: materialOwnsAttention({
      actionInFlight: actionKey(policy.decision?.action ?? null),
      requestedDuring: materialRequestedDuring,
    }),
    policyPresenting,
    working,
  });

  // 🔴 THE NAME OF THE STEP THAT IS RUNNING, OR NONE — never a guess. `CanvasThinkingPreview`
  // accepts `null` and says so in its own header ("when the caller has no honest label it passes
  // none and the lines carry the state alone"), so there is nothing to invent here. The session's
  // own label wins because it is the more specific of the two: "Reading" names the file being
  // ingested, where the policy phase names the canvas-wide step behind it.
  const preparingLabel =
    busy.kind !== null ? busy.label : policy.phase ? THINKING_COPY[policy.phase] : null;

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

  // 🔴 §38 — ONE QUESTION, ASKED ONCE, FOR THE WHOLE SURFACE. A correction and an unread passage
  // can legitimately be on screen together (`composeSurface` allows it by design), so asking each
  // component separately puts two buttons saying the same word in one viewport. `continueOwner`
  // reads each region's `requiresReading` property and returns at most one owner — the property is
  // the trigger, the control follows from it, and a future surface that asks the learner to read
  // gets one without anyone remembering to add it.
  // 🔴 THE RUNTIME'S OWN ANSWER, FOR THE REASON THE ROUTING SITE ABOVE NOW USES IT TOO. A Continue
  // control offered beside an unanswered recognition task is §38's exact failure: a way past a
  // question the learner has not answered.
  const awaitingDemonstration = policy.awaitingAnswer;
  const continueRegion = continueOwner(
    [
      {
        id: "policy",
        placement: "policy",
        // 🔴 §39 — THE POLICY'S DECLARED MODE, NEVER THE VERDICT. "Correctness does not determine
        // advancement; cognitive mode does." An earlier draft of this used `offersAdvance`, which
        // keys on whether the verdict passed — precisely the inference §39 forbids, and it would
        // have shipped a Continue that meant "you got it wrong".
        //
        // 🔴 READ FROM `policy.exposition`, NOT FROM THE DECISION — AND THAT IS A BUG FIX, NOT A
        // TIDY-UP. The property now exists, and the stopgap this replaces (`declaredCognitiveMode(
        // policy.decision)`, resolving `null` to "requires reading") had a reachable case where the
        // two doors disagreed. Measured by calling the functions, not reasoned:
        //
        //   answer the LAST objective on a canvas -> decideNext returns null while the verdict is
        //   still on screen
        //     door 1  declaredCognitiveMode(null) -> null -> requiresReading TRUE  -> a Continue
        //     door 2  runtime.exposition          -> the verdict's own transient   -> auto-advance
        //
        // So the learner was offered a button on a screen that was moving on underneath it. The
        // runtime exposes `exposition` precisely because a verdict can outlive the decision that
        // produced it, and `declaredCognitiveMode` cannot see that case by construction.
        //
        // 🔴 `readingRequirementOf` IS KEPT, ONLY ITS INPUT MOVES. Its semantics are still the ones
        // that matter — `"none"` means the policy answered "nothing is being read", and `null`
        // still means a defect resolved to the asymmetric safe side (a wrong `deliberate` costs one
        // press; a wrong `transient` advances past material the learner was meant to read).
        requiresReading:
          regions.policy && readingRequirementOf(policy.exposition.mode).requiresReading,
      },
      {
        id: "document",
        placement: "document",
        requiresReading: regions.document && unreadChunk(canvas.blocks).length > 0,
      },
    ],
    { awaitingDemonstration, busy: busy.kind !== null || policy.recording },
  );

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
        // 🔴 THE SOURCES PANEL HAS TO BE ABLE TO SAY "THE MODEL" (N10), AND IT ASKS THE CLAIMS
        // RATHER THAN THE ATTACHMENTS. This used to read `(canvas.sources, territories.length)`, so
        // the disclosure disappeared the moment any durable source arrived — while every
        // model-written claim stayed on screen underneath it. That is the laundering: attaching a
        // spreadsheet made it look like the origin of everything on the page. `policy.claims` is
        // the canvas's actual knowledge, and each object now carries whether a source really states
        // it. The predicate lives in `canvas-provenance.ts` with the reasoning.
        modelKnowledge={modelKnowledgeDisclosed(policy.claims)}
        // 🔴 THE NARROW SLICE, NOT `policy` ITSELF — see the prop's own comment in
        // canvas-header.tsx. `decidedObjectiveKey` is derived here rather than handing the whole
        // `decision` down, so nothing below this line can reach into it for anything but the one
        // fact the Minimap's "recommended" row needs (§H3).
        minimap={{
          coverage: policy.coverage,
          decidedObjectiveKey: policy.decision?.objective.identityKey ?? null,
          evidence: policy.evidence,
          focus: policy.focus,
          outcome: policy.outcome,
          setFocus: policy.setFocus,
          territories: policy.territories,
        }}
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
        onUrl={(url) => void session.attachUrl(url)}
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
        {regions.policy && (
          <CanvasPolicyView
            // 🔴 DISPATCHES `policy_continue` BEFORE ACKNOWLEDGING, NOT BECAUSE THIS CALL CHANGES
            // ANYTHING — `nextExplanationState` returns the state unchanged for this event — but
            // because the call site is what keeps that row real rather than theoretical. Contract
            // rule 2's two categories are only "explicit in the code, not incidental" if pressing
            // Continue on a correction provably does NOT also clear an unrelated aside three
            // questions old; this is where that gets exercised, and it is what a future edit
            // routing `onContinue` into `new_turn` by mistake would have to walk past.
            onContinue={
              continueBelongsTo(continueRegion, "policy")
                ? () => {
                    applyExplanationEvent({ kind: "policy_continue" });
                    policy.acknowledge();
                  }
                : null
            }
            runtime={policy}
            sharing={regions.sharing}
          />
        )}

        {/* An ordinary question, answered without touching the document (canvas-chat.ts,
            canvas-chat-routing.ts). Reuses the `.canvas-swap` treatment `canvas-document.tsx`
            already uses for a block-scoped "Explain this", the same quote-strip and Dismiss, so an
            ad hoc answer reads as one motion system rather than two effects that happen to agree.
            🔴 RENDERED HERE, NOT INSIDE `CanvasDocument`. `CanvasDocument` only mounts once the
            canvas has begun (`regions.document`), and the front door's question happens BEFORE
            that: `session.aside` with `blockId: null` is the general case
            `canvas-document.tsx`'s per-block rendering can never match, so it needs a render site
            that exists on every presence, including `invitation`. It clears on `new_turn` through
            the same `applyExplanationEvent` every other route through `submit()` already calls, so
            nothing here has to remember to dismiss it. */}
        {session.aside && session.aside.blockId === null && (
          <div className="mx-auto w-full max-w-(--canvas-column) px-6 pt-8">
            <div className="canvas-swap border-l-2 border-(--ui-stroke-secondary) py-0.5 pl-4 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)">
              {session.aside.text}
              {/* Which live pages the answer actually used, each individually promotable. This is
                  the "distinct" half of temporary-versus-durable: seeing it here is USING it for
                  one answer; pressing the small `+` is the separate, explicit act of keeping it. */}
              {session.aside.sources && session.aside.sources.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {session.aside.sources.map((source) => (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-(--ui-bg-elevated) py-0.5 pl-2.5 pr-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary) ring-1 ring-(--ui-stroke-tertiary)"
                      key={source.url}
                    >
                      <a
                        className="hover:text-(--ui-text-primary)"
                        href={source.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {(hostnameOf(source.url) ?? source.url).replace(/^www\./, "")}
                      </a>
                      <button
                        aria-label={`Add ${source.url} to sources`}
                        className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-(--ui-text-quaternary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                        onClick={() => void session.attachUrl(source.url)}
                        title="Add to sources"
                        type="button"
                      >
                        <Codicon name="add" size="0.625rem" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {session.aside.question && (
                <button
                  className="mt-3 rounded-full px-3 py-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                  onClick={() => void session.learnFromAside()}
                  type="button"
                >
                  Learn this
                </button>
              )}
              <button
                className="mt-2 block text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
                onClick={() => applyExplanationEvent({ kind: "dismiss_aside" })}
                type="button"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* 🔴 THE TWO PRE-CONTENT SCREENS ARE DELETED, NOT HIDDEN (UX brief §1). `CanvasEmpty`
            painted "What do you want to learn?" over a large dashed upload box with its own topic
            input; `SourcesAttached` painted "1 source attached" over a "Help me learn this"
            button. §1 names all three by description and §26 turns them into acceptance criteria.

            Nothing replaces them. A canvas that has not begun is the canvas, with the persistent
            composer already docked — which is §4 exactly ("no further onboarding screen") and §19
            ("the interface should almost disappear"). The composer carries the attached material
            as chips and the send control; see `showComposer` below, which used to exclude these
            two states and is the single line that forced a second and third composer to exist.

            🔴 AND THIS USED TO READ `preContent && busy.kind !== null`, WHICH IS THE DEFECT.
            Gating the processing state on the canvas NOT having begun meant that pressing send —
            the one action that ends the pre-content states — removed the only thing on the surface
            that was speaking. §24 had already made "a `learn` canvas with no blocks" the ordinary
            case, so what followed was an empty page with nothing running to explain it, on the
            first thing a student ever does. The trigger is now "there is no content to show",
            which is the question that was actually being asked. */}
        {presence === "preparing" && <CanvasThinkingPreview label={preparingLabel} />}

        {/* 🔴 A CANVAS WITH NOTHING TO PRESENT AND NOTHING RUNNING SAYS SO. This is the other half
            of the same defect, and it must NOT be a caption: `thinking-phases.ts` rules that a
            phase name is only ever emitted by a step that is genuinely executing, so showing
            "Mapping what you know" over an idle runtime would be theatre — and indistinguishable
            from the blank page it replaced, only slower to give up on.

            🔴 IT IS ALSO NOT A CLAIM ABOUT THE LEARNER. Nemesis failing to find something to ask
            is a fact about the material and about Nemesis; a surface that let it read as "you have
            nothing left to learn" would be the exact laundering the presentation invariant exists
            to prevent. The wording says what happened and offers the two moves that exist.

            Reloading is named because it genuinely recovers: knowledge is resolved when a canvas
            mounts, so a canvas whose material became readable after this one resolved will find it
            on the next open. That is the same recovery a learner stumbled into by leaving and
            reopening from the Library — made a control instead of a discovery. */}
        {/* 🔴 IT NAVIGATES TO THIS CANVAS'S OWN ADDRESS, AND `window.location.reload()` WOULD HAVE
            BEEN A WORSE DEAD END THAN THE BLANK PAGE — on the exact entry path the defect was
            reported on. Material dropped on the front door arrives at `/learn?new=1`, and nothing
            ever rewrites that URL: `useCanvasSession` mints the canvas and never touches the
            router. So reloading `?new=1` re-mounts with no id, mints a SECOND empty canvas, and
            finds the pending files already claimed — the learner loses the canvas they were
            looking at. `?c=<id>` loads theirs; every update funnels through `persist`, so it has
            been saved since long before this screen could appear.

            🔴 AND IT IS A FULL DOCUMENT LOAD, NOT `router.push`. A client-side navigation would
            re-render with the same sources, so the knowledge key would be unchanged and the policy
            would NOT look again — the button would appear to work and change nothing. Re-mounting
            is the whole mechanism by which reopening from the Library recovered. */}
        {presence === "quiet" && (
          <CanvasQuiet onRetry={() => window.location.assign(`/learn?c=${canvas.id}`)} />
        )}

        {regions.document && (
          <>

        {["learn", "targeted_relearn"].includes(canvas.state) && (
          <CanvasDocument
            aside={session.aside}
            busy={busy.kind !== null}
            busyBlockIds={busy.blockIds ?? []}
            canvas={canvas}
            // 🔴 ROUTED THROUGH THE SHARED DECISION RATHER THAN `session.dismissAside` DIRECTLY —
            // see canvas-explanation-turn.ts. Behaviourally identical for an explicit dismiss (the
            // learner's own × always clears it); what this buys is one rule with four call sites
            // instead of a handler that happens to agree with the others today.
            onDismissAside={() => applyExplanationEvent({ kind: "dismiss_aside" })}
            showContinue={continueBelongsTo(continueRegion, "document")}
            // §11 — free and local: the previous wording is already on the block, so this is a
            // state change rather than a request, and it cannot fail.
            onRestore={session.restoreRewritten}
            // §38 — the learner sets the reading pace. Writes no evidence; see the handler.
            onFinishReading={session.finishReadingChunk}
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
              <p className="flex items-center gap-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
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
            <p className="text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)">
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
          onAnswer={(text, via, tookMs) => {
            // 🔴 CONTRACT RULE 2 — answering what the canvas is asking is a "next turn" exactly as
            // much as typing a fresh question is (`submit()`'s own dispatch, above). Before this,
            // an aside opened by "Explain this" survived every retrieval answer given afterwards,
            // because nothing on THIS path — as opposed to `session.command`'s — had ever been
            // told to clear it: `askAbout`'s "disappears" was only ever true of the ask route.
            applyExplanationEvent({ kind: "new_turn" });
            if (sink.kind === "policy") void policy.submit(text, via, tookMs);
            else void session.answerActiveTask(text, via, tookMs);
          }}
          inSession={sink.kind === "policy"}
          // 🔴 THE COMPOSER NO LONGER CARRIES PROGRESSION (§38/§39). `✓` was the one control that
          // moved the learner past material; it is a `Continue` below that material now, because
          // §38 allows exactly one button and §39 makes the trigger the policy's declared cognitive
          // mode rather than anything the composer can observe.
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
          //
          // 🔴 `beginOrAnswer`, NOT `session.begin` DIRECTLY. A blank canvas with a question-shaped
          // ask and nothing attached is answered rather than swallowed as a lesson title, see that
          // function's own comment for why the check is scoped to exactly this state.
          onStart={preContent ? beginOrAnswer : null}
          pendingSources={preContent ? canvas.sources.map((source) => ({ id: source.id, title: source.title })) : []}
          selected={selected}
          task={sink.kind === "none" ? null : sink.task}
        />
      )}
    </CanvasSurface>
  );
}
