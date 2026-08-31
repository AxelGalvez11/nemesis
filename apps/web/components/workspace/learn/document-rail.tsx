"use client";

// The reading rail: a stack of tick marks down the left of a long document, one per heading, which
// opens into a table of contents on hover.
//
// 🔴🔴 MEASURED ON A REAL DEEP RESEARCH REPORT, not designed here. Owner, 2026-08-31: *"the
// document from deep research also doesn't have the leftside rail popup for table of contents…
// I need you to measure the ChatGPT one in chrome."* Every number below is in
// `docs/chatgpt-reference.md` under "The deep research report's table-of-contents rail", taken off
// 2x zoomed screenshots at a 1470px viewport — the report renders inside a cross-origin sandboxed
// iframe, so `contentDocument` is null and nothing there can be measured by script. Treat them
// as ±1 and re-measure before moving one.
//
// 🔴🔴 IT IS A SCROLL-SPY THAT HAPPENS TO BE CLICKABLE, AND THAT IS THE WHOLE DESIGN. In the
// reference, scrolling from the title into the first section moved the black mark down one tick
// with nothing clicked. A rail that only responded to clicks would be a menu, and a menu does not
// earn 19px of permanent screen space; a position indicator does, because it answers "where am I
// in this" without being asked.
//
// 🔴 FULL SCREEN ONLY, WHICH IS ALSO THE REFERENCE'S RULE. In the conversation their report sits
// in a card with no rail at all; the rail exists only in the expanded view. Ours follows, for a
// harder reason: docked, the sheet is centred inside about 932px, leaving a 58px gutter, and a
// rail plus its 287px panel does not fit beside a document without covering it.

import { useCallback, useEffect, useMemo, useState } from "react";

/** One entry: which block it is, so the rail can find the element again, and what it says. */
export interface RailHeading {
  /** The `data-comment-block` index of the heading in the rendered document. */
  index: number;
  text: string;
}

/** 🔴 THREE, NOT ONE. A document with a heading or two has no navigation problem, and a rail beside
 *  it is decoration that costs a gutter. The reference's report carried eight. */
export const RAIL_MIN_HEADINGS = 3;

/** The scroll position, in px from the top of the scroller, at which a heading counts as "the one
 *  I am reading". 🔴 NOT ZERO: a heading exactly at the top edge should already be active, and
 *  without a margin the mark flickers between two entries on the pixel where they cross. */
const ACTIVE_MARGIN = 96;

