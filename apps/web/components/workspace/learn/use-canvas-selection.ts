"use client";

// Reading a text selection out of the canvas, precisely.
//
// 🔴 THE OFFSETS ARE MEASURED AGAINST THE ELEMENT THAT RENDERS THE TEXT AND NOTHING ELSE.
// A block's `<section>` also contains its note, its hover concept labels, the source panel and
// any aside — so measuring from the section start silently counts all of that, and every offset
// comes out plausible and wrong. The marker therefore goes on the `<p>`/`<h2>` that holds
// `block.content` alone, and `readCanvasSelection` refuses to build a selection whose measured
// text does not match what the element actually contains.
//
// Native selection is preserved throughout: the learner drags across text the way they would on
// any web page. Nothing here interferes with that — it only observes.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildAnchor,
  surroundingSentence,
  type CanvasSelection,
} from "@/lib/learn/canvas-selection";

/** Marks an element as a selectable region. Returned as props so each caller keeps its own tag
 *  and classes — a wrapper element would change the layout of everything it touched.
 *
 *  🔴 `data-selectable-text` IS LOAD-BEARING, not a duplicate of the id. The workspace sets
 *  `user-select: none` on everything under `[data-workspace]` for a desktop-app feel, and
 *  `desktop-chrome.css` opts text back in only for elements carrying this attribute. Without it
 *  the browser refuses to make a selection at all: a range can still be constructed in code and
 *  reads back correctly, but `window.getSelection().toString()` is empty and no drag does
 *  anything. The entire selection layer is inert and every one of its own checks still passes. */
export function selectableRegion(
  id: string,
  options?: { blockId?: string; rewritable?: boolean; conceptIds?: readonly string[] },
): Record<string, string> {
  return {
    "data-selectable-text": "true",
    "data-selectable-id": id,
    ...(options?.blockId ? { "data-selectable-block": options.blockId } : {}),
    ...(options?.rewritable ? { "data-selectable-rewritable": "true" } : {}),
    ...(options?.conceptIds?.length ? { "data-selectable-concepts": options.conceptIds.join(",") } : {}),
  };
}

/** Character offset of a point inside `root`, counting only `root`'s own text. */
function offsetWithin(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

export interface PositionedSelection {
  selection: CanvasSelection;
  /** Viewport rectangle of the highlighted text, for placing the menu next to it. */
  rect: { top: number; bottom: number; left: number; right: number };
}

export function readCanvasSelection(): PositionedSelection | null {
  const native = window.getSelection();
  if (!native || native.isCollapsed || native.rangeCount === 0) return null;

  const range = native.getRangeAt(0);
  const anchorNode = range.startContainer;
  const host = (anchorNode instanceof Element ? anchorNode : anchorNode.parentElement)?.closest<HTMLElement>(
    "[data-selectable-id]",
  );
  if (!host) return null;
  // A selection running out of one region and into another has no single owner; treating it as
  // belonging to the first would attach the question to text the learner did not point at.
  if (!host.contains(range.endContainer)) return null;

  const text = host.textContent ?? "";
  const startOffset = offsetWithin(host, range.startContainer, range.startOffset);
  const endOffset = offsetWithin(host, range.endContainer, range.endOffset);
  const selectedText = text.slice(startOffset, endOffset);

  // 🔴 The integrity check. If the offsets do not reproduce what the browser says is selected,
  // something inside this region renders text the marker did not account for — and every offset
  // is a lie. Refusing is recoverable; a confident wrong range is not.
  if (!selectedText || selectedText !== range.toString()) return null;

  const rect = range.getBoundingClientRect();
  const conceptIds = host.dataset.selectableConcepts?.split(",").filter(Boolean);

  return {
    selection: {
      regionId: host.dataset.selectableId ?? "",
      ...(host.dataset.selectableBlock ? { blockId: host.dataset.selectableBlock } : {}),
      selectedText,
      startOffset,
      endOffset,
      surroundingText: surroundingSentence(text, startOffset, endOffset),
      anchor: buildAnchor(text, startOffset, endOffset),
      ...(conceptIds?.length ? { conceptIds } : {}),
      rewritable: host.dataset.selectableRewritable === "true",
    },
    rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
  };
}

/** Watches the document for a settled selection.
 *
 *  Settled, not live: `selectionchange` fires continuously through a drag, and repositioning a
 *  floating menu on every one of those makes it skitter across the screen while the learner is
 *  still choosing what to select. */
export function useCanvasSelection(enabled: boolean) {
  const [current, setCurrent] = useState<PositionedSelection | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    setCurrent(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onChange = () => {
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        const next = readCanvasSelection();
        // 🔴🔴 TYPING INTO THE ASK BOX IS NOT DROPPING THE HIGHLIGHT. Clicking into the menu's
        // input moves focus, and the browser collapses the document selection when it does — so
        // `readCanvasSelection` returns null, this cleared the state, and the menu unmounted from
        // under the cursor the instant the learner tried to type in it. The five fixed buttons
        // never hit this: a `<button>` takes no text caret, so nothing collapsed.
        //
        // The guard is about WHERE FOCUS WENT, not about what was selected — the selection genuinely
        // is gone, and pretending otherwise anywhere else would leave a stale range behind. Inside
        // the menu the learner is still working on that exact range, and the range we already read
        // is the honest record of it.
        if (!next && document.activeElement?.closest("[data-canvas-selection-menu]")) return;
        setCurrent(next);
      }, 180);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (settle.current) clearTimeout(settle.current);
    };
  }, [enabled]);

  return { selection: current, clear, setSelection: setCurrent };
}
