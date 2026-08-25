"use client";

// The Learning Canvas surface.
//
// One page that becomes whatever the learner needs next. There is no message list, no
// assistant column, and no route change between reading, recalling and being tested — the
// canvas itself is the interface, and the command bar is the only control.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Codicon } from "@/components/desktop-ui/codicon";
import { faviconUrl, hostnameOf, sourceLabel } from "@/lib/favicon";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { canvasCapture } from "@/lib/learn/canvas-analytics";
import { actionKey, answerSink, materialOwnsAttention } from "@/lib/learn/canvas-hosting";
import { composerIntent } from "@/lib/learn/composer-intent";
import { CanvasClarification } from "./canvas-clarification";
import { ArtifactCard } from "./artifact-card";
import { OutputPreview } from "./output-preview";
import { ResearchPlanCard } from "./research-plan-card";
import { useSettingsModal } from "@/components/workspace/shell/settings-modal";
import { useAuth } from "@/components/AuthProvider";
import { CanvasCheck } from "./canvas-check";
// 🔴 `ensureCanvasDeck` / `writeRecallCards` / `cardsFromMisses` LEFT WITH THE RESULTS SCREEN
// (owner, 2026-08-24). They existed for one caller: the "Make cards from what I missed" button on
// the card that no longer exists. All three are still exported and still used elsewhere; this file
// simply has nothing to write a deck FOR any more. A learner who wants cards asks for them in
// words, which is the rule §38 applies to everything else on this surface.
import { buildTestRun, isTestRefusal } from "@/lib/learn/test-run";
import { lookAt } from "@/lib/mascot/attention";
import { isTypingTarget, pressesContinue } from "@/lib/learn/canvas-hotkeys";
import type { CanvasBlock, CanvasOutput } from "@/lib/learn/canvas-model";
import { buildAnchor, surroundingSentence, type CanvasSelection } from "@/lib/learn/canvas-selection";
import type { PolicyOverride } from "@/lib/learn/policy-override";
import type { TeachingStrategyId } from "@/lib/learn/teaching-strategy";
import { THINKING_COPY, thinkingMark } from "@/lib/learn/thinking-phases";
import { previewLine, previewWorthShowing } from "@/lib/learn/turn-preview";
import type { MarkedTerm } from "@/lib/learn/canvas-vocabulary";


import { projectAll } from "@/lib/learn/learner-evidence";
import { HISTORY_TURNS, type TurnExchange } from "@/lib/learn/turn-router";
import { buildCanvasHistory, reconstructMoment } from "@/lib/learn/canvas-history";
import type { TurnSurroundings } from "./canvas-chat";
import { buildTranscript } from "@/lib/learn/session-transcript";
import { CanvasComposer } from "./canvas-composer";
import { COMPOSER_CAPABILITIES, type ComposerCapability } from "@/lib/learn/composer-capability";
import { planTerritories } from "@/lib/learn/curriculum-plan";

/**
 * The capabilities this surface offers: all of them.
 *
 * 🔴🔴 IT IS THE LIST ITSELF NOW, AND THE HAND-WRITTEN VERSION HAD ALREADY GONE WRONG ONCE. This
 * read `["course", "research"]`, which was complete on the day it was written and silently stopped
 * being so the moment `COMPOSER_CAPABILITIES` grew — the canvas offered two while the front door
 * offered seven, and nothing failed. That is the SAME defect #831 fixed on the front door, in a
 * second spelling: a hard-coded list cannot be wrong about itself, which is exactly what makes it
 * dangerous.
 *
 * 🔴 STILL MODULE-LEVEL, because `CanvasComposer` takes it as a prop and a fresh array on every
 * render would re-run the `useMemo` that builds the menu.
 */
const CANVAS_CAPABILITIES: readonly ComposerCapability[] = COMPOSER_CAPABILITIES;
import { nextExplanationState, type ExplanationEvent } from "./canvas-explanation-turn";
import { canvasPresentation } from "./canvas-presence";
import { CanvasFade } from "./canvas-fade";
import { CanvasHistoryRail } from "./canvas-history-rail";
import { CanvasHistoryView } from "./canvas-history-view";
import { CanvasSourceCards } from "./canvas-source-cards";
import { SemanticVisual } from "./semantic-visual";
import { replySegments } from "@/lib/learn/reply-visuals";
import { ConfirmCard } from "./confirm-card";
import { ReplyActions } from "./reply-actions";
import { SpokenExample } from "./spoken-example";
import { CanvasQuiet } from "./canvas-quiet";
import { CanvasRecorder } from "./canvas-recorder";
import { takePending } from "./pending-attachment";
import { CanvasDocument } from "./canvas-document";
import { CanvasHeader } from "./canvas-header";
import { useCanvasVoice } from "./use-canvas-voice";
import { modelKnowledgeDisclosed } from "./canvas-provenance";
import { CanvasPolicyView, screenKey } from "./canvas-policy-view";
import { BloubDock } from "@/components/bloub/bloub-dock";
import { stateForCanvas } from "@/lib/character/stations";
import { CanvasThinking } from "./canvas-thinking";
import { CanvasSelectionMenu, type SelectionAnswer } from "./canvas-selection-menu";
import { CanvasSurface } from "./canvas-surface";
import { continueBelongsTo, continueOwner, readingRequirementOf } from "@/lib/learn/canvas-continue";
import { routeRewrite } from "@/lib/learn/canvas-phrases";
import { unreadChunk } from "@/lib/learn/canvas-reading";
import { selectableRegion, useCanvasSelection } from "./use-canvas-selection";
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

/**
 * The control that puts a displaced teaching screen back.
 *
 * 🔴 IT NAMES THE DESTINATION, NOT THE ACTION. "Dismiss" would describe what happens to the reply,
 * which is not what the learner is deciding; they are choosing to go back to what they were being
 * taught. It also avoids "Continue", which is the Canvas's ONE word for "I have finished processing
 * this screen" and must not come to mean two things.
 */
const BACK_TO_LESSON = "Back to the lesson";

/**
 * Command-Enter presses whatever Continue is on screen.
 *
 * 🔴 A COMPONENT RATHER THAN AN EFFECT IN THE CANVAS BODY, AND NOT FOR TIDINESS. `continueRegion`
 * is computed below the canvas's early return, and a hook cannot sit after a conditional return.
 * Mounting the listener here also means it exists exactly when a full canvas is on screen and
 * unmounts while one is still loading — which is the correct lifetime, not a workaround.
 *
 * 🔴 IT READS A REF RATHER THAN CLOSING OVER THE HANDLER. `onContinue` is a new function on every
 * render; a dependency on it would add and remove a window listener each time. The ref keeps one
 * listener for the life of the canvas and still calls the current handler.
 */
