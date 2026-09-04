"use client";

// Finding a sentence inside a rendered card, and painting it.
//
// A highlight is stored as TEXT plus an occurrence index, never as DOM offsets: the markdown
// re-renders on every stream tick and on every reload, so anything anchored to nodes would rot.
// `findTextRanges` walks the card's text nodes ignoring whitespace and hands back live Ranges;
// the CSS Custom Highlight API paints them without touching the DOM (docs §5).

import { useEffect, useRef, useState, type RefObject } from "react";

export const INLINE_TEXT_HIGHLIGHT = "board-text-highlight";
export const INLINE_NOTE_HIGHLIGHT = "board-note-highlight";
export const INLINE_BRANCH_HIGHLIGHT = "board-branch-highlight";
export const INLINE_ACTIVE_SELECTION_HIGHLIGHT = "board-active-selection-highlight";

export interface HighlightTarget {
  id: string;
  text: string;
  occurrence?: number;
}

export function findTextRanges(root: Element, text: string): Range[] {
  const needle = text.replace(/\s+/g, "");
  if (!needle) return [];
  const chars: string[] = [];
  const at: Array<{ node: Text; offset: number }> = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    for (let index = 0; index < node.data.length; index += 1) {
      const char = node.data[index] ?? "";
      if (!char || /\s/.test(char)) continue;
      chars.push(char);
      at.push({ node, offset: index });
    }
  }
  const haystack = chars.join("");
  const ranges: Range[] = [];
  let found = haystack.indexOf(needle);
  while (found !== -1) {
    const start = at[found];
    const end = at[found + needle.length - 1];
    if (!start || !end) break;
    const range = root.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    ranges.push(range);
    found = haystack.indexOf(needle, found + needle.length);
  }
  return ranges;
}

/** Which occurrence of `text` a live selection is, or null when the selection is not exactly it. */
export function findSelectedOccurrence(root: Element, text: string, selection: Range): number | null {
  const index = findTextRanges(root, text).findIndex(
    (range) => selection.comparePoint(range.startContainer, range.startOffset) === 0 && selection.comparePoint(range.endContainer, range.endOffset) === 0,
  );
  return index >= 0 ? index : null;
}

export function findRangeRectAtPoint(range: Range, x: number, y: number): DOMRect | null {
  return Array.from(range.getClientRects()).find((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) ?? null;
}

type HighlightRegistry = { add: (range: Range) => void; delete: (range: Range) => void };

export function supportsCssCustomHighlights(): boolean {
  if (typeof CSS === "undefined" || typeof (globalThis as { Highlight?: unknown }).Highlight !== "function") return false;
  const highlights = (CSS as unknown as { highlights?: { get?: unknown; set?: unknown } }).highlights;
  return typeof highlights?.get === "function" && typeof highlights?.set === "function";
}

const HIGHLIGHT_STYLE_ID = "board-highlight-styles";

/** The ::highlight() rules, injected once. Next's CSS parser (Lightning CSS) rejects the
 *  pseudo-element in a stylesheet, so they cannot live in board.css. Colours are the board tokens. */
function ensureHighlightStyles(): void {
  if (typeof document === "undefined" || document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = [
    `::highlight(${INLINE_TEXT_HIGHLIGHT}) { background-color: color-mix(in srgb, var(--board-text-highlight) 55%, transparent); }`,
    `::highlight(${INLINE_BRANCH_HIGHLIGHT}) { color: inherit; background-color: var(--board-branch-highlight); }`,
    `::highlight(${INLINE_NOTE_HIGHLIGHT}) { background-color: color-mix(in srgb, var(--ui-action) 35%, transparent); }`,
    `::highlight(${INLINE_ACTIVE_SELECTION_HIGHLIGHT}) { color: HighlightText; background-color: Highlight; }`,
  ].join("\n");
  document.head.appendChild(style);
}

function registry(name: string): HighlightRegistry | null {
  if (!supportsCssCustomHighlights()) return null;
  ensureHighlightStyles();
  const highlights = (CSS as unknown as { highlights: Map<string, HighlightRegistry> }).highlights;
  const existing = highlights.get(name);
  if (existing) return existing;
  const HighlightCtor = (globalThis as unknown as { Highlight: new () => HighlightRegistry }).Highlight;
  const created = new HighlightCtor();
  highlights.set(name, created);
  return created;
}

const serialize = (targets: readonly HighlightTarget[]) => JSON.stringify(targets.map((target) => [target.id, target.text, target.occurrence ?? null]));

/** Paint `targets` inside `root`, re-finding them whenever the card's text changes. Returns the
 *  live ranges by id so a click can be matched to a highlight. */
export function useInlineTextHighlights(root: RefObject<HTMLElement | null>, targets: readonly HighlightTarget[], name = INLINE_TEXT_HIGHLIGHT) {
  const ranges = useRef(new Map<string, Range>());
  const key = serialize(targets);
  useEffect(() => {
    const paint = registry(name);
    const node = root.current;
    const parsed = (JSON.parse(key) as Array<[string, string, number | null]>).map(([id, text, occurrence]) => ({ id, text, occurrence: occurrence ?? undefined }));
    if (!paint || !node || parsed.length === 0) {
      ranges.current = new Map();
      return;
    }
    let painted: Range[] = [];
    let frame = 0;
    const apply = () => {
      for (const range of painted) paint.delete(range);
      const next = new Map<string, Range>();
      for (const target of parsed) {
        const found = findTextRanges(node, target.text);
        const range = target.occurrence === undefined ? found[0] : found[target.occurrence];
        if (range) next.set(target.id, range);
      }
      ranges.current = next;
      painted = [...next.values()];
      for (const range of painted) paint.add(range);
    };
    apply();
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    });
    observer.observe(node, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const range of painted) paint.delete(range);
      ranges.current = new Map();
    };
  }, [root, name, key]);
  return ranges;
}

