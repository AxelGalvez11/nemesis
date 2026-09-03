"use client";

// The mind map you can open: boxes on a plane, and only the rungs the learner has unfolded.
//
// 🔴🔴 THE OWNER'S WORDS (2026-09-03): *"if I want a mind map, I should be able to get one that's
// interactive, one that I can click on and then reveals more nodes"*. Every box here is a button. A
// box with children folds and unfolds; a leaf is picked. The tree and the geometry live in
// `lib/learn/mindmap-tree.ts`; this file only draws what that file laid out, which is why it can
// be checked by reading it.
//
// 🔴🔴 NO ACCENT ON THE MAP. The brief for this component asked for the product accent on the root's
// stroke and on the "Open the map" button. The same day, the owner ruled the accent lives in three
// places only (2026-09-03, written into desktop-ui.css: *"remove any color accents throughout the
// app, there should only be accents on the mascot and the send button and chat bubble color"*). So
// the root is told apart by WEIGHT, a heavier stroke and a heavier label, the way the course map
// says "here" with fill and weight, and the text buttons are secondary ink that darkens under the
// pointer. `--ui-action` appears here only on focus rings, which is the home desktop-ui.css names
// for it.
//
// 🔴 TWO SHAPES, ONE COMPONENT. `inline` sits in the chat column under the answer and is capped, so a
// forty-node map cannot push the conversation off the screen; `panel` fills the side panel and is
// not. Neither changes what a box does when it is clicked.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import {
  fullyExpanded,
  initiallyExpanded,
  labelPaths,
  layoutMindmap,
  mindmapStats,
  MINDMAP_METRICS,
  toggleNode,
  topExpanded,
  type LaidNode,
  type MindmapNode,
} from "@/lib/learn/mindmap-tree";

/** The most of the chat column an inline map may take before it scrolls inside itself. */
const INLINE_MAX_HEIGHT = 360;

/**
 * The map's own rules, hoisted once per page.
 *
 * 🔴 `href` + `precedence` IS REACT 19'S WAY OF SAYING "ONE COPY". Every map on a page renders this
 * element and the document gets one style tag, deduplicated by href, so twenty maps down a long
 * chat do not carry twenty stylesheets.
 *
 * 🔴 THE FADE STOPS UNDER `prefers-reduced-motion`. It is 160ms of opacity on newly revealed boxes
 * and nothing travels, but it still goes when the reader has asked for stillness.
 */
const STYLE_HREF = "nemesis-mindmap-view";
const STYLE = `
.mindmap-node { cursor: pointer; outline: none; }
.mindmap-node > rect { transition: fill 120ms ease; }
.mindmap-node:hover > rect { fill: var(--ui-bg-tertiary); }
.mindmap-node:focus-visible > rect { stroke: var(--ui-action); stroke-width: 2px; }
.mindmap-enter { animation: mindmap-fade 160ms ease-out; }
@keyframes mindmap-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .mindmap-enter { animation: none; }
  .mindmap-node > rect { transition: none; }
}
`;

/** A picked leaf: which box, its words, and every label from the root down to it. */
export interface MindmapSelection {
  id: string;
  label: string;
  path: string[];
}

