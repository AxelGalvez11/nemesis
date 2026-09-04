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
import { boardCanvasFor, makeBoardDeliverable, readDeliverableAsk, type DeliverableKind } from "@/lib/board/board-deliverables";
import { groundedSources } from "@/lib/board/board-grounding";
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
  addSourceFiles: (files: File[]) => Promise<void>;
  toggleSourceSelection: (sourceId: string) => void;
  createLessonFromSource: (sourceId: string) => void;
  /** Deliverables made on this board (lib/board/board-deliverables.ts). */
  outputs: BoardOutputCard[];
  /** Make one beside a thread (or from the composer, `cardId` null), from what was typed. */
  makeDeliverable: (kind: DeliverableKind, options?: { cardId?: string | null; topic?: string }) => void;
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
    const snapshot: BoardState = { cards, sources, outputs, selectedSourceIds, useWebSearch, viewport: viewport ?? undefined };
    const timer = window.setTimeout(() => schedule(snapshot, historyForSave()), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [cards, sources, outputs, selectedSourceIds, useWebSearch, viewport, loaded, schedule, historyForSave, seed]);

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
      const attached = (input.sourceIds ?? []).map((id) => sources.find((source) => source.id === id)).filter((s): s is BoardSource => Boolean(s));
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
    (kind: DeliverableKind, options: { cardId?: string | null; topic?: string } = {}) => {
      const cardId = options.cardId ?? null;
      const topic = (options.topic ?? "").trim();
      if (!uid) {
        setLimitNotice("Sign in to make things on the canvas.");
        return;
      }
      const parent = cardId ? cards.find((card) => card.id === cardId) : undefined;
      if (cardId && !parent) return;
      const outputId = crypto.randomUUID();
      const position = parent
        ? findFreeChildPosition({ parent: measuredRect(parent), occupied: occupied(cards, sources), side: "right", childWidth: OUTPUT_WIDTH, childHeight: OUTPUT_MIN_HEIGHT })
        : nextRootPosition([...cards, ...sources, ...outputs]);
      const draft: BoardOutputCard = { id: outputId, cardId, kind, status: "making", topic, createdAt: new Date().toISOString(), position, width: OUTPUT_WIDTH };
      setOutputs((all) => [...all, draft]);
      const canvas = boardCanvasFor({ boardId: boardIdRef.current, title: deriveBoardTitle(cards, sources), cards, cardId, sources: groundedSources(sources) });
      const patch = (change: (output: BoardOutputCard) => BoardOutputCard) => {
        if (!mounted.current) return;
        setOutputs((all) => all.map((output) => (output.id === outputId ? change(output) : output)));
      };
      void makeBoardDeliverable(uid, canvas, kind, topic, (label) => patch((output) => ({ ...output, progress: label })))
        .then((result) => {
          if ("error" in result) patch((output) => ({ ...output, status: "error", error: result.error, progress: undefined }));
          else patch((output) => ({ ...output, status: "ready", output: result.output, progress: undefined }));
        })
        .catch((error: unknown) => {
          patch((output) => ({ ...output, status: "error", error: error instanceof Error ? error.message : "This could not be made. Try again.", progress: undefined }));
        });
    },
    [cards, measuredRect, occupied, outputs, sources, uid],
  );

  const openedOutput = useMemo(() => outputs.find((output) => output.id === openedOutputId)?.output ?? null, [outputs, openedOutputId]);
  const openOutput = useCallback((outputId: string) => setOpenedOutputId(outputId), []);
  const closeOutput = useCallback(() => setOpenedOutputId(null), []);

  const startCard = useCallback(
    (
      text: string,
      options: { sourceIds?: string[]; kind?: BoardCard["kind"]; responseMode?: BoardResponseMode; updatesComposerSuggestions?: boolean } = {},
    ): boolean => {
      const message = text.trim();
      if (!message) return false;
      // "Make me flashcards on this" is an ask for a thing, not a question: the chat's own reader
      // decides (readDeliverableAsk), and the thing lands on the board instead of an answer.
      const asked = readDeliverableAsk(message);
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
    (cardId: string, text: string, retry?: RetryTarget, contextExcerpt?: string, occurrence?: number): boolean => {
      const message = text.trim();
      if (!message) return false;
      if (!retry && !contextExcerpt) {
        const asked = readDeliverableAsk(message);
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
      });
      return true;
    },
    [cards, makeDeliverable, runTurn, updateCards],
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
    const document = serializeBoardState({ cards: restored, sources, outputs, selectedSourceIds, useWebSearch, viewport: viewport ?? undefined }, measured.current);
    if (!documentFitsSizeLimit(document)) {
      setLimitNotice("This undo would exceed the canvas storage limit. Remove some content or sources and try again.");
      return;
    }
    applyHistory({ type: "undo" });
  }, [applyHistory, cards, history.past, outputs, selectedSourceIds, sources, useWebSearch, viewport]);

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
      const firstOrdinal = sources.length + 1;
      await Promise.all(
        drafts.map(async (draft, draftIndex) => {
          try {
            const read = await Promise.all(draft.files.map((file) => extractFile(file, uid, { folderPath: CANVAS_FILING_FOLDER, keep: true })));
            const content = read.map((item) => item.text).join("\n\n").trim();
            if (!content) throw new Error("Nothing readable was found in this file.");
            const name = read.length === 1 && read[0]?.title ? read[0].title : draft.name;
            const first = read[0];
            const sourceId = `s${firstOrdinal + draftIndex}`;
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
    [cards, sources.length, uid],
  );

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
      addSourceFiles,
      toggleSourceSelection,
      createLessonFromSource,
      outputs,
      makeDeliverable,
      openedOutput,
      openOutput,
      closeOutput,
    }),
    [
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
