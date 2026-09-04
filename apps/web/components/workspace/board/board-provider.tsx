"use client";

// The board's state: every card, note, highlight and source; the save loop; the streaming turns.
//
// A port of Wondering's `CanvasChatProvider` (docs/wondering-canvas-reference.md §1, §8) onto our
// own model door and table. What is kept exactly: the one-document save with an expected version,
// the 400 ms debounce and 5 s retry, the undo history that rides beside the document, a branch
// inheriting its parent's last 16 turns, the dive-deeper card, notes anchored to an excerpt.
//
// 🔴 A REPLY THAT WAS IN FLIGHT WHEN THE PAGE CLOSED IS NOT RECOVERED HERE. Theirs is persisted by
// the edge function under a message id and polled back for 3 minutes; ours streams into the page
// and is saved with the document as it arrives, so a closed tab keeps what had arrived and marks
// the reply as an error the learner can retry. That is the one honest difference and the retry
// chip covers it.

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";

import { useAuth } from "@/components/AuthProvider";
import type { BoardAnnotation } from "@/lib/board/board-annotations";
import { extractFile } from "@/lib/workspace/chat-attachments";
import {
  buildDeleteTargets,
  canApplyOperation,
  createHistoryState,
  historiesEqual,
  historyReducer,
  applyOperation,
  type DeleteTarget,
  type HistorySnapshot,
} from "@/lib/board/board-history";
import {
  CARD_MIN_HEIGHT,
  CARD_WIDTH,
  NOTE_WIDTH,
  CHECK_MIN_HEIGHT,
  CHECK_WIDTH,
  OUTPUT_MIN_HEIGHT,
  OUTPUT_WIDTH,
  SOURCE_WIDTH,
  findFreeChildPosition,
  nextRootPosition,
  notePosition,
  occupiedRects,
  type BranchSide,
} from "@/lib/board/board-layout";
import {
  BOARD_REPLY_ERROR_FALLBACK,
  MAX_BOARD_CARDS,
  NEW_THREAD_TITLE,
  cardContext,
  deriveBoardTitle,
  deriveCardTitle,
  documentFitsSizeLimit,
  emptySuggestions,
  isMessageTooLong,
  latestComposerSuggestions,
  messageLimitNotice,
  normalizeContextExcerpt,
  parseBoardState,
  pendingReplies,
  removeFailedTurn,
  serializeBoardState,
  type BoardCard,
  type BoardHighlightKind,
  type BoardMessage,
  type BoardSource,
  type BoardState,
  type BoardViewport,
  type MeasuredSize,
  type BoardOutputCard,
} from "@/lib/board/board-model";
import { BoardVersionConflict, createBoard, getBoard, updateBoard } from "@/lib/board/board-store";
import { DIVE_DEEPER_MESSAGE, runBoardTurn, type BoardResponseMode } from "@/lib/board/board-turn";
import { boardCanvasFor, makeBoardDeliverable, readBoardMakeAsk, type BoardMakeKind } from "@/lib/board/board-deliverables";
import { asksToBeTaughtToo, makeBoardCheck, readCheckAsk } from "@/lib/board/board-check";
import { groundedSources, sourceOrdinalOf } from "@/lib/board/board-grounding";
import { buildExcerpts, buildExcerptsFromModel, excerptsFromSourceContext } from "@/lib/learn/canvas-grounding";
import type { CanvasOutput, CanvasSource } from "@/lib/learn/canvas-model";
import { CANVAS_FILING_FOLDER, coverageLabel, coverageNote, loadCanonicalSource, storedCoverage } from "@/lib/learn/canvas-sources";

const SAVE_DEBOUNCE_MS = 400;
const SAVE_RETRY_MS = 5_000;
const MAX_CONSECUTIVE_SAVE_FAILURES = 3;
export const IN_FLIGHT_DELETE_NOTICE = "Wait for the response to finish before deleting this card.";

export interface NoteFocusRequest {
  cardId: string;
  excerpt: string;
  occurrence?: number;
  requestId: string;
}

export interface RetryTarget {
  userMessageId: string;
  assistantMessageId: string;
}

export interface BoardContextValue {
  boardId: string | null;
  /** True once the stored board has been read (or there was none to read). */
  loaded: boolean;
  cards: BoardCard[];
  sources: BoardSource[];
  selectedSourceIds: string[];
  useWebSearch: boolean;
  setUseWebSearch: (on: boolean) => void;
  viewport: BoardViewport | null;
  hasSavedViewport: boolean;
  updateViewport: (viewport: BoardViewport) => void;
  lastAddedCardId: string | null;
  lastComposerCardId: string | null;
  newThreadSuggestions: string[];
  limitNotice: string | null;
  dismissLimitNotice: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  sendRootMessage: (text: string) => boolean;
  sendCardMessage: (cardId: string, text: string, retry?: RetryTarget, contextExcerpt?: string, occurrence?: number) => boolean;
  createBranchCard: (cardId: string, side?: BranchSide) => void;
  sendBranchQuestion: (cardId: string, text: string, side?: BranchSide, contextExcerpt?: string, occurrence?: number) => boolean;
  branchFromSelection: (cardId: string, excerpt: string, occurrence?: number) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  updateCardPosition: (id: string, position: { x: number; y: number }) => void;
  updateCardSize: (id: string, size: { width?: number; height?: number }) => void;
  setCardCollapsed: (id: string, collapsed: boolean) => void;
  reportNodeSize: (id: string, size: MeasuredSize, remeasure: boolean) => void;
  saveCardHighlight: (cardId: string, text: string, kind?: BoardHighlightKind, occurrence?: number) => void;
  removeCardHighlight: (cardId: string, highlightId: string) => void;
  saveCardImage: (cardId: string, url: string, alt?: string) => void;
  removeCardImage: (cardId: string, imageId: string) => void;
  addCardNote: (cardId: string, excerpt?: string, occurrence?: number) => void;
  updateCardNote: (cardId: string, noteId: string, text: string) => void;
  removeCardNote: (cardId: string, noteId: string) => void;
  noteFocusRequest: NoteFocusRequest | null;
  focusNoteExcerpt: (cardId: string, excerpt: string, occurrence?: number) => void;
  /** Notes pinned inside a source, from the reading panel. Saved with the board. */
  annotations: BoardAnnotation[];
  /** 🔴 AN UPDATER, NOT A VALUE. Two annotations landing in the same tick (a follow-up and its
   *  answer) must not overwrite each other, which is exactly what setting a captured array does. */
  updateAnnotations: (update: (current: readonly BoardAnnotation[]) => BoardAnnotation[]) => void;
  addSourceFiles: (files: File[]) => Promise<void>;
  toggleSourceSelection: (sourceId: string) => void;
  createLessonFromSource: (sourceId: string) => void;
  /** Deliverables made on this board (lib/board/board-deliverables.ts). */
  outputs: BoardOutputCard[];
  /** Make one beside a thread (or from the composer, `cardId` null), from what was typed. */
  makeDeliverable: (kind: BoardMakeKind, options?: { cardId?: string | null; sourceId?: string; topic?: string }) => void;
  /** They finished a test card: the picks are kept and the card shows the result. */
  finishCheck: (outputId: string, picks: readonly (string | null)[]) => void;
  /** From a finished test card: hand the attempt to the thread so Nemesis explains the misses. */
  explainCheck: (outputId: string, account: string) => void;
  /** Fold a dropped document down to its title row, and back. */
  setSourceCollapsed: (id: string, collapsed: boolean) => void;
  /** The output open in the reading panel, if any. */
  openedOutput: CanvasOutput | null;
  openOutput: (outputId: string) => void;
  closeOutput: () => void;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useBoard must be used inside <BoardProvider>");
  return value;
}