export function MindmapView({
  expanded: controlled,
  onExpandedChange,
  onOpen,
  onSelect,
  onToggle,
  root,
  selectedId = null,
  title,
  variant,
}: {
  root: MindmapNode;
  variant: "inline" | "panel";
  /** With `onToggle`, the caller owns which boxes are open. Without both, the map owns it. */
  expanded?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  /**
   * The panel's "Expand all" and "Collapse to the top" replace the whole set at once. A controlled
   * caller passes this to receive that set; without it the buttons fall back to one `onToggle` per
   * box that changes, which a functional state update absorbs and a stale closure would not.
   */
  onExpandedChange?: (next: Set<string>) => void;
  /** Offered in the chat column as "Open the map": the door to the panel. Absent, no door is drawn. */
  onOpen?: () => void;
  /** A leaf was clicked. Boxes with children fold and unfold instead and never reach this. */
  onSelect?: (node: MindmapSelection) => void;
  selectedId?: string | null;
  title?: string;
}) {
  // 🔴 UNTOUCHED MEANS "THE DEFAULT FOR WHATEVER THE TREE IS NOW". A map in the chat column is
  // parsed again on every streamed chunk, and a branch that arrives after the first paint must open
  // like the ones before it. So until the learner clicks, the set is derived from the tree rather
  // than remembered from an earlier tree; after the first click it is theirs and the tree's growth
  // no longer touches it.
  const [touched, setTouched] = useState<ReadonlySet<string> | null>(null);
  const controlledSet = controlled !== undefined && onToggle !== undefined ? controlled : null;
  const expanded = useMemo(() => controlledSet ?? touched ?? initiallyExpanded(root), [controlledSet, root, touched]);

  const layout = useMemo(() => layoutMindmap(root, expanded), [expanded, root]);
  const paths = useMemo(() => labelPaths(root), [root]);
  const stats = useMemo(() => mindmapStats(root), [root]);
  const everything = useMemo(() => fullyExpanded(root), [root]);
  const allOpen = [...everything].every((id) => expanded.has(id));
  const atTop = [...everything].every((id) => id === root.id || !expanded.has(id));

  // Which boxes were on the plane last time, so only the newly revealed ones fade in. Seeded from
  // the first layout so nothing fades on mount: a map arriving with an answer should simply be there.
  const shown = useRef<ReadonlySet<string> | null>(null);
  if (shown.current === null) shown.current = new Set(layout.nodes.map((node) => node.id));
  const before = shown.current;
  useEffect(() => {
    shown.current = new Set(layout.nodes.map((node) => node.id));
  }, [layout]);

  const toggle = useCallback(
    (id: string) => {
      if (controlledSet !== null) onToggle?.(id);
      else setTouched((was) => toggleNode(was ?? initiallyExpanded(root), id));
    },
    [controlledSet, onToggle, root],
  );

  const replace = useCallback(
    (next: Set<string>) => {
      if (onExpandedChange) onExpandedChange(next);
      else if (controlledSet !== null) {
        for (const id of new Set([...controlledSet, ...next])) {
          if (controlledSet.has(id) !== next.has(id)) onToggle?.(id);
        }
      } else setTouched(next);
    },
    [controlledSet, onExpandedChange, onToggle],
  );

  const activate = useCallback(
    (node: LaidNode) => {
      if (node.childCount > 0) toggle(node.id);
      else onSelect?.({ id: node.id, label: node.label, path: paths.get(node.id) ?? [node.label] });
    },
    [onSelect, paths, toggle],
  );

  return (
    <div className="mindmap-view w-full" data-mindmap-variant={variant}>
      <style href={STYLE_HREF} precedence="default">{STYLE}</style>

      {variant === "panel" && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary)">{title ?? root.label}</p>
          <div className="flex shrink-0 items-center gap-3">
            <TextButton disabled={allOpen} onClick={() => replace(everything)}>
              Expand all
            </TextButton>
            <TextButton disabled={atTop} onClick={() => replace(topExpanded(root))}>
              Collapse to the top
            </TextButton>
          </div>
        </div>
      )}

      <div className="w-full overflow-auto" style={{ maxHeight: variant === "inline" ? INLINE_MAX_HEIGHT : undefined }}>
        <svg
          aria-label={title ?? root.label}
          className="block"
          height={layout.height}
          role="group"
          style={{ fontFamily: "inherit" }}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
        >
          {layout.edges.map((edge) => (
            <path d={edge.d} fill="none" key={`${edge.from}>${edge.to}`} stroke="var(--ui-stroke-primary)" strokeWidth={1.5} />
          ))}
          {layout.nodes.map((node) => {
            const isRoot = node.depth === 0;
            const hasChildren = node.childCount > 0;
            const selected = selectedId === node.id;
            return (
              <g
                aria-current={selected ? "true" : undefined}
                aria-expanded={hasChildren ? node.expanded : undefined}
                aria-label={hasChildren ? `${node.label}, ${node.childCount} ${node.childCount === 1 ? "branch" : "branches"}` : node.label}
                className={cn("mindmap-node", !before.has(node.id) && "mindmap-enter")}
                key={node.id}
                onClick={() => activate(node)}
                onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  activate(node);
                }}
                role="button"
                tabIndex={0}
                transform={`translate(${node.x} ${node.y})`}
              >
                {/* 🔴 THE ROOT AND THE PICKED BOX ARE HEAVIER, NOT ANOTHER COLOUR. See the note at the head. */}
                <rect
                  fill={selected ? "var(--ui-bg-tertiary)" : "var(--ui-bg-card)"}
                  height={node.h}
                  rx={10}
                  ry={10}
                  stroke={isRoot || selected ? "var(--ui-text-primary)" : "var(--ui-stroke-secondary)"}
                  strokeWidth={isRoot ? 1.5 : 1}
                  width={node.w}
                />
                <text
                  dominantBaseline="central"
                  fill="var(--ui-text-primary)"
                  fontSize={isRoot ? 14 : 13}
                  fontWeight={isRoot ? 600 : 400}
                  x={MINDMAP_METRICS.padX}
                  y={node.h / 2}
                >
                  {node.label}
                </text>
                {/* 🔴 "+N" IS THE DIRECT CHILDREN, NOT EVERY DESCENDANT: it says what ONE click will
                    reveal, which is the question a learner deciding whether to click is asking. It
                    hangs just outside the box, where the hidden branch would begin, so opening the
                    box does not change the box's width. */}
                {hasChildren && !node.expanded && (
                  <text aria-hidden dominantBaseline="central" fill="var(--ui-text-tertiary)" fontSize={11} x={node.w + 6} y={node.h / 2}>
                    +{node.childCount}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {variant === "inline" && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{caption(stats)}</p>
          {onOpen && <TextButton onClick={onOpen}>Open the map</TextButton>}
        </div>
      )}
    </div>
  );
}

/** "12 ideas, 3 levels deep": the size of the whole map, not of the part showing. */
function caption({ depth, nodes }: { nodes: number; depth: number }): string {
  return `${nodes} ${nodes === 1 ? "idea" : "ideas"}, ${depth} ${depth === 1 ? "level" : "levels"} deep`;
}

/** A small text control: secondary ink that turns primary under the pointer. No fill, no accent. */
function TextButton({ children, disabled, onClick }: { children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className={cn(
        "shrink-0 rounded-sm text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) underline-offset-2 hover:text-(--ui-text-primary) hover:underline",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--ui-action)",
        "disabled:opacity-40 disabled:hover:no-underline",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
