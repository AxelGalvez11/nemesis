"use client";

// Keep the learner's place when the conversation's column changes width.
//
// 🔴🔴 THE DEFECT THIS FIXES READS AS A RELOAD, AND NOTHING RELOADS. Owner, 2026-09-03: *"every
// time I click on the chip, like source panel, or if I open the sidebar panel, the chat like
// reloads because it goes away for a second."*
//
// Measured on his own canvas in production, opening a citation chip:
//
//   before   scrollTop 1704 / scrollHeight 2539 / width 1418   (pinned to the very bottom)
//   after    scrollTop  453 / scrollHeight 3076 / width  580
//
// The scroller is the SAME ELEMENT throughout and never leaves the DOM — a MutationObserver over
// the whole body recorded zero removals. What happens is arithmetic: the reading pane takes 838px,
// the conversation reflows into 580 and grows from 2539 to 3076 tall, and `scrollTop` is a raw
// pixel offset that nobody updated. 1704 used to be the bottom of the page; in the new layout it is
// a screen and a half further back. The answer you were reading is replaced by one you read
// minutes ago, which is exactly what "it reloaded" looks like from the outside.
//
// 🔴 THE ANCHOR IS AN ELEMENT, NOT A RATIO. Scaling `scrollTop` by the height change is the obvious
// fix and it is wrong: a narrower column does not stretch uniformly. A wide table reflows to four
// times its height while a heading reflows to the same height, so a proportional restore lands
// somewhere plausible and never in the right place. Holding on to WHICH block was at the top of the
// viewport is exact, because that is the thing the learner was actually looking at.
//
// 🔴 AND BEING AT THE BOTTOM IS ITS OWN CASE. The newest answer is where a reader usually is, and
// "the last block, offset 0" is not the same instruction as "stay at the bottom" once the content
// below it grows. Pinning is checked first for that reason.

import { useEffect, type RefObject } from "react";

/** Within this many pixels of the end, the learner is reading the newest answer rather than a
 *  particular block, and the bottom is what should be preserved. */
const AT_BOTTOM_PX = 80;

interface Anchor {
  /** The block that was at the top of the viewport. */
  element: Element;
  /** Where its top sat relative to the probe line. Usually negative — the block is scrolled partly
   *  out of view — which is what makes the restore exact rather than approximate. */
  offset: number;
}

/**
 * How far below the scroller's top edge to ask "what is here?".
 *
 * 🔴 NOT ZERO, AND NOT ARBITRARY. This scroller carries `pt-[48px]` to clear the floating chrome,
 * so the first 48px of it is padding: a probe at the very top hits the scroller itself, every time.
 * 56 clears the padding and lands on the first line the learner can actually read.
 */
const PROBE_INSET = 56;

/**
 * The block at the top of the viewport, and how far into it we are.
 *
 * 🔴🔴 `elementFromPoint`, NOT A SCAN OF THE SCROLLER'S CHILDREN, AND THE FIRST VERSION OF THIS
 * FILE GOT IT WRONG IN EXACTLY THE WAY ITS OWN COMMENT WARNED ABOUT. That version took the first
 * direct child whose bottom was on screen — and this scroller has THREE direct children, one of
 * which is the entire conversation. So the anchor was always that one block, "restoring" it was
 * arithmetically identical to leaving `scrollTop` alone, and the fix shipped and changed nothing.
 *
 * Measured on production after that version was live: opening a citation chip took the top of the
 * viewport from *"FEV₁/FVC ratio: if this drops below about 0.7…"* to *"Happy to help you learn
 * this…"* — the start of the answer, thousands of pixels back. Exactly the defect it was meant to
 * remove.
 *
 * Asking the browser what is at a point is the only way to get the DEEPEST element there, which is
 * the paragraph or table row the learner is looking at rather than the container it sits in.
 *
 * 🔴 THEN CLIMB OUT OF INLINE ELEMENTS. A `<span>` inside a paragraph is a valid hit but a poor
 * anchor: inline boxes reflow horizontally, so the same span's top moves to a different line when
 * the column narrows. The nearest block-level ancestor does not.
 */
function anchorOf(scroller: HTMLElement): Anchor | null {
  const box = scroller.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  const probe = box.top + PROBE_INSET;

  let element = document.elementFromPoint(box.left + box.width / 2, probe);
  // 🔴 A HIDDEN TAB RETURNS NULL, and so does a point over nothing. Falling through to the coarse
  // scan is better than dropping the anchor: it is the old behaviour, which is at least stable.
  if (!element || !scroller.contains(element)) {
    for (const child of scroller.children) {
      const rect = child.getBoundingClientRect();
      if (rect.bottom > probe) return { element: child, offset: rect.top - probe };
    }
    return null;
  }

  while (
    element.parentElement &&
    element !== scroller &&
    getComputedStyle(element).display.startsWith("inline")
  ) {
    element = element.parentElement;
  }
  if (element === scroller) return null;
  return { element, offset: element.getBoundingClientRect().top - probe };
}

/**
 * Hold the reading position while `scroller` changes width.
 *
 * @param scroller the conversation's scrolling column.
 * @param enabled off while the surface is arriving, when there is no place to hold yet.
 */
export function useAnchoredScroll(scroller: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const node = scroller.current;
    if (!node || !enabled) return;

    let anchor: Anchor | null = null;
    let pinned = false;
    let width = node.getBoundingClientRect().width;
    // 🔴 SET WHILE WE ARE THE ONES MOVING THE SCROLLER, so our own correction is not mistaken for
    // the learner scrolling away and does not overwrite the anchor we are in the middle of using.
    let restoring = false;

    const remember = () => {
      if (restoring) return;
      pinned = node.scrollHeight - node.scrollTop - node.clientHeight <= AT_BOTTOM_PX;
      anchor = pinned ? null : anchorOf(node);
    };

    const restore = () => {
      if (pinned) {
        node.scrollTop = node.scrollHeight;
        return;
      }
      if (!anchor || !node.contains(anchor.element)) return;
      const probe = node.getBoundingClientRect().top + PROBE_INSET;
      const moved = anchor.element.getBoundingClientRect().top - probe;
      // The block has drifted by `moved - offset`; taking that out of scrollTop puts it back.
      node.scrollTop += moved - anchor.offset;
    };

    remember();
    node.addEventListener("scroll", remember, { passive: true });

    // 🔴🔴 A RESIZE OBSERVER, NOT A ONE-SHOT ON THE INSET. The column does not jump to its new
    // width — `canvas-surface.tsx` animates it over `--pane-slide`, so there are ~15 intermediate
    // widths and the content reflows at every one of them. Correcting once at the end would show
    // the learner the whole slide happening at the wrong scroll position and then a jump; this
    // corrects on each frame the browser reports, so the block they were reading simply stays put
    // while the column moves around it.
    const observer = new ResizeObserver(() => {
      const next = node.getBoundingClientRect().width;
      if (Math.abs(next - width) < 0.5) return;
      width = next;
      restoring = true;
      restore();
      // 🔴 CLEARED AFTER THE SCROLL EVENT OUR OWN WRITE QUEUES, not synchronously. Setting
      // `scrollTop` fires `scroll` asynchronously; clearing the flag here would let that event
      // land with `restoring` already false and record a position we invented as the learner's.
      requestAnimationFrame(() => {
        restoring = false;
      });
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", remember);
    };
  }, [enabled, scroller]);
}
