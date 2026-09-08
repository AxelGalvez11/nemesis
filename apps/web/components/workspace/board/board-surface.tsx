"use client";

// The board itself: React Flow with our node kinds, edges between a card and what it branched
// from, the zoom controls, undo/redo, and the camera rules (docs/wondering-canvas-reference.md §3);
// and, since 2026-09-06, the sources-and-create column down the right edge (board-studio.tsx),
// inside this provider because pressing a made thing there moves the camera to it.

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
import { Group as GroupIcon, Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from "react";

import { CARD_WIDTH, EMPTY_CARD_HEIGHT, INITIAL_CARD_ZOOM, MAX_ZOOM, MIN_ZOOM, NOTE_WIDTH, SOURCE_DEFAULT_HEIGHT, centeredViewportForNode, connectionSides } from "@/lib/board/board-layout";
import { GROUP_HEADER, nodesInsideGroup } from "@/lib/board/board-groups";
import type { BoardViewport } from "@/lib/board/board-model";
import { cn } from "@/lib/utils";

import { CARD_DRAG_HANDLE, IconTooltip, isEditableTarget, measureBoardArea, sourceHandleId, targetHandleId } from "./board-chrome";
import { useBoard } from "./board-provider";
import { BoardStudio } from "./board-studio";
import { BoardThread } from "./board-thread";
import { ConversationCard, type ConversationNodeData } from "./conversation-card";
import { GROUP_DRAG_HANDLE, GroupCard, type GroupNodeData } from "./group-card";
import { NoteCard, OutputCard, SourceCard, type NoteNodeData, type OutputNodeData, type SourceNodeData } from "./other-cards";
import "./board.css";

type BoardNode =
  | Node<GroupNodeData, "groupBox">
  | Node<ConversationNodeData, "conversation">
  | Node<NoteNodeData, "note">
  | Node<SourceNodeData, "source">
  | Node<OutputNodeData, "deliverable">;

/**
 * What each kind of node is drawn by.
 *
 * 🔴🔴 NEVER NAME A TYPE `input`, `output`, `default` OR `group`. Those four are React Flow's OWN
 * built-in node types, and its stylesheet styles them by class name: `.react-flow__node-output`
 * carries `padding: 10px`, `width: 150px`, `font-size: 12px`, `text-align: center` and a solid
 * border. A custom component registered under one of those keys is drawn INSIDE that box, so the
 * card wears a second outline nothing in this repo draws and its title is mysteriously centred.
 *
 * That is exactly what shipped: deliverables were registered as `output`, and the owner reported it
 * as *"tests and notes retain a box outline around them"* (2026-09-04) — tests and notes being the
 * two deliverables he had on the board. Measured in the browser, not guessed: the extra rectangle
 * is inset 10px, has a 3px radius where ours has 16, and `getComputedStyle` on the title said
 * `text-align: center` with nothing in our own CSS asking for it. `board-panel.test.ts` guards
 * the names now.
 */
const NODE_TYPES = { conversation: ConversationCard, note: NoteCard, source: SourceCard, deliverable: OutputCard, groupBox: GroupCard };

/**
 * 🔴🔴 A GROUP FRAME SITS BEHIND EVERY CARD, EVEN WHILE IT IS SELECTED, AND THAT IS WHY THIS NUMBER
 * IS NOT -1. React Flow adds 1000 to a selected node's z (`elevateNodesOnSelect`, on by default and
 * relied on by every other card here). A frame at -1 would therefore jump to 999 the moment it was
 * clicked and paint its wash over the cards standing in it. -1001 selects to -1, which is still
 * behind everything and above the dot lattice.
 */
const GROUP_Z = -1001;
const PRO_OPTIONS = { hideAttribution: true };
const EDGE_STROKE = "var(--board-edge)";
const CONTROL_CLASS =
  "react-flow__controls-button !border-(--ui-stroke-secondary) !bg-(--ui-bg-elevated) !text-(--ui-text-secondary) transition-colors hover:!bg-(--ui-control-hover-background) hover:!text-foreground disabled:!text-(--ui-text-tertiary)";

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

/**
 * "Group these" — the one control that makes a frame.
 *
 * 🔴 IT APPEARS OVER THE SELECTION, NOT IN A TOOLBAR. Grouping is about the things you have just
 * picked, so the control belongs where they are; a button parked on the edge of the screen would
 * have to explain what it acts on. Shift-drag boxes a selection, Cmd-click adds to one, and this
 * is what the board does with it.
 *
 * 🔴 IT FOLLOWS THE CAMERA. Subscribed to React Flow's transform, so panning or zooming with a
 * selection open moves the pill with the cards instead of leaving it stranded.
 */
function GroupSelectionPill({ ids, bounds, onGroup }: { ids: readonly string[]; bounds: { x: number; y: number; width: number }; onGroup: () => void }) {
  const { flowToScreenPosition } = useReactFlow();
  useStore((state) => state.transform);
  const board = document.querySelector("[data-board]")?.getBoundingClientRect();
  const point = flowToScreenPosition({ x: bounds.x + bounds.width / 2, y: bounds.y });
  if (!board) return null;
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: point.x - board.left, top: point.y - board.top - 44 }}>
      <button
        className="pointer-events-auto flex h-[32px] -translate-x-1/2 items-center gap-[6px] rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[12px] text-[13px] font-medium text-foreground shadow-md transition-colors hover:bg-(--ui-control-hover-background)"
        data-board-group-action=""
        onClick={onGroup}
        type="button"
      >
        <GroupIcon aria-hidden className="size-[14px] text-(--ui-text-secondary)" />
        Group {ids.length}
      </button>
    </div>
  );
}