export function DocumentRail({
  headings,
  scroller,
}: {
  headings: RailHeading[];
  /** The element that actually scrolls the document. Measured against, and scrolled by. */
  scroller: HTMLElement | null;
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const find = useCallback(
    (index: number): HTMLElement | null => scroller?.querySelector<HTMLElement>(`[data-comment-block="${index}"]`) ?? null,
    [scroller],
  );

  /**
   * How far down the scroller a heading sits, in the scroller's own coordinates.
   *
   * 🔴🔴 `offsetTop` IS THE WRONG NUMBER AND IT LOOKS LIKE THE RIGHT ONE. It is measured against
   * the nearest POSITIONED ancestor, and the document's blocks live inside a `relative` grid, so
   * `offsetTop` returns a heading's offset within that grid rather than within the scroller. The
   * rail highlighted the correct entry and the page moved about 3px — caught only by pressing a
   * real entry on production, never by a test, because the offsets are plausible small numbers.
   * Two rects and the current scroll are immune to whatever is positioned in between.
   */
  const offsetIn = useCallback(
    (element: HTMLElement): number =>
      element.getBoundingClientRect().top - (scroller?.getBoundingClientRect().top ?? 0) + (scroller?.scrollTop ?? 0),
    [scroller],
  );

  // 🔴 THE LISTENER IS PASSIVE AND THE WORK IS A LOOP OVER AT MOST A FEW DOZEN HEADINGS, so this
  // stays off the scroll critical path without a rAF gate. An IntersectionObserver was the first
  // instinct and is wrong here: it answers "is this on screen", and several headings are on screen
  // at once, so it cannot say WHICH ONE the reader is in without re-deriving exactly this.
  useEffect(() => {
    if (!scroller) return;
    const recompute = () => {
      const top = scroller.scrollTop + ACTIVE_MARGIN;
      let current = 0;
      for (const [ordinal, heading] of headings.entries()) {
        const element = find(heading.index);
        if (!element) continue;
        if (offsetIn(element) <= top) current = ordinal;
      }
      setActive(current);
    };
    recompute();
    scroller.addEventListener("scroll", recompute, { passive: true });
    return () => scroller.removeEventListener("scroll", recompute);
  }, [scroller, headings, find, offsetIn]);

  const jump = (ordinal: number) => {
    const element = find(headings[ordinal]!.index);
    if (!element || !scroller) return;
    // 🔴 `scrollTop`, NOT `scrollIntoView`. The document sits in a portalled panel that is itself
    // inside the page; `scrollIntoView` walks up and scrolls ancestors too, which shifts the whole
    // workspace behind the reader. Setting the scroller's own offset moves exactly one thing.
    scroller.scrollTo({ behavior: "smooth", top: Math.max(0, offsetIn(element) - 24) });
    setActive(ordinal);
    setOpen(false);
  };

  if (headings.length < RAIL_MIN_HEADINGS) return null;

  return (
    <div
      className="absolute left-[24px] top-[88px] z-20"
      data-testid="document-rail"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* 🔴 THE TICKS STAY MOUNTED UNDER THE PANEL rather than swapping out, so the mouse never
          lands in a gap where neither is present and the panel flickers shut. */}
      <ul className="m-0 flex list-none flex-col gap-[12px] p-0">
        {headings.map((heading, ordinal) => (
          <li key={heading.index}>
            <button
              aria-label={heading.text}
              className={
                // 3px tall, fully rounded; 19px grey, 25px and near-black when active. The active
                // mark is longer AND darker on purpose — either alone is missable at this size.
                `block h-[3px] rounded-full transition-all ${
                  ordinal === active ? "w-[25px] bg-(--ui-text-primary)" : "w-[19px] bg-(--ui-stroke-secondary)"
                }`
              }
              onClick={() => jump(ordinal)}
              type="button"
            />
          </li>
        ))}
      </ul>

      {open && (
        <nav
          aria-label="Table of contents"
          className="absolute -left-[4px] -top-[24px] w-[287px] rounded-[12px] bg-(--ui-bg-elevated) py-[20px] pl-[20px] pr-[16px] shadow-lg ring-1 ring-(--ui-stroke-secondary)"
          data-testid="document-rail-panel"
        >
          <p className="m-0 mb-[12px] text-[length:var(--canvas-text-meta)] font-medium uppercase tracking-wide text-(--ui-text-quaternary)">
            Table of contents
          </p>
          <ul className="m-0 flex list-none flex-col gap-[12px] p-0">
            {headings.map((heading, ordinal) => (
              <li key={heading.index}>
                <button
                  className={`block w-full text-left text-[length:var(--canvas-text-body)] leading-[24px] transition-colors ${
                    ordinal === active ? "font-semibold text-(--ui-text-primary)" : "text-(--ui-text-secondary) hover:text-(--ui-text-primary)"
                  }`}
                  onClick={() => jump(ordinal)}
                  type="button"
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** Pull the rail's entries out of parsed document blocks. PURE, so the choice of what counts as a
 *  heading is testable without rendering anything.
 *
 *  🔴 EVERY HEADING LEVEL, NOT JUST THE TOP ONE. A report whose sections are all `##` would
 *  otherwise get an empty rail, and which level an author reached for is not a reliable signal of
 *  what a reader wants to jump to. */
export function railHeadings(blocks: { kind: string; text?: string }[]): RailHeading[] {
  return blocks
    .map((block, index) => ({ index, text: (block.text ?? "").trim() }))
    .filter((entry, index) => blocks[index]!.kind === "heading" && entry.text.length > 0);
}
