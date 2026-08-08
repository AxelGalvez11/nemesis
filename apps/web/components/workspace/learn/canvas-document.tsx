"use client";

// The document itself — the thing the brief calls "a document that is alive".
//
// Every block is addressable and selectable. Selecting text does not open an editor: it tells
// the command bar what the next instruction is about. That is the whole editing philosophy
// (§16) — the learner directs Nemesis, they do not typeset.

import { useCallback, useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { conceptLabel, type CanvasBlock, type LearningCanvas } from "@/lib/learn/canvas-model";
import { quotedExcerpt } from "@/lib/learn/canvas-grounding";
import { cn } from "@/lib/utils";

interface CanvasDocumentProps {
  canvas: LearningCanvas;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  busyBlockIds: string[];
  aside: { text: string; blockId: string | null } | null;
  onDismissAside: () => void;
  onMarkKnown: (blockId: string, known: boolean) => void;
  onToggleCollapsed: (blockId: string, collapsed: boolean) => void;
  onAskSource: (block: CanvasBlock) => void;
}

export function CanvasDocument({
  canvas,
  selectedIds,
  onSelect,
  busyBlockIds,
  aside,
  onDismissAside,
  onMarkKnown,
  onToggleCollapsed,
  onAskSource,
}: CanvasDocumentProps) {
  const root = useRef<HTMLDivElement>(null);
  const [openSource, setOpenSource] = useState<string | null>(null);

  // A browser selection spanning several blocks selects all of them. Read on selectionchange
  // rather than on click, so dragging across two paragraphs behaves the way it looks.
  //
  // 🔴 `Selection.containsNode(el, true)` is the wrong test here and silently selects nothing.
  // It asks whether the ELEMENT sits inside the selection, so highlighting a sentence within a
  // paragraph never matches that paragraph's own block element — only a selection that swallowed
  // the whole block would. `Range.intersectsNode` asks whether the two overlap at all, in either
  // direction, which is the actual question. Caught in the browser; every selection-scoped
  // command was a no-op before this.
  const readSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !root.current) return;
    const anchor = selection.anchorNode;
    if (!anchor || !root.current.contains(anchor)) return;

    const ranges: Range[] = [];
    for (let i = 0; i < selection.rangeCount; i += 1) ranges.push(selection.getRangeAt(i));

    const ids: string[] = [];
    // Document order, because the ids become the model's edit scope and a jumbled order would
    // make an insert land in a place the learner did not point at.
    for (const element of root.current.querySelectorAll<HTMLElement>("[data-block-id]")) {
      const id = element.dataset.blockId;
      if (id && ranges.some((range) => range.intersectsNode(element))) ids.push(id);
    }
    if (ids.length > 0) onSelect(ids);
  }, [onSelect]);

  useEffect(() => {
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, [readSelection]);

  const visible = canvas.blocks.filter((block) => !block.known);

  return (
    <div className="mx-auto w-full max-w-[46rem] px-6 pb-40 pt-10" ref={root}>
      {visible.map((block) => (
        <BlockView
          aside={aside?.blockId === block.id ? aside.text : null}
          block={block}
          busy={busyBlockIds.includes(block.id)}
          canvas={canvas}
          key={block.id}
          onAskSource={() => onAskSource(block)}
          onDismissAside={onDismissAside}
          onMarkKnown={() => onMarkKnown(block.id, true)}
          onToggleCollapsed={() => onToggleCollapsed(block.id, !block.collapsed)}
          onToggleSource={() => setOpenSource((current) => (current === block.id ? null : block.id))}
          selected={selectedIds.includes(block.id)}
          sourceOpen={openSource === block.id}
        />
      ))}

      {canvas.blocks.some((block) => block.known) && (
        <button
          className="mt-8 text-[0.75rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
          onClick={() => canvas.blocks.filter((b) => b.known).forEach((b) => onMarkKnown(b.id, false))}
          type="button"
        >
          {canvas.blocks.filter((block) => block.known).length} section
          {canvas.blocks.filter((block) => block.known).length === 1 ? "" : "s"} hidden as already known — show again
        </button>
      )}
    </div>
  );
}

interface BlockViewProps {
  block: CanvasBlock;
  canvas: LearningCanvas;
  selected: boolean;
  busy: boolean;
  aside: string | null;
  sourceOpen: boolean;
  onDismissAside: () => void;
  onMarkKnown: () => void;
  onToggleCollapsed: () => void;
  onToggleSource: () => void;
  onAskSource: () => void;
}