function ContinueHotkey({ onContinue }: { onContinue: (() => void) | null }): null {
  const latest = useRef(onContinue);
  latest.current = onContinue;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // 🔴 `available` IS THE HANDLER'S OWN EXISTENCE, NOT A SECOND READING OF THE STATE. `advance`
      // is null exactly when `continueOwner` refused — while a demonstration is owed, and while the
      // canvas is busy. Asking the same question again here is how the keyboard ends up with a path
      // the button does not have.
      if (!pressesContinue(event, { available: latest.current !== null, typing: isTypingTarget(document.activeElement) })) return;
      event.preventDefault();
      latest.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

export function LearningCanvas({
  canvasId,
  openingAsk = null,
  openingCapability = null,
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
  /** The one-shot capability staged beside that typed instruction — the Course chip pressed on
   *  the front door (owner, 2026-08-23: course mode must be reachable from the landing page).
   *  Rides the same URL, consumed by the same effect, and meaningless without `openingAsk`:
   *  a capability is a declaration about a submission, and the ask IS the submission here. */
  openingCapability?: ComposerCapability | null;
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
  // A no-op outside the workspace provider, so an isolated preview of this canvas never throws.
  const { openSettings } = useSettingsModal();
  /**
   * The judge decided a submission was not an attempt at the question on screen.
   *
   * 🔴 THE SAME `converse` THE COMPOSER'S ORDINARY PATH USES, not a second conversational route.
   * What the learner typed is answered exactly as it would have been with no question up; the
   * question itself is untouched and still waiting.
   */
  // 🔴 THROUGH A REF, BECAUSE THE CYCLE IS REAL AND NOT AN ACCIDENT. `converse` is defined below and
  // needs `policy` (it reads the learner model to build the turn's surroundings); `policy` needs
  // this callback. A ref is the seam: this closes over nothing, and whatever `converse` is by the
  // time the judge answers is what runs.
  const converseRef = useRef<((said: string) => Promise<unknown>) | null>(null);
  const notAnAttempt = useCallback((said: string) => {
    void converseRef.current?.(said);
  }, []);

  const policy = usePolicyRuntime(canvas, policyOverride, strategyOverride, session.opening, notAnAttempt);
  // Voice mode. 🔴 `policy.judging` is the composer-busy signal: while an answer is being read the
  // learner is waiting on a verdict, and opening a microphone at them is asking for an answer to a
  // question they already gave.
  // 🔴 THE REPLY IS HOISTED ABOVE THIS FOR THE VOICE, and the key is the text's own length plus its
  // first characters rather than a counter — a counter would re-read the same answer after any
  // re-render, and `use-canvas-voice.ts` says an identity derived separately from the text is an
  // identity that can drift from it.
  const spokenReply = useMemo(() => {
    const aside = session.aside;
    if (!aside || aside.blockId !== null || aside.kind !== "reply") return null;
    const text = aside.text.trim();
    return text ? { key: `${text.length}:${text.slice(0, 24)}`, text } : null;
  }, [session.aside]);

  /**
   * The session record, read from the append-only evidence log.
   *
   * 🔴 THE LABEL COMES FROM THE TERRITORY, WHICH IS COARSER THAN THE OBJECTIVE, AND THAT IS STATED
   * RATHER THAN HIDDEN. Territories are the only mapping from identity key to human text this
   * surface holds; a per-objective label would be better and does not exist here yet. Where even
   * that misses, `buildTranscript` shows the raw key rather than dropping the row — an incomplete
   * record that looks complete is worse than an ugly line.
   */
  const transcript = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const territory of policy.territories) {
      for (const key of territory.identityKeys) byKey.set(key, territory.label);
    }
    return buildTranscript(policy.evidence, (key) => byKey.get(key) ?? null);
  }, [policy.evidence, policy.territories]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** The artifact open in the side panel, or null. Canvas-level rather than inside the card, so the
   *  panel survives the card being replaced by the next make mid-read. */
  const [openArtifact, setOpenArtifact] = useState<CanvasOutput | null>(null);
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

  /**
   * Files the learner picked since their last send, for the composer's attachment chips.
   *
   * 🔴 FED BY THE PICK, CLEARED BY THE SEND, AND NEVER READ FROM `canvas.sources` — that is the
   * entire design, and the history demanding it is written on `recentAttachments` in
   * canvas-composer.tsx. A machine-grounded page never passes through the picker, so it can never
   * chip. A reload starts this empty, which is correct: nothing is pending over the box the
   * learner has not touched yet.
   *
   * 🔴 THE CHIP APPEARS ON PICK, NOT ON INGEST COMPLETING. The learner's question is "did my file
   * land where I'm typing?", and the honest moment to answer it is immediately — `attachFiles`
   * takes seconds on a real deck, and a chip that appears only afterwards reproduces the silence
   * this exists to end. If ingest fails, `session.error` already says so on the same screen.
   */
  const [recentAttachments, setRecentAttachments] = useState<readonly { id: string; title: string }[]>([]);
  const attachWithChips = useCallback(
    (files: FileList | File[]) => {
      const picked = Array.from(files).map((file) => ({ id: crypto.randomUUID(), title: file.name }));
      if (picked.length > 0) setRecentAttachments((current) => [...current, ...picked]);
      void session.attachFiles(files);
    },
    [session],
  );
  const acknowledgeAttachments = useCallback(() => setRecentAttachments([]), []);

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
      const current = {
        // 🔴 THE KIND TRAVELS WITH THE FACT. An opening and an answer are both "an aside is on
        // screen", and only one of them should survive the learner acknowledging the screen it
        // introduced — see `asideIsOpening`.
        asideIsOpening: session.aside?.kind === "opening",
        hasAside: session.aside !== null,
        hasPopover: answer !== null || term !== null,
      };
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
      const result = await session.defineSelection(selection);
      if (result) setAnswer(result);
    },
    [session],
  );

  /**
   * The learner typed something about what they highlighted.
   *
   * 🔴 NOTHING HERE READS IT. Whether that request means "tell me" or "change this" is the model's
   * reading (see `askSelection`), and the two arrive already distinguished: an answer comes back to
   * paint, and a rewrite comes back as null because the DOCUMENT is where it shows. This function
   * used to take one of five action names and branch on `"simpler"`, which is the branch that made
   * five buttons necessary in the first place.
   */
  const ask = useCallback(
    async (request: string) => {
      // 🔴 Captured BEFORE the call. A rewrite replaces the block these offsets index, so reading
      // the selection again afterwards would measure against text that no longer exists.
      const picked = pointed?.selection;
      if (!picked) return;
      const reply = await session.askAboutSelection(picked, request);
      if (reply?.kind === "answer") setAnswer(reply);
      // A rewrite already showed itself on the page; leaving an empty popover open over the
      // paragraph it just changed would hide the one thing the learner asked to see.
      //
      // 🔴 AND A FAILURE IS NOT A REWRITE. `null` leaves the popover exactly where it is, because
      // `session.selectionError` is about to be rendered inside it.
      else if (reply?.kind === "rewritten") dismissSelection();
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
  /**
   * The conversation so far, oldest first, BOTH SIDES.
   *
   * 🔴 IT USED TO HOLD ONLY THE LEARNER'S OWN UTTERANCES, AND IT NEVER LEFT THE BROWSER. Six of
   * their questions were kept here purely to feed a word-overlap heuristic that guessed whether
   * they were circling one subject; not one of them was ever sent to the model. So every
   * conversational turn was literally stateless, and "why?" or "no, I meant the first one" had
   * nothing to resolve against. It now holds what Nemesis said too, and it rides the packet.
   *
   * 🔴 A REF, NOT STATE. Nothing renders from it, so state would re-render the whole canvas on
   * every turn for no visible reason.
   *
   * 🔴 AND IT IS DELIBERATELY NOT PERSISTED. The Canvas is not a chat log: contract rule 2 keeps a
   * conversational reply on screen only until the next turn, and the owner's own framing is that
   * these responses stay transient while the canvas is the durable thing. What survives a reload is
   * the canvas and its evidence; the small talk that got there does not need to.
   */
  const conversation = useRef<TurnExchange[]>([]);
  const remember = useCallback((exchange: TurnExchange) => {
    if (!exchange.said.trim()) return;
    conversation.current = [...conversation.current, exchange].slice(-HISTORY_TURNS);
  }, []);

  /** What only this component knows about the canvas's runtime, for the packet. */
  const surroundings = useCallback((): TurnSurroundings => {
    const projected = projectAll(policy.evidence);
    let demonstrated = 0;
    for (const state of projected.values()) if (state.demonstratedAt !== null) demonstrated += 1;
    return {
      // 🔴 THE RUNTIME'S OWN ANSWER, NOT THE STORED STATE. It is what decides whether this turn may
      // be parked behind a clarification card: a learner who already owes an answer to a real
      // question must not be handed a second thing to answer. See `converse`.
      answerOwed: policy.awaitingAnswer,
      clarified: session.clarified,
      demonstrated,
      history: conversation.current,
      lessonInProgress: policy.decision !== null,
      objectives: policy.claims.length,
    };
  }, [policy.awaitingAnswer, policy.claims.length, policy.decision, policy.evidence, session.clarified]);

  /**
   * One turn of talking to Nemesis.
   *
   * 🔴 NO MODES, AND NOW NO CLASSIFIER EITHER. The learner never picks "chat" or "tutor", and the
   * software no longer guesses which they meant from the shape of their sentence. The utterance,
   * the conversation so far and everything the canvas knows go to the model, and what comes back
   * says both what to say and what to do. See lib/learn/turn-router.ts.
   */
  /**
   * The one-shot capability staged on the NEXT submission, or null.
   *
   * 🔴 CLEARED BY THE COMPOSER'S OWN SUBMIT, PER §38's AMENDMENT (owner, 2026-08-23): a capability
   * declares what one submission IS and must never become a persistent teaching mode. It lives
   * here rather than in the composer so the submission handlers receive it as an argument — the
   * same pipeline as the text, never a second path.
   */
  const [capability, setCapability] = useState<ComposerCapability | null>(null);

  /** The course's Minimap projection, or null on the ordinary canvas. Resolution runs against the
   *  policy's own resolved objectives, so "no material yet" is computed where it can change —
   *  never stored (non-goal 9). */
  const planRows = useMemo(
    () => (session.coursePlan ? planTerritories(session.coursePlan, policy.objectives) : null),
    [policy.objectives, session.coursePlan],
  );

  // ── the test the learner asked for (§38's phrase path) ────────────────────
  //
  // 🔴 BUILT HERE BECAUSE THIS IS WHERE BOTH HALVES ARE. `session` knows the ask happened;
  // `policy` holds the objectives and the evidence. Neither alone can build a run, and giving
  // either one the other's data to avoid this line would be the worse trade.
  //
  // 🔴 MEMOISED ON THE REQUEST, NOT ON EVERY RENDER. `buildTestRun` is pure, but a fresh object
  // each render would remount `CanvasCheck` and reset the learner to question one mid-test — the
  // component keys its progress reset on `run` identity for exactly that reason.
  //
  // 🔴🔴 THE COURSE'S OWN POOL FIRST, THE TURN'S QUESTIONS SECOND, AND THAT ORDER IS THE POINT.
  // `buildTestRun` draws on tracked objectives with grounded distractors, real evidence and
  // balanced answer seats — everything a model-written question cannot claim. Where that exists it
  // is strictly better, so it wins. `session.testQuestions` carries the case it cannot reach at
  // all: a conversation, which has no objectives, where the material is what was just said. Before
  // 2026-08-24 that case did not exist, because a topic became a lesson; now it is the common one.
  const testRun = useMemo(() => {
    if (!session.testRequested) return "nothing-taught" as const;
    const fromPool = buildTestRun({ evidence: policy.evidence, objectives: policy.objectives });
    if (!isTestRefusal(fromPool)) return fromPool;
    return session.testQuestions ?? fromPool;
  }, [policy.evidence, policy.objectives, session.testQuestions, session.testRequested]);
  const { session: authSession } = useAuth();
  const uid = authSession?.user.id ?? null;

  const converse = useCallback(
    async (asked: string, staged: CanvasBlock | null = null, withCapability: ComposerCapability | null = null) => {
      const trimmed = asked.trim();
      if (!trimmed) return null;
      const decision = await session.converse(trimmed, surroundings(), () => {
        // 🔴 THE LEARNER ASKED FOR MATERIAL, SO WHAT COMES BACK OWNS ATTENTION — until the policy
        // moves on. The action in flight is stamped rather than a bare `true`, which is what makes
        // attention return by itself; see `materialOwnsAttention`.
        setMaterialRequestedDuring(actionKey(policy.decision?.action ?? null));
      }, staged, withCapability);
      remember({ replied: decision?.say ?? "", said: trimmed });
      // 🔴🔴 THE ONE THING ON THIS CANVAS THAT EXISTED NOWHERE DURABLE. `conversation` above is a
      // ref, capped at six turns, and its own comment says it is deliberately not persisted — so
      // "what I asked and what Nemesis said" was gone on refresh, which is exactly the history the
      // rail is for. Recording it here does NOT put a chat log back on the page: contract rule 2
      // still takes the reply off the surface on the next turn. Attention and memory are different
      // questions, and `session-transcript.ts` already made that distinction in this repo — *"that
      // is a rule about ATTENTION, not about memory"*.
      //
      // 🔴 `assistant` ONLY WHEN NEMESIS ACTUALLY SAID SOMETHING. A `study` turn answers by
      // starting a lesson rather than by speaking, and marking that as an answer would put a
      // marker on the rail that opens to an empty reconstruction.
      session.recordMoment({
        kind: decision?.say ? "assistant" : "user",
        userText: trimmed,
        ...(decision?.say ? { assistantText: decision.say } : {}),
      });
      return decision;
    },
    [policy.decision, remember, session, surroundings],
  );

  /**
   * They answered the last question of a check. Nemesis marks it, in words, in the conversation.
   *
   * 🔴🔴 THIS IS WHERE THE RESULTS SCREEN WENT — OWNER, 2026-08-24: *"at the end it shouldn't show
   * anything… it's just up to DeepSeek to report the results in its own words, not some kind of
   * screen. I just want it to say, okay, you got four out of five right, and here's the one you
   * missed and why. That's more natural."*
   *
   * 🔴 THE CARD IS CLEARED BEFORE THE TURN IS SENT, NOT AFTER. `converse` awaits a whole model
   * round trip; leaving the check mounted for those seconds would show the learner a finished
   * question list with no way forward, and `session.testRequested` is what keeps it on screen.
   *
   * 🔴 AND IT GOES THROUGH `converse`, NOT A NEW PATH. The account is the learner's own turn —
   * they answered the questions and this says what they answered — so it belongs in the
   * transcript, in the six-turn window the packet carries, and in the durable moment history,
   * exactly like anything else they say. A private side channel would mark the test with
   * information the next turn could not see.
   */
  const finishCheck = useCallback(
    async (account: string) => {
      session.clearTest();
      await converse(account);
    },
    [converse, session],
  );

  /**
   * The learner settled the decision Nemesis was waiting on, by tapping an option or by typing one.
   *
   * 🔴 ONE WRAPPER FOR BOTH ROUTES, BESIDE `converse` AND FOR THE SAME REASONS. It stamps the
   * action in flight before the resumed turn can write into the document, and it records the
   * exchange in the conversation the packet carries — a resumed turn that vanished from the
   * transcript would leave the next "why?" resolving against the wrong thing.
   *
   * 🔴 IT IS NOT `converse`, AND IT MUST NOT BE FOLDED INTO IT. `converse` opens a NEW turn; this
   * finishes one that is already open. Routing an answer through the new-turn path is exactly the
   * defect shape this whole feature was careful about: the card would stay on screen, and the
   * learner's answer would be read as a fresh question.
   */
  const answerClarification = useCallback(
    async (answered: string) => {
      const trimmed = answered.trim();
      if (!trimmed) return;
      const decision = await session.answerClarification(trimmed, surroundings(), () => {
        setMaterialRequestedDuring(actionKey(policy.decision?.action ?? null));
      });
      remember({ replied: decision?.say ?? "", said: trimmed });
    },
    [policy.decision, remember, session, surroundings],
  );

  const beginOrAnswer = useCallback(
    (asked: string, withCapability: ComposerCapability | null = null) => {
      // A send acknowledges the attachment chips, same as every other send route.
      acknowledgeAttachments();
      applyExplanationEvent({ kind: "new_turn" });
      const trimmed = asked.trim();
      // An empty send with material staged is "learn this material with me", which is not an
      // utterance at all — there is nothing for the model to read, and the composer's own chips
      // already said what the send means. 🔴 A capability cannot arrive here: the composer refuses
      // the empty send while one is staged (`canStartFromAttachment`), because a declaration with
      // no words attached would have to be silently dropped — the exact argument-drop this
      // signature exists to end.
      if (!trimmed) {
        session.begin(undefined);
        return;
      }
      // 🔴 THE CAPABILITY RIDES THE SAME CALL AS THE WORDS. This function used to take `(asked)`
      // alone, so anything the composer attached to the submission was dropped on the one canvas
      // the Course capability exists for — a fresh one. Structured intent and text travel together
      // or the pipeline has two doors again.
      void converse(trimmed, null, withCapability);
    },
    [acknowledgeAttachments, applyExplanationEvent, converse, session],
  );

  // Consume the opening instruction exactly once, when the canvas is ready and still empty.
  // 🔴 Guarded by a ref rather than by state: `begin` updates the canvas, which re-runs this
  // effect, and without the latch the same topic would start a second lesson over the first.
  const askedOnce = useRef(false);
  useEffect(() => {
    if (!openingAsk || askedOnce.current || !session.ready) return;
    if (canvas.state !== "empty") return;
    askedOnce.current = true;
    // The front door's staged capability rides the consumed submission — the same one-shot the
    // composer's own chip has, one navigation later.
    beginOrAnswer(openingAsk, openingCapability);
  }, [beginOrAnswer, canvas.state, openingAsk, openingCapability, session.ready]);
  converseRef.current = converse;

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
    async (text: string, withCapability: ComposerCapability | null = null) => {
      // 🔴 CONTRACT RULE 2 — "normal chat responses may remain only until the next turn." Fired
      // ONCE, before any branch below, so every route out of this function (explain-this, scoped
      // edit, rewrite, refused, ordinary) gets it for free rather than five branches each needing
      // to remember. Safe ahead of `only` below: it touches `aside`/the selection popover only,
      // never `selected` — see canvas-explanation-turn.ts.
      applyExplanationEvent({ kind: "new_turn" });

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
      // 🔴 SEVERAL PASSAGES STAGED IS NOT A QUESTION. The learner pointed at exactly this text and
      // typed an instruction about it, so there is no "did they mean to ask or to edit" to read:
      // they picked the passages by hand. Short-circuited above the model call so a scoped edit
      // costs nothing extra, and so `converse` is never asked to reason about a "this" that means
      // four different paragraphs at once.
      if (selected.length > 1) {
        setMaterialRequestedDuring(actionKey(policy.decision?.action ?? null));
        await session.command(text, selected);
        clearSelection();
        return;
      }

      // 🔴 ONE READING OF THE TURN, WHETHER OR NOT A PASSAGE IS STAGED. This used to be three
      // separate decisions made before any model saw the sentence:
      //
      //   · `/^(where|which source|what source)\b/i` with a passage staged — three openers were
      //     answered beside the passage, and every other sentence was treated as an instruction to
      //     EDIT it. "is this the same as what we did last week?" silently rewrote the paragraph
      //     the learner was asking about.
      //   · `asksForRewrite`, a list of instruction phrases plus a list of confusion phrasings with
      //     an interrogative guard wedged between them to stop the two colliding.
      //   · everything left over, which went to `converse`.
      //
      // All three asked the same question — what does the learner want done with what is on screen
      // — and answered it three different ways. Now the model answers it once, with the staged
      // passage in the packet so "this" has something to resolve against, and the canvas decides
      // what each answer is allowed to do. See lib/learn/turn-router.ts.
      const decision = await converse(text, only, withCapability);

      if (decision?.then === "rewrite") {
        // 🔴 THE REFERENT IS READ, NEVER GUESSED — see canvas-phrases.ts. "Most recent block" and
        // "nearest the viewport" are inventions about time and gaze; the active reading region is
        // derived from Continue presses the learner made themselves. And a demonstration owed
        // outranks the model's answer outright: rewriting the material under a live question would
        // hand the learner the answer to it.
        const routing = routeRewrite({
          // 🔴 THE RUNTIME'S OWN ANSWER, NOT A THIRD COPY OF THE TEST. This read
          // `action.type === "retrieve"` and would have gone stale the moment a second kind of ask
          // existed: a learner sitting in front of an unanswered recognition task would have had
          // their typing routed as a question about the material. See `PolicyRuntime.awaitingAnswer`.
          awaitingDemonstration: policy.awaitingAnswer,
          hasReadingMaterial: canvas.blocks.length > 0,
          selectedBlockId: only?.id ?? null,
          unreadBlockIds: unreadChunk(canvas.blocks).map((block) => block.id),
        });

        if (routing.kind === "rewrite") {
          const block = canvas.blocks.find((candidate) => candidate.id === routing.blockId);
          if (block) {
            // 🔴 `text` GOES WITH IT. The router read this sentence to decide a rewrite was wanted;
            // the rewrite itself then needs it to know WHICH rewrite. Without it every instruction
            // came back as the same simplification. `rewritable` is true because a document block is
            // exactly where a rewrite has somewhere to land.
            await session.rewriteSelection({
              anchor: { exact: block.content.slice(0, 64), prefix: "", suffix: "" },
              blockId: block.id,
              endOffset: block.content.length,
              regionId: block.id,
              rewritable: true,
              selectedText: block.content,
              startOffset: 0,
              surroundingText: block.content,
            }, text);
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
        // `defer-to-policy` falls through to the scaffolding path below.
      }

      // The only case still standing is `defer-to-policy`: a rewrite asked for while a
      // demonstration is owed, which is a scaffolding request (§33) and the policy's to answer.
      // Everything else has already been carried out by `converse` — a `reply` set the aside, under
      // the staged passage when there was one, and a `study` either began a session or wrote into
      // the study document scoped to that passage.
      // 🔴 THE LEARNER ASKED, SO WHAT COMES BACK IS THE ACTION — until the policy moves on. The
      // action in flight is stamped here rather than a bare `true`, which is what makes attention
      // return by itself; see `materialOwnsAttention`.
      if (decision?.then === "rewrite") {
        setMaterialRequestedDuring(actionKey(policy.decision?.action ?? null));
        await session.command(text, selected);
      }
      clearSelection();
    },
    [applyExplanationEvent, canvas, clearSelection, converse, policy.decision, policy.feedback, policy.prompt, selected, session],
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
  //
  // 🔴🔴 AND NOT ON A CANVAS THAT HAS NOTHING TO SHOW BESIDE IT — owner, 2026-08-24: *"going back
  // to previous canvases causes a glitch where it just flips, it doesn't even show anything, and it
  // just asks questions."* Reproduced: a canvas the retired teaching lane had put into `learn`
  // reopens, the policy resumes, and it stages a question over a surface with no blocks and no live
  // reply — so the learner is ambushed by a question about a lesson they cannot see. This file
  // already documents that exact shape one state over ("a question float at the top of an empty
  // surface"); the door §24 opened is what let it reach `learn` too.
  //
  // A course keeps its right to ask: `coursePlan` means there is a plan behind the question even
  // when this canvas holds no blocks yet. Everything else waits for the learner to say something,
  // which is what a conversation does anyway.
  const policyHasSomethingBehindIt =
    canvas.blocks.length > 0 || session.coursePlan !== null;
  const policyPresenting =
    policy.status === "ready" &&
    policyHasSomethingBehindIt &&
    (policy.feedback !== null || policy.decision !== null);

  /**
   * Nemesis has answered something the learner asked, and that answer is live.
   *
   * 🔴 `blockId === null` BECAUSE A `blockId` MEANS THE ANSWER BELONGS TO A PASSAGE and is rendered
   * under it by `CanvasDocument`; only the general case is a turn of conversation occupying the page.
   *
   * 🔴🔴 AND `kind === "reply"`, WHICH IS THE HALF A BROWSER FOUND AND NO TEST COULD. A `study` turn
   * on a canvas that has not begun ALSO writes an aside: the opening line, "Hydroxyl it is. Quick
   * pass before we dig in:", set immediately before `begin()`. Counting that as a reply made it
   * displace the very lesson it was introducing, so "Teach me the hydroxyl functional group"
   * printed one sentence and then nothing, for the rest of the session. An opening is the first
   * sentence OF what follows; an answer is a turn INSTEAD of it.
   */
  /**
   * A check is on screen and it is what the learner is being held to.
   *
   * 🔴🔴🔴 OWNER, 2026-08-25: *"when the quiz is created, it should fit the canvas, deepseek should
   * not say anything like 'here it is'. that way users do not have to scroll down."* The quiz
   * renders in its own block BELOW the reply, so a turn that produced one printed a paragraph of
   * preamble first and the learner had to scroll past it to reach the first question. Measured on
   * the live app the same week, the paragraph was *"Ready. Five questions coming up covering the
   * main parts of a neuron… The first one will ask you to identify a labelled part on a diagram."*
   * Every word of that is the quiz describing itself to somebody already looking at it.
   *
   * 🔴🔴🔴 AND HIDING THE PROSE IS THE WRONG FIX, WHICH I TRIED FIRST. This file already records
   * what happens when a check turn's answer goes missing: 2026-08-24, *"Teach me the three branches
   * of the US government, then quiz me on it"* returned five good chips and an EMPTY answer, and the
   * canvas printed "Nemesis had nothing to add." above a quiz on a lesson never given. Suppressing
   * the prose whenever a check exists reproduces exactly that, for exactly that request: the learner
   * asked for two things and would see only the second.
   *
   * So the answer stays and the SURFACE moves to the check instead. A preamble above it costs a
   * scroll the learner never has to make; a hidden lesson costs the lesson.
   *
   * 🔴 A REFUSAL IS NOT A CHECK. "There is nothing to test yet" is the whole answer to that turn and
   * has no questions under it, so it does not take the surface from anything.
   */
  const checkOwnsSurface = session.testRequested && !policy.awaitingAnswer && !isTestRefusal(testRun);

  const asideOnScreen: "none" | "opening" | "reply" =
    session.aside === null || session.aside.blockId !== null ? "none" : session.aside.kind;

  // 🔴 A STEP IS RUNNING, ANSWERED HONESTLY AND IN ONE PLACE. `thinking-phases.ts` is explicit that
  // a caption on a timer "would look exactly like a system thinking and would be theatre", so this
  // reports work that is genuinely in flight and nothing else. It is what separates "Nemesis is
  // busy" from "Nemesis has nothing for you", which are opposite things to say to a learner.
  //
  // 🔴🔴 `policy.status === "loading"` IS LOAD-BEARING HERE NOW, AND IT IS THE OTHER HALF OF THE
  // BLANK-SCREEN FIX. This comment used to say the clause was deliberately absent because the early
  // return above made it unreachable — and it ended with the exact sentence that turned out to
  // matter: *"`canvasPresence` still accepts the input so the value stays correct if that early
  // return is ever removed."* It has been removed, so the input is supplied.
  //
  // 🔴 WITHOUT IT THE BLANK PAGE COMES BACK WEARING WORSE COPY. Knowledge resolution does not always
  // name a phase — for a canvas with no sources `topicTerritory` returns before `onPhase` is ever
  // called — so `phase` can be null while the policy is genuinely still loading. `working` would be
  // false, presence would resolve to `quiet`, and the learner would read *"Nemesis has your material
  // but hasn't found anything to ask you about yet"* about a canvas that is still working it out.
  // Progress rendered as failure is the one thing `quiet` must never do.
  // 🔴 `policy.phase` TOO, AND THAT SECOND CLAUSE IS A MEASURED DEFECT, NOT A TIDY-UP. Observed in
  // production on a grounded topic canvas: `Teach me innate immunity.` attached three pages, the
  // session's own `busy` cleared, and knowledge extraction carried on running underneath — during
  // which this said `false`, the presence resolved to `quiet`, and the learner read *"Nemesis has
  // your material but hasn't found anything to ask you about yet"* for about fifteen seconds before
  // a perfectly good question appeared. Progress rendered as failure, which is the one thing
  // `quiet` must never do.
  //
  // 🔴 `phase`, NOT `thinking`. `thinking` is `phase !== null` AND long enough to be worth SAYING
  // OUT LOUD (`THINKING_VISIBLE_AFTER_MS`) — a deliberate delay so a fast step does not flash a
  // caption. Whether a step is worth narrating and whether one is running are different questions,
  // and using the narration flag here would reopen the same hole for exactly the length of that
  // delay. `preparingLabel` already handles a null label honestly.
  // 🔴🔴 `policy.deciding` IS THE THIRD STATE THAT WAS MISSING, AND ITS ABSENCE RENDERED PROGRESS AS
  // A DEAD END. Between two questions the controller is choosing the next move: `status` is already
  // `ready`, no phase is narrated, and `busy` is the session's rather than the policy's — so none of
  // the three flags below held, `canvasPresentation` fell through to `quiet`, and the learner read
  // "Nemesis hasn't found anything to ask you about yet" with a Try again button, mid-lesson.
  const working =
    busy.kind !== null || policy.phase !== null || policy.status === "loading" || policy.deciding;

  /**
   * The learner just sent something and Nemesis is making the answer to it.
   *
   * 🔴🔴 `busy` ONLY, AND DELIBERATELY NOT THE THREE POLICY FLAGS `working` ALSO CARRIES. `busy` is
   * the SESSION's — it is set by `converse`, `command` and `attachFiles`, which is to say by things
   * the learner just did. The policy flags cover knowledge resolution, which this session MEASURED
   * running for minutes on a topic-only canvas; keying the thinking screen on those would take a
   * lesson off the screen of someone reading it, for minutes, which is #690's blank screen with a
   * drawing on top.
   */
  const turnInFlight = busy.kind !== null;
  /**
   * Voice, once the answer has actually finished arriving.
   *
   * 🔴🔴 `turnInFlight` IS THE GATE, AND WITHOUT IT AUTOPLAY IS A COST BUG (§48). `spokenReply`'s key
   * is derived from the text, and the text GROWS as the answer streams — so an ungated autoplay
   * would fire a fresh paid synthesis on every chunk of every answer, each one cancelling the last,
   * and the learner would hear the beginning of the answer over and over. It is the same signal the
   * row of controls under an answer keys on, for the same reason: half an answer is not an answer.
   */
  const voice = useCanvasVoice(policy, turnInFlight ? null : spokenReply);

  // 🔴 WHAT PAINTS AND WHETHER ANYTHING PAINTS ARE ONE DERIVATION NOW — see canvas-presence.ts.
  //
  // This line used to call `composeSurface` directly, and it did so WITHOUT `hasReadingMaterial`,
  // which that module's own documentation names as a defect ("absent means assume there is", and a
  // task then makes room for a document that is not there). Worse, the question composeSurface
  // cannot answer — is there anything on this surface at all? — was left to inline conditions
  // further down, and they said no in a state that had no way back. A canvas that had begun with
  // nothing generated into it painted an empty page for ever.
  const { presence, regions } = canvasPresentation({
    // 🔴 THE RUNTIME'S OWN ANSWER TO "IS SOMETHING OWED", NOT A READING OF THE ACTION TYPE. It is
    // already derived from `presenting` inside `use-policy-runtime.ts`, which is the one place that
    // knows a verdict can outlive the decision that produced it — see `awaitingAnswer` there.
    answerOwed: policy.awaitingAnswer,
    blocks: canvas.blocks.length,
    canvasState: canvas.state,
    // 🔴 NOTHING WAS ATTACHED, SO NOTHING WAS SEARCHED. See `hasMaterial` in canvas-presence.ts.
    hasMaterial: canvas.sources.length > 0,
    // 🔴 THE MATERIAL IS THE ACTION ONLY WHILE THAT ACTION IS STILL IN FLIGHT. Answering the
    // question lands evidence, the policy picks a different action, this flips to false and the
    // task has attention back — with no handler anywhere having to remember to clear anything.
    materialIsTheAction: materialOwnsAttention({
      actionInFlight: actionKey(policy.decision?.action ?? null),
      requestedDuring: materialRequestedDuring,
    }),
    aside: asideOnScreen,
    policyPresenting,
    turnInFlight,
    working,
  });

  /**
   * What is on screen, as one string — the identity `CanvasFade` swaps on.
   *
   * 🔴 COMPOSED FROM THE THREE THINGS THAT CAN OCCUPY THE SURFACE, and from nothing else. `presence`
   * covers the states with no content of their own (preparing, quiet, invitation); `screenKey`
   * is the policy view's OWN existing identity for a teaching screen, exported rather than
   * reimplemented so the outer fade and the inner remount can never disagree about what "a
   * different screen" means; the aside contributes its text because two consecutive replies are two
   * different things to read even though neither is a teaching screen.
   *
   * 🔴 NOTHING ABOUT BUSY, LOADING OR THE CLOCK. Those change many times inside one screen, and a
   * key that moved with them would fade the canvas out and back in while the learner was reading —
   * which is the flicker this exists to remove, arriving as the fix for it.
   */
  /**
   * A teaching screen exists and this reply is standing in front of it.
   *
   * 🔴 COMPUTED ONCE BECAUSE TWO PLACES READ IT AND THEY MUST NEVER DISAGREE. The reply decides
   * which single control it offers from this, and the control itself is gated on it; written out
   * twice — once negated — a future edit changes one and the learner gets either two pills or none.
   * "None" is the dangerous half: the way back to a displaced lesson would simply not be drawn.
   */
/** The pages to show under a reply: what it CITED, or failing that what it READ.
   *
   * 🔴 CITED FIRST BECAUSE IT IS THE STRONGER CLAIM — these pages supported particular sentences.
   * The fallback is weaker and still true: this answer was built from these. Never nothing, which
   * is what a searched answer showed before and which presents live research as the model's own
   * recall. Derived once so the row's condition and its contents cannot disagree. */
  const replySources =
    session.aside?.sources?.length ? session.aside.sources : session.aside?.consulted ?? [];

  /** The reply's own text and its index-aligned pages, hoisted out of the JSX.
   *
   * 🔴 HOISTED BECAUSE A CLOSURE LOSES THE NARROWING. `session.aside` is checked non-null by the
   * gate around the block below, but the `.map` callback is a function and TypeScript cannot carry
   * a narrowing across it — and the honest fix is a value, not a `!`. A non-null assertion here
   * would be asserting exactly the thing that has gone wrong on this surface before. */
  const replyText = session.aside?.blockId === null ? session.aside.text : "";
  const replyConsulted = session.aside?.blockId === null ? session.aside.consulted : undefined;
  /** Hoisted for the same narrowing reason as the two above: `session.aside` is re-read per line. */
  const replyVisualList = session.aside?.blockId === null ? session.aside.visuals ?? [] : [];

    const lessonHeld = policyPresenting && !regions.policy;

  /**
   * The moment the History Rail is showing, or null for the present.
   *
   * 🔴 COMPONENT STATE, NOT SESSION STATE, AND NOT PERSISTED. Where you are LOOKING is not a fact
   * about the canvas — reopening it tomorrow must land on now, not on wherever you last browsed
   * to. It is also why nothing about rewinding reaches `update()`: the canvas is not modified by
   * being read.
   */
  const [rewound, setRewound] = useState<string | null>(null);

  /**
   * The rail's rows.
   *
   * 🔴 MEMOISED ON THE FOUR ARRAYS IT ACTUALLY READS, NOT ON `canvas`. The canvas object is
   * replaced on every autosave (`update` spreads it and stamps `updatedAt`), so depending on the
   * whole thing would rebuild the history — and re-render the rail — on a keystroke that touched
   * nothing it shows. This is the "keep it cheap" requirement, and it is the only place it needed
   * spending.
   */
  const history = useMemo(
    () =>
      buildCanvasHistory({
        createdAt: canvas.createdAt,
        moments: canvas.moments,
        questions: canvas.questions,
        responses: canvas.responses,
        sources: canvas.sources,
      }),
    [canvas.createdAt, canvas.moments, canvas.questions, canvas.responses, canvas.sources],
  );

  /** What to paint while rewound. Null whenever the moment has gone or nothing is rewound to. */
  const viewing = useMemo(
    () =>
      rewound
        ? reconstructMoment(
            {
              createdAt: canvas.createdAt,
              moments: canvas.moments,
              questions: canvas.questions,
              responses: canvas.responses,
              sources: canvas.sources,
            },
            rewound,
          )
        : null,
    [canvas.createdAt, canvas.moments, canvas.questions, canvas.responses, canvas.sources, rewound],
  );

  /**
   * 🔴 A NEW TURN RETURNS THE LEARNER TO NOW. Leaving the canvas rewound while an answer arrives
   * behind it would put the reply somewhere they cannot see and leave a stale moment reading as
   * the live one — the single dangerous state this feature has. `turnInFlight` is the same signal
   * the thinking screen keys on.
   */
  useEffect(() => {
    if (turnInFlight) setRewound(null);
  }, [turnInFlight]);

  // 🔴 IT READS ITS OWN ANSWER (owner 2026-08-24: when it is "reading off the output", it
  // should "look at the words that are on screen"). A fresh reply sends the eyes to the
  // words for a beat — through the same attention channel a focused field uses — then the
  // pointer gets them back. lookAt(null) on cleanup, so leaving the canvas mid-beat never
  // strands the character staring at a spot where text used to be.
  const replyRegionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!replyText || !replyRegionRef.current) return;
    lookAt(replyRegionRef.current);
    const timer = window.setTimeout(() => lookAt(null), 2600);
    return () => {
      window.clearTimeout(timer);
      lookAt(null);
    };
  }, [replyText]);

  // 🔴🔴🔴 AND IT SITS BELOW EVERY HOOK, WHICH IS NOT A STYLE CHOICE. React identifies hooks
  // by call order, and this gate used to stand in the middle of the component with
  // `useCanvasVoice`, the history rail's state and three more hooks underneath it — so the
  // render after the canvas's one database read called MORE hooks than the render before it.
  // React throws for exactly that, and the crash landed on precisely the entry paths that start
  // unready (a deep link, a hard refresh, going back into an old canvas) and took the exit
  // button down with it. Guarded in send-is-acknowledged.test.ts.
  // 🔴🔴 THIS USED TO RETURN ON `policy.status === "loading"` TOO, AND THAT WAS THE BLANK SCREEN.
  //
  // Measured 2026-08-18 against production: a learner types anything on the front door and gets an
  // EMPTY PAGE — no composer, no reply, nothing they can do — for as long as the canvas takes to
  // resolve its knowledge. 25 seconds for a plain greeting; 59 for "teach me pharmacokinetics",
  // which has to search for material and ingest it first. No error, no crash, no console line: the
  // component was returning a surface with one optional caption in it, and the caption only appears
  // once a NAMED phase has been running long enough to be worth saying out loud. Most of that time
  // there was literally nothing on screen.
  //
  // 🔴 THE REASON IT WAS WRITTEN IS GONE. The comment here used to say that painting early would
  // let "the stage machine's own effects start generating a lesson for a canvas the policy is about
  // to own". That machine no longer exists: nothing below this line generates anything on mount,
  // and `composeSurface` already withholds every content region while the policy has nothing —
  // `policyPresenting` requires `status === "ready"`, so a loading canvas resolves to `preparing`,
  // which is a real surface WITH the composer under it. Suppressing the whole page was protecting
  // against a runtime that had already been deleted.
  //
  // 🔴 WHAT STAYS IS `!session.ready`, WHICH IS A DIFFERENT CLAIM. That means the canvas itself has
  // not loaded from the database yet — there is no title, no sources, no state, and a composer
  // would have nothing to submit into. It is one read and it is fast.
  //
  // 🔴 AND IT CARRIES THE EXIT, WHICH IT DID NOT (UX brief §38.2). This branch used to return a
  // bare `<main>` with a caption in it: no header, therefore no way out. Harmless while the shell
  // still floated a rail toggle in the corner; under §38.1, which takes the rail away inside a
  // canvas, it is a page a learner cannot leave — on the exact entry paths (deep link, hard
  // refresh, fresh sign-in) that land here first. `CanvasSurface` renders the `×` above the
  // branch, so this state cannot be reached without one.
  if (!session.ready) {
    return (
      <CanvasSurface onExit={leave}>
        <div className="flex h-full items-center justify-center">
          {/* Nothing is docked yet — there is no composer to stand above — so the character
              simply holds the middle, which is where it would have walked to anyway. */}
          <BloubDock bottom={0} contain left={0} state={stateForCanvas({ thinking: true, preparing: true })} />
          {/* This branch is one database read long and shows no caption, so the dock's own
              animation is the whole of what says "working" here. Nothing draws a second one. */}
          {/* 🔴 USUALLY NOTHING RENDERS HERE AT ALL, AND NOW THAT IS FINE. This branch is one
              database read long. It was not fine while it also covered knowledge resolution, which
              is a model call and an ingestion and can run for a minute. */}
          {/* 🔴 EXCEPT WHEN THE ONE READ FAILED — then the sentence is the whole point. The loader
              sets `session.error` instead of leaving this screen to stand for ever (owner report,
              2026-08-23), and a failure with no words here would be exactly that stand. */}
          {session.error
            ? <p className="max-w-sm px-6 text-center text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">{session.error}</p>
            : policy.thinking && policy.phase && <CanvasThinking phase={policy.phase} />}
        </div>
      </CanvasSurface>
    );
  }



  // 🔴🔴 THE MODE IS NOT PART OF THE IDENTITY ANY MORE (owner 2026-08-22: "canvas should have one
  // persistent screen not a swapping one"). `presence` was the first element, so every change of
  // MODE — reading → thinking → question — rebuilt the whole surface through `CanvasFade` at
  // 160ms out plus 220ms in. A single answer crossed it twice and spent ~760ms dissolving the page
  // away and back.
  //
  // What is left is what the surface is SHOWING: which question, and what Nemesis last said. Those
  // are genuinely new content and deserve the crossfade the fade was written for — "question →
  // feedback → next question", as globals.css puts it. Going busy and coming back is not new
  // content and no longer counts as a swap.
  const surfaceKey = [
    regions.policy ? screenKey(policy) : "-",
    session.aside ? `aside:${session.aside.text.slice(0, 40)}` : "-",
    // 🔴 SO THE HISTORICAL VIEW ARRIVES AND LEAVES THROUGH THE SAME FADE EVERYTHING ELSE USES.
    // Without this the swap between two moments is instant while every other swap on the canvas
    // is animated, which reads as a different app for one interaction.
    rewound ? `moment:${rewound}` : "-",
  ].join("|");

  // 🔴 THE NAME OF THE STEP THAT IS RUNNING, OR NONE — never a guess. `CanvasThinkingPreview`
  // accepts `null` and says so in its own header ("when the caller has no honest label it passes
  // none and the lines carry the state alone"), so there is nothing to invent here. The session's
  // own label wins because it is the more specific of the two: "Reading" names the file being
  // ingested, where the policy phase names the canvas-wide step behind it.
  // 🔴🔴 THE LIVE THINKING PREVIEW, RESOLVED IN ONE PLACE. Owner, 2026-08-21: a short natural-language
  // line beside the character saying what Nemesis is working on, updated as real stages change, gone
  // when the answer starts.
  //
  // 🔴 THE MODEL'S WORDS WHEN IT HAS THEM FOR THIS STAGE, THE SYSTEM'S WHEN IT DOES NOT. A milestone
  // is conversational and about the learner's subject — only the model can write that. The system
  // label is the honest fallback for a step the model could not have anticipated: pages coming back,
  // a structure being looked up, a curve being computed.
  //
  // 🔴 AND NOTHING AT ALL ON A TURN THAT SIMPLY ANSWERS. `previewWorthShowing` is the owner's first
  // rule — *"for a simple conversational response, do not show a thinking preview"* — because a
  // greeting that flashes a line about planning teaches the learner to stop reading the slot.
  // 🔴 IN ORDER OF HOW SPECIFIC THE FACT IS. `busy` names an ingestion or a search that owns the
  // whole surface; `work` names a step inside a turn (a lookup, a curve); the policy phase names the
  // canvas-wide step behind everything. All three are work that is genuinely running, which is the
  // only thing this slot is allowed to hold.
  const systemLabel =
    busy.kind !== null ? busy.label : session.work ?? (policy.phase ? THINKING_COPY[policy.phase] : null);
  const preparingLabel = previewWorthShowing({ milestones: session.milestones, systemLabel })
    ? previewLine({ milestones: session.milestones, stage: session.stage, systemLabel })
    : null;
  // 🔴 THE MARK IS DERIVED FROM THE SAME THREE FACTS, IN THE SAME ORDER, as `systemLabel` above —
  // that is the only thing stopping a magnifier appearing beside "Reading your material".
  // `searching` is the most specific truth available and outranks the rest, and it is true only
  // while a turn is in flight AND real hostnames have come back, which is the same gate the chips
  // themselves are drawn behind.
  const preparingMark = thinkingMark({
    busyKind: busy.kind,
    phase: policy.phase,
    searching: turnInFlight && session.searchedDomains.length > 0,
    work: session.work,
    // 🔴 THE MARK THE LABEL BROUGHT WITH IT, and nothing else. `thinkingMark` still refuses to
    // invent one for a label that arrived bare — see the note on `workMark` there.
    workMark: session.workMark,
  });

  // 🔴 ONE PLACE DECIDES WHO RECEIVES THE ANSWER, AND IT CANNOT NAME TWO. The composer used to pick
  // with `policyOwns ? … : …`, which was safe only while ownership was all-or-nothing. Now that a
  // task can sit beside a document, a ternary would happily route an answer typed at a recall card
  // to the policy's prompt id — evidence written against a question nobody was asked, with every
  // test still green. See canvas-hosting.ts.
  const sink = answerSink({
    // 🔴 THE CARD GOES IN THE SINK RATHER THAN BESIDE IT, WHICH IS THE WHOLE REASON IT IS SAFE. The
    // primary composer stays on screen underneath the options, and typing into a text box that is
    // right there is the ordinary thing to do. Held anywhere this union cannot see, that submission
    // reaches `start` on a canvas that has not begun — `begin()` re-titles it and regenerates it.
    // `answerSink` ranks it last, so a real question still outranks it and no owed answer can be
    // read as a preference.
    clarifying: session.clarifying,
    hosted: policy.task,
    regions,
    stageTask: session.activeTask,
  });

  /**
   * 🔴🔴🔴 WHAT SUBMITTING MEANS RIGHT NOW — ONE VALUE, NOT FIVE BOOLEANS RACING THROUGH HANDLER
   * PRECEDENCE.
   *
   * This replaces `preContent = canvas.state === "empty" || canvas.state === "sources_attached"`,
   * which was read in three places and was WRONG in all of them the moment the policy staged a
   * question. Nothing advances `canvas.state` when that happens — knowledge resolves as soon as a
   * source's durable id lands, and `openCanvas()` (the only writer of `learn`) runs inside
   * `begin()`, which the learner has not pressed yet. So `preContent` stayed true with a real
   * question on screen, `onStart` was still handed to the composer, and the composer's routing put
   * starting above answering. The learner typed an answer, pressed **Submit answer**, and the text
   * went to `begin()`: no judge, no evidence row, and their canvas re-titled underneath them.
   *
   * 🔴 IT IS NOT A THEORY. Production holds exactly one typed answer that reached the judge —
   * canvas `796a6045`, 2026-08-14 — and that canvas is stored at `learn`. The predicate is the
   * discriminator.
   *
   * See composer-intent.ts. The rule it encodes is the owner's: *if Nemesis is visibly asking the
   * learner a question, submitting through the primary composer is an answer to that question.*
   */
  const intent = composerIntent({
    awaitingAnswer: policy.awaitingAnswer,
    canvasState: canvas.state,
    // 🔴🔴 THE UNDISPLACED VALUE, DELIBERATELY — see `policyHasContent` in composer-intent.ts. This
    // is the fact that the canvas HAS a lesson, which does not stop being true because a reply is
    // in front of it. Passing `regions.policy` here instead would make `start` reachable the moment
    // Nemesis answered a question on a canvas that had attached material but never been begun.
    policyHasContent: policyPresenting,
    sink,
  });

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

  /**
   * Pressing the Continue that is on screen, whichever region owns it — or null when none is.
   *
   * 🔴🔴 ONE FUNCTION, SO THE KEYBOARD CANNOT HAVE A PATH THE BUTTON DOES NOT. Command-Enter and
   * the visible control now call exactly this; the alternative — a shortcut that reaches into
   * `policy.acknowledge()` on its own — is a second way to advance the canvas, free to keep working
   * after the button's own conditions change. `continueOwner` already guarantees at most one owner,
   * so there is nothing to arbitrate here, only one place to say what pressing it does.
   *
   * 🔴 NULL IS THE REFUSAL AND IT IS INHERITED, NEVER RESTATED. `continueOwner` returns null while a
   * demonstration is owed (its N3 guard: a control that moves the learner on while an answer is
   * owed is a way to press past the question) and while the canvas is busy. Both the button and the
   * key get that for free by asking whether this is null.
   */
  const advance = continueBelongsTo(continueRegion, "policy")
    ? () => {
        // 🔴 DISPATCHES `policy_continue` BEFORE ACKNOWLEDGING, NOT BECAUSE THIS CALL CHANGES
        // ANYTHING — `nextExplanationState` returns the state unchanged for this event — but
        // because the call site is what keeps that row real rather than theoretical. Contract
        // rule 2's two categories are only "explicit in the code, not incidental" if pressing
        // Continue on a correction provably does NOT also clear an unrelated aside three
        // questions old; this is where that gets exercised, and it is what a future edit
        // routing `onContinue` into `new_turn` by mistake would have to walk past.
        applyExplanationEvent({ kind: "policy_continue" });
        policy.acknowledge();
      }
    : continueBelongsTo(continueRegion, "document")
      ? () => session.finishReadingChunk()
      : null;


  return (
    // One uninterrupted sheet. The controls and the composer float on it; nothing divides it —
    // the sheet, its scrim, the floating strip and the `×` all come from `CanvasSurface`, which
    // owns them so that no render branch can omit the exit. See the note at the top of that file.
    <CanvasSurface
      // 🔴 THE WHOLE CANVAS IS THE DROP TARGET, not the composer. A 52px pill is a target you have
      // to aim at, and nobody aims at a text box when they are dragging a PDF — they drop it on the
      // page. Same door a picked file takes, so a dropped lecture and a chosen one are one path.
      onDropFiles={(files) => void session.attachFiles(files)}
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
        making={session.making}
        modelKnowledge={modelKnowledgeDisclosed(policy.claims)}
        onMakeDeliverable={(kind) => void session.makeDeliverable(kind)}
        replyAudio={voice.replyAudio}
        transcript={transcript}
        voice={voice.header}
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
          // 🔴 THE COURSE, RESOLVED AGAINST WHAT THIS CANVAS ACTUALLY HOLDS — see `planRows` above.
          // Null on the ordinary canvas, in which case the panel is exactly what it was yesterday.
          plan: planRows,
          planTitle: session.coursePlan?.title ?? null,
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
        onFiles={attachWithChips}
        onRename={session.rename}
      />
      }
    >
      {/* Clearance for the floating controls, expressed as padding on the scroller. It is NOT a
          header height — nothing is reserved, painted or bounded up there; the page simply
          starts below where the controls sit (12px inset + 28px control + 24px breathing room,
          compact-UI pass -- was 16+32+24=72, tightened alongside the header it clears). */}
      {/* Command-Enter presses whatever Continue is on screen. Renders nothing. */}
      <ContinueHotkey onContinue={advance} />

      {/* 🔴🔴 BOTTOM PADDING, AND ITS ABSENCE WAS A REAL BUG. Owner, 2026-08-20: *"also i cant
          scroll all the way down."* This had `pt-[64px]` to clear the header and nothing at all for
          the composer — which is an ABSOLUTELY POSITIONED overlay at `bottom-0`, so it takes no
          space in this scroller and the last stretch of every answer sat permanently underneath it.
          Scrolling could not reach it because there was nothing below it to scroll to.

          🔴 SIZED FROM THE OVERLAY, NOT GUESSED: 56px of gradient (`pt-14`) + a 52px composer +
          16px (`pb-4`) is 124, and the composer GROWS with what is typed into it, to
          `MAX_COMPOSER_HEIGHT`. 160 clears a composer several lines tall and leaves the gradient
          doing its job rather than hiding text behind it. */}
      {/* ── the History Rail ───────────────────────────────────────────────────────────────
          🔴 A SIBLING OF THE SCROLLER, NOT A CHILD OF IT. Inside, it would scroll away with the
          answer; the rail is a fixture of the Canvas, not a mark on the page.

          🔴 IT IS NOT THE MINIMAP AND THEY BOTH LIVE HERE AT ONCE. The Minimap is a header control
          answering "where am I in what I'm learning" from the learner model; this answers "what
          happened here, and how did I get here" from a moment log that provably cannot state
          anything about knowledge. See canvas-history-rail.tsx. */}
      <CanvasHistoryRail
        activeMomentId={rewound}
        entries={history}
        onSelect={setRewound}
      />

      {/* ── the rewound Canvas ─────────────────────────────────────────────────────────────
          🔴 AN OPAQUE OVERLAY RATHER THAN A REPLACED SUBTREE, AND THAT IS THE CHEAP CORRECT ONE.
          Unmounting the live surface to show history would tear down the policy's screen, the
          reply and its audio controller, and rebuild all three on `Return to now` — a visible
          rebuild, and a loss of any local state they hold, for a read-only detour. The sheet's own
          background makes it a replacement to look at while leaving the live Canvas standing
          behind it, which is why returning is instant.

          🔴 `z-10`: OVER THE CONTENT, UNDER THE CHROME. The exit `×` and the header controls sit at
          z-20/z-30 in `CanvasSurface` and must stay pressable — a history view that trapped the
          learner would be a worse bug than the one it fixes. */}
      {viewing && (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-(--ui-bg-editor) pb-[160px] pt-[64px]">
          <CanvasFade contentKey={`moment:${viewing.momentId}`}>
            <CanvasHistoryView moment={viewing} onReturn={() => setRewound(null)} />
          </CanvasFade>
        </div>
      )}

      <div className="relative h-full overflow-y-auto pb-[160px] pt-[64px]">
        {/* 🔴🔴 EVERYTHING THAT SWAPS, SWAPS THROUGH ONE FADE — owner call, 2026-08-19: "text should
            fade away and fade in". `.canvas-swap` only ever faded content IN, at 140ms, which is
            below what anyone notices; the owner's reading ("there are also no fade in or fade out
            animations?") was accurate. Fading OUT needs the outgoing subtree to survive its own
            unmount, which is what `CanvasFade` does and why it is a component rather than a class.

            🔴 ONE WRAPPER AROUND ALL THREE REGIONS, NOT THREE WRAPPERS. A question replacing a reply
            is the same motion as a correction replacing a question; wrapping each region separately
            would fade them independently and produce a moment with both on screen at once.

            🔴 THE KEY IS WHAT IS BEING SHOWN, NOT WHETHER SOMETHING IS LOADING. Keying on `busy`
            would fade the page out and back in every time a request started, which is the flicker
            this is meant to remove. */}
        <CanvasFade contentKey={surfaceKey}>
        {/* 🔴 THE POLICY'S CONTRIBUTION COMES FIRST IN THE FLOW, NOT OVER THE TOP OF THE DOCUMENT.
            An overlay would hide the very material 7b exists to keep visible, and a learner who
            wanted to look something up would have to dismiss the question to do it. It sits above
            the reading and the reading continues beneath it — one continuous surface, which is why
            neither is in a panel, a modal or a column of its own. */}
        {/* 🔴 NO LONGER GATED ON `preparing`. Content outranks thinking — see `canvas-presence.ts`.
            The presence ladder now reports `preparing` only when there is nothing to keep, so this
            region simply paints whenever `composeSurface` says it may. */}
        {regions.policy && (
          <CanvasPolicyView
            lookedUp={session.lookedUp}
            voice={{ replay: voice.replay, speaking: voice.speaking }}
            // 🔴 DISPATCHES `policy_continue` BEFORE ACKNOWLEDGING, NOT BECAUSE THIS CALL CHANGES
            // ANYTHING — `nextExplanationState` returns the state unchanged for this event — but
            // because the call site is what keeps that row real rather than theoretical. Contract
            // rule 2's two categories are only "explicit in the code, not incidental" if pressing
            // Continue on a correction provably does NOT also clear an unrelated aside three
            // questions old; this is where that gets exercised, and it is what a future edit
            // routing `onContinue` into `new_turn` by mistake would have to walk past.
            onContinue={continueBelongsTo(continueRegion, "policy") ? advance : null}
            runtime={policy}
            sharing={regions.sharing}
          />
        )}

        {/* An ordinary question, answered without touching the document (canvas-chat.ts,
            lib/learn/turn-router.ts). Reuses the `.canvas-swap` treatment `canvas-document.tsx`
            already uses for a block-scoped "Explain this", the same quote-strip and Dismiss, so an
            ad hoc answer reads as one motion system rather than two effects that happen to agree.
            🔴 RENDERED HERE, NOT INSIDE `CanvasDocument`. `CanvasDocument` only mounts once the
            canvas has begun (`regions.document`), and the front door's question happens BEFORE
            that: `session.aside` with `blockId: null` is the general case
            `canvas-document.tsx`'s per-block rendering can never match, so it needs a render site
            that exists on every presence, including `invitation`. It clears on `new_turn` through
            the same `applyExplanationEvent` every other route through `submit()` already calls, so
            nothing here has to remember to dismiss it. */}
        {/* 🔴 GATED ON THE REGION NOW, NOT ON THE STATE. The condition is the same one
            `replyOnScreen` computes — that is the point: `composeSurface` decides the RELATIONSHIP
            between this and the policy's screen (which of them yields, and to which), and reading
            the raw state here would be a second opinion free to disagree with the first. */}
        {regions.reply && session.aside && (
          <div className="mx-auto w-full max-w-(--canvas-column) px-6 pt-8" ref={replyRegionRef}>
            {/* 🔴 AN ANSWER, NOT A QUOTATION — owner call, 2026-08-19. This carried a 2px left rule
                and rendered at `--ui-text-secondary` (66%), which is the treatment this app gives
                ASIDES: something attached to the document, subordinate to it, quoted off to one
                side. But when Nemesis answers what you asked, that reply IS the page — there is no
                document beside it for it to be an aside to — and dressing it as marginalia while it
                is the only thing on screen made Nemesis read as if it were quoting someone else.
                Plain text at full strength, in the same column and at the same 16px/26px as the
                reference. See `canvas-document.tsx`, which keeps the rule for the genuinely
                block-scoped case ("Explain this" on a passage), where the quotation is true. */}
            {/* 🔴 A NEW SEND FADES THE OLD ANSWER (owner 2026-08-25: "the current output did
                not disappear… to have the mascot in the middle"). While the next turn is in
                flight the previous reply eases out and the character takes the centre — the
                same 220ms curve every departing preview uses — instead of the new thinking
                happening on top of a page that still looks finished. `forwards` holds it gone;
                the class drops when the new reply replaces the text. */}
            <div className={`canvas-swap text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)${turnInFlight ? " canvas-preview-out" : ""}`}>
              {/* 🔴🔴 THE HIGHLIGHT TOOLBAR ONLY EVER WORKED OVER DOCUMENT BLOCKS, AND THAT WAS
                  INVISIBLE UNTIL SELECTION WENT ON EVERYWHERE. `readCanvasSelection` requires a
                  `[data-selectable-id]` ancestor, and `selectableRegion()` was called from exactly
                  one place in the app: `canvas-document.tsx`, on a block. So Define/Example/Why/
                  Explain were unreachable on any canvas with no reading material — which is every
                  topic-only canvas, where `canvas.blocks` is empty by design.

                  🔴 AND #695 MADE IT LOOK BROKEN RATHER THAN ABSENT. Turning `user-select` on for
                  the whole canvas meant the learner could finally drag across a reply — and get
                  nothing. Highlighting that does nothing reads as a dead feature; before, the text
                  simply refused to highlight.

                  🔴 THE TEXT GETS ITS OWN ELEMENT, NOT THE WRAPPER. Offsets are measured against
                  the element carrying the marker, and this div also holds the source pills, the
                  offer and the buttons — measuring from here would count all of it, and
                  `readCanvasSelection`'s integrity check would refuse every selection. One element,
                  one string.

                  🔴 NOT `rewritable`. "Simpler" REWRITES the passage it is invoked on, and there is
                  no block behind a reply to rewrite. `selectionActions` already drops that option
                  when the region does not claim it, so the toolbar offers exactly the four that
                  work here. */}
              {/* 🔴🔴 THE SAME RENDERER THE CHAT SURFACE USES, AND SUPPLYING `sources` IS THE WHOLE
                  FIX. Owner, 2026-08-20: *"nemesis still doesnt have inline text source pills or
                  bubbles with the favicon for thumbnail."* The answer came back with `[1]`, `[4]`,
                  `[6]` sitting in the prose as literal characters, because this rendered
                  `{session.aside.text}` as a raw string.

                  `AssistantMarkdown`'s own documentation states the behaviour that was missing:
                  supplying `sources` "turns the answer's [n] markers into inline source pills;
                  omitting them leaves the text as-is". `citationsToMarkdown` rewrites each marker
                  into a link and the renderer draws it as a favicon dot the height of the
                  surrounding text. It has been built and tested on the chat surface since August;
                  the Canvas simply never called it.

                  🔴 THE CANVAS'S OWN TYPE WINS. `MARKDOWN_CONTAINER_CLASS_NAME` sets
                  `--conversation-text-font-size`, which is the sessions surface's scale, not the
                  16px/26px this canvas was measured to. The overrides below are last in the string
                  so they take precedence, and the reading measure stays the canvas column's.

                  🔴 THE SELECTABLE MARKER MOVES TO THE WRAPPER, WHICH IS STILL AN ELEMENT HOLDING
                  ONLY THIS PROSE. Offsets are measured against the marked element; the pills, the
                  offer line and the buttons are siblings of this div, not children of it. */}
              {/* 🔴🔴 A REPLY CAN DRAW NOW. Reported 2026-08-20: "i asked it to create the chemical
                  structures using the new tools we gave it" — and it answered in prose, because a
                  reply was a string and nothing on this path could produce a picture.
                  `SemanticVisual` has rendered nine kinds including `structure` for weeks; every one
                  was reachable only from the TEACHING path. The capability existed and the
                  conversation had no way to reach it.

                  🔴 THE SEGMENTS KEEP THEIR ORDER, which is the whole reason this is a split rather
                  than a `visuals` array. A drawing lands exactly where the model put it, between the
                  sentence that introduces it and the one that follows.

                  🔴 EACH PROSE RUN KEEPS ITS OWN SELECTABLE MARKER. Offsets are measured against the
                  marked element, so one marker wrapping prose AND an SVG would fail
                  `readCanvasSelection`'s integrity check on every selection. */}
              {replySegments(replyText, replyVisualList).map((segment, index) =>
                segment.kind === "visual" ? (
                  <SemanticVisual key={`v${index}`} visual={segment.visual} />
                ) : segment.kind === "target_language" ? (
                  /* 🔴🔴 THE ONE PLACE THE LANGUAGE LANE IS REACHED FROM. §43 built a router that
                     speaks a target-language sentence in a named variety and §47 wired Azure to
                     say it; neither could ever run, because nothing in a conversation could say
                     "this much is Spanish". The model marks it, this mounts it, and `speakExample`
                     is the only caller in the product that passes the language purpose.

                     🔴 OUTSIDE THE MARKED DIV, for the same reason a drawing is: one marker
                     wrapping prose AND a button would fail `readCanvasSelection`'s integrity
                     check on every selection inside it. */
                  <SpokenExample
                    key={`s${index}`}
                    locale={segment.locale}
                    onSpeak={() => voice.speakExample(`s${index}`, segment.locale, segment.text)}
                    onStop={voice.stopSpeaking}
                    // 🔴 THIS ROW, NOT ANY ROW. `voice.header.speaking` is one boolean for the whole
                    // surface, and handing it to every example turned all of them into stop buttons
                    // the moment one played (owner, 2026-08-21).
                    speaking={voice.speakingExample === `s${index}`}
                    text={segment.text}
                  />
                ) : (
                  <div key={`p${index}`} {...selectableRegion(index === 0 ? "reply" : `reply-${index}`)}>
                    <AssistantMarkdown
                      className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)"
                      namedCitations
                      // 🔴 INLINE `$x$` IS MATHS ON THIS SURFACE, WHICH IS THE OPPOSITE OF THE
                      // CHAT DEFAULT AND DELIBERATE. The flag is off globally because of an owner
                      // screenshot: "$0.20 per million input tokens and $1.20" turned into
                      // italics. That reasoning is about a surface where prices come up and
                      // notation does not. This one is the reverse — a learner working through
                      // kinetics or a proof meets `$k$` far more often than a dollar sign — and
                      // `$$…$$` display maths already rendered here regardless.
                      singleDollarMath
                      sources={replyConsulted}
                      text={segment.text}
                    />
                  </div>
                ),
              )}

              {/* 🔴🔴 THE CONFIRMATION CARD SITS UNDER THE SENTENCE THAT EXPLAINS IT, and above the
                  copy/voice row rather than below it: what the learner has to decide must come
                  before the controls for the answer they have finished reading. It is on the aside,
                  so the next turn replaces the card with the answer it belonged to — a card that
                  outlived its sentence would be a consent button attached to nothing.
                  🔴 SAME `turnInFlight` GATE AS THE ROW BELOW. A "Delete" button under half an
                  answer is a button under a sentence that is about to say something else. */}
              {!turnInFlight && session.aside?.pending && (
                <ConfirmCard onAnswer={(approve) => session.confirmPending(approve)} pending={session.aside.pending} />
              )}

              {/* 🔴 AFTER THE ANSWER, AND ONLY ONCE IT HAS ARRIVED. Copying half an answer copies
                  half an answer, and a play button on a sentence about to be replaced reads as
                  broken. `turnInFlight` is the same signal the thinking screen keys on. */}
              {!turnInFlight && replyText.trim() && (
                <ReplyActions
                  // 🔴 THE CONTROLLER FOR *THIS ANSWER'S* AUDIO (§48), not a shared "something is
                  // playing" boolean. Play, pause, seek, speed and progress all read from one state,
                  // so an example row speaking elsewhere can never turn this into a stop button.
                  audio={voice.replyAudio}
                  // 🔴 THE RAW REPLY FOR THE VOICE, THE FLATTENED PROSE FOR THE CLIPBOARD, AND THE
                  // TWO MUST DIFFER. `replySpeechPlan` reads the `[say: …]` marks to route each
                  // sentence to the voice that must say it; the clipboard wants those marks gone.
                  // Handing the synthesiser the flattened copy is how a Spanish drill gets read by
                  // the English prose voice.
                  spoken={replyText}
                  // 🔴 THE PROSE, NOT THE RENDERED PAGE. `replySegments` splits drawings out of the
                  // text; pasting "[figure 1]" into someone's notes is pasting our wire format at
                  // them, and a synthesiser reading it aloud is worse.
                  text={replySegments(replyText, replyVisualList)
                    // 🔴 The spoken example is part of the answer: dropping it makes Copy lossy.
                    .filter((segment) => segment.kind === "prose" || segment.kind === "target_language")
                    .map((segment) => (segment as { text: string }).text)
                    .join("\n\n")
                    .trim()}
                />
              )}

              {/* Which live pages the answer actually used, each individually promotable. This is
                  the "distinct" half of temporary-versus-durable: seeing it here is USING it for
                  one answer; pressing the small `+` is the separate, explicit act of keeping it. */}
              {/* 🔴🔴 CARDS, NOT DOMAIN PILLS — owner call after measuring ChatGPT, 2026-08-20.
                  A broad question produced ten pills reading "Cnbc", "Cnbc", "Businessinsider",
                  with nothing to tell them apart; the HEADLINE is what distinguishes them and it
                  was the one thing not shown. See `canvas-source-cards.tsx` for why there is no
                  thumbnail and no "Today": this search does not return either, and inventing them
                  would be a claim about freshness the product cannot stand behind.

                  🔴 CITED FIRST WHEN THERE IS ONE, because it is the stronger claim: these pages
                  supported particular sentences. The fallback is the weaker and still-true one:
                  these are the pages this answer was built from. Never nothing — a searched answer
                  that shows no origin presents live research as the model's own recall. */}
              {replySources.length > 0 && (
                <CanvasSourceCards
                  cards={replySources.map((source) => ({ title: source.title || source.url, url: source.url }))}
                  onAdd={(url) => void session.attachUrl(url)}
                />
              )}

              {/* 🔴🔴 "LEARN THIS" IS GONE, 2026-08-20. Owner: *"why does nemesis still show
                  'learn this'?"*, having already said once before that it was clutter they had not
                  asked for.

                  🔴 THE GATE WAS THE PROBLEM, AND NARROWING IT WOULD NOT HAVE BEEN ENOUGH. It hung
                  on `aside.topic` — "did this turn name a subject?" — which nearly every real
                  question does, so a button offering to start a lesson sat under nearly every
                  answer. The line ABOVE it was properly rare; the button was not, and a nudge that
                  appears every time is not a nudge.

                  🔴 THE CAPABILITY IS UNTOUCHED, WHICH IS THE STANDING RULE HERE — remove the
                  control, not the feature. `learnFromAside` still exists and the router still reads
                  `topic` off every turn; asking to be taught in words is the door now, and it is
                  the one the semantic front door was built to open. §46's "Teach me X" acceptance
                  cases go through that door, not this button. */}
              {/* 🔴🔴 THE WAY BACK, AND IT IS NOT OPTIONAL POLISH — IT IS THE EXIT.
                  `no-screen-is-a-dead-end.test.ts` states the rule this obeys: a screen the learner
                  cannot leave is the product's worst failure mode, and it has already shipped once.
                  A `deliberate` teaching screen's ONLY exit is its Continue, and displacing that
                  screen takes the Continue with it — `continueOwner` reads `regions.policy` for
                  exactly the reasons that make displacement work everywhere else.

                  🔴 AND TYPING CANNOT GET THE LEARNER BACK, WHICH IS WHY A CONTROL IS REQUIRED
                  RATHER THAN NICE. Every route through `submit()` fires `new_turn`, which clears
                  this reply — and then sets the NEXT one. So a learner who talked their way off a
                  lesson could talk for ever and never see it again. This is the only thing that
                  puts it back.

                  🔴 IT APPEARS ONLY WHEN SOMETHING IS ACTUALLY BEING HELD. `policyPresenting &&
                  !regions.policy` is precisely "the policy has a screen and this reply is standing
                  in front of it" — on an ordinary conversational canvas with no lesson behind it
                  there is nothing to go back to, and a button offering to would be a dead control. */}
              {lessonHeld && (
                <div className="mt-6">
                  <button
                    className="rounded-full px-3 py-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                    onClick={() => applyExplanationEvent({ kind: "dismiss_aside" })}
                    type="button"
                  >
                    {BACK_TO_LESSON}
                  </button>
                </div>
              )}
              {/* 🔴 NO "Dismiss" — owner call, 2026-08-19, AND NOTHING IS STRANDED BY REMOVING IT.
                  The reply already clears on `new_turn` through the same `applyExplanationEvent`
                  every route through `submit()` calls, so saying anything at all replaces it; the
                  button was a second way to do what the next message does anyway. A chat reply that
                  asks to be dismissed reads as a notification rather than as an answer, which is
                  the whole complaint. `dismiss_aside` stays in `canvas-explanation-turn.ts` — it is
                  still how the block-scoped popover closes. */}
            </div>
          </div>
        )}

        {/* 🔴🔴 ITS OWN BLOCK, NOT NESTED IN THE REPLY ABOVE, AND THAT IS DELIBERATE. `say` is
            allowed to be empty — a model that asks a good question and says nothing else has still
            taken a complete turn — and nesting the card inside `regions.reply && session.aside`
            would make the whole feature disappear on exactly that turn, silently. The card is what
            the turn IS; the sentence above it is optional. */}
        {session.clarifying && presence !== "preparing" && (
          // 🔴 `pb-40` IS THE COMPOSER'S HEIGHT, THE SAME NUMBER `canvas-document.tsx` USES. The
          // composer is absolutely positioned over the bottom of this scroll container, so a card
          // with no bottom padding has its last control sitting underneath it — and on a short
          // canvas there is nothing to scroll, so the Submit button is simply unreachable.
          <div className="mx-auto w-full max-w-(--canvas-column) px-6 pb-40">
            <CanvasClarification
              onDismiss={session.dismissClarification}
              // 🔴 THE LABEL, NOT THE ID — because tapping must be indistinguishable from typing
              // it, and `readClarifyAnswer` resolves a label back to its option. One route in, one
              // meaning, and no branch that only the mouse exercises. The card's own Other box
              // sends its prose through this same prop for the same reason.
              onAnswer={(text) => void answerClarification(text)}
              question={session.clarifying}
            />
          </div>
        )}

        {/* 🔴🔴 THE PLAN, BEFORE ANY OF IT IS PAID FOR. A Deep research run is about a minute and
            several metered searches from a budget shared with ordinary chat search, so the learner
            sees what it intends to look up and presses Start. Planning is one model call and no
            searches, which is what makes showing them affordable.

            🔴 IT SITS BESIDE THE CLARIFICATION CARD BECAUSE IT IS THE SAME KIND OF OBJECT: a card
            the turn produced, answered by tapping, with the composer below untouched. What it is
            NOT is a clarification — nothing was ambiguous, the learner declared the capability, and
            this is Nemesis showing what it understood rather than asking what they meant. */}
        {/* 🔴 THE FILE, HANDED BACK IN THE FLOW. Owner, 2026-08-25, with screenshots of the
            reference: a finished document arrives in the conversation as an object with a name on
            it, not as a line of notice text pointing at a panel. It sits in the same slot as the
            plan card and the clarification because it is the same kind of thing — something this
            turn produced, sitting above an untouched composer. */}
        {session.madeArtifact && presence !== "preparing" && (
          <div className="mx-auto w-full max-w-(--canvas-column) px-6 pb-40">
            <ArtifactCard onOpen={() => setOpenArtifact(session.madeArtifact)} output={session.madeArtifact} />
          </div>
        )}
{/* The reader, docked to the right. Mounted at canvas level so it outlives the card. */}
        {openArtifact && <OutputPreview onClose={() => setOpenArtifact(null)} output={openArtifact} />}
                {session.researchPlan && presence !== "preparing" && (
          <div className="mx-auto w-full max-w-(--canvas-column) px-6 pb-40">
            <ResearchPlanCard
              onCancel={session.cancelResearchPlan}
              onStart={session.startResearchPlan}
              question={session.researchPlan.question}
              starting={session.making === "report"}
              subQuestions={session.researchPlan.subQuestions}
            />
          </div>
        )}

        {/* 🔴🔴 THE TEST THE LEARNER ASKED FOR, IN THE CHAT (owner 2026-08-24: *"the 'tests' are
            supposed to be in chat chips for users to click through"*). It sits here, beside the
            clarification card, because both are the same kind of object: a card the turn produced
            that the learner answers by tapping, with the composer below untouched.

            🔴 THE REFUSAL IS SHOWN, NOT SWALLOWED. `buildTestRun` refuses freely — nothing taught
            yet, or too little that can carry an honest question — and a request that produced
            silence would read as a broken feature. Saying which of the two happened is the whole
            difference between "not yet" and "something is wrong". */}
        {/* 🔴🔴 "MEMORY UPDATED", THE WAY CHATGPT SAYS IT — owner 2026-08-24: *"does memory work like
            it does in ChatGPT where you basically can see the memory prompt and the updates?"* The
            Settings screen already answered the first half (every line, verbatim, deletable). This
            is the second half: knowing at the moment it happens, rather than discovering weeks
            later that a file has been accumulating.

            🔴 IT NAMES A COUNT AND A DESTINATION, NEVER THE FACT ITSELF. Printing the sentence into
            the canvas would put a claim about the learner on their screen mid-lesson; the place to
            read and delete those is Settings, where all of them are together and none of them is a
            surprise.

            🔴 AND IT IS DISMISSIBLE, because a notice that cannot be put away is an alert. */}
        {session.memoryNotice > 0 && (
          <div className="mx-auto w-full max-w-(--canvas-column) px-6">
            <p className="canvas-swap mt-4 flex items-center gap-2 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary)">
              <span className="flex-1">
                Memory updated.{" "}
                {/* 🔴🔴 IT OPENS THE POPUP; IT DOES NOT NAVIGATE (owner 2026-08-24: settings are
                    *"supposed to be a pop up, not supposed to be a replaced chat or the Canvas
                    page"*). This shipped as `<a href="/settings">`, which is a full page load: a
                    learner mid-lesson who wanted to glance at what had just been remembered lost
                    the canvas they were reading and had to find their way back to it. Every other
                    door into settings in the shell already calls `openSettings`; this one was the
                    single exception, and it was the one attached to a notice that appears WHILE
                    the learner is working — the worst possible moment to take the page away. */}
                <button className="underline" onClick={() => openSettings("memory")} type="button">
                  See what Nemesis remembers
                </button>
              </span>
              <button
                aria-label="Dismiss"
                className="shrink-0 rounded-md bg-transparent px-1.5 py-0.5 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                onClick={session.clearMemoryNotice}
                type="button"
              >
                ✕
              </button>
            </p>
          </div>
        )}

        {session.testRequested && presence !== "preparing" && !policy.awaitingAnswer && (
          <div className="mx-auto w-full max-w-(--canvas-column) px-6 pb-40">
            {isTestRefusal(testRun) ? (
              <p className="canvas-swap mt-5 rounded-2xl p-4 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary)">
                {testRun === "nothing-taught"
                  ? "There is nothing to test yet. Learn some of this first, then ask again."
                  : "Not enough of this canvas can carry a fair question yet. Keep going a little longer and ask again."}
              </p>
            ) : (
              <CanvasCheck onDismiss={session.clearTest} onFinished={(account) => void finishCheck(account)} run={testRun} />
            )}
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
        {presence === "preparing" && (
          <CanvasThinkingPreview label={preparingLabel} mascot={turnInFlight} />
        )}

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
        {presence === "quiet" && !checkOwnsSurface && (
          <CanvasQuiet
            // 🔴 `relook=1` IS WHAT MAKES THIS BUTTON DO ANYTHING. Without it the reload re-resolves
            // and a remembered empty answer short-circuits before a lane runs — the identical screen,
            // every press. See `takeRelook` in `use-policy-runtime.ts`.
            onRetry={() => window.location.assign(`/learn?c=${canvas.id}&relook=1`)}
            unread={canvas.sources.find((source) => source.coverageNote)?.coverageNote ?? null}
          />
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
            // 🔴 THE SAME FUNCTION THE KEYBOARD CALLS. `advance` is non-null exactly when
            // `showContinue` is true, so the fallback is unreachable and exists only to keep the
            // prop non-nullable — routing this through the shared derivation is what stops
            // command-enter and the button drifting into two ways of moving on.
            onFinishReading={advance ?? session.finishReadingChunk}
            // §11 — free and local: the previous wording is already on the block, so this is a
            // state change rather than a request, and it cannot fail.
            onRestore={session.restoreRewritten}
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

        </CanvasFade>

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

      {/* 🔴 THE CHARACTER, AND IT IS NOT A LOADING INDICATOR. It lives above the composer for
          the whole session, not only while something is running, because a companion that only
          appears when you are waiting IS a spinner with a face. What changes while Nemesis works
          is where it stands and what it does: it walks to the middle of the surface and comes
          back, and `canvas-motion.test.ts`'s rule still holds — the CAPTION beside it is still
          the name of a step that is genuinely executing, and nothing here narrates progress.

          🔴 IT TAKES NO SPACE AND NO CLICKS. Absolutely positioned, `pointer-events: none`,
          outside the flow — it cannot reflow the lesson it is sitting on, and it cannot swallow
          a press meant for the composer behind it. */}
      <BloubDock
        anchor="#canvas-composer"
        // 🔴 THE CAPTION RIDES THE CHARACTER. It used to be its own box on the page and ended up
        // against the right edge of the window, hundreds of pixels from the mascot it was meant to
        // label (owner, 2026-08-21: "why is the 'thinking' so far off"). Nothing static can sit
        // beside something whose position is a live transform, so it moved onto the dock itself.
        caption={turnInFlight || presence === "preparing" ? preparingLabel : null}
        captionMark={turnInFlight || presence === "preparing" ? preparingMark : null}
        // 🔴 THE ANSWER HAS STARTED ARRIVING, SO THE CAPTION MAKES WAY. `replyText` is the text as
        // it streams, and its first character is the honest end of the wait — not a timer, and not
        // the turn formally finishing.
        captionLeaving={Boolean(replyText.trim())}
        // 🔴🔴 GATED ON THE TURN, NOT ON THE LIST BEING NON-EMPTY, and that is what makes a stale
        // chip unrepresentable. The session clears the hosts when a fresh request goes out, but
        // computing the gate HERE means no cleanup path has to be remembered: between turns there
        // is no turn in flight, so there are no chips, whatever the session happens to be holding.
        // Same construction as `caption` on the line above.
        domains={turnInFlight ? session.searchedDomains : undefined}
        // 🔴 THE SURFACE KNOWS, BECAUSE THE POSE NO LONGER DOES. The character works in `idle` now
        // that the dots are gone, and `idle` is also how it rests — so "come forward" has to be
        // said by whoever knows a turn is in flight rather than inferred from the animation.
        station={turnInFlight || presence === "preparing" ? "centre" : "corner"}
        contain
        // 🔴 "!" WHEN SOMETHING WENT WRONG, "?" WHEN NEMESIS IS WAITING ON THE LEARNER, and null on
        // nearly every render — a mascot that is always signalling is a mascot nobody looks at.
        //
        // 🔴 THE ERROR OUTRANKS THE QUESTION. Both can be true at once (a question on screen and a
        // turn that just failed), and of the two only the failure is news: the question is already
        // rendered in full, in words, in the middle of the page.
        // 🔴 AND NOT WHILE NEMESIS IS WORKING. `awaitingAnswer` stays true across a turn, so the
        // "?" sat on the mascot's head THROUGH its own thinking — scaled up with it, in the middle
        // of an otherwise empty page (owner, 2026-08-21: "a random question mark"). The mark means
        // "Nemesis needs something from you", and while it is thinking it does not: it needs to
        // finish. This is the same distinction the dock's own `state` already draws, applied to
        // the badge that sits on top of it.
        // 🔴🔴 AND NOT WHILE THE QUESTION IS OFF SCREEN, WHICH IS THE REST OF "RANDOM" (owner
        // 2026-08-21, still seeing it after the narrowing above: "the mascot randomly gets a
        // question mark on its head"). `awaitingAnswer` is the POLICY's state — it stays true
        // whenever the runtime believes it has asked for something — while `regions.policy` is
        // whether that question is actually PAINTING. The two come apart on every surface that
        // withholds the policy region: a reply, a document, a lesson held back. So the mark sat
        // over a page with no question anywhere on it, which from the learner's side is exactly
        // a mark appearing for no reason.
        //
        // The mark means "Nemesis needs something from you". If the thing it needs is not on
        // screen, the mark is not a signal — it is a puzzle. Gated on the region that renders it.
        marker={
          session.error
            ? "!"
            : awaitingDemonstration && regions.policy && !turnInFlight && presence !== "preparing"
              ? "?"
              : null
        }
        // 🔴🔴 `turnInFlight`, NOT `policy.thinking` — AND THIS IS THE SAME MISTAKE THE THINKING
        // SCREEN ALREADY FIXED, MADE AGAIN ONE COMPONENT OVER.
        //
        // Reported 2026-08-20 as the mascot "painting over answers". Measured on production: the
        // dock's resting position was correct (bottom 84px, left 336px, right at the composer) and
        // a TRANSFORM was lifting it 412px up and scaling it 2.1x — the deliberate "come forward to
        // think" station, still applied minutes after the answer had landed.
        //
        // The cause is what `policy.thinking` MEANS. It is `phase !== null`, and the phases include
        // `mapping_knowledge` — background knowledge resolution measured in MINUTES. So a learner
        // reading a finished answer had a character standing over it at double size because
        // something unrelated was still running behind the page. `use-canvas-session` records this
        // exact distinction for the thinking SCREEN ("never `working`, which includes knowledge
        // resolution"); the dock was wired to the other signal and nobody had looked.
        //
        // 🔴 THE ANIMATION IS UNCHANGED. `ACTIVITY_STATE` maps `thinking` and `preparing` onto the
        // same state, so this alters WHERE the character stands and WHEN, never what it plays.
        state={stateForCanvas({ thinking: turnInFlight, preparing: presence === "preparing" })}
        // 🔴 THE GLASSES GO ON ONLY WHILE MATERIAL IS ACTUALLY BEING TAKEN IN — `busy` names an
        // ingestion or a search that owns the surface, which is the one moment "reading" is the
        // literal truth. Tied to anything broader (thinking, preparing) they would become a
        // costume, and rule 4 of the language is that every face has a reason. See face.ts.
        face={busy.kind !== null ? "reading" : undefined}
        // 🔴🔴 NEVER HIDDEN FOR THE PREVIEW ANY MORE (owner 2026-08-25: "It won't show the
        // mascot… it would just disappear"). This carried `hidden={presence === "preparing"}`
        // from the era when CanvasThinkingPreview drew its own character — the six-dot rule:
        // one renderer per surface. The preview stopped drawing a character when the caption
        // moved onto the dock, so the guard was switching off the ONLY character for the sake
        // of one that no longer existed. The six-dot rule still holds, satisfied the other way
        // round: the preview is announcement-only (sr-only) and the dock is the one owner.
      />

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
          onAsk={(request) => void ask(request)}
          onSpeak={(text) => voice.speakAloud(text)}
          speaking={voice.header.speaking}
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
          busy={intent.kind === "answer" && intent.sink === "policy" ? policy.judging : busy.kind === "command"}
          busyLabel={intent.kind === "answer" && intent.sink === "policy" ? THINKING_COPY.reading_answer : busy.label}
          // 🔴 THE SAME COMPOSER, CARRYING A DIFFERENT MEANING — not a second answer box built for
          // the policy. What a submission IS comes from whether something is currently being
          // asked, which is the rule this component already ran on.
          // 🔴 ONE ROUTE, CHOSEN BY THE SINK. This used to read `policyOwns ? … : …`, which was a
          // safe ternary only because ownership was all-or-nothing. `sink` is a union that cannot
          // name two receivers, so there is no combination of states in which both branches are
          // live — see canvas-hosting.ts.
          onAnswer={(text, via, tookMs) => {
            acknowledgeAttachments();
            // 🔴 NEMESIS STOPS TALKING THE MOMENT THE LEARNER ANSWERS. Speech that outlives the
            // screen it belongs to reads the previous question over the current one.
            voice.stopSpeaking();
            // 🔴 CONTRACT RULE 2 — answering what the canvas is asking is a "next turn" exactly as
            // much as typing a fresh question is (`submit()`'s own dispatch, above). Before this,
            // an aside opened by "Explain this" survived every retrieval answer given afterwards,
            // because nothing on THIS path — as opposed to `session.command`'s — had ever been
            // told to clear it: `askAbout`'s "disappears" was only ever true of the ask route.
            applyExplanationEvent({ kind: "new_turn" });
            // 🔴 THE INTENT NAMES THE RECEIVER. `sink.kind` said the same thing and is still what
            // the intent was built from, but reading it again here would be a second place deciding
            // who owns an answer — which is exactly the shape of the defect above.
            if (intent.kind === "answer" && intent.sink === "policy") void policy.submit(text, via, tookMs);
            else void session.answerActiveTask(text, via, tookMs);
          }}
          intent={intent}
          // 🔴 THE COMPOSER NO LONGER CARRIES PROGRESSION (§38/§39). `✓` was the one control that
          // moved the learner past material; it is a `Continue` below that material now, because
          // §38 allows exactly one button and §39 makes the trigger the policy's declared cognitive
          // mode rather than anything the composer can observe.
          // 🔴 THE SAME ROUTE THE BUTTONS TAKE. Typing "academic" under the card and tapping the
          // Academic option must reach one handler, or the two drift and only one of them keeps
          // working. `session.answerClarification` is that handler; the card below calls it too.
          // 🔴 THE SAME ROUTE THE CARD'S BUTTONS TAKE. Typing "academic" under the card and tapping
          // the Academic option must reach one handler, or the two drift and only one keeps working.
          onClarify={(text) => {
            acknowledgeAttachments();
            // Nemesis stops talking the moment the learner responds, exactly as `onAnswer` does.
            voice.stopSpeaking();
            void answerClarification(text);
          }}
          onAsk={(text, chosen) => {
            acknowledgeAttachments();
            void submit(text, chosen);
          }}
          onClearSelection={clearSelection}
          onFiles={attachWithChips}
          // 🔴 "Record a lecture" IS HIDDEN, NOT DELETED. Owner call, 2026-08-20: "remove the
          // 'record a lecture' option or just hide it." Withholding `onRecord` is the whole change:
          // the composer's `+` already falls through to the file picker on the first press when
          // there is nothing to choose between, so the menu disappears AND the one remaining action
          // costs one click instead of two.
          //
          // 🔴 THE PANEL AND ITS ROUTE STAY. `CanvasRecorder`, the `recording` state and its close
          // handler are untouched below, so re-offering this is putting one prop back rather than
          // rebuilding a feature. The control is what was asked about; the capability behind it was
          // not.
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
          // 🔴 ALWAYS PASSED, AND THAT IS THE POINT. It used to be `preContent ? beginOrAnswer :
          // null`, and the composer decided what a submission meant by asking whether it had been
          // given a function. Presence is not meaning: `intent` says whether starting is what this
          // submission IS, and this handler is simply how starting is done when it is.
          onStart={beginOrAnswer}
          // 🔴 A COUNT, NOT THE SOURCES. The composer used to draw them as chips and stopped
          // (owner 2026-08-21: *"the sources should appear in the sources"*). All it still needs to
          // know is whether pressing send with an empty box means anything, and passing the list
          // for that would be handing it everything it needs to start drawing them again.
          attachedCount={canvas.sources.length}
          recentAttachments={recentAttachments}
          selected={selected}
          // 🔴 ONE CAPABILITY OFFERED, AND ONLY THE COMPOSER CLEARS IT. §38's amendment (owner,
          // 2026-08-23) permits one-shot capabilities that declare what the next submission IS;
          // Course is the first. The state lives above so the submission handlers receive it as an
          // argument — same pipeline as the text.
          capabilities={CANVAS_CAPABILITIES}
          capability={capability}
          onCapability={setCapability}
        />
      )}
    </CanvasSurface>
  );
}
