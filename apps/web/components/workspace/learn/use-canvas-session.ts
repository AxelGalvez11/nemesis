"use client";

// The canvas's brain: one piece of state, and every way it is allowed to change.
//
// Kept out of the components so the page stays a rendering of a canvas rather than a place
// where learning logic hides. Everything that decides anything — what is weak, what may
// change, where the arc goes next — lives in lib/learn and is unit-tested; this wires those
// decisions to the network and to React.

import { useCallback, useEffect, useRef, useState } from "react";

import { coverageNoticeForModel, readCoverage } from "@nemesis/shared";

import { useAuth } from "@/components/AuthProvider";
import { extractFile } from "@/lib/workspace/chat-attachments";
import { canvasCapture, captureLessonGenerated, captureStateChange } from "@/lib/learn/canvas-analytics";
import {
  explainBlock,
  generateLesson,
  generateRelearn,
  generateRecall,
  generateTest,
  applyTeachingAction,
  cardAsTask,
  evaluateLearningResponse,
  explainSelection,
  simplifySelection,
  questionAsTask,
  runCommand,
} from "@/lib/learn/canvas-api";
import { blocksForConcepts, clearEvidenceForRetest, diagnose } from "@/lib/learn/canvas-diagnosis";
import { appendEvent, type NewLearningEvent } from "@/lib/learn/canvas-events";
import { buildExcerpts, buildExcerptsFromModel, excerptsFromSourceContext } from "@/lib/learn/canvas-grounding";
import { CANVAS_FILING_FOLDER, loadCanonicalSource } from "@/lib/learn/canvas-sources";
import { verdictIsPass } from "@/lib/learn/canvas-judge";
import { actionMutatesCanvas, determineNextCognitiveAction } from "@/lib/learn/canvas-policy";
import { deriveSchedulingSignal } from "@/lib/learn/canvas-scheduling";
import {
  conceptLabel,
  type CanvasBlock,
  type CanvasLevel,
  type CanvasSource,
  type CanvasState,
  type LearningCanvas,
  type ResponseEvaluation,
  type RetrievalFormat,
} from "@/lib/learn/canvas-model";
import type { RelearnMiss } from "@/lib/learn/canvas-prompts";
import { applyOps } from "@/lib/learn/canvas-ops";
import type { CanvasSelection, SelectionAction } from "@/lib/learn/canvas-selection";
import { canStart } from "@/lib/learn/canvas-state";
import { RECALL_PLACEHOLDER, RESPONSE_PLACEHOLDER } from "@/lib/learn/canvas-tasks";
import { deleteCanvas, loadCanvas, mergeSourceIntoCanvas, newCanvas, saveCanvas } from "@/lib/learn/canvas-store";
import { ensureCanvasDeck, gradeStudyCard, writeRecallCards } from "@/lib/learn/canvas-study-bridge";

const RECALL_CARDS = 8;
const TEST_QUESTIONS = 6;
const RETEST_QUESTIONS = 4;

/** What the canvas is asking for right now, if anything.
 *
 *  The persistent composer reads this to decide what it is FOR: what to call itself, and where
 *  a submission should go. There is exactly one answer surface on the canvas, and this is how
 *  it knows which prompt it is answering. */
export interface ActiveTask {
  kind: "recall" | "question";
  id: string;
  /** What is being asked, so the composer can label itself against the real prompt. */
  prompt: string;
  /** The placeholder the composer shows — derived from the retrieval task, because
   *  "Explain it in your own words" is wrong for a prompt whose answer is one noun. */
  placeholder: string;
  index: number;
  total: number;
  /** Once answered, the composer goes back to being a place to ask about the feedback. */
  answered: boolean;
}

/** Which part of the page is working. Local rather than global so §21 holds: simplifying one
 *  paragraph must light up that paragraph, not blank the document. */
export interface BusyState {
  kind: "lesson" | "command" | "recall" | "test" | "relearn" | "source" | null;
  /** The block a scoped command is working on, so only it shows as busy. */
  blockIds?: string[];
  label?: string;
}