function BlockView({
  block,
  canvas,
  selected,
  busy,
  aside,
  sourceOpen,
  onDismissAside,
  onMarkKnown,
  onToggleCollapsed,
  onToggleSource,
  onAskSource,
}: BlockViewProps) {
  const concepts = (block.conceptIds ?? []).map((id) => conceptLabel(canvas, id)).filter(Boolean);

  return (
    <section
      className={cn(
        "group relative -mx-4 rounded-lg px-4 py-1.5 transition-colors",
        // Selection is a quiet tint, not a highlighter — the page has to stay readable while
        // the learner is deciding what to ask about.
        selected && "bg-(--ui-bg-tertiary)",
        busy && "animate-pulse",
      )}
      data-block-id={block.id}
      data-selected={selected ? "true" : undefined}
    >
      {block.collapsed ? (
        <button
          className="flex w-full items-center gap-2 py-1 text-left text-[0.8125rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
          onClick={onToggleCollapsed}
          type="button"
        >
          <Codicon name="chevron-right" size="0.75rem" />
          {block.content.slice(0, 90)}…
        </button>
      ) : (
        <BlockBody block={block} />
      )}

      {block.note && !block.collapsed && (
        <p className="mt-2 border-l-2 border-(--ui-accent)/40 py-0.5 pl-3 text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">
          {block.note}
        </p>
      )}

      {/* Concept labels are NOT printed under every block. They were, and consecutive blocks
          on the same idea repeated the same line — clutter on a page whose whole argument is
          that the content is the interface. Concepts are what the diagnosis speaks in; they
          surface there, and on hover here. */}

      {/* Controls stay hidden until the block is hovered or selected. The content is the
          interface; the affordances are not. */}
      {!block.collapsed && (
        <div className="pointer-events-none absolute -top-1 right-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          {concepts.length > 0 && (
            <span className="mr-1 max-w-[16rem] truncate text-[0.6875rem] text-(--ui-text-quaternary)">
              {concepts.join(" · ")}
            </span>
          )}
          {(block.sourceRefs?.length ?? 0) > 0 && (
            <BlockControl icon="link" label="Where this came from" onClick={onToggleSource} />
          )}
          {(block.sourceRefs?.length ?? 0) === 0 && canvas.sources.length > 0 && (
            <BlockControl icon="question" label="Where did this come from?" onClick={onAskSource} />
          )}
          <BlockControl icon="check" label="I already know this" onClick={onMarkKnown} />
          <BlockControl icon="fold" label="Hide this detail" onClick={onToggleCollapsed} />
        </div>
      )}

      {sourceOpen && <SourcePanel block={block} canvas={canvas} />}

      {aside && (
        <div className="mt-3 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-3 text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">
          {aside}
          <button
            className="mt-2 block text-[0.6875rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
            onClick={onDismissAside}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}

function BlockControl({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-1 text-(--ui-text-tertiary) shadow-sm hover:text-(--ui-text-primary)"
      onClick={onClick}
      title={label}
      type="button"
    >
      <Codicon name={icon} size="0.6875rem" />
    </button>
  );
}

/** Deliberately plain typography. Headings are the only scale change; emphasis is weight, not
 *  colour. A study document that looks like a dashboard is harder to read, not easier. */
function BlockBody({ block }: { block: CanvasBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <h2 className="mt-10 text-[1.375rem] font-semibold leading-snug tracking-[-0.01em] text-(--ui-text-primary) first:mt-0">
          {block.content}
        </h2>
      );
    case "concept":
      return (
        <div className="my-3 border-l-2 border-(--ui-accent) py-1 pl-4">
          <p className="text-[1.0625rem] font-medium leading-relaxed text-(--ui-text-primary)">{block.content}</p>
        </div>
      );
    case "callout":
      return (
        <div className="my-3 rounded-lg bg-(--ui-bg-tertiary) px-4 py-3">
          <p className="text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">{block.content}</p>
        </div>
      );
    case "example":
      return (
        <p className="my-2.5 pl-4 text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">{block.content}</p>
      );
    case "citation":
      return (
        <p className="my-2 text-[0.8125rem] leading-relaxed text-(--ui-text-tertiary)">{block.content}</p>
      );
    default:
      return (
        <p className="my-2.5 text-[1rem] leading-[1.7] text-(--ui-text-primary)">{block.content}</p>
      );
  }
}

/** "Where did this come from?" — answered from the excerpt ids the block was generated with,
 *  never by asking the model, which would let it invent a source. */
function SourcePanel({ block, canvas }: { block: CanvasBlock; canvas: LearningCanvas }) {
  const found = (block.sourceRefs ?? [])
    .map((ref) => quotedExcerpt(canvas.sources, ref))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return (
    <div className="mt-3 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-3">
      {found.length === 0 ? (
        <p className="text-[0.8125rem] text-(--ui-text-tertiary)">
          This part wasn&rsquo;t taken from your material — Nemesis wrote it from general knowledge.
        </p>
      ) : (
        found.map(({ excerpt, source }) => (
          <div className="mb-3 last:mb-0" key={excerpt.id}>
            <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-(--ui-text-quaternary)">
              {source.title}
              {excerpt.label ? ` · ${excerpt.label}` : ""}
            </p>
            <p className="mt-1 border-l-2 border-(--ui-stroke-primary) pl-3 text-[0.8125rem] leading-relaxed text-(--ui-text-secondary)">
              {excerpt.text.length > 600 ? `${excerpt.text.slice(0, 600)}…` : excerpt.text}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
