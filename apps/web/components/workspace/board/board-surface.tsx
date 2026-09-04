"use client";

// The board itself: React Flow with our three node kinds, edges between a card and what it branched
// from, the zoom controls, undo/redo, and the camera rules (docs/wondering-canvas-reference.md §3).

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getNodesBounds,
  getViewportForBounds,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeChange,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { CARD_WIDTH, EMPTY_CARD_HEIGHT, INITIAL_CARD_ZOOM, MAX_ZOOM, MIN_ZOOM, NOTE_WIDTH, centeredViewportForNode, connectionSides } from "@/lib/board/board-layout";
import type { BoardViewport } from "@/lib/board/board-model";
import { cn } from "@/lib/utils";

import { IconTooltip, isEditableTarget, measureBoardArea, sourceHandleId, targetHandleId } from "./board-chrome";
import { useBoard } from "./board-provider";
import { ConversationCard, type ConversationNodeData } from "./conversation-card";
import { NoteCard, OutputCard, SourceCard, type NoteNodeData, type OutputNodeData, type SourceNodeData } from "./other-cards";
import "./board.css";

type BoardNode =
  | Node<ConversationNodeData, "conversation">
  | Node<NoteNodeData, "note">
  | Node<SourceNodeData, "source">
  | Node<OutputNodeData, "output">;

const NODE_TYPES = { conversation: ConversationCard, note: NoteCard, source: SourceCard, output: OutputCard };
const PRO_OPTIONS = { hideAttribution: true };
const EDGE_STROKE = "var(--board-edge)";
const CONTROL_CLASS =
  "react-flow__controls-button !border-(--ui-stroke-secondary) !bg-(--ui-bg-elevated) !text-(--ui-text-secondary) transition-colors hover:!bg-(--ui-control-hover-background) hover:!text-foreground disabled:!text-(--ui-text-tertiary)";

const isApple = () => typeof navigator !== "undefined" && /Mac|iP(?:hone|ad|od)/.test(navigator.platform || navigator.userAgent);

function UndoRedoControls() {
  const { canUndo, canRedo, undo, redo } = useBoard();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target) || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isRedo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey);
      const isUndo = key === "z" && !event.shiftKey;
      if (!isUndo && !isRedo) return;
      event.preventDefault();
      if (isRedo && canRedo) redo();
      else if (isUndo && canUndo) undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRedo, canUndo, redo, undo]);
  const apple = isApple();
  const undoKey = apple ? "⌘Z" : "Ctrl+Z";
  const redoKey = apple ? "⇧⌘Z" : "Ctrl+Y";
  const button = "rounded-[6px] p-[6px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-(--ui-text-secondary)";
  return (
    <div className="absolute right-[16px] top-[16px] z-10 flex items-center gap-[2px] rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/95 p-[4px] shadow-sm">
      <IconTooltip label={`Undo (${undoKey})`}>
        <button aria-label={`Undo (${undoKey})`} className={button} disabled={!canUndo} onClick={undo} type="button">
          <Undo2 className="size-[16px]" />
        </button>
      </IconTooltip>
      <IconTooltip label={`Redo (${redoKey})`}>
        <button aria-label={`Redo (${redoKey})`} className={button} disabled={!canRedo} onClick={redo} type="button">
          <Redo2 className="size-[16px]" />
        </button>
      </IconTooltip>
    </div>
  );
}