export interface CanvasSession {
  canvas: LearningCanvas;
  busy: BusyState;
  error: string | null;
  /** A transient answer to a question that did not change the page (§4). */
  aside: { text: string; blockId: string | null } | null;
  /** The id of the prompt whose answer is being read, or null. */
  judging: string | null;
  ready: boolean;
  dismissError: () => void;
  dismissAside: () => void;
  attachFiles: (files: FileList | File[]) => Promise<void>;
  /** Starts the arc. Takes the topic for a topic-first canvas (§6B); omit it when
   *  material is already attached. */
  begin: (topic?: string) => void;
  chooseLevel: (level: CanvasLevel) => Promise<void>;
  command: (text: string, selected: readonly CanvasBlock[]) => Promise<void>;
  askAbout: (block: CanvasBlock, question: string) => Promise<void>;
  markKnown: (blockId: string, known: boolean) => void;
  toggleCollapsed: (blockId: string, collapsed: boolean) => void;
  startRecall: () => Promise<void>;
  gradeRecall: (
    cardId: string,
    grade: "again" | "hard" | "good" | "easy",
    evidence?: {
      said?: string;
      via?: "typed" | "spoken";
      revealed?: boolean;
      evaluation?: ResponseEvaluation;
    },
  ) => Promise<void>;
  /** Retrieval by producing something rather than self-grading (§31). */
  attemptRecall: (cardId: string, text: string, via: "typed" | "spoken") => Promise<void>;
  /** They asked to see the answer: recorded as a retrieval we did not obtain. */
  revealRecall: (cardId: string) => Promise<void>;
  startTest: () => Promise<void>;
  /** Multiple choice on request only — exam simulation, not the default (§18). */
  startChoiceTest: () => Promise<void>;
  answer: (questionId: string, picked: number) => void;
  /** Records the learner's own words and asks the judge what they show. */
  respond: (questionId: string, text: string, via: "typed" | "spoken", tookMs?: number) => Promise<void>;
  finishTest: () => void;
  /** What the canvas is asking for right now — null while reading. */
  activeTask: ActiveTask | null;
  /** Move to the next prompt of the round, or off the end of it. */
  advanceTask: () => void;
  /** The ONE way a learner answers anything. Routes to the recall or the test path by what is
   *  currently being asked, so there is never a second answer field. */
  answerActiveTask: (text: string, via: "typed" | "spoken", tookMs?: number) => Promise<void>;
  /** "I don't know" — an explicit statement of state, which is real evidence, unlike a reveal
   *  shortcut that only tells us they looked. */
  admitUnknown: () => Promise<void>;
  /** Answer a question about an exact highlighted range. Returns text for a popover; for
   *  "simpler" it rewrites the one block instead and returns null. */
  /** Session management (§10). Kept away from the teaching API above on purpose — these change
   *  what the session IS, not what the learner is doing inside it. */
  rename: (title: string) => void;
  remove: () => Promise<void>;
  askAboutSelection: (
    selection: CanvasSelection,
    action: SelectionAction,
  ) => Promise<{ term: string; text: string; sourceLabel?: string } | null>;
  /** Record what the learner did. 🔴 Telemetry only — see canvas-events.ts. */
  recordEvent: (event: NewLearningEvent) => void;
  selectionBusy: boolean;
  selectionError: string | null;
  clearSelectionAnswer: () => void;
  relearn: () => Promise<void>;
  startRetest: () => Promise<void>;
  finish: () => void;
  reset: () => void;
}