/**
 * Is there anything on this board a test could be written from?
 *
 * An answer Nemesis gave, or a document that finished reading. Both are what `canvasHasMaterial`
 * counts on the chat side; this is the same question asked of a board before the maker is called,
 * so the refusal never becomes a card.
 */
function hasSomethingToTest(cards: readonly BoardCard[], sources: readonly BoardSource[]): boolean {
  if (sources.some((source) => source.status === "ready")) return true;
  return cards.some((card) => card.messages.some((message) => message.role === "assistant" && !message.isError && message.content.trim().length > 0));
}

interface SaveJob {
  revision: number;
  snapshot: BoardState;
  history: HistorySnapshot | null;
}

export function BoardProvider({
  boardId: initialBoardId,
  onBoardCreated,
  seed,
  children,
}: {
  boardId: string | null;
  onBoardCreated?: (id: string) => void;
  /** 🔴 DEV-PREVIEW SEAM: fixture cards for /dev-preview/board, where nothing is signed in and
   *  nothing must be saved. Same shape as the sidebar's `seed`. */
  seed?: BoardState;
  children: ReactNode;
}) {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const [history, dispatch] = useReducer(historyReducer, undefined, () => createHistoryState());
  const cards = history.cards;
  const updateCards = useCallback((update: BoardCard[] | ((cards: BoardCard[]) => BoardCard[])) => dispatch({ type: "update", update }), []);

  const [sources, setSources] = useState<BoardSource[]>([]);
  const [outputs, setOutputs] = useState<BoardOutputCard[]>([]);
  const [openedOutputId, setOpenedOutputId] = useState<string | null>(null);
  /** Notes pinned inside a source in the reading panel. Saved with the board. See board-panel.tsx. */
  const [annotations, setAnnotations] = useState<BoardAnnotation[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  // 🔴 OFF BY DEFAULT (owner 2026-09-03: "websearch on in canvas, off by default"). On by default,
  // every board answer went to the web unasked and came back wearing [n] marks that read as
  // invented sources. A board that turned it on keeps it on: the flag is saved with the document.
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [viewport, setViewport] = useState<BoardViewport | null>(null);
  const [hasSavedViewport, setHasSavedViewport] = useState(false);
  const [lastAddedCardId, setLastAddedCardId] = useState<string | null>(null);
  const [lastComposerCardId, setLastComposerCardId] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [noteFocusRequest, setNoteFocusRequest] = useState<NoteFocusRequest | null>(null);
  const [newThreadSuggestions, setNewThreadSuggestions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(initialBoardId === null);
  const composerMessageId = useRef<string | null>(null);

  const boardIdRef = useRef<string | null>(initialBoardId);
  const versionRef = useRef<number | null>(null);
  const pendingBoardIdRef = useRef<string | null>(null);
  const measured = useRef(new Map<string, MeasuredSize>());
  const [, bumpMeasured] = useState(0);
  const previewUrls = useRef(new Set<string>());
  const skipNextSave = useRef(false);
  const saving = useRef(false);
  const queued = useRef<SaveJob | null>(null);
  const revision = useRef(0);
  const failures = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const mounted = useRef(true);
  const turnAborts = useRef(new Map<string, AbortController>());
  /**
   * A test to make once the answer it tests has actually landed in the card.
   *
   * 🔴🔴 STATE, NOT A CALL FROM INSIDE THE TURN, AND THAT DISTINCTION WAS A REAL DEFECT MEASURED ON
   * PRODUCTION (2026-09-04). The first version called the maker straight from `runTurn`'s `then`,
   * one line after `patchMessage` wrote the finished answer. React had not re-rendered yet, so the
   * maker closed over the PREVIOUS `cards` — where that assistant message is still pending and
   * empty — and `boardCanvasFor` handed the writer a thread with nothing in it. The card arrived
   * saying "There is nothing on this thread to test you on yet", underneath the answer it was
   * supposed to be testing.
   *
   * An effect runs after the commit, so by the time this fires the thread holds the lesson.
   */
  const [pendingCheck, setPendingCheck] = useState<{ cardId: string; topic: string } | null>(null);

  const reportNodeSize = useCallback((id: string, size: MeasuredSize, remeasure: boolean) => {
    const known = measured.current.get(id);
    if (known?.width === size.width && known.height === size.height) return;
    measured.current.set(id, size);
    if (remeasure) bumpMeasured((n) => n + 1);
  }, []);

  const measuredRect = useCallback(
    (item: { id: string; position: { x: number; y: number }; width?: number; height?: number }) => {
      const size = measured.current.get(item.id);
      return { position: item.position, width: size?.width ?? item.width, height: size?.height ?? item.height };
    },
    [],
  );

  const occupied = useCallback(
    (allCards: readonly BoardCard[], allSources: readonly BoardSource[]) =>
      occupiedRects(allCards, allSources, outputs).map((item) => ("id" in item ? measuredRect(item as BoardCard) : item)),
    [measuredRect, outputs],
  );

  // ----------------------------------------------------------------- load
  useEffect(() => {
    mounted.current = true;
    if (seed) {
      skipNextSave.current = true;
      dispatch({ type: "replace", cards: seed.cards, history: { past: [], future: [] } });
      setSources(seed.sources);
      setOutputs(seed.outputs);
      setAnnotations(seed.annotations ?? []);
      setSelectedSourceIds(seed.selectedSourceIds);
      setUseWebSearch(seed.useWebSearch);
      setViewport(seed.viewport ?? null);
      setHasSavedViewport(seed.viewport !== undefined);
      setNewThreadSuggestions(latestComposerSuggestions(seed.cards).suggestions);
      setLoaded(true);
      return () => {
        mounted.current = false;
      };
    }
    if (boardIdRef.current === null) return () => {
      mounted.current = false;
    };
    let cancelled = false;
    getBoard(boardIdRef.current)
      .then(({ document, version, history: storedHistory }) => {
        if (cancelled) return;
        versionRef.current = version;
        const state = parseBoardState(document);
        const { cards: restored } = pendingReplies(state.cards);
        // A reply that never finished is an error the learner can retry, not a spinner for ever.
        const settled = restored.map((card) => ({
          ...card,
          status: "idle" as const,
          messages: card.messages.map((message) =>
            message.pending
              ? { ...message, pending: false, isStreaming: false, isError: true, content: message.content || BOARD_REPLY_ERROR_FALLBACK }
              : message,
          ),
        }));
        skipNextSave.current = true;
        dispatch({ type: "replace", cards: settled, history: storedHistory });
        setSources(state.sources);
        setOutputs(state.outputs);
        setAnnotations(state.annotations ?? []);
        setSelectedSourceIds(state.selectedSourceIds);
        setUseWebSearch(state.useWebSearch);
        setViewport(state.viewport ?? null);
        setHasSavedViewport(state.viewport !== undefined);
        const latest = latestComposerSuggestions(settled);
        composerMessageId.current = latest.messageId;
        setNewThreadSuggestions(latest.suggestions);
        setLoaded(true);
      })
      .catch((error) => {
        console.error("Failed to load canvas:", error);
        if (!cancelled) setLimitNotice("This canvas could not be loaded.");
      });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current.clear();
      for (const controller of turnAborts.current.values()) controller.abort();
    },
    [],
  );

  // ----------------------------------------------------------------- save
  const drain = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (queued.current) {
        const job = queued.current;
        queued.current = null;
        try {
          const document = serializeBoardState(job.snapshot, measured.current);
          const title = deriveBoardTitle(job.snapshot.cards, job.snapshot.sources);
          if (boardIdRef.current) {
            const { version } = await updateBoard(boardIdRef.current, {
              expectedVersion: versionRef.current ?? 1,
              title,
              document,
              history: job.history,
            });
            versionRef.current = version;
          } else {
            if (!uid) throw new Error("Sign in to use the canvas.");
            const id = pendingBoardIdRef.current ?? crypto.randomUUID();
            pendingBoardIdRef.current = id;
            const created = await createBoard({ userId: uid, boardId: id, title, document, history: job.history });
            boardIdRef.current = created.id;
            pendingBoardIdRef.current = null;
            versionRef.current = created.version;
            if (mounted.current) onBoardCreated?.(created.id);
          }
          failures.current = 0;
        } catch (error) {
          console.error("Failed to save canvas:", error);
          if (error instanceof BoardVersionConflict && boardIdRef.current) {
            try {
              const latest = await getBoard(boardIdRef.current);
              versionRef.current = latest.version;
              const theirs = latest.history.past.length > 0 || latest.history.future.length > 0;
              if (job.history !== null && theirs && !historiesEqual(job.history, latest.history)) {
                const state = parseBoardState(latest.document);
                skipNextSave.current = true;
                dispatch({ type: "replace", cards: state.cards, history: latest.history });
                setSources(state.sources);
                setOutputs(state.outputs);
                setSelectedSourceIds(state.selectedSourceIds);
                setUseWebSearch(state.useWebSearch);
                setViewport(state.viewport ?? null);
                setHasSavedViewport(state.viewport !== undefined);
                setLimitNotice("This canvas changed in another session. The latest version and undo history are now loaded.");
                failures.current = 0;
                break;
              }
              // The version moved but nothing conflicts: the retry below carries the new version.
            } catch {
              // Fall through to the retry.
            }
          }
          queued.current = queued.current ?? job;
          failures.current += 1;
          if (failures.current < MAX_CONSECUTIVE_SAVE_FAILURES && retryTimer.current === null) {
            retryTimer.current = window.setTimeout(() => {
              retryTimer.current = null;
              void drain();
            }, SAVE_RETRY_MS);
          } else if (failures.current >= MAX_CONSECUTIVE_SAVE_FAILURES) {
            setLimitNotice("This change has not been saved yet. Keep this canvas open while the connection recovers.");
          }
          break;
        }
      }
    } finally {
      saving.current = false;
    }
  }, [onBoardCreated, uid]);

  const schedule = useCallback(
    (snapshot: BoardState, historyToSave: HistorySnapshot | null) => {
      revision.current += 1;
      queued.current = { revision: revision.current, snapshot, history: historyToSave ?? queued.current?.history ?? null };
      failures.current = 0;
      void drain();
    },
    [drain],
  );

  const historyForSave = useCallback(
    () => (history.past.length === 0 && history.future.length === 0 ? null : { past: history.past, future: history.future }),
    [history.future, history.past],
  );

  // Every change to the document saves, 400 ms after the last one. The first render after a load
  // or a conflict replace is skipped: it is the database's own truth coming back.
  useEffect(() => {
    if (!loaded || seed) return;
    if (cards.length === 0 && sources.length === 0 && outputs.length === 0 && boardIdRef.current === null) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const snapshot: BoardState = { annotations, cards, sources, outputs, selectedSourceIds, useWebSearch, viewport: viewport ?? undefined };
    const timer = window.setTimeout(() => schedule(snapshot, historyForSave()), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [annotations, cards, sources, outputs, selectedSourceIds, useWebSearch, viewport, loaded, schedule, historyForSave, seed]);

  // ----------------------------------------------------------------- turns
  const setCardStatus = useCallback(
    (cardId: string, status: BoardCard["status"]) =>
      updateCards((all) => all.map((card) => (card.id === cardId ? { ...card, status } : card))),
    [updateCards],
  );

  const patchMessage = useCallback(
    (cardId: string, messageId: string, patch: (message: BoardMessage) => BoardMessage) =>
      updateCards((all) =>
        all.map((card) =>
          card.id === cardId ? { ...card, messages: card.messages.map((message) => (message.id === messageId ? patch(message) : message)) } : card,
        ),
      ),
    [updateCards],
  );

  const runTurn = useCallback(
    (input: {
      cardId: string;
      assistantMessageId: string;
      requestMessage: string;
      history: ReturnType<typeof cardContext>;
      contextExcerpt?: string;
      sourceIds?: string[];
      responseMode?: BoardResponseMode;
      updatesComposerSuggestions?: boolean;
      cardTitle?: string;
      cardSummary?: string;
      /** The learner asked to be taught AND tested. The test is made from this thread once the
       *  answer lands, so the questions are never asked about a lesson that was not given. */
      thenCheck?: boolean;
    }) => {
      if (!uid) {
        patchMessage(input.cardId, input.assistantMessageId, (message) => ({
          ...message,
          content: "Sign in to use the canvas.",
          isError: true,
          pending: false,
          isStreaming: false,
        }));
        setCardStatus(input.cardId, "idle");
        return;
      }
      const controller = new AbortController();
      turnAborts.current.set(input.assistantMessageId, controller);
      // 🔴 NOTHING TICKED MEANS EVERYTHING, NEVER NOTHING. A learner who drops five lectures and just
      // types must get an answer from the five, the way the chat grounds in everything attached.
      // The chips narrow the pile when they are used; unused, they do not empty it.
      const chosen = (input.sourceIds ?? []).map((id) => sources.find((source) => source.id === id)).filter((s): s is BoardSource => Boolean(s));
      const attached = chosen.length ? chosen : sources.filter((source) => source.status === "ready");
      void runBoardTurn({
        uid,
        message: input.requestMessage,
        history: input.history,
        contextExcerpt: input.contextExcerpt,
        sources: attached,
        responseMode: input.responseMode,
        useWebSearch,
        cardTitle: input.cardTitle,
        cardSummary: input.cardSummary,
        signal: controller.signal,
        onContent: (visible) => {
          if (!mounted.current) return;
          patchMessage(input.cardId, input.assistantMessageId, (message) => ({ ...message, content: visible }));
        },
      })
        .then((result) => {
          if (!mounted.current) return;
          const suggestions = result.error ? undefined : result.suggestions;
          patchMessage(input.cardId, input.assistantMessageId, (message) => ({
            ...message,
            content: result.content || (result.error ? result.error : BOARD_REPLY_ERROR_FALLBACK),
            ...(result.citations.length ? { citations: result.citations } : {}),
            suggestedQuestions: suggestions,
            isError: result.error || !result.content ? true : undefined,
            pending: false,
            isStreaming: false,
            ...(result.truncated ? { wasTruncated: true } : {}),
          }));
          if (!result.error && (result.title || result.summary)) {
            updateCards((all) =>
              all.map((card) =>
                card.id === input.cardId
                  ? { ...card, ...(result.title ? { title: result.title } : {}), ...(result.summary ? { summary: result.summary } : {}) }
                  : card,
              ),
            );
          }
          if (input.updatesComposerSuggestions && composerMessageId.current === input.assistantMessageId) {
            setNewThreadSuggestions(result.error ? [] : result.suggestions.newThreads);
          }
          setCardStatus(input.cardId, "idle");
          // 🔴 AFTER THE ANSWER, NEVER INSTEAD OF IT. See `asksToBeTaughtToo`. A failed turn taught
          // nothing, so there is nothing to be tested on and no card is made.
          if (input.thenCheck && !result.error) setPendingCheck({ cardId: input.cardId, topic: input.requestMessage });
        })
        .catch((error) => {
          if (!mounted.current) return;
          if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Canvas turn failed:", error);
          patchMessage(input.cardId, input.assistantMessageId, (message) => ({
            ...message,
            content: message.content || BOARD_REPLY_ERROR_FALLBACK,
            isError: true,
            pending: false,
            isStreaming: false,
          }));
          setCardStatus(input.cardId, "idle");
        })
        .finally(() => {
          turnAborts.current.delete(input.assistantMessageId);
        });
    },
    [patchMessage, setCardStatus, sources, uid, updateCards, useWebSearch],
  );

  // ----------------------------------------------------------------- deliverables
  /**
   * Make a deliverable beside a thread, or from the composer.
   *
   * 🔴 THE CHAT'S MAKERS, A BOARD-SHAPED PLACE (lib/board/board-deliverables.ts). The card appears at
   * once in its "making" state so the learner sees where it will land; the maker fills it or marks
   * it failed. A board saved mid-make drops the card on reload (parseBoardState), same as a pending
   * reply, because nothing would ever finish it.
   */
  const makeDeliverable = useCallback(
    (kind: BoardMakeKind, options: { cardId?: string | null; sourceId?: string; topic?: string } = {}) => {
      const cardId = options.cardId ?? null;
      const topic = (options.topic ?? "").trim();
      if (!uid) {
        setLimitNotice("Sign in to make things on the canvas.");
        return;
      }
      // 🔴 EITHER PARENT, ONE PATH. A note made from a document and a note made from a thread are
      // the same maker reading the same shape of canvas; only what is put in front of it differs,
      // and which card the line is drawn from.
      const sourceParent = options.sourceId ? sources.find((source) => source.id === options.sourceId && source.status === "ready") : undefined;
      if (options.sourceId && !sourceParent) return;
      const parent = cardId ? cards.find((card) => card.id === cardId) : sourceParent;
      if (cardId && !parent) return;
      const outputId = crypto.randomUUID();
      const width = kind === "check" ? CHECK_WIDTH : OUTPUT_WIDTH;
      const minHeight = kind === "check" ? CHECK_MIN_HEIGHT : OUTPUT_MIN_HEIGHT;
      const position = parent
        ? findFreeChildPosition({ parent: measuredRect(parent), occupied: occupied(cards, sources), side: "right", childWidth: width, childHeight: minHeight })
        : nextRootPosition([...cards, ...sources, ...outputs]);
      const draft: BoardOutputCard = {
        id: outputId,
        cardId,
        ...(sourceParent ? { sourceId: sourceParent.id } : {}),
        kind,
        status: "making",
        topic,
        createdAt: new Date().toISOString(),
        position,
        width,
      };
      setOutputs((all) => [...all, draft]);
      // 🔴 A DOCUMENT'S OWN MATERIAL WHEN IT WAS ASKED FROM A DOCUMENT, or a note "from this
      // lecture" would be written from every other file on the board as well.
      const material = sourceParent ? groundedSources([sourceParent]) : groundedSources(sources);
      const canvas = boardCanvasFor({
        boardId: boardIdRef.current,
        title: sourceParent ? sourceParent.name : deriveBoardTitle(cards, sources),
        cards: sourceParent ? [] : cards,
        cardId,
        sources: material,
      });
      const patch = (change: (output: BoardOutputCard) => BoardOutputCard) => {
        if (!mounted.current) return;
        setOutputs((all) => all.map((output) => (output.id === outputId ? change(output) : output)));
      };
      // 🔴 A CHECK TAKES THE SAME ROUTE AND LANDS IN THE SAME CARD, because everything around it —
      // where the card sits, the line back to its thread, being saved, being deleted — is identical.
      // Only what arrives differs: a run of questions rather than a file in the Library.
      const made = kind === "check" ? makeBoardCheck(uid, canvas, topic) : makeBoardDeliverable(uid, canvas, kind, topic, (label) => patch((output) => ({ ...output, progress: label })));
      void made
        .then((result) => {
          if ("error" in result) patch((output) => ({ ...output, status: "error", error: result.error, progress: undefined }));
          else if ("run" in result) patch((output) => ({ ...output, status: "ready", run: result.run, progress: undefined }));
          else patch((output) => ({ ...output, status: "ready", output: result.output, progress: undefined }));
        })
        .catch((error: unknown) => {
          patch((output) => ({ ...output, status: "error", error: error instanceof Error ? error.message : "This could not be made. Try again.", progress: undefined }));
        });
    },
    [cards, measuredRect, occupied, outputs, sources, uid],
  );
  // 🔴 THE QUEUED TEST, MADE ONCE THE ANSWER IS ON THE BOARD. See `pendingCheck` for what happens
  // when this is called a render too early.
  useEffect(() => {
    if (!pendingCheck) return;
    const card = cards.find((item) => item.id === pendingCheck.cardId);
    // Gone, or still writing: wait. A card that vanished takes its test with it.
    if (!card) {
      setPendingCheck(null);
      return;
    }
    if (card.status === "streaming") return;
    setPendingCheck(null);
    makeDeliverable("check", { cardId: pendingCheck.cardId, topic: pendingCheck.topic });
  }, [cards, makeDeliverable, pendingCheck]);

  const openedOutput = useMemo(() => outputs.find((output) => output.id === openedOutputId)?.output ?? null, [outputs, openedOutputId]);
  const openOutput = useCallback((outputId: string) => setOpenedOutputId(outputId), []);
  const closeOutput = useCallback(() => setOpenedOutputId(null), []);

  const startCard = useCallback(
    (
      text: string,
      options: { sourceIds?: string[]; kind?: BoardCard["kind"]; responseMode?: BoardResponseMode; updatesComposerSuggestions?: boolean; readsAsk?: boolean } = {},
    ): boolean => {
      const message = text.trim();
      if (!message) return false;
      // "Make me flashcards on this" is an ask for a thing, not a question: the chat's own reader
      // decides (readBoardMakeAsk), and the thing lands on the board instead of an answer.
      let asked = options.readsAsk === false ? null : readBoardMakeAsk(message);
      // 🔴🔴 ASKED FOR BOTH: THE ANSWER IS WRITTEN FIRST AND THE TEST IS MADE FROM IT. Read from the
      // message itself rather than from `asked`, and that ordering was a real defect: the
      // empty-board rule below cleared `asked` first, so "Explain how a bill becomes a law, then
      // quiz me" as the FIRST thing typed produced a lesson and no test at all. Measured on
      // production 2026-09-04, which is also where the model filled the hole by printing the quiz
      // in prose.
      const thenCheck = asked === "check" && asksToBeTaughtToo(message);
      // 🔴 A TEST NEEDS SOMETHING TO TEST. A bare "quiz me" as the first thing typed would route to
      // the test writer and answer with a card saying there is nothing here yet. With nothing on the
      // board that ask is an ordinary question; the learner asks to be tested once there is a
      // thread. A turn that also asks to be taught is exempt, because by the time its test is
      // written the lesson it tests is on the board.
      if (asked === "check" && !thenCheck && !hasSomethingToTest(cards, sources)) asked = null;
      if (thenCheck) asked = null;
      if (asked) {
        makeDeliverable(asked, { cardId: null, topic: message });
        return true;
      }
      if (isMessageTooLong(message)) {
        setLimitNotice(messageLimitNotice(message));
        return false;
      }
      if (cards.length >= MAX_BOARD_CARDS) {
        setLimitNotice(`This canvas has reached the ${MAX_BOARD_CARDS}-card limit. Remove a card and try again.`);
        return false;
      }
      const sourceIds = (options.sourceIds ?? selectedSourceIds).filter((id) => sources.some((source) => source.id === id && source.status === "ready"));
      const parentSource = sources.find((source) => source.id === sourceIds[0]);
      const cardId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const card: BoardCard = {
        id: cardId,
        kind: options.kind ?? "conversation",
        parentId: parentSource?.id ?? null,
        sourceIds,
        contextExcerpt: null,
        inheritedContext: [],
        title: deriveCardTitle(message),
        highlights: [],
        savedImages: [],
        notes: [],
        status: "streaming",
        position: parentSource
          ? findFreeChildPosition({ parent: measuredRect(parentSource), occupied: occupied(cards, sources), childHeight: CARD_MIN_HEIGHT })
          : nextRootPosition([...cards, ...sources]),
        width: CARD_WIDTH,
        messages: [
          { id: crypto.randomUUID(), role: "user", content: message },
          { id: assistantId, role: "assistant", content: "", isStreaming: true, pending: true, ...(options.updatesComposerSuggestions ? { updatesComposerSuggestions: true } : {}) },
        ],
      };
      updateCards((all) => [...all, card]);
      setLastAddedCardId(cardId);
      if (options.updatesComposerSuggestions) {
        setLastComposerCardId(cardId);
        composerMessageId.current = assistantId;
        setNewThreadSuggestions([]);
      }
      if (sourceIds.length > 0) setSelectedSourceIds([]);
      runTurn({
        cardId,
        assistantMessageId: assistantId,
        requestMessage: message,
        history: [],
        sourceIds,
        responseMode: options.responseMode,
        updatesComposerSuggestions: options.updatesComposerSuggestions,
        thenCheck,
      });
      return true;
    },
    [cards, makeDeliverable, measuredRect, occupied, runTurn, selectedSourceIds, sources, updateCards],
  );

  const sendRootMessage = useCallback((text: string) => startCard(text, { updatesComposerSuggestions: true }), [startCard]);

  const createLessonFromSource = useCallback(
    (sourceId: string) => {
      const source = sources.find((item) => item.id === sourceId && item.status === "ready");
      if (!source) return;
      startCard(`Create a lesson from ${source.name}.`, { sourceIds: [sourceId], kind: "lesson", responseMode: "lesson" });
    },
    [sources, startCard],
  );

  const sendCardMessage = useCallback(
    (cardId: string, text: string, retry?: RetryTarget, contextExcerpt?: string, occurrence?: number, options: { readsAsk?: boolean } = {}): boolean => {
      const message = text.trim();
      if (!message) return false;
      // 🔴 `readsAsk: false` IS FOR TEXT THE PRODUCT WROTE, NOT THE LEARNER. A finished test's
      // account quotes every question back ("I answered…, but the answer was…"), and a quoted
      // question can easily contain a make-verb near the word "test" or "questions". Reading it
      // would answer a learner's finished test by making them a second one.
      // Asked for both: teach in the answer, then make the test from this thread. See
      // `asksToBeTaughtToo` for why a test can never replace the lesson it is testing.
      const thenCheck = !retry && !contextExcerpt && options.readsAsk !== false && readCheckAsk(message) && asksToBeTaughtToo(message);
      if (!retry && !contextExcerpt && options.readsAsk !== false && !thenCheck) {
        const asked = readBoardMakeAsk(message);
        if (asked) {
          makeDeliverable(asked, { cardId, topic: message });
          return true;
        }
      }
      if (isMessageTooLong(message)) {
        setLimitNotice(messageLimitNotice(message));
        return false;
      }
      const card = cards.find((item) => item.id === cardId);
      if (!card || card.status === "streaming") return false;
      const retried = retry ? removeFailedTurn(card.messages, retry) : null;
      if (retry && !retried) return false;
      const messages = retried?.messages ?? card.messages;
      const updatesComposer = retried?.updatesComposerSuggestions ?? false;
      const excerpt =
        normalizeContextExcerpt(contextExcerpt) ?? normalizeContextExcerpt(retried?.contextExcerpt) ?? normalizeContextExcerpt(card.contextExcerpt ?? undefined);
      const excerptOccurrence = contextExcerpt ? occurrence : retried?.contextExcerpt ? retried.contextOccurrence : excerpt ? card.contextOccurrence : undefined;
      const responseMode: BoardResponseMode = retry && card.kind === "lesson" && messages.length === 0 ? "lesson" : "answer";
      const context = cardContext({ ...card, messages });
      const assistantId = crypto.randomUUID();
      updateCards((all) =>
        all.map((item) =>
          item.id === cardId
            ? {
                ...item,
                title: messages.length === 0 ? deriveCardTitle(message) : item.title,
                status: "streaming",
                messages: [
                  ...messages,
                  { id: crypto.randomUUID(), role: "user", content: message, ...(excerpt ? { contextExcerpt: excerpt, contextOccurrence: excerptOccurrence } : {}) },
                  { id: assistantId, role: "assistant", content: "", isStreaming: true, pending: true, ...(updatesComposer ? { updatesComposerSuggestions: true } : {}) },
                ],
              }
            : item,
        ),
      );
      if (updatesComposer) {
        composerMessageId.current = assistantId;
        setNewThreadSuggestions([]);
      }
      runTurn({
        cardId,
        assistantMessageId: assistantId,
        requestMessage: message,
        history: context,
        contextExcerpt: excerpt,
        sourceIds: card.sourceIds,
        responseMode,
        updatesComposerSuggestions: updatesComposer,
        cardTitle: card.title.trim() || undefined,
        cardSummary: card.summary?.trim() || undefined,
        thenCheck,
      });
      return true;
    },
    [cards, makeDeliverable, runTurn, updateCards],
  );

  /**
   * The last tap on a test card: the result stays in the card.
   *
   * 🔴🔴 A REVERSAL, AND IT IS THE OWNER'S — 2026-09-04: *"tests should show results in their own
   * card node not be sent to chat"*. This shipped the chat's way, which is to send an account of
   * the attempt into the thread and let Nemesis mark it in words (his own rule, 2026-08-24), and
   * delete the card. On a board that is wrong twice over: the card is a place the learner put
   * somewhere, and a test that scores you and then disappears leaves nothing to look at.
   *
   * So the picks are kept, the card draws the score and every question, and asking Nemesis to
   * explain the misses is a BUTTON on that card rather than something that happens to you.
   */
  const finishCheck = useCallback((outputId: string, picks: readonly (string | null)[]) => {
    setOutputs((all) => all.map((output) => (output.id === outputId ? { ...output, picks: [...picks] } : output)));
  }, []);

  /** Ask the thread to explain what was missed. The account is the chat's own `describeAttempt`. */
  const explainCheck = useCallback(
    (outputId: string, account: string) => {
      const check = outputs.find((output) => output.id === outputId);
      const text = account.trim();
      if (!check || !text) return;
      if (check.cardId && cards.some((card) => card.id === check.cardId)) {
        sendCardMessage(check.cardId, text, undefined, undefined, undefined, { readsAsk: false });
        return;
      }
      startCard(text, { readsAsk: false });
    },
    [cards, outputs, sendCardMessage, startCard],
  );

  const createBranchCard = useCallback(
    (cardId: string, side: BranchSide = "right") => {
      const parent = cards.find((item) => item.id === cardId);
      if (!parent) return;
      const id = crypto.randomUUID();
      const card: BoardCard = {
        id,
        kind: "conversation",
        parentId: cardId,
        sourceIds: parent.sourceIds,
        contextExcerpt: null,
        inheritedContext: cardContext(parent),
        title: NEW_THREAD_TITLE,
        highlights: [],
        savedImages: [],
        notes: [],
        status: "idle",
        position: findFreeChildPosition({ parent: measuredRect(parent), occupied: occupied(cards, sources), side }),
        width: CARD_WIDTH,
        messages: [],
      };
      updateCards((all) => [...all, card]);
      setLastAddedCardId(id);
    },
    [cards, measuredRect, occupied, sources, updateCards],
  );

  const setHighlight = useCallback(
    (
      cardId: string,
      text: string,
      kind: BoardHighlightKind,
      options: { noteId?: string; savedByUser?: boolean; occurrence?: number } = {},
    ) => {
      const flat = text.replace(/\s+/g, " ").trim();
      if (!flat) return;
      updateCards((all) =>
        all.map((card) => {
          if (card.id !== cardId) return card;
          const existing = card.highlights.find((item) => item.text === flat && (item.occurrence ?? 0) === (options.occurrence ?? 0));
          if (existing) {
            const nextKind = kind === "branch" ? "branch" : existing.kind;
            const savedByUser = existing.savedByUser || Boolean(options.savedByUser);
            const noteIds = options.noteId && !existing.noteIds.includes(options.noteId) ? [...existing.noteIds, options.noteId] : existing.noteIds;
            if (nextKind === existing.kind && savedByUser === existing.savedByUser && noteIds === existing.noteIds) return card;
            return { ...card, highlights: card.highlights.map((item) => (item === existing ? { ...item, kind: nextKind, savedByUser, noteIds } : item)) };
          }
          return {
            ...card,
            highlights: [
              ...card.highlights,
              {
                id: crypto.randomUUID(),
                category: "highlighted-text",
                kind,
                text: flat,
                occurrence: options.occurrence,
                savedByUser: Boolean(options.savedByUser),
                noteIds: options.noteId ? [options.noteId] : [],
              },
            ],
          };
        }),
      );
    },
    [updateCards],
  );

  const saveCardHighlight = useCallback(
    (cardId: string, text: string, kind: BoardHighlightKind = "saved", occurrence?: number) => {
      setHighlight(cardId, text, kind, { savedByUser: kind === "saved", occurrence });
    },
    [setHighlight],
  );

  const sendBranchQuestion = useCallback(
    (cardId: string, text: string, side: BranchSide = "right", contextExcerpt?: string, occurrence?: number): boolean => {
      const message = text.trim();
      if (!message) return false;
      if (isMessageTooLong(message)) {
        setLimitNotice(messageLimitNotice(message));
        return false;
      }
      const parent = cards.find((item) => item.id === cardId);
      if (!parent) return false;
      const excerpt = normalizeContextExcerpt(contextExcerpt);
      const excerptOccurrence = excerpt ? occurrence : undefined;
      const context = cardContext(parent);
      const id = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const card: BoardCard = {
        id,
        kind: "conversation",
        parentId: cardId,
        sourceIds: parent.sourceIds,
        contextExcerpt: excerpt ?? null,
        contextOccurrence: excerptOccurrence,
        inheritedContext: context,
        title: deriveCardTitle(message),
        highlights: [],
        savedImages: [],
        notes: [],
        status: "streaming",
        position: findFreeChildPosition({ parent: measuredRect(parent), occupied: occupied(cards, sources), side, childHeight: CARD_MIN_HEIGHT }),
        width: CARD_WIDTH,
        messages: [
          { id: crypto.randomUUID(), role: "user", content: message, ...(excerpt ? { contextExcerpt: excerpt, contextOccurrence: excerptOccurrence } : {}) },
          { id: assistantId, role: "assistant", content: "", isStreaming: true, pending: true },
        ],
      };
      updateCards((all) => [...all, card]);
      setLastAddedCardId(id);
      runTurn({ cardId: id, assistantMessageId: assistantId, requestMessage: message, history: context, contextExcerpt: excerpt, sourceIds: parent.sourceIds });
      if (excerpt) setHighlight(cardId, excerpt, "branch", { occurrence: excerptOccurrence });
      return true;
    },
    [cards, measuredRect, occupied, runTurn, setHighlight, sources, updateCards],
  );

  const branchFromSelection = useCallback(
    (cardId: string, excerpt: string, occurrence?: number) => {
      const flat = excerpt.trim();
      const parent = cards.find((item) => item.id === cardId);
      if (!flat || !parent) return;
      const context = cardContext(parent);
      const id = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const card: BoardCard = {
        id,
        kind: "conversation",
        parentId: cardId,
        sourceIds: parent.sourceIds,
        contextExcerpt: flat,
        contextOccurrence: occurrence,
        inheritedContext: context,
        title: deriveCardTitle(flat),
        highlights: [],
        savedImages: [],
        notes: [],
        status: "streaming",
        position: findFreeChildPosition({ parent: measuredRect(parent), occupied: occupied(cards, sources), childHeight: CARD_MIN_HEIGHT }),
        width: CARD_WIDTH,
        messages: [{ id: assistantId, role: "assistant", content: "", isStreaming: true, pending: true }],
      };
      updateCards((all) => [...all, card]);
      setLastAddedCardId(id);
      runTurn({ cardId: id, assistantMessageId: assistantId, requestMessage: DIVE_DEEPER_MESSAGE, history: context, contextExcerpt: flat, sourceIds: parent.sourceIds });
      setHighlight(cardId, flat, "branch", { occurrence });
    },
    [cards, measuredRect, occupied, runTurn, setHighlight, sources, updateCards],
  );

  // ----------------------------------------------------------------- edits
  const updateCardPosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      updateCards((all) =>
        all.map((card) =>
          card.id === id
            ? { ...card, position }
            : card.notes.some((note) => note.id === id)
              ? { ...card, notes: card.notes.map((note) => (note.id === id ? { ...note, position } : note)) }
              : card,
        ),
      );
      setSources((all) => all.map((source) => (source.id === id ? { ...source, position } : source)));
      setOutputs((all) => all.map((output) => (output.id === id ? { ...output, position } : output)));
    },
    [updateCards],
  );

  const updateViewport = useCallback((next: BoardViewport) => {
    setViewport((was) => (was && was.x === next.x && was.y === next.y && was.zoom === next.zoom ? was : next));
  }, []);

  const updateCardSize = useCallback(
    (id: string, size: { width?: number; height?: number }) => {
      const apply = <T extends { id: string; width: number; height?: number }>(items: T[]): T[] => {
        let changed = false;
        const next = items.map((item) => {
          if (item.id !== id) return item;
          const width = size.width ?? item.width;
          const height = size.height ?? item.height;
          if (item.width === width && item.height === height) return item;
          changed = true;
          return { ...item, width, height };
        });
        return changed ? next : items;
      };
      updateCards(apply);
      setSources(apply);
    },
    [updateCards],
  );

  const setCardCollapsed = useCallback(
    (id: string, collapsed: boolean) => {
      updateCards((all) => all.map((card) => (card.id === id && (card.collapsed === true) !== collapsed ? { ...card, collapsed: collapsed || undefined } : card)));
    },
    [updateCards],
  );

  const applyHistory = useCallback(
    (action: { type: "delete"; targets: DeleteTarget[] } | { type: "undo" } | { type: "redo" }) => {
      const entryId = crypto.randomUUID();
      const full = action.type === "delete" ? { ...action, entryId, cardSnapshots: history.cards.map((card) => ({ ...card, ...(measured.current.get(card.id) ?? {}) })) } : { ...action, entryId };
      const next = historyReducer(history, full);
      if (next === history) return;
      const before = new Set(history.cards.flatMap((card) => [card.id, ...card.notes.map((note) => note.id)]));
      const after = new Set(next.cards.flatMap((card) => [card.id, ...card.notes.map((note) => note.id)]));
      const arrived = action.type === "delete" ? undefined : [...after].find((id) => !before.has(id));
      if (arrived) setLastAddedCardId(arrived);
      else if (lastAddedCardId && !after.has(lastAddedCardId)) setLastAddedCardId(null);
      dispatch(full);
    },
    [history, lastAddedCardId],
  );

  const deleteNodes = useCallback(
    (ids: string[]) => {
      const wanted = new Set(ids);
      if (cards.some((card) => wanted.has(card.id) && card.status === "streaming")) {
        setLimitNotice(IN_FLIGHT_DELETE_NOTICE);
        return;
      }
      const outputIds = ids.filter((id) => outputs.some((output) => output.id === id));
      if (outputIds.length) {
        setOutputs((all) => all.filter((output) => !outputIds.includes(output.id)));
        setOpenedOutputId((open) => (open && outputIds.includes(open) ? null : open));
      }
      const sourceIds = ids.filter((id) => sources.some((source) => source.id === id));
      if (sourceIds.length) {
        setSources((all) => all.filter((source) => !sourceIds.includes(source.id)));
        setSelectedSourceIds((all) => all.filter((id) => !sourceIds.includes(id)));
      }
      const targets = buildDeleteTargets(cards, ids);
      if (targets.length) applyHistory({ type: "delete", targets });
    },
    [applyHistory, cards, outputs, sources],
  );

  const deleteNode = useCallback((id: string) => deleteNodes([id]), [deleteNodes]);

  const undo = useCallback(() => {
    const entry = history.past.at(-1);
    if (!entry) return;
    if (!canApplyOperation(cards, entry.operation)) {
      setLimitNotice(`This undo would exceed the ${MAX_BOARD_CARDS}-card canvas limit. Remove a card and try again.`);
      return;
    }
    const restored = applyOperation(cards, entry.operation).cards;
    const document = serializeBoardState({ annotations, cards: restored, sources, outputs, selectedSourceIds, useWebSearch, viewport: viewport ?? undefined }, measured.current);
    if (!documentFitsSizeLimit(document)) {
      setLimitNotice("This undo would exceed the canvas storage limit. Remove some content or sources and try again.");
      return;
    }
    applyHistory({ type: "undo" });
  }, [annotations, applyHistory, cards, history.past, outputs, selectedSourceIds, sources, useWebSearch, viewport]);

  const redo = useCallback(() => {
    if (history.future.length === 0) return;
    applyHistory({ type: "redo" });
  }, [applyHistory, history.future.length]);

  const removeCardHighlight = useCallback((cardId: string, highlightId: string) => applyHistory({ type: "delete", targets: [{ cardId, highlightId }] }), [applyHistory]);

  const saveCardImage = useCallback(
    (cardId: string, url: string, alt = "") => {
      const trimmed = url.trim();
      if (!trimmed) return;
      updateCards((all) =>
        all.map((card) =>
          card.id !== cardId || card.savedImages.some((image) => image.url === trimmed)
            ? card
            : { ...card, savedImages: [...card.savedImages, { id: crypto.randomUUID(), category: "saved-image", url: trimmed, alt: alt.trim() || "Saved image" }] },
        ),
      );
    },
    [updateCards],
  );

  const removeCardImage = useCallback(
    (cardId: string, imageId: string) => {
      updateCards((all) => all.map((card) => (card.id === cardId ? { ...card, savedImages: card.savedImages.filter((image) => image.id !== imageId) } : card)));
    },
    [updateCards],
  );

  const addCardNote = useCallback(
    (cardId: string, excerpt?: string, occurrence?: number) => {
      const flat = excerpt?.replace(/\s+/g, " ").trim();
      const noteId = crypto.randomUUID();
      if (flat) setHighlight(cardId, flat, "saved", { noteId, occurrence });
      updateCards((all) =>
        all.map((card) =>
          card.id === cardId
            ? {
                ...card,
                notes: [
                  ...card.notes,
                  { id: noteId, category: "note", contextExcerpt: flat || null, contextOccurrence: flat ? occurrence : undefined, text: "", position: notePosition(measuredRect(card), card.notes.length) },
                ],
              }
            : card,
        ),
      );
      setLastAddedCardId(noteId);
    },
    [measuredRect, setHighlight, updateCards],
  );

  const updateCardNote = useCallback(
    (cardId: string, noteId: string, text: string) => {
      updateCards((all) => all.map((card) => (card.id === cardId ? { ...card, notes: card.notes.map((note) => (note.id === noteId ? { ...note, text } : note)) } : card)));
    },
    [updateCards],
  );

  const removeCardNote = useCallback(
    (cardId: string, noteId: string) => {
      updateCards((all) =>
        all.map((card) => {
          if (card.id !== cardId || !card.notes.some((note) => note.id === noteId)) return card;
          return {
            ...card,
            notes: card.notes.filter((note) => note.id !== noteId),
            highlights: card.highlights.flatMap((highlight) => {
              if (!highlight.noteIds.includes(noteId)) return [highlight];
              const noteIds = highlight.noteIds.filter((id) => id !== noteId);
              return noteIds.length === 0 && !highlight.savedByUser && highlight.kind !== "branch" ? [] : [{ ...highlight, noteIds }];
            }),
          };
        }),
      );
    },
    [updateCards],
  );

  const focusNoteExcerpt = useCallback((cardId: string, excerpt: string, occurrence?: number) => {
    setNoteFocusRequest({ cardId, excerpt, occurrence, requestId: crypto.randomUUID() });
  }, []);

  // ----------------------------------------------------------------- sources
  const toggleSourceSelection = useCallback(
    (sourceId: string) => {
      const source = sources.find((item) => item.id === sourceId);
      if (!source || source.status !== "ready") return;
      setSelectedSourceIds((all) => {
        // No cap any more: the board grounds across every selected document the way the chat
        // grounds across every attached one (lib/board/board-grounding.ts), so there is nothing
        // to protect the packet from. Wondering's four was the size of a pasted question.
        if (all.includes(sourceId)) return all.filter((id) => id !== sourceId);
        return [...all, sourceId];
      });
    },
    [sources],
  );

  const sourceOrdinal = useRef(0);
  const claimSourceOrdinal = useCallback(() => {
    const held = Math.max(0, ...sourcesRef.current.map((source) => sourceOrdinalOf(source)));
    sourceOrdinal.current = Math.max(sourceOrdinal.current, held) + 1;
    return `s${sourceOrdinal.current}`;
  }, []);
  const sourcesRef = useRef<BoardSource[]>([]);
  sourcesRef.current = sources;

  const updateAnnotations = useCallback(
    (update: (current: readonly BoardAnnotation[]) => BoardAnnotation[]) => setAnnotations((current) => update(current)),
    [],
  );

  const addSourceFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
      const images = files.filter((file) => file.type.startsWith("image/") || /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name));
      const documents = files.filter((file) => !pdfs.includes(file) && !images.includes(file));
      const drafts = [
        ...pdfs.map((file) => ({ id: crypto.randomUUID(), type: "pdf" as const, name: file.name, files: [file], previewUrls: [] as string[] })),
        ...documents.map((file) => ({ id: crypto.randomUUID(), type: "document" as const, name: file.name, files: [file], previewUrls: [] as string[] })),
        ...(images.length > 0
          ? [{ id: crypto.randomUUID(), type: "image" as const, name: images.length === 1 ? (images[0]?.name ?? "image") : `${images.length} images`, files: images, previewUrls: images.map((file) => URL.createObjectURL(file)) }]
          : []),
      ];
      for (const draft of drafts) for (const url of draft.previewUrls) previewUrls.current.add(url);
      setSources((all) => {
        const next = [...all];
        for (const draft of drafts) {
          next.push({
            id: draft.id,
            type: draft.type,
            name: draft.name,
            content: "",
            status: "processing",
            previewUrls: draft.previewUrls,
            position: nextRootPosition([...cards, ...next]),
            width: SOURCE_WIDTH,
          });
        }
        return next;
      });
      // 🔴 THE CHAT'S ATTACH PATH, NOT A SECOND ONE (use-canvas-session.ts, "keep IS WHAT MAKES
      // CROSS-SESSION LEARNING POSSIBLE"). `keep` files the document so it has a parsed row for
      // retrieval to search; the canonical parse gives the excerpts their headings and pages; the
      // coverage disclosure rides so the model never claims a page it could not read.
      await Promise.all(
        drafts.map(async (draft) => {
          try {
            const read = await Promise.all(draft.files.map((file) => extractFile(file, uid, { folderPath: CANVAS_FILING_FOLDER, keep: true })));
            const content = read.map((item) => item.text).join("\n\n").trim();
            if (!content) throw new Error("Nothing readable was found in this file.");
            const name = read.length === 1 && read[0]?.title ? read[0].title : draft.name;
            const first = read[0];
            // 🔴 CLAIMED, NOT COUNTED (use-canvas-session.ts, `claimSourceId`): two drops in flight
            // both read the same length and both mint the same id, and a removed source leaves a gap a
            // later id can reuse, so two documents share one excerpt namespace. The counter starts past
            // every id the board already holds and only ever goes up.
            const sourceId = claimSourceOrdinal();
            const canonical = read.length === 1 && first?.librarySourceId ? await loadCanonicalSource(first.librarySourceId) : { ok: false as const };
            const disclosure =
              read.length === 1 && first?.librarySourceId
                ? await storedCoverage(first.librarySourceId)
                : { label: coverageLabel(first?.coverage), note: coverageNote(first?.coverage) };
            const grounded: CanvasSource = {
              id: sourceId,
              title: name,
              kind: first?.kind ?? draft.type,
              excerpts: canonical.ok
                ? excerptsFromSourceContext(sourceId, canonical.context)
                : read.length === 1 && first?.model
                  ? buildExcerptsFromModel(sourceId, first.model)
                  : buildExcerpts(sourceId, content),
              ...(disclosure.note ? { coverageNote: disclosure.note } : {}),
              ...(disclosure.label ? { coverageLabel: disclosure.label } : {}),
              durability: read.length === 1 && first?.librarySourceId ? "durable" : "ephemeral",
              ...(read.length === 1 && first?.librarySourceId ? { librarySourceId: first.librarySourceId } : {}),
            };
            setSources((all) => all.map((source) => (source.id === draft.id ? { ...source, name, content, grounded, status: "ready" } : source)));
            setSelectedSourceIds((all) => [...all, draft.id]);
          } catch (error) {
            setSources((all) =>
              all.map((source) =>
                source.id === draft.id ? { ...source, status: "error", error: error instanceof Error ? error.message : "This source could not be processed." } : source,
              ),
            );
          }
        }),
      );
    },
    [cards, claimSourceOrdinal, uid],
  );

  const setSourceCollapsed = useCallback((id: string, collapsed: boolean) => {
    setSources((all) => all.map((source) => (source.id === id ? { ...source, collapsed: collapsed || undefined } : source)));
  }, []);

  const dismissLimitNotice = useCallback(() => setLimitNotice(null), []);

  const value = useMemo<BoardContextValue>(
    () => ({
      boardId: boardIdRef.current,
      loaded,
      cards,
      sources,
      selectedSourceIds,
      useWebSearch,
      setUseWebSearch,
      viewport,
      hasSavedViewport,
      updateViewport,
      lastAddedCardId,
      lastComposerCardId,
      newThreadSuggestions,
      limitNotice,
      dismissLimitNotice,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      undo,
      redo,
      sendRootMessage,
      sendCardMessage,
      createBranchCard,
      sendBranchQuestion,
      branchFromSelection,
      deleteNode,
      deleteNodes,
      updateCardPosition,
      updateCardSize,
      setCardCollapsed,
      reportNodeSize,
      saveCardHighlight,
      removeCardHighlight,
      saveCardImage,
      removeCardImage,
      addCardNote,
      updateCardNote,
      removeCardNote,
      noteFocusRequest,
      focusNoteExcerpt,
      annotations,
      updateAnnotations,
      addSourceFiles,
      toggleSourceSelection,
      createLessonFromSource,
      outputs,
      makeDeliverable,
      finishCheck,
      explainCheck,
      setSourceCollapsed,
      openedOutput,
      openOutput,
      closeOutput,
    }),
    [
      annotations,
      updateAnnotations,
      loaded,
      cards,
      sources,
      selectedSourceIds,
      useWebSearch,
      viewport,
      hasSavedViewport,
      updateViewport,
      lastAddedCardId,
      lastComposerCardId,
      newThreadSuggestions,
      limitNotice,
      dismissLimitNotice,
      history.past.length,
      history.future.length,
      undo,
      redo,
      sendRootMessage,
      sendCardMessage,
      createBranchCard,
      sendBranchQuestion,
      branchFromSelection,
      deleteNode,
      deleteNodes,
      updateCardPosition,
      updateCardSize,
      setCardCollapsed,
      reportNodeSize,
      saveCardHighlight,
      removeCardHighlight,
      saveCardImage,
      removeCardImage,
      addCardNote,
      updateCardNote,
      removeCardNote,
      noteFocusRequest,
      focusNoteExcerpt,
      addSourceFiles,
      toggleSourceSelection,
      createLessonFromSource,
      outputs,
      makeDeliverable,
      finishCheck,
      explainCheck,
      setSourceCollapsed,
      openedOutput,
      openOutput,
      closeOutput,
    ],
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export { NOTE_WIDTH };
export type { BoardState };
export { emptySuggestions };