function ViewportControls() {
  const { fitView, getNodes, setViewport, zoomIn, zoomOut } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  const minZoom = useStore((state) => state.minZoom);
  const maxZoom = useStore((state) => state.maxZoom);
  const fit = () => {
    const area = measureBoardArea();
    const nodes = getNodes();
    if (!area || area.viewportWidth <= 0 || area.availableHeight <= 0 || nodes.length === 0) {
      void fitView();
      return;
    }
    const next = getViewportForBounds(getNodesBounds(nodes), area.viewportWidth, area.availableHeight, minZoom, maxZoom, 0.1);
    void setViewport(next, { duration: 250 });
  };
  return (
    <Controls className="!bottom-0 !right-0 !top-auto !z-10 !m-[15px]" position="bottom-right" showFitView={false} showInteractive={false} showZoom={false}>
      <IconTooltip label="Zoom in" side="left">
        <button aria-label="Zoom in" className={cn(CONTROL_CLASS, "react-flow__controls-zoomin")} disabled={zoom >= maxZoom} onClick={() => void zoomIn()} type="button">
          <Plus aria-hidden className="size-[16px]" />
        </button>
      </IconTooltip>
      <IconTooltip label="Zoom out" side="left">
        <button aria-label="Zoom out" className={cn(CONTROL_CLASS, "react-flow__controls-zoomout")} disabled={zoom <= minZoom} onClick={() => void zoomOut()} type="button">
          <Minus aria-hidden className="size-[16px]" />
        </button>
      </IconTooltip>
      <IconTooltip label="Fit view" side="left">
        <button aria-label="Fit view" className={cn(CONTROL_CLASS, "react-flow__controls-fitview")} onClick={fit} type="button">
          <Maximize aria-hidden className="size-[16px]" />
        </button>
      </IconTooltip>
    </Controls>
  );
}

/** Once, on load: put the camera back where it was. */
function RestoreViewport({ viewport }: { viewport: BoardViewport | null }) {
  const { setViewport } = useReactFlow();
  const done = useRef(false);
  useEffect(() => {
    if (!viewport || done.current) return;
    done.current = true;
    void setViewport(viewport);
  }, [setViewport, viewport]);
  return null;
}

/** Centre the camera on a node the first time it has a size: a new card, a restored one, a note. */
function CenterTarget({ nodeId, companionId, instant, maxZoom }: { nodeId: string | null; companionId: string | null; instant: boolean; maxZoom?: number }) {
  const ready = useNodesInitialized();
  const { getInternalNode, setViewport } = useReactFlow();
  const centred = useRef<string | null>(null);
  useEffect(() => {
    if (!nodeId || !ready || centred.current === nodeId) return;
    const node = getInternalNode(nodeId);
    const area = measureBoardArea();
    if (!node?.measured?.width || !node.measured.height || !area) return;
    const companion = companionId ? getInternalNode(companionId) : null;
    const left = companion?.measured?.width ? Math.min(node.position.x, companion.position.x) : node.position.x;
    const right = companion?.measured?.width
      ? Math.max(node.position.x + node.measured.width, companion.position.x + companion.measured.width)
      : node.position.x + node.measured.width;
    centred.current = nodeId;
    const next = centeredViewportForNode({
      nodePosition: { x: left, y: node.position.y },
      nodeWidth: right - left,
      nodeHeight: node.measured.height,
      maxZoom,
      viewportWidth: area.viewportWidth,
      availableHeight: area.availableHeight,
    });
    void setViewport(next, instant ? undefined : { duration: 250 });
  }, [companionId, getInternalNode, instant, maxZoom, nodeId, ready, setViewport]);
  return null;
}

