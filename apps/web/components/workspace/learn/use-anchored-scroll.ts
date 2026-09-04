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
  /** The block that was at (or across) the top of the viewport. */
  element: Element;
  /** Where its top sat relative to the viewport's top. Usually negative — the block is scrolled
   *  partly out of view — which is what makes the restore exact rather than approximate. */
  offset: number;
}

/**
 * The block at the top of the viewport, and how far into it we are.
 *
 * 🔴 DIRECT CHILDREN, NOT `[data-thread-turn]`. A turn is the whole exchange and can easily be
 * three screens tall, so anchoring to one restores "somewhere in this answer" — which for a long
 * answer is the same defect at a smaller scale. Every direct child of the scroller is a real
 * boundary, and on this surface that includes the live region and the composer's spacer.
 */
function anchorOf(scroller: HTMLElement): Anchor | null {
  const top = scroller.getBoundingClientRect().top;
  for (const element of scroller.children) {
    const box = element.getBoundingClientRect();
    // The first block whose BOTTOM is still on screen is the one being read.
    if (box.bottom > top + 1) return { element, offset: box.top - top };
  }
  return null;
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
      const top = node.getBoundingClientRect().top;
      const moved = anchor.element.getBoundingClientRect().top - top;
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