export function useCanvasSession(canvasId: string | null): CanvasSession {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  const [canvas, setCanvas] = useState<LearningCanvas>(() => newCanvas());
  const [busy, setBusy] = useState<BusyState>({ kind: null });
  const [error, setError] = useState<string | null>(null);
  const [aside, setAside] = useState<{ text: string; blockId: string | null } | null>(null);
  /** The prompt whose answer is being read right now. Per-question rather than a page-wide busy
   *  flag, so judging one answer does not freeze the rest of the page. */
  const [judging, setJudging] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** Which prompt of the current round the learner is on.
   *
   *  🔴 THIS LIVES HERE, NOT IN THE STAGE. It used to be `useState(0)` inside CanvasRecall and
   *  again inside CanvasTest, which is exactly why each of them had to grow its own answer box:
   *  the persistent composer is a sibling of the stage and had no way of knowing what was being
   *  asked. One cursor in the session is what lets one composer answer everything. */
  const [cursor, setCursor] = useState(0);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  // Saving is debounced against a ref so a burst of edits writes once, and so the save always
  // sees the newest canvas rather than the one captured when the timer was set.
  const latest = useRef(canvas);
  latest.current = canvas;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveCanvas(uid, latest.current), 600);
  }, [uid]);

  /** Every state change funnels through here so nothing can update the canvas without also
   *  stamping the time and scheduling a save. */
  const update = useCallback(
    (change: (current: LearningCanvas) => LearningCanvas) => {
      setCanvas((current) => {
        const next = change(current);
        if (next === current) return current;
        latest.current = { ...next, updatedAt: new Date().toISOString() };
        return latest.current;
      });
      persist();
    },
    [persist],
  );

  /** 🔴 Records an interaction and NOTHING ELSE. It must never touch `weakConceptIds`, an
   *  evaluation, or a scheduling grade — those come from performance, and a tooltip is not a
   *  performance. `canvas-events.test.ts` holds the line behaviourally. */
  const recordEvent = useCallback(
    (event: NewLearningEvent) => {
      update((current) =>
        appendEvent(current, event, new Date().toISOString(), `e${current.events.length}-${Date.now()}`),
      );
    },
    [update],
  );

  const go = useCallback(
    (to: CanvasState) => {
      captureStateChange(latest.current, to);
      update((current) => ({ ...current, state: to }));
    },
    [update],
  );

  // Load, or start fresh.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (canvasId) {
        const found = await loadCanvas(uid, canvasId);
        if (alive && found) {
          setCanvas(found);
          latest.current = found;
          setReady(true);
          return;
        }
      }
      if (!alive) return;
      const fresh = newCanvas();
      setCanvas(fresh);
      latest.current = fresh;
      canvasCapture("canvas_created", fresh);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [canvasId, uid]);

  // Time on task, for the completion state. Only counted while the tab is actually visible —
  // "14 min active learning" must not include an hour in a background tab.
  useEffect(() => {
    let since = Date.now();
    const flush = () => {
      const elapsed = Date.now() - since;
      since = Date.now();
      if (elapsed > 500 && document.visibilityState === "visible") {
        update((current) => ({ ...current, activeMs: current.activeMs + elapsed }));
      }
    };
    const onVisibility = () => {
      flush();
      since = Date.now();
    };
    const timer = setInterval(flush, 30_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [update]);

  const requireUid = useCallback((): string | null => {
    if (!uid) setError("Sign in to use the canvas.");
    return uid;
  }, [uid]);

  // ------------------------------------------------------------------ sources

  const attachFiles = useCallback(
    async (files: FileList | File[]) => {
      const id = requireUid();
      if (!id) return;
      setError(null);
      setBusy({ kind: "source", label: "Reading" });
      try {
        for (const file of Array.from(files)) {
          // The existing extraction chokepoint — same door chat attachments, Library import
          // and syllabus import all use. No second pipeline.
          //
          // 🔴 `keep` IS WHAT MAKES CROSS-SESSION LEARNING POSSIBLE AT ALL. Without it a file
          // under 4 MB took the inline lane, which has no stored row for a parse to attach to —
          // so a canvas attachment produced no `library_sources` row, no `parsed_documents` row
          // and no durable id. Everything the canvas then learned from that document was anchored
          // to a string that means nothing outside this one canvas: a second canvas built on the
          // same lecture could not tell it was the same lecture, and retrieval, which needs a
          // filed row, returned nothing at all. Chat keeps the old default on purpose — a photo
          // dropped into a conversation should not silently become a permanent document.
          const extracted = await extractFile(file, id, { folderPath: CANVAS_FILING_FOLDER, keep: true });
          const sourceId = `s${latest.current.sources.length + 1}`;
          const note = coverageNote(extracted.coverage);

          // 🔴 READ BACK WHAT SURVIVED, RATHER THAN TRUSTING WHAT WAS RETURNED. The upload
          // response carries the model the parser produced in that request; the canvas has to
          // work from the one that got STORED, because that is what every later reader sees —
          // this canvas after a reload, a second canvas, retrieval, extraction. While the two are
          // built from different inputs, a write that silently failed or a shape the envelope
          // reader rejects looks perfect here and empty everywhere else.
          const canonical = extracted.librarySourceId
            ? await loadCanonicalSource(extracted.librarySourceId)
            : { ok: false as const, reason: "not-found" as const };

          const source: CanvasSource = {
            id: sourceId,
            title: extracted.title ?? file.name,
            kind: extracted.kind ?? "text",
            // Three inputs, in order of how much is known about them, and the fallbacks are
            // fallbacks rather than dead code: an image has no structural pass at all, and a PDF
            // the structural reader could not open falls back to `unpdf`.
            //
            //   1. the STORED canonical parse — the one everything else reads;
            //   2. the model from this request — right, but only until the tab closes;
            //   3. the flat text — a heading becomes a guess and a table becomes pipe soup.
            //
            // 🔴 AND A MISSING MODEL IS "UNKNOWN", NEVER "FLAT". Reading absence the second way
            // is how a two-column paper gets filed as prose.
            excerpts: canonical.ok
              ? excerptsFromSourceContext(sourceId, canonical.context)
              : extracted.model
                ? buildExcerptsFromModel(sourceId, extracted.model)
                : buildExcerpts(sourceId, extracted.text),
            ...(note ? { coverageNote: note } : {}),
            // 🔴 STATED, NOT LEFT TO BE INFERRED. A reader must not have to work out durability
            // from whether some other field happens to be set — an ephemeral source can teach this
            // canvas perfectly well, and must not pretend to support anything that outlives it.
            durability: extracted.librarySourceId ? "durable" : "ephemeral",
            ...(extracted.librarySourceId ? { librarySourceId: extracted.librarySourceId } : {}),
            ...(canonical.ok ? { parseQuality: canonical.context.quality } : {}),
          };
          update((current) => mergeSourceIntoCanvas(current, source));
          canvasCapture("source_attached", latest.current, {
            kind: source.kind,
            excerpts: source.excerpts.length,
            chars: extracted.text.length,
            // Logged so the proportion of canvases running on a degraded parse is findable in
            // production without a student having to report one.
            durability: extracted.librarySourceId ? "durable" : "ephemeral",
            grounding: canonical.ok ? "canonical" : extracted.model ? "response-model" : "text",
            ...(canonical.ok ? { quality: canonical.context.quality } : {}),
          });
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Nemesis couldn't read that file.");
      } finally {
        setBusy({ kind: null });
      }
    },
    [requireUid, update],
  );

  /** Start learning. The topic is passed in rather than set first and read back:
   *
   *  🔴 `setTopic(t); begin();` looked fine and was a race. `latest.current` is only written
   *  inside the `setCanvas` updater, and React runs that eagerly only when the fiber has no
   *  pending work — which the active-time interval routinely creates. So the topic-first entry
   *  path (§6B, one of the two documented ways in) intermittently read a canvas with no title
   *  and refused with "Add material, or say what you want to learn." Taking the topic as an
   *  argument removes the ordering dependency instead of narrowing the window. */
  const begin = useCallback(
    (topic?: string) => {
      const title = topic?.trim() ?? "";
      const check = canStart({ sources: latest.current.sources, title: title || latest.current.title });
      if (!check.ok) {
        setError(check.reason);
        return;
      }
      update((current) => ({ ...current, ...(title ? { title } : {}), state: "orient" }));
    },
    [update],
  );

  // ------------------------------------------------------------------- lesson

  const chooseLevel = useCallback(
    async (level: CanvasLevel) => {
      const id = requireUid();
      if (!id) return;
      update((current) => ({ ...current, level }));
      setError(null);
      setBusy({ kind: "lesson", label: "Writing your lesson" });
      const startedAt = Date.now();
      const result = await generateLesson(id, {
        topic: latest.current.title,
        level,
        sources: latest.current.sources,
      });
      setBusy({ kind: null });
      if (!result.value) {
        setError(result.error);
        canvasCapture("canvas_generation_failed", latest.current, { stage: "lesson" });
        return;
      }
      const lesson = result.value;
      update((current) => ({
        ...current,
        title: current.title || lesson.title,
        concepts: lesson.concepts,
        blocks: lesson.blocks,
        state: "learn",
      }));
      captureLessonGenerated(latest.current, {
        ms: Date.now() - startedAt,
        blocks: lesson.blocks.length,
        concepts: lesson.concepts.length,
        sources: latest.current.sources.length,
        grounded: lesson.blocks.some((block) => (block.sourceRefs?.length ?? 0) > 0),
      });
    },
    [requireUid, update],
  );

  // ----------------------------------------------------------------- commands

  const command = useCallback(
    async (text: string, selected: readonly CanvasBlock[]) => {
      const id = requireUid();
      if (!id || !text.trim()) return;
      setError(null);
      setAside(null);
      setBusy({
        kind: "command",
        blockIds: selected.map((block) => block.id),
        label: selected.length ? "Rewriting" : "Updating",
      });
      const result = await runCommand(id, latest.current, text.trim(), selected);
      setBusy({ kind: null });
      if (!result.value) {
        setError(result.error);
        return;
      }
      update((current) => applyOps(current, result.value ?? []));
      canvasCapture("canvas_section_rewritten", latest.current, {
        scoped: selected.length > 0,
        selected: selected.length,
        applied: result.value.length,
        rejected: result.rejected,
      });
    },
    [requireUid, update],
  );

  /** Questions that do not change the page. Answered in a popover that disappears — the whole
   *  point of §4 is that asking does not build a transcript down the side of the document. */
  const askAbout = useCallback(
    async (block: CanvasBlock, question: string) => {
      const id = requireUid();
      if (!id) return;
      setError(null);
      setBusy({ kind: "command", blockIds: [block.id], label: "Looking" });
      const result = await explainBlock(id, latest.current, block, question);
      setBusy({ kind: null });
      if (!result.value) setError(result.error);
      else setAside({ text: result.value, blockId: block.id });
    },
    [requireUid],
  );

  const markKnown = useCallback(
    (blockId: string, known: boolean) => {
      update((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, known } : block)),
      }));
    },
    [update],
  );

  const toggleCollapsed = useCallback(
    (blockId: string, collapsed: boolean) => {
      update((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, collapsed } : block)),
      }));
    },
    [update],
  );

  // ------------------------------------------------------------------- recall

  const startRecall = useCallback(async () => {
    const id = requireUid();
    if (!id) return;
    setError(null);
    setBusy({ kind: "recall", label: "Preparing recall" });
    const result = await generateRecall(id, latest.current, RECALL_CARDS);
    if (!result.value) {
      setBusy({ kind: null });
      setError(result.error);
      canvasCapture("canvas_generation_failed", latest.current, { stage: "recall" });
      return;
    }

    // Write through to the real study tables so these are genuine Nemesis flashcards, on the
    // production scheduler, visible in Study afterwards. Best-effort: recall still runs if
    // this fails, it just does not outlive the canvas.
    let cards = result.value;
    const deckId = await ensureCanvasDeck(id, latest.current.title, latest.current.studyDeckId);
    if (deckId) {
      const written = await writeRecallCards(id, deckId, cards, latest.current.concepts);
      cards = cards.map((card) => {
        const studyCardId = written.get(card.id);
        return studyCardId ? { ...card, studyCardId } : card;
      });
    }

    setBusy({ kind: null });
    captureStateChange(latest.current, "recall");
    setCursor(0);
    update((current) => ({
      ...current,
      recall: cards,
      recallResults: [],
      state: "recall",
      ...(deckId ? { studyDeckId: deckId } : {}),
    }));
  }, [requireUid, update]);

  const gradeRecall = useCallback(
    async (
      cardId: string,
      grade: "again" | "hard" | "good" | "easy",
      evidence?: {
      said?: string;
      via?: "typed" | "spoken";
      revealed?: boolean;
      evaluation?: ResponseEvaluation;
    },
    ) => {
      const card = latest.current.recall.find((candidate) => candidate.id === cardId);
      // The same Postgres function the Study tab grades through, so the scheduling is real.
      void gradeStudyCard(card?.studyCardId, grade);
      update((current) => {
        const recallResults = [
          ...current.recallResults.filter((result) => result.cardId !== cardId),
          {
            cardId,
            conceptId: card?.conceptId ?? null,
            at: new Date().toISOString(),
            grade,
            ...(evidence ?? {}),
          },
        ];
        // The deck is finished the moment the last card is graded — the funnel needs the
        // "got through recall" number, not just the "started recall" one.
        if (current.recall.length > 0 && recallResults.length >= current.recall.length) {
          canvasCapture("canvas_recall_completed", current, {
            cards: current.recall.length,
            again: recallResults.filter((result) => result.grade === "again").length,
          });
        }
        return { ...current, recallResults };
      });
    },
    [update],
  );

  /** Retrieval by producing something, rather than by revealing and marking yourself (§31).
   *
   *  🔴 THE ORDER HERE IS THE ARCHITECTURE. The performance is evaluated first, that evidence is
   *  what gets stored, and only then is a review grade derived from it. Deriving the grade first
   *  and keeping only that would leave a spaced-repetition app with a text box on it — the
   *  evaluation is the thing Nemesis is actually for. */
  const attemptRecall = useCallback(
    async (cardId: string, text: string, via: "typed" | "spoken") => {
      const said = text.trim();
      if (!said) return;
      const card = latest.current.recall.find((candidate) => candidate.id === cardId);
      if (!card) return;

      const id = requireUid();
      if (!id) {
        await gradeRecall(cardId, deriveSchedulingSignal({ evaluation: null }).grade, { said, via });
        return;
      }

      recordEvent({
        type: "response_submitted",
        ...(card.conceptId ? { conceptIds: [card.conceptId] } : {}),
        payload: { via, stage: "recall" },
      });

      setJudging(cardId);
      const result = await evaluateLearningResponse(
        id,
        latest.current,
        cardAsTask(latest.current, card, { text: said, via }),
      );
      setJudging(null);

      const evaluation = result.value;
      if (!evaluation) canvasCapture("canvas_judge_failed", latest.current, { cardId });
      else {
        canvasCapture("canvas_response_judged", latest.current, {
          verdict: evaluation.verdict,
          errorType: evaluation.errorType ?? null,
          confidence: evaluation.confidence,
          via,
          conceptId: card.conceptId,
          stage: "recall",
        });
      }

      // Earlier successful retrievals of this same idea, from previous rounds on this canvas.
      // This is what separates "right just now" from "right again", and without it the
      // scheduler could never award Easy — the rule would exist only in its tests.
      //
      // `timeSinceLastExposureMs` is deliberately NOT passed: nothing on a RecallResult records
      // when it happened, and inventing a gap from the canvas's own timestamps would be a
      // guess dressed as a measurement. Repeat success is the honest half of the same test.
      const priorSuccesses = card.conceptId
        ? latest.current.recallResults.filter(
            (entry) =>
              entry.cardId !== cardId &&
              entry.conceptId === card.conceptId &&
              entry.evaluation &&
              verdictIsPass(entry.evaluation.verdict),
          ).length
        : 0;

      const signal = deriveSchedulingSignal({ evaluation, hintsUsed: 0, priorSuccesses });
      await gradeRecall(cardId, signal.grade, {
        said,
        via,
        ...(evaluation ? { evaluation } : {}),
      });
    },
    [gradeRecall, recordEvent, requireUid],
  );

  /** They asked to see the answer instead of attempting it.
   *
   *  §7: that is itself evidence — we did not obtain a retrieval — and it is recorded as such.
   *  The learner is deliberately NOT asked how well they knew it afterwards: someone who has
   *  just read the answer is the worst available judge of whether they could have produced it,
   *  and asking puts the metacognitive work back on them for a worse signal than we already have. */
  const revealRecall = useCallback(
    async (cardId: string) => {
      const signal = deriveSchedulingSignal({ evaluation: null, revealed: true });
      await gradeRecall(cardId, signal.grade, { revealed: true });
    },
    [gradeRecall],
  );

  // --------------------------------------------------------------------- test

  const runTest = useCallback(
    async (state: "test" | "retest", format: RetrievalFormat = "free") => {
      const id = requireUid();
      if (!id) return;
      setError(null);
      setBusy({ kind: "test", label: state === "retest" ? "Writing your retest" : "Writing your test" });
      const retest = state === "retest";
      const result = await generateTest(
        id,
        latest.current,
        retest ? RETEST_QUESTIONS : TEST_QUESTIONS,
        format,
        retest ? latest.current.weakConceptIds : undefined,
      );
      setBusy({ kind: null });
      if (!result.value) {
        setError(result.error);
        canvasCapture("canvas_generation_failed", latest.current, { stage: state, format });
        return;
      }
      captureStateChange(latest.current, "test");
      setCursor(0);
      update((current) => ({
        // A retest replaces the evidence about the concepts it re-assesses — including the
        // recall grades. Without that a single "Again" kept a concept weak forever and the
        // canvas could never be finished.
        //
        // The plain-test branch clears responses alongside answers for the same reason: a new
        // set of questions makes the old ones' evidence stale, and evidence that outlives its
        // round is what made this state unreachable the first time.
        ...(retest
          ? clearEvidenceForRetest(current, current.weakConceptIds)
          : { ...current, answers: [], responses: [] }),
        questions: result.value ?? [],
        state,
      }));
    },
    [requireUid, update],
  );

  // Free response is the default everywhere, including at the exam level: §35-36 are explicit
  // that even under time pressure the canvas prefers explaining to recognising. Multiple choice
  // stays reachable as a deliberate request ("test me the way the exam will"), never as the
  // thing that happens when nobody chose.
  const startTest = useCallback(() => runTest("test"), [runTest]);
  const startRetest = useCallback(() => runTest("retest"), [runTest]);
  const startChoiceTest = useCallback(() => runTest("test", "choice"), [runTest]);

  const answer = useCallback(
    (questionId: string, picked: number) => {
      update((current) => {
        const question = current.questions.find((candidate) => candidate.id === questionId);
        // Only a choice question has an option to have picked. A stray call against a free
        // prompt is a bug upstream, and scoring it against `undefined` would silently mark it
        // wrong rather than showing that bug.
        if (!question || question.format !== "choice") return current;
        return {
          ...current,
          answers: [
            ...current.answers.filter((entry) => entry.questionId !== questionId),
            { questionId, picked, correct: picked === question.answer },
          ],
        };
      });
    },
    [update],
  );

  /** Record what the learner said, then ask the judge what it showed.
   *
   *  The answer is stored BEFORE the model is called and is never removed if the call fails.
   *  Someone who just explained something at length must not lose their words because a judge
   *  timed out — an unjudged response simply carries no evidence (see diagnose). */
  const respond = useCallback(
    async (questionId: string, text: string, via: "typed" | "spoken", tookMs?: number) => {
      const said = text.trim();
      if (!said) return;

      const question = latest.current.questions.find((candidate) => candidate.id === questionId);
      if (!question || question.format !== "free") return;

      update((current) => ({
        ...current,
        responses: [
          ...current.responses.filter((entry) => entry.questionId !== questionId),
          {
            questionId,
            // Captured here, not derived later: the question this came from is replaced on the
            // next round, and by then nothing can say what this answer was evidence about.
            ...(question.conceptId ? { objectiveIds: [question.conceptId] } : {}),
            at: new Date().toISOString(),
            text: said,
            via,
            ...(tookMs !== undefined ? { tookMs } : {}),
          },
        ],
      }));

      recordEvent({
        type: "response_submitted",
        ...(question.conceptId ? { conceptIds: [question.conceptId] } : {}),
        payload: { via, stage: "test", ...(tookMs !== undefined ? { tookMs } : {}) },
      });

      const id = requireUid();
      if (!id) return;
      setJudging(questionId);
      const result = await evaluateLearningResponse(
        id,
        latest.current,
        questionAsTask(latest.current, question, { text: said, via, ...(tookMs !== undefined ? { tookMs } : {}) }),
      );
      setJudging(null);

      if (!result.value) {
        // Deliberately not surfaced as a page error: the learner did their part, and "we could
        // not read that" is a fact about us, not a verdict about them.
        canvasCapture("canvas_judge_failed", latest.current, { questionId });
        return;
      }

      const evaluation = result.value;
      canvasCapture("canvas_response_judged", latest.current, {
        verdict: evaluation.verdict,
        errorType: evaluation.errorType ?? null,
        confidence: evaluation.confidence,
        via,
        conceptId: question.conceptId,
        stage: "test",
      });
      update((current) => ({
        ...current,
        responses: current.responses.map((entry) =>
          entry.questionId === questionId ? { ...entry, evaluation } : entry,
        ),
      }));

      // ── The teaching loop ────────────────────────────────────────────────
      //
      // 🔴 This is the step that makes the canvas adaptive rather than a graded quiz. The
      // decision is deterministic — the evaluation already says what was demonstrated, what was
      // missing and which false belief appeared, so no second model call is spent working out
      // what to do. A model is used only to WRITE the correction, once the action is chosen.
      const objectiveId = question.conceptId;
      const action = determineNextCognitiveAction({
        evaluation,
        attempts: latest.current.correctiveAttempts[objectiveId ?? ""] ?? 0,
      });
      canvasCapture("canvas_action_chosen", latest.current, {
        action: action.type,
        because: action.because,
        verdict: evaluation.verdict,
        conceptId: objectiveId,
      });
      if (!actionMutatesCanvas(action) || !objectiveId) return;

      setBusy({ kind: "relearn", label: "Working through that with you" });
      const change = await applyTeachingAction(id, latest.current, {
        action,
        objectiveId,
        prompt: question.q,
        said,
        demonstrated: evaluation.demonstrated,
      });
      setBusy({ kind: null });
      if (!change.value) return;

      const { ops, followUp } = change.value;
      // What the correction actually said, so it can sit beside their answer as well as in the
      // document. Taken from the ops we just validated rather than asked for separately.
      const taught = ops
        .map((op) =>
          op.operation === "replace_block"
            ? op.content
            : op.operation === "insert_before" || op.operation === "insert_after"
              ? op.block.content
              : op.operation === "annotate_block"
                ? op.note
                : "",
        )
        .filter(Boolean)
        .join("\n\n");

      update((current) => {
        const mutated = applyOps(current, ops);
        // The follow-up goes immediately after the prompt it follows up, so "Next" lands on it
        // rather than on whatever the generator happened to put there.
        const at = current.questions.findIndex((entry) => entry.id === questionId);
        const questions = followUp
          ? [
              ...current.questions.slice(0, at + 1),
              followUp,
              ...current.questions.slice(at + 1),
            ]
          : current.questions;
        return {
          ...mutated,
          questions,
          correctiveAttempts: {
            ...current.correctiveAttempts,
            [objectiveId]: (current.correctiveAttempts[objectiveId] ?? 0) + 1,
          },
          responses: current.responses.map((entry) =>
            entry.questionId === questionId
              ? {
                  ...entry,
                  action: action.type,
                  ...(taught ? { taught } : {}),
                  ...(followUp ? { followUpQuestionId: followUp.id } : {}),
                }
              : entry,
          ),
        };
      });
    },
    [recordEvent, requireUid, update],
  );

  const finishTest = useCallback(() => {
    const result = diagnose(latest.current);
    const wasRetest = latest.current.state === "retest";
    canvasCapture(wasRetest ? "canvas_retest_completed" : "canvas_test_completed", latest.current, {
      correct: result.score.correct,
      total: result.score.total,
      weak: result.weak.length,
    });
    update((current) => ({
      ...current,
      weakConceptIds: result.weak.map((concept) => concept.id),
      // A concept that WAS weak and is no longer is a correction earned, and the completion
      // state counts those rather than counting concepts that were never wrong.
      correctedConceptIds: wasRetest
        ? Array.from(
            new Set([
              ...current.correctedConceptIds,
              ...current.weakConceptIds.filter((id) => !result.weak.some((concept) => concept.id === id)),
            ]),
          )
        : current.correctedConceptIds,
      state: "diagnose",
    }));
    canvasCapture("canvas_diagnosis_viewed", latest.current);
  }, [update]);

  // ---------------------------------------------------------------- relearn

  const relearn = useCallback(async () => {
    const id = requireUid();
    if (!id) return;
    setError(null);
    setBusy({ kind: "relearn", label: "Focusing on your weak spots" });

    const current = latest.current;
    const relevant = blocksForConcepts(current.blocks, current.weakConceptIds);
    // What they actually got wrong, in words — so the rewrite addresses the misunderstanding
    // instead of repeating the original explanation more loudly.
    const choiceMisses: RelearnMiss[] = current.answers
      .filter((entry) => !entry.correct)
      .map((entry) => {
        const question = current.questions.find((candidate) => candidate.id === entry.questionId);
        if (!question || question.format !== "choice") return null;
        return {
          kind: "choice" as const,
          question: question.q,
          picked: question.options[entry.picked] ?? "",
          correct: question.options[question.answer] ?? "",
          why: question.why,
        };
      })
      .filter((miss): miss is Extract<RelearnMiss, { kind: "choice" }> => miss !== null);

    // The free-response misses are the richer half: the rewrite is told what the learner
    // actually said and precisely which point was absent, so it can address the gap instead of
    // restating the original explanation more loudly.
    const freeMisses: RelearnMiss[] = current.responses
      .filter((entry) => entry.evaluation && !verdictIsPass(entry.evaluation.verdict))
      .map((entry) => {
        const question = current.questions.find((candidate) => candidate.id === entry.questionId);
        if (!question || question.format !== "free") return null;
        return {
          kind: "free" as const,
          question: question.q,
          said: entry.text,
          missing: entry.evaluation?.missing ?? [],
          ...(entry.evaluation?.misconceptions?.length
            ? { misconception: entry.evaluation.misconceptions.join("; ") }
            : {}),
        };
      })
      .filter((miss): miss is Extract<RelearnMiss, { kind: "free" }> => miss !== null);

    const misses = [...freeMisses, ...choiceMisses];

    const result = await generateRelearn(
      id,
      current,
      relevant.length > 0 ? relevant : current.blocks,
      misses,
    );
    setBusy({ kind: null });
    if (!result.value) {
      setError(result.error);
      return;
    }
    // Not captureStateChange here: it maps "targeted_relearn" onto the same event name, and
    // firing both double-counted every relearn in the funnel.
    update((existing) => ({ ...applyOps(existing, result.value ?? []), state: "targeted_relearn" }));
    canvasCapture("canvas_weakspots_relearned", latest.current, {
      concepts: current.weakConceptIds.map((cid) => conceptLabel(current, cid)),
      blocksBefore: current.blocks.length,
      blocksAfter: latest.current.blocks.length,
    });
  }, [requireUid, update]);

  const finish = useCallback(() => {
    canvasCapture("canvas_completed", latest.current, {
      concepts: latest.current.concepts.length,
      corrected: latest.current.correctedConceptIds.length,
      activeMs: latest.current.activeMs,
    });
    update((current) => ({ ...current, state: "complete" }));
  }, [update]);

  const reset = useCallback(() => {
    const fresh = newCanvas();
    latest.current = fresh;
    setCanvas(fresh);
    canvasCapture("canvas_created", fresh);
  }, []);

  // ── The one thing being asked, and the one way to answer it ─────────────
  //
  // Derived rather than stored: the prompts themselves live on the canvas, the cursor says
  // which one, and everything else follows. Storing a duplicate of the current prompt would be
  // one more thing to keep in step with a document the teaching loop rewrites mid-round.
  const activeTask: ActiveTask | null = (() => {
    if (canvas.state === "recall") {
      const card = canvas.recall[cursor];
      if (!card) return null;
      return {
        kind: "recall",
        id: card.id,
        prompt: card.front,
        placeholder: RECALL_PLACEHOLDER,
        index: cursor,
        total: canvas.recall.length,
        answered: canvas.recallResults.some((entry) => entry.cardId === card.id),
      };
    }
    if (canvas.state === "test" || canvas.state === "retest") {
      const question = canvas.questions[cursor];
      if (!question) return null;
      return {
        kind: "question",
        id: question.id,
        prompt: question.q,
        // A multiple-choice prompt is answered by picking, not by typing, so the composer stays
        // a place to ask about it rather than pretending to be the answer field.
        placeholder: question.format === "free" ? RESPONSE_PLACEHOLDER[question.task] : "",
        index: cursor,
        total: canvas.questions.length,
        answered:
          question.format === "choice"
            ? canvas.answers.some((entry) => entry.questionId === question.id)
            : canvas.responses.some((entry) => entry.questionId === question.id),
      };
    }
    return null;
  })();

  // Read through a ref for the same reason `latest` exists: these handlers are called from
  // async paths and from event listeners, where a value captured at render time can already be
  // a round out of date.
  const activeTaskRef = useRef(activeTask);
  activeTaskRef.current = activeTask;

  const advanceTask = useCallback(() => setCursor((current) => current + 1), []);

  const answerActiveTask = useCallback(
    async (text: string, via: "typed" | "spoken", tookMs?: number) => {
      const task = activeTaskRef.current;
      if (!task || task.answered) return;
      if (task.kind === "recall") await attemptRecall(task.id, text, via);
      else await respond(task.id, text, via, tookMs);
    },
    [attemptRecall, respond],
  );

  /** §24: not the same thing as showing the answer. "I don't know" is the learner reporting
   *  their state, which is evidence; a reveal shortcut only records that they read something.
   *  Either way no retrieval was obtained, so the scheduler hears the same thing — but this
   *  path is chosen deliberately rather than reached by pressing space. */
  const admitUnknown = useCallback(async () => {
    const task = activeTaskRef.current;
    if (!task || task.answered) return;
    canvasCapture("canvas_unknown_admitted", latest.current, { kind: task.kind, id: task.id });
    recordEvent({ type: "unknown_admitted", payload: { kind: task.kind, id: task.id } });
    if (task.kind === "recall") await revealRecall(task.id);
    else await respond(task.id, "I don't know.", "typed");
  }, [recordEvent, respond, revealRecall]);

  /** The fast path from "I don't understand this bit" to an answer, without leaving the page.
   *
   *  🔴 Only "simpler" is allowed to touch the document, and only the one block the selection
   *  came from. Everything else answers in a popover: looking up a word must not move the
   *  paragraph the learner is looking at. */
  const askAboutSelection = useCallback(
    async (selection: CanvasSelection, action: SelectionAction) => {
      const id = requireUid();
      if (!id) {
        // 🔴 Also reported in the popover, not only in the page-level error strip. The learner
        // asked about one word and is looking at that word; an explanation that appears at the
        // bottom of the screen is an explanation they will not connect to what they just did.
        setSelectionError("Sign in to use the canvas.");
        return null;
      }
      setSelectionError(null);
      setSelectionBusy(true);

      recordEvent({
        type:
          action === "define"
            ? "definition_opened"
            : action === "simpler"
              ? "simplification_requested"
              : action === "example"
                ? "example_requested"
                : action === "why"
                  ? "why_requested"
                  : "explanation_requested",
        ...(selection.blockId ? { blockId: selection.blockId } : {}),
        ...(selection.conceptIds ? { conceptIds: selection.conceptIds } : {}),
        selectedText: selection.selectedText,
      });

      if (action === "simpler") {
        const result = await simplifySelection(id, latest.current, selection);
        setSelectionBusy(false);
        if (!result.value) {
          setSelectionError(result.error);
          return null;
        }
        update((current) => applyOps(current, result.value!.ops));
        return null;
      }

      const result = await explainSelection(id, latest.current, selection, action);
      setSelectionBusy(false);
      if (!result.value) {
        setSelectionError(result.error);
        return null;
      }
      return result.value;
    },
    [recordEvent, requireUid, update],
  );

  return {
    canvas,
    busy,
    error,
    aside,
    judging,
    ready,
    dismissError: () => setError(null),
    dismissAside: () => setAside(null),
    attachFiles,
    begin,
    chooseLevel,
    command,
    askAbout,
    markKnown,
    toggleCollapsed,
    startRecall,
    gradeRecall,
    attemptRecall,
    revealRecall,
    startTest,
    startChoiceTest,
    answer,
    respond,
    finishTest,
    activeTask,
    advanceTask,
    answerActiveTask,
    admitUnknown,
    rename: (title: string) => update((current) => ({ ...current, title: title.slice(0, 300) })),
    remove: async () => {
      // Written through before navigating away. The debounced autosave would otherwise fire
      // after the row is already flagged deleted and quietly resurrect it.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await deleteCanvas(uid, latest.current.id);
    },
    askAboutSelection,
    recordEvent,
    selectionBusy,
    selectionError,
    clearSelectionAnswer: () => setSelectionError(null),
    relearn,
    startRetest,
    finish,
    reset,
  };
}

/** The extractor's own account of what it could not read, in the words the shared module
 *  already uses for exactly this — so a canvas built on a half-read lecture says so in the
 *  same terms chat does. Returns null when the file was read whole. */
function coverageNote(coverage: unknown): string | null {
  const parsed = readCoverage(coverage);
  return parsed ? coverageNoticeForModel(parsed) : null;
}