function BoardInner() {
  const { fitView } = useReactFlow();
  const {
    cards,
    sources,
    outputs,
    lastAddedCardId,
    deleteNodes,
    updateCardPosition,
    updateCardSize,
    reportNodeSize,
    viewport,
    hasSavedViewport,
    updateViewport,
    addSourceFiles,
  } = useBoard();
  const ready = useNodesInitialized();
  const { getInternalNode } = useReactFlow();
  const [nodes, setNodes] = useState<BoardNode[]>([]);
  const [pickedUp, setPickedUp] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const resizeAttributes = useRef(new Map<string, boolean | "width" | "height">());
  const known = useRef(new Map<string, { position: { x: number; y: number }; width?: number; height?: number }>());

  const total = cards.length + sources.length + cards.reduce((sum, card) => sum + card.notes.length, 0);
  const isEmpty = useRef(total === 0);
  isEmpty.current = total === 0;
  const onlyOne = total === 1;

  const target = lastAddedCardId ?? (hasSavedViewport ? null : (cards[0]?.id ?? sources[0]?.id ?? null));
  const companion = (target && cards.find((card) => card.notes.some((note) => note.id === target))?.id) ?? null;

  // The first card on an empty board: centred at 0.9 before it even exists.
  const onInit = useCallback((instance: { setViewport: (viewport: BoardViewport) => void }) => {
    if (!isEmpty.current) return;
    const area = measureBoardArea();
    if (!area) return;
    instance.setViewport(
      centeredViewportForNode({
        nodePosition: { x: 0, y: 0 },
        nodeWidth: CARD_WIDTH,
        nodeHeight: EMPTY_CARD_HEIGHT,
        maxZoom: INITIAL_CARD_ZOOM,
        viewportWidth: area.viewportWidth,
        availableHeight: area.availableHeight,
      }),
    );
  }, []);

  // Model → nodes, reusing node objects whose geometry did not move so React Flow does not re-measure.
  useEffect(() => {
    const heightOf = (card: (typeof cards)[number]) => (card.collapsed ? undefined : card.height);
    const previous = known.current;
    const next = new Map(
      [
        ...cards.map((card) => ({ id: card.id, position: card.position, width: card.width, height: heightOf(card) })),
        ...cards.flatMap((card) => card.notes.map((note) => ({ id: note.id, position: note.position, width: NOTE_WIDTH, height: undefined }))),
        ...sources.map((source) => ({ id: source.id, position: source.position, width: source.width, height: source.height })),
      ].map((item) => [item.id, { position: item.position, width: item.width, height: item.height }] as const),
    );
    setNodes((was) => {
      const byId = new Map(was.map((node) => [node.id, node]));
      let changed = was.length !== next.size;
      const reuse = <T extends BoardNode>(id: string, node: T, position: { x: number; y: number }, width: number | undefined, height: number | undefined, deletable = node.deletable): T => {
        const before = previous.get(id);
        const moved = !before || before.position.x !== position.x || before.position.y !== position.y || before.width !== width || before.height !== height;
        const nextPosition = moved ? position : node.position;
        const nextWidth = moved ? width : node.width;
        const nextHeight = moved ? height : node.height;
        if (node.position.x === nextPosition.x && node.position.y === nextPosition.y && node.width === nextWidth && node.height === nextHeight && node.deletable === deletable) return node;
        changed = true;
        return { ...node, position: nextPosition, width: nextWidth, height: nextHeight, deletable };
      };
      const rebuilt: BoardNode[] = [
        ...cards.map((card) => {
          const existing = byId.get(card.id) as Node<ConversationNodeData, "conversation"> | undefined;
          if (existing) return reuse(card.id, existing, card.position, card.width, heightOf(card), card.status !== "streaming");
          changed = true;
          return { id: card.id, type: "conversation", position: card.position, width: card.width, height: heightOf(card), deletable: card.status !== "streaming", data: { cardId: card.id } } as BoardNode;
        }),
        ...cards.flatMap((card) =>
          card.notes.map((note) => {
            const existing = byId.get(note.id) as Node<NoteNodeData, "note"> | undefined;
            if (existing) return reuse(note.id, existing, note.position, NOTE_WIDTH, undefined);
            changed = true;
            return { id: note.id, type: "note", position: note.position, width: NOTE_WIDTH, data: { cardId: card.id, noteId: note.id } } as BoardNode;
          }),
        ),
        ...sources.map((source) => {
          const existing = byId.get(source.id) as Node<SourceNodeData, "source"> | undefined;
          if (existing) return reuse(source.id, existing, source.position, source.width, source.height);
          changed = true;
          return { id: source.id, type: "source", position: source.position, width: source.width, height: source.height, deletable: false, data: { sourceId: source.id } } as BoardNode;
        }),
        ...outputs.map((output) => {
          const existing = byId.get(output.id) as Node<OutputNodeData, "output"> | undefined;
          if (existing) return reuse(output.id, existing, output.position, output.width, undefined, output.status !== "making");
          changed = true;
          return { id: output.id, type: "output", position: output.position, width: output.width, deletable: output.status !== "making", data: { outputId: output.id } } as BoardNode;
        }),
      ];
      return changed ? rebuilt : was;
    });
    known.current = next;
  }, [cards, outputs, sources]);

  // The node being dragged floats above the rest.
  useEffect(() => {
    setNodes((was) =>
      was.map((node) => {
        if (node.id === pickedUp) {
          return node.data.isPickedUp ? node : ({ ...node, data: { ...node.data, isPickedUp: true }, style: { ...node.style, zIndex: 1000 } } as BoardNode);
        }
        if (!node.data.isPickedUp) return node;
        const data = { ...node.data };
        delete data.isPickedUp;
        const style = { ...node.style };
        delete style.zIndex;
        return { ...node, data, style: Object.keys(style).length > 0 ? style : undefined } as BoardNode;
      }),
    );
  }, [pickedUp]);

  // Backspace / Delete on selected nodes, never while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isEditableTarget(event.target) || (event.key !== "Backspace" && event.key !== "Delete")) return;
      const chosen = nodes.filter((node) => node.type !== "source" && node.selected).map((node) => node.id);
      if (chosen.length === 0) return;
      event.preventDefault();
      deleteNodes(chosen);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [deleteNodes, nodes]);

  const edges = useMemo<Edge[]>(() => {
    const rects = new Map(
      [...cards, ...cards.flatMap((card) => card.notes), ...sources, ...outputs].map((item) => {
        const measured = ready ? getInternalNode(item.id)?.measured : undefined;
        return [
          item.id,
          {
            position: item.position,
            width: measured?.width ?? ("width" in item ? item.width : NOTE_WIDTH),
            height: measured?.height ?? ("height" in item ? item.height : undefined),
          },
        ] as const;
      }),
    );
    const cardEdges = cards.flatMap((card) => {
      const parents = new Set(card.sourceIds);
      if (card.parentId) parents.add(card.parentId);
      return [...parents].flatMap((parentId) => {
        const from = rects.get(parentId);
        const to = rects.get(card.id);
        if (!from || !to) return [];
        const { sourceSide, targetSide } = connectionSides(from, to);
        return [
          {
            id: `edge-${parentId}-${card.id}`,
            source: parentId,
            sourceHandle: sourceHandleId(sourceSide),
            target: card.id,
            targetHandle: targetHandleId(targetSide),
            animated: card.status === "streaming",
            style: { stroke: EDGE_STROKE, strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_STROKE, width: 18, height: 18 },
          } satisfies Edge,
        ];
      });
    });
    const noteEdges = cards.flatMap((card) =>
      card.notes.flatMap((note) => {
        const from = rects.get(card.id);
        const to = rects.get(note.id);
        if (!from || !to) return [];
        const { sourceSide, targetSide } = connectionSides(from, to);
        return [
          {
            id: `edge-${card.id}-${note.id}`,
            source: card.id,
            sourceHandle: sourceHandleId(sourceSide),
            target: note.id,
            targetHandle: targetHandleId(targetSide),
            style: { stroke: EDGE_STROKE, strokeWidth: 1.5, ...(note.text.trim() ? {} : { strokeDasharray: "4 4" }) },
          } satisfies Edge,
        ];
      }),
    );
    // A deliverable hangs off the thread it was made from, on the same line a branch uses.
    const outputEdges = outputs.flatMap((output) => {
      if (!output.cardId) return [];
      const from = rects.get(output.cardId);
      const to = rects.get(output.id);
      if (!from || !to) return [];
      const { sourceSide, targetSide } = connectionSides(from, to);
      return [
        {
          id: `edge-${output.cardId}-${output.id}`,
          source: output.cardId,
          sourceHandle: sourceHandleId(sourceSide),
          target: output.id,
          targetHandle: targetHandleId(targetSide),
          animated: output.status === "making",
          style: { stroke: EDGE_STROKE, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_STROKE, width: 18, height: 18 },
        } satisfies Edge,
      ];
    });
    return [...cardEdges, ...noteEdges, ...outputEdges];
  }, [cards, getInternalNode, outputs, ready, sources]);

  const onNodesChange = useCallback<OnNodesChange<BoardNode>>(
    (changes: NodeChange<BoardNode>[]) => {
      setNodes((was) => applyNodeChanges(changes, was));
      for (const change of changes) {
        if (change.type === "position" && change.position && change.dragging === false) updateCardPosition(change.id, change.position);
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const card = cards.find((item) => item.id === change.id);
        const source = sources.find((item) => item.id === change.id);
        const settled = Boolean(
          change.resizing !== true &&
            ((card && card.status === "idle" && (card.width !== change.dimensions.width || (card.messages.length > 0 && card.height !== change.dimensions.height))) ||
              (source && source.status !== "processing" && (source.width !== change.dimensions.width || source.height !== change.dimensions.height))),
        );
        reportNodeSize(change.id, change.dimensions, settled);
        if (change.resizing && change.setAttributes) resizeAttributes.current.set(change.id, change.setAttributes);
        if (change.resizing === false) {
          const attributes = resizeAttributes.current.get(change.id);
          resizeAttributes.current.delete(change.id);
          if (!attributes) continue;
          updateCardSize(change.id, {
            width: attributes === true || attributes === "width" ? change.dimensions.width : undefined,
            height: attributes === true || attributes === "height" ? change.dimensions.height : undefined,
          });
          const position = getInternalNode(change.id)?.position;
          if (position) updateCardPosition(change.id, position);
        }
      }
    },
    [cards, getInternalNode, reportNodeSize, sources, updateCardPosition, updateCardSize],
  );

  const clearSelection = useCallback(() => setNodes((was) => was.map((node) => (node.selected ? { ...node, selected: false } : node))), []);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) void addSourceFiles(files);
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden overscroll-none"
      data-board=""
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setDragOver(false);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDrop={onDrop}
    >
      <ReactFlow<BoardNode>
        deleteKeyCode={null}
        edges={edges}
        edgesFocusable={false}
        maxZoom={MAX_ZOOM}
        minZoom={MIN_ZOOM}
        nodeDragThreshold={4}
        nodeTypes={NODE_TYPES}
        nodes={nodes}
        nodesConnectable={false}
        onInit={onInit}
        onMoveEnd={(_event, next) => {
          if (total > 0) updateViewport(next);
        }}
        onNodeDoubleClick={(event, node) => {
          // Owner 2026-09-03: "allow double click on individual canvas chat to fit to screen".
          // A double-click that selected a word, or landed in a text box, is the learner's, not ours.
          if (isEditableTarget(event.target) || window.getSelection()?.isCollapsed === false) return;
          void fitView({ nodes: [{ id: node.id }], duration: 320, padding: 0.1, maxZoom: 1 });
        }}
        onNodeDragStart={(_event, node) => setPickedUp(node.id)}
        onNodeDragStop={() => setPickedUp(null)}
        onNodesChange={onNodesChange}
        onPaneClick={clearSelection}
        panOnDrag
        panOnScroll
        panOnScrollSpeed={1}
        proOptions={PRO_OPTIONS}
        selectNodesOnDrag={false}
        zoomOnDoubleClick={false}
        zoomOnPinch
        zoomOnScroll={false}
      >
        <RestoreViewport key="restore" viewport={hasSavedViewport ? viewport : null} />
        <CenterTarget companionId={companion} instant={onlyOne} maxZoom={onlyOne && cards.length === 1 ? INITIAL_CARD_ZOOM : undefined} nodeId={target} />
        <Background color="var(--board-dot)" gap={28} size={2} variant={BackgroundVariant.Dots} />
      </ReactFlow>
      <ViewportControls />
      <UndoRedoControls />
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-(--ui-bg-editor)/60 backdrop-blur-[1px]">
          <div className="rounded-[12px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[16px] py-[10px] text-[14px] font-medium text-foreground shadow-md">Drop to add as a source</div>
        </div>
      )}
    </div>
  );
}

export function BoardSurface() {
  return (
    <ReactFlowProvider>
      <BoardInner />
    </ReactFlowProvider>
  );
}