/** Keep the browser's own selection painted while the selection menu is open, so opening the menu
 *  (which takes focus) does not make the selected sentence vanish. */
export function useLiveSelectionHighlight(root: RefObject<HTMLElement | null>, hold: boolean, name = INLINE_ACTIVE_SELECTION_HIGHLIGHT) {
  const current = useRef<Range | null>(null);
  const paint = useRef<HighlightRegistry | null>(null);
  const holdRef = useRef(hold);
  holdRef.current = hold;
  useEffect(() => {
    const registryRef = registry(name);
    paint.current = registryRef;
    if (!registryRef) return;
    const clear = () => {
      if (current.current) {
        registryRef.delete(current.current);
        current.current = null;
      }
    };
    const sync = () => {
      const node = root.current;
      const selection = window.getSelection();
      const range = selection && !selection.isCollapsed && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const inside = Boolean(node && range && node.contains(range.commonAncestorContainer));
      if (range && inside) {
        if (current.current !== range) {
          clear();
          current.current = range;
          registryRef.add(range);
        }
        return;
      }
      if (!holdRef.current) clear();
    };
    sync();
    document.addEventListener("selectionchange", sync);
    return () => {
      document.removeEventListener("selectionchange", sync);
      clear();
      paint.current = null;
    };
  }, [root, name]);
  useEffect(() => {
    if (hold) return;
    const node = root.current;
    const selection = window.getSelection();
    const range = selection && !selection.isCollapsed && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (node && range && node.contains(range.commonAncestorContainer)) return;
    if (paint.current && current.current) paint.current.delete(current.current);
    current.current = null;
  }, [root, hold]);
}

export interface SelectionPosition {
  top: number;
  bottom: number;
  left: number;
  width: number;
  anchorHidden: boolean;
}

function measureSelection(range: Range, root: HTMLElement): SelectionPosition {
  const rects = Array.from(range.getClientRects());
  const first = rects[0] ?? range.getBoundingClientRect();
  const last = rects[rects.length - 1] ?? first;
  const bounds = root.getBoundingClientRect();
  const hidden = last.bottom < bounds.top || first.top > bounds.bottom;
  return { top: first.top, bottom: last.bottom, left: first.left + first.width / 2, width: first.width, anchorHidden: hidden };
}

/** The learner's live selection inside one card: its text and where it sits on screen. */
export function useTextSelection(root: RefObject<HTMLElement | null>): {
  selectedText: string;
  position: SelectionPosition | null;
  clearBrowserSelection: () => void;
} {
  const rangeRef = useRef<Range | null>(null);
  const [state, setState] = useState<{ selectedText: string; position: SelectionPosition | null }>({ selectedText: "", position: null });
  const clear = () => {
    rangeRef.current = null;
    setState({ selectedText: "", position: null });
  };
  useEffect(() => {
    const read = () => {
      const selection = window.getSelection();
      const node = root.current;
      if (!selection || !node) return clear();
      const text = selection.toString().trim();
      if (!text) return clear();
      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range || !node.contains(range.commonAncestorContainer)) return clear();
      rangeRef.current = range;
      setState({ selectedText: text, position: measureSelection(range, node) });
    };
    let pointerDown = false;
    const onPointerDown = () => {
      pointerDown = true;
    };
    const onPointerUp = () => {
      pointerDown = false;
      window.setTimeout(read, 0);
    };
    const onSelectionChange = () => {
      if (pointerDown) return;
      read();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clear` and `setState` are stable
  }, [root]);
  // Follow the card while it scrolls or the board pans.
  useEffect(() => {
    if (!state.selectedText) return;
    let frame = 0;
    const follow = () => {
      const range = rangeRef.current;
      const node = root.current;
      if (!range || !node || !node.contains(range.commonAncestorContainer)) return clear();
      const next = measureSelection(range, node);
      setState((was) =>
        was.position &&
        was.position.top === next.top &&
        was.position.bottom === next.bottom &&
        was.position.left === next.left &&
        was.position.anchorHidden === next.anchorHidden
          ? was
          : { ...was, position: next },
      );
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clear` and `setState` are stable
  }, [root, state.selectedText]);
  return {
    selectedText: state.selectedText,
    position: state.position,
    clearBrowserSelection: () => {
      clear();
      window.getSelection()?.removeAllRanges();
    },
  };
}