/**
 * The light that follows the pointer across the board (board.css, `.board-glow`).
 *
 * Owner, 2026-09-06: *"copy the glow that follows the mouse in canvas"*, then, of the first build,
 * *"the dot glow is delayed"* and *"the canvas feels slow and laggy"*.
 *
 * 🔴🔴 IT MOVES BY `transform`, IT DOES NOT EASE, AND BOTH OF THOSE WERE ONE MISTAKE. The first
 * version wrote the pointer into a full-bleed gradient's origin and eased 16% toward it each frame:
 * the easing is what made the light trail the cursor, and moving a gradient's origin REPAINTS the
 * whole element — a board-sized repaint at pointer speed, on the main thread, behind every card,
 * which is exactly what "laggy" feels like. A fixed 920px layer moved with `translate3d` is
 * composited rather than painted, and it is pinned to the pointer with no easing at all.
 *
 * 🔴 NO REACT STATE, AND NO LAYOUT READ PER MOVE. A pointer emits well over a hundred moves a
 * second: setting state would re-render every card on the board, and `getBoundingClientRect()` in
 * the handler would force a synchronous layout just as often. The box is measured on entry and on
 * resize; the position is written straight onto the element inside one rAF.
 */
function useCursorGlow(board: RefObject<HTMLDivElement | null>, glow: RefObject<HTMLDivElement | null>, inner: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const surface = board.current;
    const light = glow.current;
    if (!surface || !light) return;
    let box = surface.getBoundingClientRect();
    let at: { x: number; y: number } | null = null;
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (!at) return;
      const x = Math.round(at.x);
      const y = Math.round(at.y);
      light.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      // 🔴 THE EXACT OPPOSITE, OR THE BRIGHT DOTS TRAVEL WITH THE POINTER instead of the window
      // travelling over them, which reads as a smear rather than as the lattice lighting up.
      if (inner.current) inner.current.style.transform = `translate3d(${-x}px, ${-y}px, 0)`;
    };
    const onMove = (event: PointerEvent) => {
      at = { x: event.clientX - box.left, y: event.clientY - box.top };
      // 🔴 WRITE THE ATTRIBUTE ONCE, NOT ON EVERY MOVE. Setting `dataset` invalidates style for the
      // subtree; at pointer speed that is a recalculation a hundred times a second for a value that
      // has not changed.
      if (surface.dataset.glow !== "on") surface.dataset.glow = "on";
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onEnter = () => {
      box = surface.getBoundingClientRect();
    };
    const onLeave = () => {
      surface.dataset.glow = "off";
    };
    const observer = new ResizeObserver(() => {
      box = surface.getBoundingClientRect();
    });
    observer.observe(surface);
    surface.addEventListener("pointerenter", onEnter);
    surface.addEventListener("pointermove", onMove);
    surface.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      surface.removeEventListener("pointerenter", onEnter);
      surface.removeEventListener("pointermove", onMove);
      surface.removeEventListener("pointerleave", onLeave);
    };
  }, [board, glow]);
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
    groups,
    nodeRects,
    createGroup,
    moveGroup,
    resizeGroup,
    deleteGroup,
    fannedCardId,
  } = useBoard();
  const ready = useNodesInitialized();
  const { getInternalNode } = useReactFlow();
  const [nodes, setNodes] = useState<BoardNode[]>([]);
  const [pickedUp, setPickedUp] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  /** The bright lattice inside the halo, counter-translated so it stays pinned to the board. */
  const halo = useRef<HTMLDivElement>(null);
  const resizeAttributes = useRef(new Map<string, boolean | "width" | "height">());
  const known = useRef(new Map<string, { position: { x: number; y: number }; width?: number; height?: number }>());
  useCursorGlow(board, glow, halo);

  /**
   * What is hidden because the frame around it is folded (owner 2026-09-06: *"there should be a way
   * to collapse groups too"*).
   *
   * 🔴 ASKED OF THE GEOMETRY, NOT OF A MEMBER LIST (lib/board/board-groups.ts). A card dragged into
   * a folded frame disappears into it, and one dragged out reappears, with nothing to keep in step.
   * 🔴 `node.hidden`, NOT A FILTER ON THE ARRAY. React Flow hides an edge whose end is hidden by
   * itself; filtering the node out instead would leave a line running to nowhere.
   */
  const hidden = useMemo(() => {
    const set = new Set<string>();
    /**
     * 🔴🔴 A CHAT'S MADE THINGS ARE PUT AWAY UNTIL THAT CHAT IS FANNED. Owner, 2026-09-07: *"any
     * deliverables created by chats should not show on canvas and instead should be able to be
     * seen behind the chat"*. Hidden, not removed: the node keeps its id, its position and its
     * place in the saved document, so fanning is a change of what is drawn and nothing else.
     * A thing being MADE is always drawn, because a progress card nobody can see is a hang.
     */
    for (const output of outputs) {
      if (output.cardId && output.cardId !== fannedCardId && output.status !== "making") set.add(output.id);
    }
    const folded = groups.filter((group) => group.collapsed === true);
    if (folded.length === 0) return set;
    const rects = nodeRects();
    for (const group of folded) for (const id of nodesInsideGroup(group, rects)) set.add(id);
    return set;
  }, [fannedCardId, groups, nodeRects, outputs]);

  const total = cards.length + sources.length + cards.reduce((sum, card) => sum + card.notes.length, 0);
  /** Nothing at all, not even a thing being made: the landing is up (board-page.tsx) and the controls stay out of its way. */
  const empty = total === 0 && outputs.length === 0;
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
    /**
     * 🔴🔴 A DOCUMENT CARD IS ALWAYS A BOX, EVEN WHEN THE BOARD NEVER STORED ONE. Owner, 2026-09-04,
     * of a canvas made before sources were given a default height: *"it's sort of not contained
     * within the box. It's sort of clipping out."* He is describing a node with no height: React
     * Flow lets it grow to its content, and its content is a whole document, so a 55-slide deck
     * became a 1,581px card running off the canvas (measured). New sources have carried
     * `SOURCE_DEFAULT_HEIGHT` since they were introduced; every source saved before that has
     * nothing, and a board is a place people come back to.
     *
     * 🔴 COLLAPSED IS AUTO, exactly as it is for a thread: a collapsed card is its title bar, and
     * holding 560px of empty box under it would be the same bug in the other direction.
     */
    const sourceHeightOf = (source: (typeof sources)[number]) =>
      source.collapsed ? undefined : (source.height ?? SOURCE_DEFAULT_HEIGHT);
    const previous = known.current;
    const next = new Map(
      [
        ...groups.map((group) => ({ id: group.id, position: group.position, width: group.width, height: group.collapsed ? GROUP_HEADER : group.height })),
        ...cards.map((card) => ({ id: card.id, position: card.position, width: card.width, height: heightOf(card) })),
        ...cards.flatMap((card) => card.notes.map((note) => ({ id: note.id, position: note.position, width: NOTE_WIDTH, height: undefined }))),
        ...sources.map((source) => ({ id: source.id, position: source.position, width: source.width, height: sourceHeightOf(source) })),
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
        // Frames first, so they are behind everything even before z-index is consulted.
        ...groups.map((group) => {
          const height = group.collapsed ? GROUP_HEADER : group.height;
          const existing = byId.get(group.id) as Node<GroupNodeData, "groupBox"> | undefined;
          if (existing) return reuse(group.id, existing, group.position, group.width, height);
          changed = true;
          return {
            id: group.id,
            type: "groupBox",
            position: group.position,
            width: group.width,
            height,
            zIndex: GROUP_Z,
            // Only the label bar drags the frame; the rest of it belongs to the board (group-card.tsx).
            dragHandle: `.${GROUP_DRAG_HANDLE}`,
            data: { groupId: group.id },
          } as BoardNode;
        }),
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
        /**
         * 🔴🔴 SOURCES ARE NOT DRAWN ON THE BOARD. Owner, 2026-09-07: *"adding documents still loads
         * them on canvas, please remove that"*, and in the same breath *"so all chats should contain
         * all sources"* and *"thats why we have tickers"*. A document is a row in the Sources panel
         * with a tick beside it; the canvas holds conversations.
         *
         * 🔴 THE ROWS ARE UNTOUCHED. Every `BoardSource` still carries its `position`, `width` and
         * `height`, still round-trips through the saved document, and a board made before today
         * still holds them. Nothing was migrated: this is one map call away from coming back, which
         * is why `source-document.tsx`, `sourceHeightOf` and the layout's source constants all stay.
         */
        ...outputs.map((output) => {
          const existing = byId.get(output.id) as Node<OutputNodeData, "deliverable"> | undefined;
          if (existing) return reuse(output.id, existing, output.position, output.width, undefined, output.status !== "making");
          changed = true;
          /**
           * 🔴🔴 A MADE CARD MOVES BY ITS TITLE BAR, BECAUSE ITS BODY CANNOT MOVE IT. Owner,
           * 2026-09-07: *"I still can't move any notes in the canvas"*. A test wraps its whole body
           * in `nodrag nopan nowheel` so a tap answers a question rather than dragging the board,
           * and a made card's body is one full-width button that opens it — measured, EVERY point
           * on a check card is inside a `.nodrag`. Naming the title bar as the handle gives the card
           * somewhere to be grabbed without taking a press away from anything.
           */
          return { id: output.id, type: "deliverable", position: output.position, width: output.width, deletable: output.status !== "making", dragHandle: `.${CARD_DRAG_HANDLE}`, data: { outputId: output.id } } as BoardNode;
        }),
      ];
      return changed ? rebuilt : was;
    });
    known.current = next;
  }, [cards, groups, outputs, sources]);

  // A card inside a folded frame is hidden, and so are the lines that reach it.
  useEffect(() => {
    setNodes((was) => {
      let changed = false;
      const next = was.map((node) => {
        const shouldHide = hidden.has(node.id);
        if (Boolean(node.hidden) === shouldHide) return node;
        changed = true;
        return { ...node, hidden: shouldHide };
      });
      return changed ? next : was;
    });
  }, [hidden]);

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
      const picked = nodes.filter((node) => node.type !== "source" && node.selected);
      if (picked.length === 0) return;
      event.preventDefault();
      // 🔴 A FRAME IS DELETED ON ITS OWN AND KEEPS WHAT WAS INSIDE IT (board-provider's
      // `deleteGroup`). It was never a parent, so there is nothing to take with it.
      for (const node of picked) if (node.type === "groupBox") deleteGroup(node.id);
      const chosen = picked.filter((node) => node.type !== "groupBox").map((node) => node.id);
      if (chosen.length > 0) deleteNodes(chosen);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [deleteGroup, deleteNodes, nodes]);

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

  /**
   * What a frame is carrying, captured the moment it is picked up.
   *
   * 🔴🔴 CAPTURED AT DRAG START, NOT RECOMPUTED PER FRAME. Membership is geometric, so asking again
   * mid-drag would answer with the cards the frame happens to be over RIGHT NOW — a group dragged
   * across the board would collect everything it passed and leave its own cards behind. Obsidian
   * has the same rule for the same reason: what moves is what was inside when you took hold of it.
   */
  const carrying = useRef<{ id: string; start: { x: number; y: number }; members: Array<{ id: string; x: number; y: number }> } | null>(null);
  const groupIds = useMemo(() => new Set(groups.map((group) => group.id)), [groups]);

  const onNodesChange = useCallback<OnNodesChange<BoardNode>>(
    (changes: NodeChange<BoardNode>[]) => {
      // A frame's move becomes a move for everything it is carrying, in the same batch, so the
      // cards travel with it rather than snapping into place when it is dropped.
      const held = carrying.current;
      let all = changes;
      if (held) {
        const move = changes.find((change) => change.type === "position" && change.id === held.id && change.position);
        if (move && move.type === "position" && move.position) {
          const dx = move.position.x - held.start.x;
          const dy = move.position.y - held.start.y;
          all = [
            ...changes,
            ...held.members.map((member) => ({ id: member.id, type: "position" as const, position: { x: member.x + dx, y: member.y + dy }, dragging: move.dragging })),
          ];
        }
      }
      setNodes((was) => applyNodeChanges(all, was));
      for (const change of all) {
        if (change.type === "position" && change.position && change.dragging === false) {
          if (groupIds.has(change.id)) moveGroup(change.id, change.position);
          else updateCardPosition(change.id, change.position);
        }
        if (change.type !== "dimensions" || !change.dimensions) continue;
        // A frame resized by its handles: only once the handle is let go, and its corner may have
        // moved too (dragging the top-left edge changes both).
        if (groupIds.has(change.id)) {
          if (change.resizing === false) {
            resizeGroup(change.id, change.dimensions);
            const position = getInternalNode(change.id)?.position;
            if (position) moveGroup(change.id, position);
          }
          continue;
        }
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
    [cards, getInternalNode, groupIds, moveGroup, reportNodeSize, resizeGroup, sources, updateCardPosition, updateCardSize],
  );

  /**
   * 🔴🔴 A PRESS ON THE BOARD NO LONGER PUTS A FANNED CHAT'S THINGS AWAY. Owner, 2026-09-07, twice:
   * *"I still can't move any notes in the canvas"*. They are movable — a drag on a fanned note
   * moves it, measured — but they were closing again on the first press on empty board, which is
   * exactly what a learner does between deciding to move one and reaching for it. It read as the
   * note not being there at all.
   *
   * They still hide by default, which is his own answer to clutter (2026-09-07: *"They fan out on
   * the board around the chat"*). What changed is that opening them out is a state you stay in
   * until you press the stack again, rather than one that ends on the next click anywhere.
   */
  const clearSelection = useCallback(() => {
    setNodes((was) => was.map((node) => (node.selected ? { ...node, selected: false } : node)));
  }, []);

  /** Two or more cards chosen: the box around them, and the ids a frame would be drawn around. */
  const grouping = useMemo(() => {
    const chosen = nodes.filter((node) => node.selected && node.type !== "groupBox" && !node.hidden);
    if (chosen.length < 2) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    for (const node of chosen) {
      const measuredNode = ready ? getInternalNode(node.id) : undefined;
      const width = measuredNode?.measured?.width ?? node.width ?? 0;
      left = Math.min(left, node.position.x);
      top = Math.min(top, node.position.y);
      right = Math.max(right, node.position.x + width);
    }
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { ids: chosen.map((node) => node.id), bounds: { x: left, y: top, width: right - left } };
  }, [getInternalNode, nodes, ready]);

  /**
   * 🔴 THE SELECTION IS LET GO THE MOMENT THE FRAME EXISTS. Leaving the cards selected leaves the
   * "Group 2" pill standing over the frame it just made — measured in the harness, where it sat on
   * top of the new label and swallowed the click meant for it. Obsidian does the same thing: what
   * you had chosen stops being chosen, and the new group's name is what has your attention (the
   * label focuses itself in group-card.tsx).
   */
  const groupSelection = useCallback(() => {
    if (!grouping) return;
    if (!createGroup(grouping.ids)) return;
    setNodes((was) => was.map((node) => (node.selected ? { ...node, selected: false } : node)));
  }, [createGroup, grouping]);

  // ⌘G / Ctrl+G, the shortcut every canvas has for this.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target) || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "g" || !grouping) return;
      event.preventDefault();
      groupSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grouping, groupSelection]);

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
      data-glow="off"
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
      ref={board}
    >
      {/* 🔴 THE BRIGHT LATTICE, SEEN THROUGH A MOVING WINDOW. React Flow's own `<Background>` reads
          the viewport from context, so a second one draws the SAME pattern in the same place; only
          its colour and size differ. board.css explains why the window moves and the dots do not. */}
      <div aria-hidden className="board-halo" ref={glow}>
        <div className="board-halo-inner" ref={halo}>
          <Background color="var(--board-dot-lit)" gap={28} size={3} variant={BackgroundVariant.Dots} />
        </div>
      </div>
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
        onNodeDragStart={(_event, node) => {
          setPickedUp(node.id);
          const group = groups.find((item) => item.id === node.id);
          carrying.current = group
            ? {
                id: group.id,
                start: { ...node.position },
                members: nodesInsideGroup(group, nodeRects()).map((id) => {
                  const held = getInternalNode(id);
                  return { id, x: held?.position.x ?? 0, y: held?.position.y ?? 0 };
                }),
              }
            : null;
        }}
        onNodeDragStop={() => {
          setPickedUp(null);
          carrying.current = null;
        }}
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
      {grouping && <GroupSelectionPill bounds={grouping.bounds} ids={grouping.ids} onGroup={groupSelection} />}
      {!empty && <ViewportControls />}
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
      <BoardStudio />
      {/* 🔴 LAST, SO IT IS THE TOP LAYER, and inside the provider so the board keeps its camera while
          it is covered (board-thread.tsx). */}
      <BoardThread />
    </ReactFlowProvider>
  );
}
