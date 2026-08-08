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
  runCommand,
} from "@/lib/learn/canvas-api";
import { blocksForConcepts, clearEvidenceForRetest, diagnose } from "@/lib/learn/canvas-diagnosis";
import { buildExcerpts } from "@/lib/learn/canvas-grounding";
import {
  conceptLabel,
  type CanvasBlock,
  type CanvasLevel,
  type CanvasSource,
  type CanvasState,
  type LearningCanvas,
} from "@/lib/learn/canvas-model";
import { applyOps } from "@/lib/learn/canvas-ops";
import { canStart } from "@/lib/learn/canvas-state";
import { loadCanvas, mergeSourceIntoCanvas, newCanvas, saveCanvas } from "@/lib/learn/canvas-store";
import { ensureCanvasDeck, gradeStudyCard, writeRecallCards } from "@/lib/learn/canvas-study-bridge";

const RECALL_CARDS = 8;
const TEST_QUESTIONS = 6;
const RETEST_QUESTIONS = 4;

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
  gradeRecall: (cardId: string, grade: "again" | "hard" | "good" | "easy") => Promise<void>;
  startTest: () => Promise<void>;
  answer: (questionId: string, picked: number) => void;
  finishTest: () => void;
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
  const [ready, setReady] = useState(false);

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
          const extracted = await extractFile(file, id);
          const sourceId = `s${latest.current.sources.length + 1}`;
          const note = coverageNote(extracted.coverage);
          const source: CanvasSource = {
            id: sourceId,
            title: extracted.title ?? file.name,
            kind: extracted.kind ?? "text",
            excerpts: buildExcerpts(sourceId, extracted.text),
            ...(note ? { coverageNote: note } : {}),
          };
          update((current) => mergeSourceIntoCanvas(current, source));
          canvasCapture("source_attached", latest.current, {
            kind: source.kind,
            excerpts: source.excerpts.length,
            chars: extracted.text.length,
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
    update((current) => ({
      ...current,
      recall: cards,
      recallResults: [],
      state: "recall",
      ...(deckId ? { studyDeckId: deckId } : {}),
    }));
  }, [requireUid, update]);

  const gradeRecall = useCallback(
    async (cardId: string, grade: "again" | "hard" | "good" | "easy") => {
      const card = latest.current.recall.find((candidate) => candidate.id === cardId);
      // The same Postgres function the Study tab grades through, so the scheduling is real.
      void gradeStudyCard(card?.studyCardId, grade);
      update((current) => {
        const recallResults = [
          ...current.recallResults.filter((result) => result.cardId !== cardId),
          { cardId, conceptId: card?.conceptId ?? null, grade },
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

  // --------------------------------------------------------------------- test

  const runTest = useCallback(
    async (state: "test" | "retest") => {
      const id = requireUid();
      if (!id) return;
      setError(null);
      setBusy({ kind: "test", label: state === "retest" ? "Writing your retest" : "Writing your test" });
      const retest = state === "retest";
      const result = await generateTest(
        id,
        latest.current,
        retest ? RETEST_QUESTIONS : TEST_QUESTIONS,
        retest ? latest.current.weakConceptIds : undefined,
      );
      setBusy({ kind: null });
      if (!result.value) {
        setError(result.error);
        canvasCapture("canvas_generation_failed", latest.current, { stage: state });
        return;
      }
      captureStateChange(latest.current, "test");
      update((current) => ({
        // A retest replaces the evidence about the concepts it re-assesses — including the
        // recall grades. Without that a single "Again" kept a concept weak forever and the
        // canvas could never be finished.
        ...(retest ? clearEvidenceForRetest(current, current.weakConceptIds) : { ...current, answers: [] }),
        questions: result.value ?? [],
        state,
      }));
    },
    [requireUid, update],
  );

  const startTest = useCallback(() => runTest("test"), [runTest]);
  const startRetest = useCallback(() => runTest("retest"), [runTest]);

  const answer = useCallback(
    (questionId: string, picked: number) => {
      update((current) => {
        const question = current.questions.find((candidate) => candidate.id === questionId);
        if (!question) return current;
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
    const misses = current.answers
      .filter((entry) => !entry.correct)
      .map((entry) => {
        const question = current.questions.find((candidate) => candidate.id === entry.questionId);
        if (!question) return null;
        return {
          question: question.q,
          picked: question.options[entry.picked] ?? "",
          correct: question.options[question.answer] ?? "",
          why: question.why,
        };
      })
      .filter((miss): miss is NonNullable<typeof miss> => miss !== null);

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

  return {
    canvas,
    busy,
    error,
    aside,
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
    startTest,
    answer,
    finishTest,
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
